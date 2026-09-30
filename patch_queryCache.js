const fs = require('fs');
const file = 'frontend/src/lib/queryCache.ts';
let code = fs.readFileSync(file, 'utf-8');

// 1. Add listeners at the top (after inflightRequests)
code = code.replace(
  "const inflightRequests = new Map<string, Promise<unknown>>();",
  "const inflightRequests = new Map<string, Promise<unknown>>();\n\ntype CacheListener = (key: string) => void;\nconst cacheListeners = new Set<CacheListener>();\n\nfunction notifyListeners(key: string) {\n  cacheListeners.forEach(listener => listener(key));\n}"
);

// 2. setCachedData
code = code.replace(
  /export function setCachedData<T>\(key: string, data: T, ttlSeconds = 120\): void \{\n  const entry: CacheEntry<T> = \{ data, fetchedAt: Date.now\(\), ttl: ttlSeconds \* 1000 \};\n  memoryCache.set\(key, entry\);\n  writeSessionCache\(key, entry\);\n\}/,
  "export function setCachedData<T>(key: string, data: T, ttlSeconds = 120): void {\n  const entry: CacheEntry<T> = { data, fetchedAt: Date.now(), ttl: ttlSeconds * 1000 };\n  memoryCache.set(key, entry);\n  writeSessionCache(key, entry);\n  notifyListeners(key);\n}"
);

// 3. cachedFetch
code = code.replace(
  "    memoryCache.set(key, entry);\n    writeSessionCache(key, entry);\n    inflightRequests.delete(key);\n    return data;",
  "    memoryCache.set(key, entry);\n    writeSessionCache(key, entry);\n    inflightRequests.delete(key);\n    notifyListeners(key);\n    return data;"
);

// 4. useCachedFetch (add subscription)
code = code.replace(
  "  // Initial fetch on mount\n  useEffect(() => {\n    mountedRef.current = true;\n    doFetch();\n    return () => { mountedRef.current = false; };\n  }, [doFetch]);",
  "  // Initial fetch on mount & subscription\n  useEffect(() => {\n    mountedRef.current = true;\n    doFetch();\n\n    const listener = (notifiedKey: string) => {\n      if (notifiedKey === key) {\n        doFetch();\n      }\n    };\n    cacheListeners.add(listener);\n\n    return () => {\n      mountedRef.current = false;\n      cacheListeners.delete(listener);\n    };\n  }, [key, doFetch]);"
);

// 5. useCachedQuery (add subscription)
code = code.replace(
  "  useEffect(() => {\n    mountedRef.current = true;\n    doFetch();\n    return () => { mountedRef.current = false; };\n  }, [doFetch]);",
  "  useEffect(() => {\n    mountedRef.current = true;\n    doFetch();\n\n    const listener = (notifiedKey: string) => {\n      if (notifiedKey === key) {\n        doFetch();\n      }\n    };\n    cacheListeners.add(listener);\n\n    return () => {\n      mountedRef.current = false;\n      cacheListeners.delete(listener);\n    };\n  }, [key, doFetch]);"
);

// 6. invalidateCache
code = code.replace(
  "export function invalidateCache(key: string): void {\n  memoryCache.delete(key);\n  try { sessionStorage.removeItem(STORAGE_PREFIX + key); } catch {}\n}",
  "export function invalidateCache(key: string): void {\n  memoryCache.delete(key);\n  try { sessionStorage.removeItem(STORAGE_PREFIX + key); } catch {}\n  notifyListeners(key);\n}"
);

// 7. invalidateCacheByPrefix
code = code.replace(
  "export function invalidateCacheByPrefix(prefix: string): void {\n  const keysToRemove = [...memoryCache.keys()].filter((k) => k.startsWith(prefix));\n  keysToRemove.forEach((k) => memoryCache.delete(k));\n  try {\n    const toRemove: string[] = [];\n    for (let i = 0; i < sessionStorage.length; i++) {\n      const sk = sessionStorage.key(i);\n      if (sk && sk.startsWith(STORAGE_PREFIX + prefix)) toRemove.push(sk);\n    }\n    toRemove.forEach((sk) => sessionStorage.removeItem(sk));\n  } catch {}\n}",
  "export function invalidateCacheByPrefix(prefix: string): void {\n  const keysToRemove = [...memoryCache.keys()].filter((k) => k.startsWith(prefix));\n  keysToRemove.forEach((k) => {\n    memoryCache.delete(k);\n    notifyListeners(k);\n  });\n  try {\n    const toRemove: string[] = [];\n    for (let i = 0; i < sessionStorage.length; i++) {\n      const sk = sessionStorage.key(i);\n      if (sk && sk.startsWith(STORAGE_PREFIX + prefix)) {\n        toRemove.push(sk);\n        const actualKey = sk.substring(STORAGE_PREFIX.length);\n        if (!keysToRemove.includes(actualKey)) {\n          notifyListeners(actualKey);\n        }\n      }\n    }\n    toRemove.forEach((sk) => sessionStorage.removeItem(sk));\n  } catch {}\n}"
);

fs.writeFileSync(file, code);
