import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// queryCache.ts — Lightweight client-side query cache with:
//   • In-memory Map for session lifetime
//   • sessionStorage fallback for instant F5 restore (stale-while-revalidate)
//   • In-flight request deduplication (same key = 1 fetch, N consumers)
//   • Configurable TTL per query
// ---------------------------------------------------------------------------

/** Maximum bytes to store in sessionStorage (2 MB safety limit) */
const SESSION_STORAGE_MAX_BYTES = 2 * 1024 * 1024;
const STORAGE_PREFIX = 'qc:';

// ---- Internal cache structures ----

interface CacheEntry<T = unknown> {
  data: T;
  fetchedAt: number; // Date.now() when fetched
  ttl: number;       // ms
}

/** In-memory cache — survives HMR, cleared on full page unload */
const memoryCache = new Map<string, CacheEntry>();

/** In-flight request dedup — maps key → Promise of the fetch result */
const inflightRequests = new Map<string, Promise<unknown>>();

// ---- sessionStorage helpers ----

function readSessionCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeSessionCache<T>(key: string, entry: CacheEntry<T>): void {
  try {
    const serialized = JSON.stringify(entry);
    // Don't exceed our budget
    if (serialized.length > SESSION_STORAGE_MAX_BYTES) return;
    sessionStorage.setItem(STORAGE_PREFIX + key, serialized);
  } catch {
    // sessionStorage full or disabled — degrade gracefully
  }
}

// ---- Core fetch-with-cache ----

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < entry.ttl;
}

/**
 * Get cached data synchronously if available in memory or sessionStorage.
 */
export function getCachedData<T>(key: string): T | null {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem.data;
  const session = readSessionCache<T>(key);
  if (session) {
    memoryCache.set(key, session);
    return session.data;
  }
  return null;
}

/**
 * Manually set cached data in memory and sessionStorage.
 */
export function setCachedData<T>(key: string, data: T, ttlSeconds = 120): void {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now(), ttl: ttlSeconds * 1000 };
  memoryCache.set(key, entry);
  writeSessionCache(key, entry);
}

/**
 * Fetch data with caching and in-flight deduplication.
 * Returns { data, fromCache } where fromCache indicates stale data.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number,
): Promise<{ data: T; fromCache: boolean }> {
  // 1. Check memory cache
  const memEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memEntry && isFresh(memEntry)) {
    return { data: memEntry.data, fromCache: false };
  }

  // 2. Deduplicate in-flight requests
  const existing = inflightRequests.get(key);
  if (existing) {
    const data = (await existing) as T;
    return { data, fromCache: false };
  }

  // 3. Execute fetch with dedup guard
  const fetchPromise = fetcher().then((data) => {
    const entry: CacheEntry<T> = { data, fetchedAt: Date.now(), ttl };
    memoryCache.set(key, entry);
    writeSessionCache(key, entry);
    inflightRequests.delete(key);
    return data;
  }).catch((err) => {
    inflightRequests.delete(key);
    throw err;
  });

  inflightRequests.set(key, fetchPromise);
  const data = (await fetchPromise) as T;
  return { data, fromCache: false };
}

// ---- Public API: React Hook ----

export interface UseCachedFetchOptions {
  /** Time-to-live in seconds (default: 120 = 2 min) */
  ttl?: number;
  /** If true, skip the fetch entirely (for conditional fetching) */
  enabled?: boolean;
  /** Polling interval in seconds. 0 = no polling. */
  refetchInterval?: number;
}

export interface UseCachedFetchResult<T> {
  /** The data, or null if not yet available */
  data: T | null;
  /** True only when there is NO cached data and a fetch is in progress */
  loading: boolean;
  /** True when showing stale cached data while revalidating in background */
  stale: boolean;
  /** Error from the most recent fetch attempt */
  error: Error | null;
  /** Manually trigger a refetch */
  refetch: () => void;
}

/**
 * React hook for cached data fetching with stale-while-revalidate semantics.
 *
 * @param key   Unique cache key (same key across components = shared data, 1 fetch)
 * @param url   API endpoint URL
 * @param opts  Configuration options
 *
 * @example
 * const { data, loading, stale } = useCachedFetch<TickerData[]>(
 *   'cedears-tickers',
 *   '/api/cedears/tickers',
 *   { ttl: 3600 }
 * );
 */
export function useCachedFetch<T>(
  key: string,
  url: string,
  opts: UseCachedFetchOptions = {},
): UseCachedFetchResult<T> {
  const { ttl = 120, enabled = true, refetchInterval = 0 } = opts;
  const ttlMs = ttl * 1000;

  const [data, setData] = useState<T | null>(() => {
    // Initialize from memory cache (instant, survives HMR)
    const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (mem) return mem.data;
    // Fall back to sessionStorage (instant F5 restore)
    const session = readSessionCache<T>(key);
    if (session) return session.data;
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    // Only "loading" if we have zero data to show
    const mem = memoryCache.get(key);
    if (mem) return false;
    const session = readSessionCache<T>(key);
    if (session) return false;
    return enabled;
  });

  const [stale, setStale] = useState<boolean>(() => {
    // If we have data but it's from sessionStorage (post-F5), it's stale
    const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (mem && isFresh(mem)) return false;
    const session = readSessionCache<T>(key);
    return session !== null;
  });

  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const doFetch = useCallback(() => {
    if (!enabled) return;

    const memEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memEntry && isFresh(memEntry)) {
      // Memory cache hit & fresh — no fetch needed
      if (mountedRef.current) {
        setData(memEntry.data);
        setLoading(false);
        setStale(false);
      }
      return;
    }

    // We have stale data to show? Mark stale, not loading
    const hasStaleData = data !== null;
    if (hasStaleData) {
      setStale(true);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const fetcher = async (): Promise<T> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      return res.json();
    };

    cachedFetch<T>(key, fetcher, ttlMs)
      .then(({ data: freshData }) => {
        if (!mountedRef.current) return;
        setData(freshData);
        setLoading(false);
        setStale(false);
        setError(null);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setStale(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url, ttlMs, enabled]);

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    return () => { mountedRef.current = false; };
  }, [doFetch]);

  // Polling
  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      intervalRef.current = setInterval(doFetch, refetchInterval * 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [doFetch, refetchInterval, enabled]);

  const refetch = useCallback(() => {
    // Invalidate cache for this key and refetch
    memoryCache.delete(key);
    try { sessionStorage.removeItem(STORAGE_PREFIX + key); } catch {}
    doFetch();
  }, [key, doFetch]);

  return { data, loading, stale, error, refetch };
}

/**
 * Convenience hook for fetching with a custom async function (not just a URL).
 * Useful when the fetch involves multiple API calls or data transformation.
 *
 * @param key     Unique cache key
 * @param fetcher Async function that returns the data
 * @param opts    Configuration options
 */
export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: UseCachedFetchOptions = {},
): UseCachedFetchResult<T> {
  const { ttl = 120, enabled = true, refetchInterval = 0 } = opts;
  const ttlMs = ttl * 1000;

  const [data, setData] = useState<T | null>(() => {
    const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (mem) return mem.data;
    const session = readSessionCache<T>(key);
    if (session) return session.data;
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    const mem = memoryCache.get(key);
    if (mem) return false;
    const session = readSessionCache<T>(key);
    if (session) return false;
    return enabled;
  });

  const [stale, setStale] = useState<boolean>(() => {
    const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (mem && isFresh(mem)) return false;
    const session = readSessionCache<T>(key);
    return session !== null;
  });

  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const doFetch = useCallback(() => {
    if (!enabled) return;

    const memEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memEntry && isFresh(memEntry)) {
      if (mountedRef.current) {
        setData(memEntry.data);
        setLoading(false);
        setStale(false);
      }
      return;
    }

    const hasStaleData = data !== null;
    if (hasStaleData) {
      setStale(true);
      setLoading(false);
    } else {
      setLoading(true);
    }

    cachedFetch<T>(key, () => fetcherRef.current(), ttlMs)
      .then(({ data: freshData }) => {
        if (!mountedRef.current) return;
        setData(freshData);
        setLoading(false);
        setStale(false);
        setError(null);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setStale(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttlMs, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    return () => { mountedRef.current = false; };
  }, [doFetch]);

  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      intervalRef.current = setInterval(doFetch, refetchInterval * 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [doFetch, refetchInterval, enabled]);

  const refetch = useCallback(() => {
    memoryCache.delete(key);
    try { sessionStorage.removeItem(STORAGE_PREFIX + key); } catch {}
    doFetch();
  }, [key, doFetch]);

  return { data, loading, stale, error, refetch };
}

/**
 * Invalidate a specific cache key (both memory and sessionStorage).
 * Useful after mutations (e.g., saving a portfolio).
 */
export function invalidateCache(key: string): void {
  memoryCache.delete(key);
  try { sessionStorage.removeItem(STORAGE_PREFIX + key); } catch {}
}

/**
 * Invalidate all cache entries matching a prefix.
 * e.g., invalidateCacheByPrefix('portfolios') clears 'portfolios-list', 'portfolios-rebalance-xyz', etc.
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const sk = sessionStorage.key(i);
      if (sk && sk.startsWith(STORAGE_PREFIX + prefix)) toRemove.push(sk);
    }
    toRemove.forEach((sk) => sessionStorage.removeItem(sk));
  } catch {}
}
