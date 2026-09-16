import React, { useState, useEffect, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { 
  TooltipComponent, 
  GridComponent, 
  LegendComponent,
  MarkLineComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { 
  Compass, 
  TrendingUp, 
  RefreshCw, 
  Activity, 
  Search,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useChartTheme } from '../hooks/useChartTheme';
import { useTicker360 } from '../context/Ticker360Context';

echarts.use([
  BarChart,
  LineChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;

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

const ETF_COLORS: Record<string, string> = {
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

export const EtfRotationView: React.FC = () => {
  const chartTheme = useChartTheme();
  const { openTicker360 } = useTicker360();

  const [data, setData] = useState<EtfRotationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [universeFilter, setUniverseFilter] = useState<'all' | 'sectors'>('all');

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

  // 1. Objeto SPY como EtfItem para agruparlo con QQQ y DIA
  const spyItem: EtfItem | null = useMemo(() => {
    if (!data?.benchmark) return null;
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
    if (!data?.items) return [];
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
    if (!data?.items) return [];
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

  // 1. Gráfico de Evolución Semanal (Week to Date / 5 ruedas) con SPY como Benchmark Rector
  const weeklyEvolutionOption = useMemo(() => {
    if (!data || !data.benchmark || displayedItems.length === 0) return {};

    const dates = data.week_dates && data.week_dates.length === 5 
      ? data.week_dates 
      : ['D-4', 'D-3', 'D-2', 'D-1', 'Hoy'];

    const spyHistory = data.benchmark.history_5d || [0, 0, 0, 0, data.benchmark.perf_w];

    // Serie de referencia: SPY (Benchmark)
    // 1) Halo protector oscuro: corta cualquier línea que se cruce detrás de SPY
    // 2) Línea principal brillante: ámbar/oro, 4.5px, glow, nodos blancos y etiqueta fija al final
    const series: any[] = [
      {
        id: 'spy-halo',
        name: 'SPY (Benchmark)',
        type: 'line',
        data: spyHistory,
        lineStyle: { color: '#181920', width: 9, type: 'solid', cap: 'round' },
        symbol: 'none',
        silent: true,
        tooltip: { show: false },
        z: 40
      },
      {
        id: 'spy-main',
        name: 'SPY (Benchmark)',
        type: 'line',
        data: spyHistory,
        lineStyle: {
          color: '#fbbf24',
          width: 4.5,
          type: 'solid',
          shadowColor: 'rgba(251, 191, 36, 0.75)',
          shadowBlur: 10,
          shadowOffsetY: 0
        },
        itemStyle: {
          color: '#fbbf24',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        symbol: 'circle',
        symbolSize: 8,
        endLabel: {
          show: true,
          formatter: (params: any) => {
            const val = params.value;
            const sign = val !== undefined && val !== null && val > 0 ? '+' : '';
            const num = val !== undefined && val !== null ? Number(val).toFixed(1) : '0.0';
            return ` ★ SPY (${sign}${num}%)`;
          },
          color: '#fbbf24',
          fontWeight: 'bolder',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(24, 25, 32, 0.95)',
          borderColor: '#fbbf24',
          borderWidth: 1.5,
          borderRadius: 4,
          padding: [3, 6],
          distance: 8
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: 0,
              lineStyle: {
                type: 'dashed',
                color: 'rgba(255, 255, 255, 0.2)',
                width: 1
              },
              label: {
                show: true,
                position: 'start',
                formatter: '0%',
                color: 'rgba(255, 255, 255, 0.35)',
                fontSize: 10,
                fontFamily: 'monospace'
              }
            }
          ]
        },
        z: 50
      }
    ];

    // Series de los otros tres Grandes Índices: QQQ, DIA e IWM
    const qqq = data.items.find(it => it.ticker === 'QQQ');
    if (qqq && displayedItems.some(it => it.ticker === 'QQQ')) {
      const history = qqq.history_5d || [0, 0, 0, 0, qqq.perf_w ?? 0];
      series.push({
        id: 'qqq-main',
        name: 'QQQ (Nasdaq 100)',
        type: 'line',
        data: history,
        lineStyle: {
          color: ETF_COLORS.QQQ || '#06b6d4',
          width: 2.2,
          opacity: 0.85
        },
        itemStyle: { color: ETF_COLORS.QQQ || '#06b6d4' },
        symbol: 'none',
        smooth: true,
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3.5, opacity: 1 }
        },
        z: 30
      });
    }

    const dia = data.items.find(it => it.ticker === 'DIA');
    if (dia && displayedItems.some(it => it.ticker === 'DIA')) {
      const history = dia.history_5d || [0, 0, 0, 0, dia.perf_w ?? 0];
      series.push({
        id: 'dia-main',
        name: 'DIA (Dow Jones)',
        type: 'line',
        data: history,
        lineStyle: {
          color: ETF_COLORS.DIA || '#818cf8',
          width: 2.2,
          opacity: 0.85
        },
        itemStyle: { color: ETF_COLORS.DIA || '#818cf8' },
        symbol: 'none',
        smooth: true,
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3.5, opacity: 1 }
        },
        z: 30
      });
    }

    const iwm = data.items.find(it => it.ticker === 'IWM');
    if (iwm && displayedItems.some(it => it.ticker === 'IWM')) {
      const history = iwm.history_5d || [0, 0, 0, 0, iwm.perf_w ?? 0];
      series.push({
        id: 'iwm-main',
        name: 'IWM (Russell 2000)',
        type: 'line',
        data: history,
        lineStyle: {
          color: ETF_COLORS.IWM || '#c084fc',
          width: 2.2,
          opacity: 0.85
        },
        itemStyle: { color: ETF_COLORS.IWM || '#c084fc' },
        symbol: 'none',
        smooth: true,
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3.5, opacity: 1 }
        },
        z: 30
      });
    }

    // Series de los demás ETFs sectoriales y temáticos (excluyendo SPY, QQQ, DIA, IWM, TLT, ARGT)
    const majorSet = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'ARGT']);
    displayedItems.filter(it => !majorSet.has(it.ticker)).forEach(it => {
      const history = it.history_5d || [0, 0, 0, 0, it.perf_w ?? 0];
      const color = ETF_COLORS[it.ticker] || '#94a3b8';
      series.push({
        name: `${it.ticker} (${it.name})`,
        type: 'line',
        data: history,
        lineStyle: {
          color,
          width: 1.4,
          opacity: 0.45
        },
        itemStyle: { color },
        symbol: 'none',
        smooth: true,
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3,
            opacity: 1
          }
        },
        z: 10
      });
    });

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 35,
        right: 85, // Espacio para el badge "★ SPY (x.x%)" sin recortes
        bottom: 30,
        left: 45
      },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: chartTheme.textMuted, fontSize: 10, fontFamily: 'monospace' },
        formatter: (name: string) => {
          if (name.includes('SPY')) return `⭐ ${name}`;
          if (name.startsWith('QQQ')) return `🔷 ${name}`;
          if (name.startsWith('DIA')) return `🔶 ${name}`;
          if (name.startsWith('IWM')) return `🟣 ${name}`;
          return name;
        },
        pageTextStyle: { color: '#ffffff' },
        pageIconColor: '#3b82f6',
        pageIconInactiveColor: '#4b5563'
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#12131a',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        padding: [8, 12],
        extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7); max-height: 420px; overflow-y: auto; border-radius: 8px;',
        textStyle: { color: '#ffffff', fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const dateLabel = params[0].axisValueLabel || params[0].name || '';

          // Filtrar series silenciosas como el halo
          const items = params.filter((p: any) => p.seriesName && p.seriesName.trim() !== '' && p.value !== undefined && p.seriesId !== 'spy-halo');

          const isMajorIndex = (name: string) => {
            return name.includes('SPY') || name.startsWith('QQQ') || name.startsWith('DIA') || name.startsWith('IWM');
          };

          const majorItems = items.filter((p: any) => isMajorIndex(p.seriesName));
          majorItems.sort((a: any, b: any) => {
            const getPriority = (name: string) => {
              if (name.includes('SPY')) return 1;
              if (name.startsWith('QQQ')) return 2;
              if (name.startsWith('DIA')) return 3;
              if (name.startsWith('IWM')) return 4;
              return 99;
            };
            return getPriority(a.seriesName) - getPriority(b.seriesName);
          });

          const sectorItems = items.filter((p: any) => !isMajorIndex(p.seriesName));
          sectorItems.sort((a: any, b: any) => (Number(b.value) || 0) - (Number(a.value) || 0));

          const renderRow = (p: any, isBenchmark = false) => {
            const val = Number(p.value);
            const isPos = val > 0;
            const isNeg = val < 0;
            const valColor = isBenchmark ? '#fbbf24' : isPos ? '#34d399' : isNeg ? '#f87171' : '#94a3b8';
            const formattedVal = `${isPos ? '+' : ''}${val.toFixed(2)}%`;
            const dotColor = isBenchmark ? '#fbbf24' : (p.color || '#94a3b8');

            return `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0; font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor}; flex-shrink: 0; ${isBenchmark ? 'box-shadow: 0 0 6px #fbbf24;' : ''}"></span>
                  <span style="${isBenchmark ? 'font-weight: bold; color: #fbbf24;' : 'color: #e2e8f0;'}">${p.seriesName}</span>
                </div>
                <strong style="color: ${valColor}; font-family: monospace; font-size: 11px;">${formattedVal}</strong>
              </div>
            `;
          };

          let html = `
            <div style="font-family: monospace; min-width: 220px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px; margin-bottom: 6px;">
                <span style="font-weight: bold; color: #a1a1aa; font-size: 10px; text-transform: uppercase;">📅 Rueda: ${dateLabel}</span>
                <span style="font-size: 9px; color: #71717a;">Trayectoria WTD</span>
              </div>
          `;

          if (majorItems.length > 0) {
            html += `
              <div style="margin-bottom: 6px;">
                <div style="font-size: 9px; font-weight: 800; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">
                  🏛️ Índices Principales
                </div>
                ${majorItems.map((p: any) => renderRow(p, p.seriesName.includes('SPY'))).join('')}
              </div>
            `;
          }

          if (sectorItems.length > 0) {
            html += `
              <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 5px; margin-top: 5px;">
                <div style="font-size: 9px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; display: flex; justify-content: space-between;">
                  <span>📊 Sectores / Activos</span>
                  <span style="font-size: 8px; color: #64748b;">(ord. rendimiento)</span>
                </div>
                ${sectorItems.map((p: any) => renderRow(p, false)).join('')}
              </div>
            `;
          }

          html += `</div>`;
          return html;
        }
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 600 }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
        }
      },
      series
    };
  }, [data, displayedItems, chartTheme]);

  // 2. Gráfico de Barras Divergentes de Diferencial vs SPY (1W)
  const barChartOption = useMemo(() => {
    if (!data || displayedItems.length === 0) return {};

    // Filtrar TLT y ARGT
    const cleanList = displayedItems.filter(it => it.ticker !== 'TLT' && it.ticker !== 'ARGT');
    // Ordenar de menor a mayor para que el más alto quede arriba en el eje Y
    const sorted = [...cleanList].sort((a, b) => (a.diff_vs_spy_w ?? 0) - (b.diff_vs_spy_w ?? 0));
    const categories = sorted.map(it => `${it.ticker} • ${it.name}`);
    const values = sorted.map(it => {
      const diff = it.diff_vs_spy_w ?? 0;
      const isPositive = diff >= 0;
      return {
        value: diff,
        itemStyle: {
          color: isPositive ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)',
          borderRadius: isPositive ? [0, 4, 4, 0] : [4, 0, 0, 4]
        },
        meta: it
      };
    });

    const spyPerf = data.benchmark?.perf_w ?? 0;

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 20,
        right: 50,
        bottom: 25,
        left: 60 // Margen reservado exclusivamente a los tickers Y para evitar superposición
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#12131a',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        textStyle: { color: '#ffffff', fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: any) => {
          if (!params || !params[0]) return '';
          const p = params[0];
          const it: EtfItem = p.data.meta;
          const diff = p.value;
          return `
            <div style="font-family: monospace; min-width: 220px; padding: 2px;">
              <div style="font-weight: bold; color: #ffffff; font-size: 12px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px;">
                ${it.name} <span style="color: #a1a1aa;">(${it.ticker})</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Diferencial vs SPY (1W):</span>
                <strong style="color: ${diff >= 0 ? '#34d399' : '#f87171'};">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Retorno ETF (1W):</span>
                <span style="color: #e2e8f0;">${(it.perf_w ?? 0) >= 0 ? '+' : ''}${(it.perf_w ?? 0).toFixed(2)}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Retorno SPY Benchmark:</span>
                <span style="color: #fbbf24; font-weight: bold;">${spyPerf >= 0 ? '+' : ''}${spyPerf.toFixed(2)}%</span>
              </div>
            </div>
          `;
        }
      },
      xAxis: {
        type: 'value',
        // Escala dinámica con holgura garantizada para que las barras nunca alcancen las etiquetas del eje Y
        min: (val: { min: number }) => Math.floor(Math.min(val.min * 1.35, val.min - 1.5)),
        max: (val: { max: number }) => Math.ceil(Math.max(val.max * 1.35, val.max + 1.5)),
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
        }
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLine: { show: true, lineStyle: { color: chartTheme.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: chartTheme.textPrimary,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'monospace',
          margin: 10,
          formatter: (val: string) => val.split(' • ')[0]
        }
      },
      series: [
        {
          name: 'Diferencial vs SPY (1W)',
          type: 'bar',
          data: values,
          barWidth: '62%',
          label: {
            show: true,
            position: (params: any) => params.value >= 0 ? 'right' : 'left',
            distance: 6,
            fontSize: 9.5,
            fontFamily: 'monospace',
            fontWeight: 700,
            color: chartTheme.textPrimary,
            formatter: (p: any) => `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%`
          }
        }
      ]
    };
  }, [data, displayedItems, chartTheme]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-zinc-400">
        <Compass className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="text-xs font-mono">Cargando seguimiento de ETFs vs SPY...</span>
      </div>
    );
  }

  const topLeader = data?.top_leader;
  const topLaggard = data?.top_laggard;

  return (
    <div className="space-y-4">
      {/* 1. Barra Superior Limpia */}
      <div className="bg-[#181920] border border-white/10 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Compass className="w-5 h-5 text-emerald-400" />
          <h1 className="text-sm font-bold text-white tracking-tight">
            Seguimiento Semanal de ETFs vs SPY
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30">
            SPY Base: {data?.benchmark?.perf_w ? `${data.benchmark.perf_w > 0 ? '+' : ''}${data.benchmark.perf_w.toFixed(1)}%` : '—'} (1W)
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Toggle universo */}
          <div className="flex items-center bg-black/40 border border-white/10 p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setUniverseFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                universeFilter === 'all' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos ({data?.items.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setUniverseFilter('sectors')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                universeFilter === 'sectors' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              11 Sectores S&P
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* 2. Menú Superior: EXACTAMENTE las 2 tarjetas de la imagen del usuario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tarjeta 1: AMPLITUD DE MERCADO */}
        <div className="bg-[#181920] border border-white/10 rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300">
              AMPLITUD DE MERCADO
            </span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="my-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-white">
              {data?.breadth_w ? `${Math.round(data.breadth_w)}%` : '0%'}
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              superan a SPY (1W)
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${data?.breadth_w ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
              <span>Amplitud 1M: <strong className="text-zinc-200">{data?.breadth_1m ? `${Math.round(data.breadth_1m)}%` : '0%'}</strong></span>
              <span className="text-zinc-300 font-semibold">{data?.breadth_w && data.breadth_w >= 50 ? 'Saludable' : 'Selectiva'}</span>
            </div>
          </div>
        </div>

        {/* Tarjeta 2: EXTREMOS TÁCTICOS (1W) */}
        <div className="bg-[#181920] border border-white/10 rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-300">
              EXTREMOS TÁCTICOS (1W)
            </span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>

          <div className="space-y-1.5 my-1.5 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 text-xs truncate max-w-[240px]">
                🥇 {topLeader ? `${topLeader.ticker} (${topLeader.name})` : '—'}
              </span>
              <span className="font-bold text-emerald-400">
                {topLeader?.diff_vs_spy_w !== null && topLeader?.diff_vs_spy_w !== undefined
                  ? `${topLeader.diff_vs_spy_w > 0 ? '+' : ''}${topLeader.diff_vs_spy_w.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 text-xs truncate max-w-[240px]">
                🔻 {topLaggard ? `${topLaggard.ticker} (${topLaggard.name})` : '—'}
              </span>
              <span className="font-bold text-rose-400">
                {topLaggard?.diff_vs_spy_w !== null && topLaggard?.diff_vs_spy_w !== undefined
                  ? `${topLaggard.diff_vs_spy_w > 0 ? '+' : ''}${topLaggard.diff_vs_spy_w.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex justify-between font-mono">
            <span>Spread Líder/Rezagado:</span>
            <strong className="text-white font-bold">
              {data?.spread_extremos ? `${data.spread_extremos.toFixed(1)}%` : '—'}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. Dos Gráficos: Evolución Semanal vs SPY y Ranking de Diferencial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico 1: Evolución Semanal (Week to Date / 5 Ruedas) */}
        <div className="bg-[#181920] border border-white/10 rounded-xl p-4 flex flex-col shadow-sm">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                Evolución Semanal (Week to Date) vs SPY
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Trayectoria de 5 ruedas con <strong className="text-amber-400">SPY</strong> como benchmark rector
              </p>
            </div>
          </div>

          <div className="w-full h-[360px]">
            <ReactECharts
              echarts={echarts}
              option={weeklyEvolutionOption}
              style={{ width: '100%', height: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          </div>
        </div>

        {/* Gráfico 2: Ranking Diferencial vs SPY (1W) */}
        <div className="bg-[#181920] border border-white/10 rounded-xl p-4 flex flex-col shadow-sm">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Diferencial Semanal vs SPY (1W)
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Sobre-rendimiento (+) o rezago (-) respecto a SPY en la semana
              </p>
            </div>
          </div>

          <div className="w-full h-[360px]">
            <ReactECharts
              echarts={echarts}
              option={barChartOption}
              style={{ width: '100%', height: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          </div>
        </div>
      </div>

      {/* 4. Tabla Cuantitativa: Foco 100% en Comparar con el Benchmark */}
      <div className="bg-[#181920] border border-white/10 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              Comparativa de ETFs vs SPY ({filteredMajorIndices.length + filteredSectorItems.length} activos)
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Tríada de Índices Principales (SPY, QQQ, DIA) agrupada y rotación sectorial vs Benchmark
            </p>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Buscar ticker o sector..."
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-white/[0.02]">
                <th className="px-3 py-2.5">Ticker</th>
                <th className="px-3 py-2.5">Sector / Nombre</th>
                <th className="px-3 py-2.5 text-right">Precio Spot</th>
                <th className="px-3 py-2.5 text-right font-black text-white bg-white/[0.04] border-x border-white/10">
                  DIFERENCIAL VS SPY (1W)
                </th>
                <th className="px-3 py-2.5 text-right">Retorno ETF (1W)</th>
                <th className="px-3 py-2.5 text-center">RSI (14)</th>
                <th className="px-3 py-2.5 text-center">Tendencia SMA50</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {/* SECCIÓN 1: ÍNDICES PRINCIPALES (SPY • QQQ • DIA • IWM) */}
              {filteredMajorIndices.length > 0 && (
                <tr className="bg-amber-500/10 border-y border-amber-500/25 text-amber-300 select-none">
                  <td colSpan={7} className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        🏛️ Índices Principales de Wall Street (SPY • QQQ • DIA • IWM)
                      </span>
                      <span className="text-[9px] text-amber-400/80 font-mono font-medium">
                        Cuarteto de Benchmarks Macro
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {filteredMajorIndices.map(item => {
                const isSpy = item.ticker === 'SPY';
                const diff = item.diff_vs_spy_w ?? 0;
                const isPositive = diff > 0;
                const isNegative = diff < 0;

                return (
                  <tr 
                    key={item.ticker} 
                    className={`transition-colors select-none ${
                      isSpy ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* Ticker */}
                    <td className="px-3 py-2 font-bold text-white">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openTicker360(item.ticker)}
                          className={`font-black transition-colors cursor-pointer ${
                            isSpy 
                              ? 'text-amber-400 hover:text-amber-300' 
                              : item.ticker === 'IWM' 
                              ? 'text-purple-400 hover:text-purple-300' 
                              : 'text-white hover:text-emerald-400'
                          }`}
                          title={`Ver ficha 360 de ${item.ticker}`}
                        >
                          {item.ticker}
                        </button>
                        {isSpy ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold border border-amber-400/40">
                            BENCHMARK
                          </span>
                        ) : item.ticker === 'QQQ' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
                            NASDAQ
                          </span>
                        ) : item.ticker === 'DIA' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40">
                            DOW
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40">
                            RUSSELL
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-2 font-sans font-medium text-zinc-200">
                      {item.name}
                    </td>

                    {/* Precio Spot */}
                    <td className="px-3 py-2 text-right text-zinc-300">
                      ${item.close.toFixed(2)}
                    </td>

                    {/* HERO: DIFERENCIAL VS SPY */}
                    <td className={`px-3 py-2 text-right font-black text-sm border-x border-white/10 ${
                      isSpy
                        ? 'text-amber-400 bg-amber-400/10'
                        : isPositive 
                        ? 'text-emerald-400 bg-emerald-950/20' 
                        : isNegative 
                        ? 'text-rose-400 bg-rose-950/20' 
                        : 'text-zinc-400 bg-white/[0.02]'
                    }`}>
                      {isSpy 
                        ? '0.0% (Base)'
                        : item.diff_vs_spy_w !== null && item.diff_vs_spy_w !== undefined
                        ? `${item.diff_vs_spy_w > 0 ? '+' : ''}${item.diff_vs_spy_w.toFixed(1)}%`
                        : '—'}
                    </td>

                    {/* Retorno 1W ETF */}
                    <td className={`px-3 py-2 text-right font-bold ${
                      isSpy 
                        ? 'text-amber-300'
                        : (item.perf_w ?? 0) >= 0 
                        ? 'text-emerald-400/80' 
                        : 'text-rose-400/80'
                    }`}>
                      {item.perf_w !== null ? `${item.perf_w > 0 ? '+' : ''}${item.perf_w.toFixed(1)}%` : '—'}
                    </td>

                    {/* RSI */}
                    <td className="px-3 py-2 text-center">
                      <span className={
                        item.rsi && item.rsi >= 70 ? 'text-amber-400 font-bold' : item.rsi && item.rsi <= 30 ? 'text-blue-400 font-bold' : 'text-zinc-400'
                      }>
                        {item.rsi ? Math.round(item.rsi) : '—'}
                      </span>
                    </td>

                    {/* SMA50 */}
                    <td className="px-3 py-2 text-center font-sans font-medium">
                      <span className={
                        item.trend_sma50 === 'BULLISH'
                          ? 'text-emerald-400/90'
                          : item.trend_sma50 === 'BEARISH'
                          ? 'text-rose-400/90'
                          : 'text-zinc-500'
                      }>
                        {item.trend_sma50 === 'BULLISH' ? '▲ Alcista' : item.trend_sma50 === 'BEARISH' ? '▼ Bajista' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* SECCIÓN 2: SECTORES Y ACTIVOS DE MERCADO */}
              {filteredSectorItems.length > 0 && (
                <tr className="bg-white/[0.03] border-y border-white/10 text-zinc-300 select-none">
                  <td colSpan={7} className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        📊 {universeFilter === 'sectors' ? '11 Sectores Oficiales del S&P 500' : 'Sectores y ETFs Temáticos'} ({filteredSectorItems.length} activos)
                      </span>
                      <span className="text-[9px] text-zinc-500 font-mono font-normal">
                        Fuerza Relativa Sectorial
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {filteredSectorItems.map(item => {
                const diff = item.diff_vs_spy_w ?? 0;
                const isPositive = diff > 0;
                const isNegative = diff < 0;

                return (
                  <tr key={item.ticker} className="hover:bg-white/[0.02] transition-colors select-none">
                    {/* Ticker */}
                    <td className="px-3 py-2 font-bold text-white">
                      <button
                        type="button"
                        onClick={() => openTicker360(item.ticker)}
                        className="hover:text-emerald-400 transition-colors cursor-pointer"
                        title={`Ver ficha 360 de ${item.ticker}`}
                      >
                        {item.ticker}
                      </button>
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-2 font-sans font-medium text-zinc-200">
                      {item.name}
                    </td>

                    {/* Precio Spot */}
                    <td className="px-3 py-2 text-right text-zinc-300">
                      ${item.close.toFixed(2)}
                    </td>

                    {/* HERO: DIFERENCIAL VS SPY */}
                    <td className={`px-3 py-2 text-right font-black text-sm border-x border-white/10 ${
                      isPositive 
                        ? 'text-emerald-400 bg-emerald-950/20' 
                        : isNegative 
                        ? 'text-rose-400 bg-rose-950/20' 
                        : 'text-zinc-400 bg-white/[0.02]'
                    }`}>
                      {item.diff_vs_spy_w !== null && item.diff_vs_spy_w !== undefined
                        ? `${item.diff_vs_spy_w > 0 ? '+' : ''}${item.diff_vs_spy_w.toFixed(1)}%`
                        : '—'}
                    </td>

                    {/* Retorno 1W ETF */}
                    <td className={`px-3 py-2 text-right ${
                      (item.perf_w ?? 0) >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'
                    }`}>
                      {item.perf_w !== null ? `${item.perf_w > 0 ? '+' : ''}${item.perf_w.toFixed(1)}%` : '—'}
                    </td>

                    {/* RSI */}
                    <td className="px-3 py-2 text-center">
                      <span className={
                        item.rsi && item.rsi >= 70 ? 'text-amber-400 font-bold' : item.rsi && item.rsi <= 30 ? 'text-blue-400 font-bold' : 'text-zinc-400'
                      }>
                        {item.rsi ? Math.round(item.rsi) : '—'}
                      </span>
                    </td>

                    {/* SMA50 */}
                    <td className="px-3 py-2 text-center font-sans font-medium">
                      <span className={
                        item.trend_sma50 === 'BULLISH'
                          ? 'text-emerald-400/90'
                          : item.trend_sma50 === 'BEARISH'
                          ? 'text-rose-400/90'
                          : 'text-zinc-500'
                      }>
                        {item.trend_sma50 === 'BULLISH' ? '▲ Alcista' : item.trend_sma50 === 'BEARISH' ? '▼ Bajista' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
