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
  error?: string | null;
}

const SECTOR_ETF_TICKERS = new Set([
  'XLK', 'XLF', 'XLV', 'XLY', 'XLC', 'XLI', 'XLP', 'XLE', 'XLRE', 'XLB', 'XLU'
]);

export const useEtfRotation = () => {
  const [data, setData] = useState<EtfRotationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [universeFilter, setUniverseFilter] = useState<'all' | 'sectors'>('sectors');
  const [rrgData, setRrgData] = useState<EtfRrgData | null>(null);
  const [rrgLoading, setRrgLoading] = useState<boolean>(false);
  const [rrgError, setRrgError] = useState<string | null>(null);
  const rrgLoadedRef = useRef(false);
  const rrgInFlightRef = useRef(false);

  const loadRrg = useCallback(async (force = false) => {
    if (rrgInFlightRef.current) return;
    if (!force && rrgLoadedRef.current) return;

    rrgLoadedRef.current = true;
    rrgInFlightRef.current = true;
    setRrgLoading(true);
    setRrgError(null);

    try {
      const res = await fetch('/api/cedears/etf_rrg?universe=all&weeks=52&tail=8');
      if (!res.ok) throw new Error(`Error API: ${res.status}`);
      const json: EtfRrgData = await res.json();
      setRrgData(json);
      if (json.error && (!json.points || json.points.length === 0)) {
        setRrgError(json.error);
      }
    } catch (err: any) {
      setRrgError(err?.message || 'No se pudo cargar el Relative Rotation Graph.');
    } finally {
      setRrgLoading(false);
      rrgInFlightRef.current = false;
    }
  }, []);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      // Pedimos 'all' para tener todos los ETFs disponibles
      const res = await fetch('/api/cedears/etf_rotation_analysis?universe=all');
      if (res.ok) {
        const json = await res.json();
        // Filtrar TLT y ARGT según directiva del usuario
        const cleanItems = (json.items || []).filter(
          (it: EtfItem) => it.ticker !== 'TLT' && it.ticker !== 'ARGT'
        );
        setData({ ...json, items: cleanItems });
      }
    } catch (err) {
      console.error('Error fetching ETF rotation data:', err);
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

  // 6. Puntos RRG filtrados por universo y búsqueda (en Sectores, solo los 11 SPDR)
  const displayedRrgPoints = useMemo(() => {
    const points = rrgData?.points ?? [];
    let list = universeFilter === 'sectors'
      ? points.filter(point => SECTOR_ETF_TICKERS.has(point.ticker))
      : points;

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(point =>
        point.ticker.toLowerCase().includes(q) ||
        point.name.toLowerCase().includes(q) ||
        point.sector.toLowerCase().includes(q)
      );
    }

    return list;
  }, [rrgData?.points, universeFilter, searchFilter]);

  return {
    data,
    loading,
    refreshing,
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
    loadRrg,
    displayedRrgPoints
  };
};
