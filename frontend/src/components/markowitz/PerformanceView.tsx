import React, { useEffect, useState, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import {
  TooltipComponent,
  LegendComponent,
  GridComponent,
  VisualMapComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '@/hooks/useChartTheme';

echarts.use([
  HeatmapChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  VisualMapComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getSortedRowModel, 
  useReactTable, 
  SortingState 
} from '@tanstack/react-table';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Search, 
  RefreshCw, 
  Filter, 
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface PortfolioSummary {
  name: string;
  type: string;
  perf_3m: number;
  perf_6m: number;
  perf_ytd: number;
  perf_1y: number;
  beta?: number | null;
  sma50_dist: string;
  sma200_dist: string;
}

interface BenchmarkItem {
  ticker: string;
  close: number | null;
  perf_3m: number | null;
  perf_6m: number | null;
  perf_ytd: number | null;
  perf_1y: number | null;
  beta?: number | null;
  sma50_dist: string;
  sma200_dist: string;
  rsi: number | null;
}

interface AssetDetail {
  ticker: string;
  portfolio: string;
  weight: number;
  close: number | null;
  perf_3m: number | null;
  perf_6m: number | null;
  perf_ytd: number | null;
  perf_1y: number | null;
  beta?: number | null;
  sma50_dist: string;
  sma200_dist: string;
  rsi: number | null;
}

interface PerformanceResponse {
  portfolio_summaries: PortfolioSummary[];
  benchmarks: BenchmarkItem[];
  assets_detail: AssetDetail[];
  periods: string[];
}

export const PerformanceView: React.FC = () => {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [portfolioFilter, setPortfolioFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const fetchPerformanceData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/performance/data_json');
      if (res.ok) {
        const json: PerformanceResponse = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPerformanceData();
  }, []);

  // Filtered asset list
  const filteredAssets = useMemo(() => {
    if (!data?.assets_detail) return [];
    return data.assets_detail.filter(asset => {
      const q = searchFilter.toLowerCase().trim();
      const matchesSearch = !q || asset.ticker.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (portfolioFilter !== 'all' && asset.portfolio !== portfolioFilter) {
        return false;
      }
      return true;
    });
  }, [data, searchFilter, portfolioFilter]);

  const chartTheme = useChartTheme();

  // ECharts: Heatmap Matricial de Rendimiento Multiactivo vs Benchmark
  const { chartOption, chartHeight } = useMemo(() => {
    if (!data?.portfolio_summaries || data.portfolio_summaries.length === 0) {
      return { chartOption: {}, chartHeight: 300 };
    }
    const periods = ['3 Meses (3M)', '6 Meses (6M)', 'Año en Curso (YTD)', '1 Año (1A)'];
    const periodShort = ['3M', '6M', 'YTD', '1A'];

    // Benchmarks lookup (especialmente SPY para calcular Alpha en tooltip)
    const spy = data.benchmarks.find(b => b.ticker === 'SPY');
    const spyData = [spy?.perf_3m ?? 0, spy?.perf_6m ?? 0, spy?.perf_ytd ?? 0, spy?.perf_1y ?? 0];

    interface EntityRow {
      name: string;
      isBenchmark: boolean;
      isSpy: boolean;
      data: [number, number, number, number];
    }

    const entities: EntityRow[] = [];

    // 1. Carteras de Inversión
    data.portfolio_summaries.forEach(pf => {
      entities.push({
        name: pf.name,
        isBenchmark: false,
        isSpy: false,
        data: [pf.perf_3m, pf.perf_6m, pf.perf_ytd, pf.perf_1y]
      });
    });

    // 2. Benchmarks de Mercado (SPY primero como base de referencia, luego QQQ y DIA)
    const sortedBenchmarks = [...data.benchmarks].sort((a, b) => {
      if (a.ticker === 'SPY') return -1;
      if (b.ticker === 'SPY') return 1;
      return 0;
    });

    sortedBenchmarks.forEach(bm => {
      entities.push({
        name: `${bm.ticker} (Benchmark)`,
        isBenchmark: true,
        isSpy: bm.ticker === 'SPY',
        data: [bm.perf_3m ?? 0, bm.perf_6m ?? 0, bm.perf_ytd ?? 0, bm.perf_1y ?? 0]
      });
    });

    // Construcción de la matriz [xIndex, yIndex, alphaValue, absoluteReturn]
    const heatmapData: [number, number, number, number][] = [];
    entities.forEach((entity, yIdx) => {
      entity.data.forEach((val, xIdx) => {
        const spyVal = spyData[xIdx] ?? 0;
        const alpha = entity.isSpy ? 0 : Math.round((val - spyVal) * 100) / 100;
        heatmapData.push([xIdx, yIdx, alpha, Math.round(val * 100) / 100]);
      });
    });

    const calculatedHeight = Math.max(380, entities.length * 50 + 90);

    const alphaPieces = [
      { min: 15, label: '≥ +15% Alpha (Outperformance Alto)', color: '#059669' },
      { min: 5, max: 15, label: '+5% a +15% Alpha', color: '#047857' },
      { min: 1, max: 5, label: '+1% a +5% Alpha', color: '#0d4a36' },
      { min: -1, max: 1, label: '-1% a +1% (A la par / Base SPY)', color: '#1c1f26' },
      { min: -5, max: -1, label: '-5% a -1% Alpha', color: '#3e1a22' },
      { min: -15, max: -5, label: '-15% a -5% Alpha', color: '#6e1a24' },
      { max: -15, label: '< -15% Alpha (Underperformance)', color: '#991b1b' }
    ];

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: chartTheme.tooltipText, fontSize: 12 },
        formatter: (params: any) => {
          const [xIdx, yIdx, alpha, absVal] = params.value;
          const periodName = periodShort[xIdx];
          const entity = entities[yIdx];
          const spyVal = spyData[xIdx];

          let alphaHtml = '';
          if (!entity.isSpy && spyVal !== undefined) {
            const isPos = alpha >= 0;
            const color = isPos ? '#34d399' : '#f87171';
            const sign = isPos ? '+' : '';
            const badgeText = isPos ? 'SUPERÓ AL MERCADO (+ALPHA)' : 'POR DEBAJO DEL MERCADO (-ALPHA)';
            const badgeBg = isPos ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)';
            const badgeBorder = isPos ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)';

            alphaHtml = `
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="color: ${chartTheme.textMuted};">Rendimiento SPY (${periodName}):</span>
                  <strong style="color: ${chartTheme.textPrimary}; font-family: monospace;">${spyVal >= 0 ? '+' : ''}${spyVal.toFixed(2)}%</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: ${chartTheme.textMuted}; font-weight: bold;">Alpha vs SPY:</span>
                  <strong style="color: ${color}; font-family: monospace; font-size: 13px;">${sign}${alpha.toFixed(2)}%</strong>
                </div>
                <div style="margin-top: 6px; padding: 3px 6px; border-radius: 4px; background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${color}; font-size: 9px; font-weight: bold; text-align: center; letter-spacing: 0.5px;">
                  ${badgeText}
                </div>
              </div>
            `;
          } else if (entity.isSpy) {
            alphaHtml = `
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; text-align: center; color: ${chartTheme.benchmarkColor}; font-weight: bold;">
                ★ Índice Benchmark de Referencia Base (Alpha = 0.00%)
              </div>
            `;
          }

          return `
            <div style="font-family: inherit; min-width: 200px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="font-size: 13px; color: ${entity.isBenchmark ? chartTheme.benchmarkColor : chartTheme.textPrimary};">${entity.name}</strong>
                <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); color: ${chartTheme.textMuted}; font-weight: bold;">${periodName}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
                <span style="font-size: 11px; color: ${chartTheme.textMuted};">Retorno Absoluto:</span>
                <strong style="font-size: 15px; font-family: monospace; color: ${absVal >= 0 ? '#49d090' : '#ff453a'};">
                  ${absVal > 0 ? '+' : ''}${absVal.toFixed(2)}%
                </strong>
              </div>
              ${alphaHtml}
            </div>
          `;
        }
      },
      grid: {
        left: 170,
        right: 25,
        top: 30,
        bottom: 60
      },
      xAxis: {
        type: 'category',
        data: periods,
        position: 'top',
        splitArea: { show: false },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: {
          color: chartTheme.textPrimary,
          fontSize: 12,
          fontWeight: 'bold'
        }
      },
      yAxis: {
        type: 'category',
        data: entities.map(e => e.name),
        inverse: true,
        splitArea: { show: false },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: {
          color: (name: string) => (name.includes('Benchmark') ? chartTheme.benchmarkColor : chartTheme.textPrimary),
          fontWeight: 'bold',
          fontSize: 11
        }
      },
      visualMap: {
        type: 'piecewise',
        dimension: 2, // Evalúa la 3ra columna (alpha) para asignar color
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 14,
        itemHeight: 14,
        itemGap: 12,
        textStyle: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' },
        pieces: alphaPieces
      },
      series: [
        {
          name: 'Alpha vs SPY',
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
            formatter: (params: any) => {
              const [, yIdx, alpha, absVal] = params.value;
              const entity = entities[yIdx];
              const absSign = absVal > 0 ? '+' : '';
              const retStr = `${absSign}${absVal.toFixed(2)}%`;
              
              if (entity.isSpy) {
                return `{ret|${retStr}}\n{alphaNeutral|Ref. SPY}`;
              }
              const alphaSign = alpha > 0 ? '+' : '';
              const alphaStr = `α ${alphaSign}${alpha.toFixed(2)}%`;
              const styleKey = alpha > 1 ? 'alphaPos' : (alpha < -1 ? 'alphaNeg' : 'alphaNeutral');
              return `{ret|${retStr}}\n{${styleKey}|${alphaStr}}`;
            },
            rich: {
              ret: {
                fontSize: 12,
                fontWeight: 'bold',
                color: '#ffffff',
                lineHeight: 18,
                fontFamily: 'monospace',
                textBorderColor: 'rgba(0, 0, 0, 0.75)',
                textBorderWidth: 2
              },
              alphaPos: {
                fontSize: 10,
                fontWeight: 'bold',
                color: '#34d399',
                lineHeight: 14,
                fontFamily: 'monospace',
                textBorderColor: 'rgba(0, 0, 0, 0.75)',
                textBorderWidth: 1.5
              },
              alphaNeg: {
                fontSize: 10,
                fontWeight: 'bold',
                color: '#f87171',
                lineHeight: 14,
                fontFamily: 'monospace',
                textBorderColor: 'rgba(0, 0, 0, 0.75)',
                textBorderWidth: 1.5
              },
              alphaNeutral: {
                fontSize: 10,
                fontWeight: 'bold',
                color: '#9ca3af',
                lineHeight: 14,
                fontFamily: 'monospace',
                textBorderColor: 'rgba(0, 0, 0, 0.75)',
                textBorderWidth: 1.5
              }
            }
          },
          itemStyle: {
            borderColor: chartTheme.cardBorder,
            borderWidth: 2,
            borderRadius: 6
          },
          emphasis: {
            label: {
              show: true,
              formatter: (params: any) => {
                const [, yIdx, alpha, absVal] = params.value;
                const entity = entities[yIdx];
                const absSign = absVal > 0 ? '+' : '';
                const retStr = `${absSign}${absVal.toFixed(2)}%`;
                
                if (entity.isSpy) {
                  return `{retHover|${retStr}}\n{alphaHover|Ref. SPY}`;
                }
                const alphaSign = alpha > 0 ? '+' : '';
                const alphaStr = `α ${alphaSign}${alpha.toFixed(2)}%`;
                return `{retHover|${retStr}}\n{alphaHover|${alphaStr}}`;
              },
              rich: {
                retHover: {
                  fontSize: 13,
                  fontWeight: 'bold',
                  color: '#ffffff',
                  lineHeight: 18,
                  fontFamily: 'monospace',
                  textBorderColor: 'rgba(0, 0, 0, 0.9)',
                  textBorderWidth: 2.5
                },
                alphaHover: {
                  fontSize: 11,
                  fontWeight: 'bold',
                  color: '#ffffff',
                  lineHeight: 14,
                  fontFamily: 'monospace',
                  textBorderColor: 'rgba(0, 0, 0, 0.9)',
                  textBorderWidth: 2
                }
              }
            },
            itemStyle: {
              shadowBlur: 14,
              shadowColor: 'rgba(0, 0, 0, 0.7)',
              borderColor: '#ffffff',
              borderWidth: 2
            }
          }
        }
      ]
    };

    return { chartOption: option, chartHeight: calculatedHeight };
  }, [data, chartTheme]);

  // TanStack Table columns
  const columnHelper = createColumnHelper<AssetDetail>();
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO',
      cell: info => <span className="font-extrabold text-slate-900 dark:text-foreground text-xs tracking-wide">{info.getValue()}</span>,
    }),
    columnHelper.accessor('portfolio', {
      header: 'CARTERA',
      cell: info => (
        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-foreground dark:border-blue-500/20 font-bold">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('close', {
      header: 'PRECIO USD',
      cell: info => {
        const val = info.getValue();
        return (
          <span className="font-mono text-xs text-slate-700 dark:text-muted-foreground tabular-nums">
            {typeof val === 'number' ? `U$ ${val.toFixed(2)}` : '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('perf_3m', {
      header: '3 MESES',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        return (
          <span className={`font-mono text-xs font-bold tabular-nums ${val >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    }),
    columnHelper.accessor('perf_6m', {
      header: '6 MESES',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        return (
          <span className={`font-mono text-xs font-bold tabular-nums ${val >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    }),
    columnHelper.accessor('perf_ytd', {
      header: 'YTD',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        return (
          <span className={`font-mono text-xs font-bold tabular-nums ${val >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    }),
    columnHelper.accessor('perf_1y', {
      header: '1 AÑO',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        return (
          <span className={`font-mono text-xs font-bold tabular-nums ${val >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    }),
    columnHelper.accessor('beta', {
      header: 'BETA (SPY)',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        
        let colorClass = 'text-muted-foreground bg-secondary/50 border-border';
        let labelDesc = 'Neutro (~1.0)';
        if (val < 0.8) {
          colorClass = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
          labelDesc = 'Defensivo (<0.8)';
        } else if (val > 1.2) {
          colorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
          labelDesc = 'Agresivo (>1.2)';
        }

        return (
          <span 
            title={`Beta respecto a SPY: ${val.toFixed(2)} (${labelDesc})`}
            className={`font-mono text-xs font-bold px-2 py-0.5 rounded border tabular-nums inline-block ${colorClass}`}
          >
            {val.toFixed(2)}
          </span>
        );
      },
    }),
    columnHelper.accessor('sma50_dist', {
      header: 'SMA 50',
      cell: info => <span className="font-mono text-[11px] text-slate-600 dark:text-muted-foreground tabular-nums">{info.getValue()}</span>,
    }),
    columnHelper.accessor('sma200_dist', {
      header: 'SMA 200',
      cell: info => <span className="font-mono text-[11px] text-slate-600 dark:text-muted-foreground tabular-nums">{info.getValue()}</span>,
    }),
    columnHelper.accessor('rsi', {
      header: 'RSI (14)',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        const color = val > 65 ? 'text-rose-600 dark:text-negative' : (val < 35 ? 'text-emerald-600 dark:text-positive' : 'text-slate-700 dark:text-muted-foreground');
        return <span className={`font-mono text-xs font-bold tabular-nums ${color}`}>{val.toFixed(1)}</span>;
      },
    }),
  ], []);

  const table = useReactTable({
    data: filteredAssets,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-foreground flex items-center gap-3">
            Rendimiento Multiactivo vs Benchmark
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-foreground dark:border-blue-500/30">
              TradingView Feed
            </span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-muted-foreground mt-1">
            Métricas de rendimiento histórico ponderado, medias móviles simples (SMA50/200) y Alpha vs. SPY.
          </p>
        </div>

        <button
          onClick={fetchPerformanceData}
          disabled={refreshing}
          className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-secondary/50 dark:hover:bg-secondary/50 dark:text-muted-foreground font-bold text-xs flex items-center gap-2 border border-slate-200 dark:border-border transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar Métricas
        </button>
      </div>

      {loading && !data ? (
        <div className="bg-card border border-border h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Escaneando métricas de rendimiento multiactivo...</span>
        </div>
      ) : data ? (
        <>
          {/* Heatmap Matrix Chart */}
          <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-3 border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-positive" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Matriz Comparativa de Rendimiento & Alpha vs. SPY (%)
                </h3>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Gradiente térmico por <strong className="text-positive">Alpha diferencial</strong> (Verde: superó a SPY / Grafito: a la par / Rojo: por debajo).
              </span>
            </div>
            <ReactECharts echarts={echarts} option={chartOption} style={{ height: `${chartHeight}px` }} />
          </div>

          {/* Portfolio Aggregated Performance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.portfolio_summaries.map(pf => (
              <div key={pf.name} className="bg-card border border-border p-5 rounded-2xl flex flex-col justify-between gap-3 border border-slate-200 dark:border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-slate-900 dark:text-foreground">{pf.name} (Ponderado)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-foreground font-bold uppercase">
                    Portfolio
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-border">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-muted-foreground font-bold">3M</span>
                    <span className={`text-xs font-bold font-mono ${pf.perf_3m >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
                      {pf.perf_3m > 0 ? '+' : ''}{pf.perf_3m}%
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-muted-foreground font-bold">6M</span>
                    <span className={`text-xs font-bold font-mono ${pf.perf_6m >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
                      {pf.perf_6m > 0 ? '+' : ''}{pf.perf_6m}%
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-muted-foreground font-bold">YTD</span>
                    <span className={`text-xs font-bold font-mono ${pf.perf_ytd >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
                      {pf.perf_ytd > 0 ? '+' : ''}{pf.perf_ytd}%
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-muted-foreground font-bold">1A</span>
                    <span className={`text-xs font-bold font-mono ${pf.perf_1y >= 0 ? 'text-emerald-600 dark:text-positive' : 'text-rose-600 dark:text-negative'}`}>
                      {pf.perf_1y > 0 ? '+' : ''}{pf.perf_1y}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-muted-foreground font-mono pt-1">
                  <span>SMA 50: {pf.sma50_dist}</span>
                  {typeof pf.beta === 'number' && (
                    <span className="font-bold text-muted-foreground">
                      Beta: <span className={pf.beta > 1.2 ? 'text-amber-400' : (pf.beta < 0.8 ? 'text-sky-400' : 'text-foreground')}>{pf.beta.toFixed(2)}</span>
                    </span>
                  )}
                  <span>SMA 200: {pf.sma200_dist}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Asset Breakdown Table */}
          <div className="bg-card border border-border p-6 rounded-2xl flex flex-col gap-4 border border-slate-200 dark:border-border shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-foreground">
                  Detalle de Activos y Medias Móviles
                </h2>
                <p className="text-xs text-slate-600 dark:text-muted-foreground mt-0.5">
                  Tabla de rendimiento multitemporal con distancia a medias móviles SMA 50 y SMA 200.
                </p>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar activo..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="h-9 pl-9 pr-3 bg-slate-50 dark:bg-secondary border border-slate-200 dark:border-border rounded-xl text-xs font-bold text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors w-40"
                  />
                </div>

                <div className="flex items-center bg-slate-100 dark:bg-secondary p-1 rounded-xl border border-slate-200 dark:border-border text-xs font-bold">
                  <button
                    onClick={() => setPortfolioFilter('all')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${portfolioFilter === 'all' ? 'bg-blue-600 text-foreground shadow-sm' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/60 dark:hover:bg-secondary/50'}`}
                  >
                    Todos
                  </button>
                  {data.portfolio_summaries.map(pf => (
                    <button
                      key={pf.name}
                      onClick={() => setPortfolioFilter(pf.name)}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${portfolioFilter === pf.name ? 'bg-blue-600 text-foreground shadow-sm' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/60 dark:hover:bg-secondary/50'}`}
                    >
                      {pf.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-border">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-secondary/50 border-b border-slate-200 dark:border-border">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => {
                        const canSort = header.column.getCanSort();
                        const isSorted = header.column.getIsSorted();
                        return (
                          <th 
                            key={header.id} 
                            onClick={header.column.getToggleSortingHandler()}
                            className={`p-2.5 font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground select-none ${canSort ? 'cursor-pointer hover:text-foreground transition-colors' : ''}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                              {isSorted === 'asc' && <span className="text-blue-500 font-bold">↑</span>}
                              {isSorted === 'desc' && <span className="text-blue-500 font-bold">↓</span>}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="p-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
