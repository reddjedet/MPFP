import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

export interface EtfItem {
  ticker: string;
  name: string;
  sector: string;
  close: number;
  change_d: number;
  perf_w: number | null;
  diff_vs_spy_w: number | null;
  rsi: number | null;
  trend_sma50: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volume: number | null;
}

export interface EtfRotationData {
  benchmark: {
    ticker: string;
    name: string;
    sector?: string;
    close: number;
    change_d: number;
    perf_w: number | null;
    rsi?: number | null;
    trend_sma50?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  } | null;
  items: EtfItem[];
  breadth_w: number;
  breadth_1m: number;
  top_leader: EtfItem | null;
  top_laggard: EtfItem | null;
  spread_extremos: number;
}

export type RrgQuadrant = 'LEADING' | 'WEAKENING' | 'IMPROVING' | 'LAGGING';

export interface RrgMethod {
  name: string;
  scale: string;
  clip: [number, number];
  smoothing: string;
  window_weeks: number;
  momentum: string;
  complete_weeks_only: boolean;
}

export interface RrgTrailPoint {
  week: string;
  x: number;
  y: number;
}

export interface RrgPoint {
  ticker: string;
  name: string;
  sector: string;
  x: number;
  y: number;
  quadrant: RrgQuadrant;
  quadrant_label: string;
  weeks_in_quadrant: number;
  quadrant_since: string;
  rsi: number | null;
  rsi_spy: number | null;
  trail: RrgTrailPoint[];
}

export interface EtfRrgData {
  benchmark: string;
  as_of: string | null;
  weeks: number;
  tail: number;
  spy_rsi: number | null;
  points: RrgPoint[];
  skipped?: Array<{ ticker: string; reason: string }>;
  method?: RrgMethod;
  error?: string | null;
}

const SECTOR_ETF_TICKERS = new Set([
  'XLK', 'XLF', 'XLV', 'XLY', 'XLC', 'XLI', 'XLP', 'XLE', 'XLRE', 'XLB', 'XLU'
]);

export const useEtfRotation = () => {
  const [data, setData] = useState<EtfRotationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [universeFilter, setUniverseFilter] = useState<'all' | 'sectors'>('sectors');
  const [rrgData, setRrgData] = useState<EtfRrgData | null>(null);
  const [rrgLoading, setRrgLoading] = useState<boolean>(false);
  const [rrgError, setRrgError] = useState<string | null>(null);
  const [rrgTail, setRrgTailState] = useState<number>(8);
  const rrgTailRef = useRef<number>(8);
  const rrgLoadedRef = useRef(false);
  const rrgRequestIdRef = useRef(0);

  const loadRrg = useCallback(async (force = false, tailOverride?: number) => {
    if (!force && rrgLoadedRef.current) return;

    const requestId = ++rrgRequestIdRef.current;
    const tail = tailOverride ?? rrgTail;
    rrgLoadedRef.current = true;
    setRrgLoading(true);
    setRrgError(null);

    try {
      const res = await fetch(`/api/cedears/etf_rrg?universe=all&weeks=52&tail=${tail}`);
      if (!res.ok) throw new Error(`Error API: ${res.status}`);
      const json: EtfRrgData = await res.json();
      // Si llegó una respuesta vieja (cambió la cola), no pisamos la actual.
      if (requestId !== rrgRequestIdRef.current) return;
      setRrgData(json);
      if (json.error && (!json.points || json.points.length === 0)) {
        setRrgError(json.error);
      }
    } catch (err: any) {
      if (requestId !== rrgRequestIdRef.current) return;
      setRrgError(err?.message || 'No se pudo cargar el Relative Rotation Graph.');
    } finally {
      if (requestId === rrgRequestIdRef.current) {
        setRrgLoading(false);
      }
    }
  }, [rrgTail]);

  const setRrgTail = useCallback((tail: number) => {
    if (rrgTailRef.current === tail) return;
    rrgTailRef.current = tail;
    setRrgTailState(tail);
    void loadRrg(true, tail);
  }, [loadRrg]);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Pedimos 'all' para tener todos los ETFs disponibles
      const res = await fetch('/api/cedears/etf_rotation_analysis?universe=all');
      if (!res.ok) {
        throw new Error(`Error ${res.status}: no se pudo actualizar la rotación de ETFs.`);
      }
      const json = await res.json();
      // Filtrar TLT y ARGT según directiva del usuario
      const cleanItems = (json.items || []).filter(
        (it: EtfItem) => it.ticker !== 'TLT' && it.ticker !== 'ARGT'
      );
      setData({ ...json, items: cleanItems });
    } catch (err) {
      console.error('Error fetching ETF rotation data:', err);
      setError(err instanceof Error ? err.message : 'Error de conexión al actualizar la rotación de ETFs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    if (rrgLoadedRef.current) {
      void loadRrg(true);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const spyItem: EtfItem | null = useMemo(() => {
    if (!data?.benchmark) {
      return null;
    }
    return {
      ticker: 'SPY',
      name: 'S&P 500 ETF Trust',
      sector: 'Índice Benchmark S&P 500',
      close: data.benchmark.close,
      change_d: data.benchmark.change_d,
      perf_w: data.benchmark.perf_w,
      diff_vs_spy_w: 0.0,
      rsi: data.benchmark.rsi ?? null,
      trend_sma50: data.benchmark.trend_sma50 ?? 'BULLISH',
      volume: null,
    };
  }, [data?.benchmark]);

  // 2. Tríada / Grupo de Índices Principales: SPY, QQQ, DIA e IWM
  const majorIndices = useMemo(() => {
    const list: EtfItem[] = [];
    if (spyItem) list.push(spyItem);
    if (data?.items) {
      const qqq = data.items.find(it => it.ticker === 'QQQ');
      const dia = data.items.find(it => it.ticker === 'DIA');
      const iwm = data.items.find(it => it.ticker === 'IWM');
      if (qqq) list.push(qqq);
      if (dia) list.push(dia);
      if (iwm) list.push(iwm);
    }
    return list;
  }, [spyItem, data?.items]);

  // 3. Filtrado de Índices Principales según búsqueda
  const filteredMajorIndices = useMemo(() => {
    if (!searchFilter.trim()) return majorIndices;
    const q = searchFilter.toLowerCase().trim();
    return majorIndices.filter(
      it => it.ticker.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || it.sector.toLowerCase().includes(q)
    );
  }, [majorIndices, searchFilter]);

  // 4. Filtrado de Sectores y Activos (excluyendo SPY, QQQ, DIA, IWM, TLT, ARGT para la tabla agrupada)
  const filteredSectorItems = useMemo(() => {
    if (!data?.items) {
      return [];
    }
    const majorSet = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'ARGT']);
    let list = data.items.filter(it => !majorSet.has(it.ticker));

    if (universeFilter === 'sectors') {
      const sectorTickers = new Set(['XLK', 'XLF', 'XLV', 'XLY', 'XLC', 'XLI', 'XLP', 'XLE', 'XLRE', 'XLB', 'XLU']);
      list = list.filter(it => sectorTickers.has(it.ticker));
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        it => it.ticker.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || it.sector.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data?.items, universeFilter, searchFilter]);

  // 5. Elementos activos para gráficos (incluyendo QQQ, DIA, IWM como referencias + sectores, sin TLT ni ARGT)
  const displayedItems = useMemo(() => {
    if (!data?.items) {
      return [];
    }
    const excluded = new Set(['TLT', 'ARGT']);
    let list = data.items.filter(it => !excluded.has(it.ticker));

    if (universeFilter === 'sectors') {
      const sectorTickers = new Set(['XLK', 'XLF', 'XLV', 'XLY', 'XLC', 'XLI', 'XLP', 'XLE', 'XLRE', 'XLB', 'XLU', 'QQQ', 'DIA', 'IWM']);
      list = list.filter(it => sectorTickers.has(it.ticker));
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        it => it.ticker.toLowerCase().includes(q) || it.name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data?.items, universeFilter, searchFilter]);

  // 6. Puntos RRG del universo activo, sin filtro de búsqueda.
  // Se usan para fijar el dominio de los ejes y evitar que el gráfico se reescale al buscar.
  const rrgUniversePoints = useMemo(() => {
    const points = rrgData?.points ?? [];
    return universeFilter === 'sectors'
      ? points.filter(point => SECTOR_ETF_TICKERS.has(point.ticker))
      : points;
  }, [rrgData?.points, universeFilter]);

  // 7. Puntos RRG visibles: universo + búsqueda.
  const displayedRrgPoints = useMemo(() => {
    if (!searchFilter.trim()) {
      return rrgUniversePoints;
    }

    const q = searchFilter.toLowerCase().trim();
    return rrgUniversePoints.filter(point =>
      point.ticker.toLowerCase().includes(q) ||
      point.name.toLowerCase().includes(q) ||
      point.sector.toLowerCase().includes(q)
    );
  }, [rrgUniversePoints, searchFilter]);

  return {
    data,
    loading,
    refreshing,
    error,
    searchFilter,
    setSearchFilter,
    universeFilter,
    setUniverseFilter,
    fetchData,
    spyItem,
    majorIndices,
    filteredMajorIndices,
    filteredSectorItems,
    displayedItems,
    topLeader: data?.top_leader,
    topLaggard: data?.top_laggard,
    rrgData,
    rrgLoading,
    rrgError,
    rrgTail,
    setRrgTail,
    loadRrg,
    rrgUniversePoints,
    displayedRrgPoints
  };
};
