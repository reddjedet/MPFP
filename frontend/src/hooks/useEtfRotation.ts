import { useState, useEffect, useMemo } from 'react';

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
  history_5d?: number[];
}

export interface EtfRotationData {
  benchmark: {
    ticker: string;
    name: string;
    sector?: string;
    close: number;
    change_d: number;
    perf_w: number;
    rsi?: number | null;
    trend_sma50?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    history_5d?: number[];
  } | null;
  items: EtfItem[];
  breadth_w: number;
  breadth_1m: number;
  top_leader: EtfItem | null;
  top_laggard: EtfItem | null;
  spread_extremos: number;
  week_dates: string[];
}

export const ETF_COLORS: Record<string, string> = {
  XLK: '#38bdf8', // Celeste Tech
  XLF: '#60a5fa', // Azul Finanzas
  XLV: '#a78bfa', // Violeta Salud
  XLY: '#f472b6', // Rosa Consumo Disc
  XLC: '#ec4899', // Fucsia Comunicaciones
  XLI: '#94a3b8', // Pizarra / Acero Industrial (evita confusión con SPY)
  XLP: '#84cc16', // Lima / Verde Claro Consumo Básico (evita colisión)
  XLE: '#ef4444', // Rojo Coral Energía (evita colisión de naranja con SPY)
  XLRE: '#4ade80', // Verde Real Estate
  XLB: '#2dd4bf', // Turquesa Materiales
  XLU: '#64748b', // Gris Utilities
  QQQ: '#06b6d4',
  IWM: '#c084fc',
  DIA: '#818cf8',
  SMH: '#22d3ee',
  ARKK: '#e879f9',
  EWZ: '#10b981',
  GLD: '#d97706', // Oro bronce profundo
};

export const useEtfRotation = () => {
  const [data, setData] = useState<EtfRotationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [universeFilter, setUniverseFilter] = useState<'all' | 'sectors'>('sectors');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

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
      history_5d: data.benchmark.history_5d || [0, 0, 0, 0, data.benchmark.perf_w]
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

  return {
    data,
    loading,
    refreshing,
    searchFilter,
    setSearchFilter,
    universeFilter,
    setUniverseFilter,
    selectedTicker,
    setSelectedTicker,
    fetchData,
    spyItem,
    majorIndices,
    filteredMajorIndices,
    filteredSectorItems,
    displayedItems,
    topLeader: data?.top_leader,
    topLaggard: data?.top_laggard
  };
};
