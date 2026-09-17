import React, { useEffect, useState, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { ScatterChart, LineChart } from 'echarts/charts';
import {
  TooltipComponent,
  GridComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  ScatterChart,
  LineChart,
  TooltipComponent,
  GridComponent,
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
  Search, 
  RefreshCw
} from 'lucide-react';

interface BondRow {
  ticker: string;
  nombre?: string;
  descripcion?: string;
  tipo?: string;
  ley?: string | null;
  precio?: number | null;
  md?: number | null;
  tea?: number | null;
  tem_mkt?: number | null;
  tna?: number | null;
  tir?: number | null;
  tir_real?: number | null;
  dias?: number | null;
  vencimiento?: string | null;
  vence?: string | null;
  posicion_curva?: string | null;
  spread_curva_bps?: number | null;
  paridad?: number | null;
  monto?: number | null;
  teorica?: number | null;
  vf?: number | null;
  cupones?: number | null;
}

interface ScatterPoint {
  ticker: string;
  md: number;
  yield_val: number;
  posicion_curva: string;
  precio: number | null;
  paridad: number | null;
  spread_curva_bps: number | null;
}

interface FixedIncomeResponse {
  category: string;
  ley: string;
  tipo_inst: string;
  highlights: {
    best_tir?: { ticker: string; val: string };
    lowest_parity?: { ticker: string; val: string };
    most_liquid?: { ticker: string; val: string };
    efficient?: { ticker: string; val: string };
  };
  scatter_points: ScatterPoint[];
  curve_line: number[][];
  table_data: BondRow[];
}

export const FixedIncomeView: React.FC = () => {
  const [category, setCategory] = useState<string>('lecap');
  const [ley, setLey] = useState<string>('Ambas');
  const [tipoInst, setTipoInst] = useState<string>('Todos');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [data, setData] = useState<FixedIncomeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const fetchCurveData = async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({
        category,
        ley,
        tipo_inst: tipoInst
      });
      const res = await fetch(`/api/renta_fija/curve_json?${params.toString()}`);
      if (res.ok) {
        const json: FixedIncomeResponse = await res.json();
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
    fetchCurveData();
  }, [category, ley, tipoInst]);

  // Filtered rows for TanStack Table
  const filteredRows = useMemo(() => {
    if (!data?.table_data) return [];
    return data.table_data.filter(row => {
      const q = searchFilter.toLowerCase().trim();
      if (!q) return true;
      return (
        (row.ticker && row.ticker.toLowerCase().includes(q)) || 
        (row.tipo && row.tipo.toLowerCase().includes(q)) ||
        (row.ley && row.ley.toLowerCase().includes(q)) ||
        (row.nombre && row.nombre.toLowerCase().includes(q)) ||
        (row.descripcion && row.descripcion.toLowerCase().includes(q))
      );
    });
  }, [data, searchFilter]);

  // ECharts: Scatter Curve (TIR / TEA vs. Modified Duration)
  const chartOption = useMemo(() => {
    if (!data?.scatter_points || data.scatter_points.length === 0) return {};

    const isLecap = data.category === 'lecap';
    const yAxisLabel = isLecap ? 'TEA / TIR (%)' : 'TIR (%)';

    // Series: Points
    const pointsData = data.scatter_points.map(pt => ({
      name: pt.ticker,
      value: [pt.md, pt.yield_val],
      itemStyle: {
        color: pt.posicion_curva === 'arriba' 
          ? '#49d090' 
          : (pt.posicion_curva === 'abajo' ? '#ff453a' : '#38bdf8')
      },
      raw: pt
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#181920',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        textStyle: { color: '#ffffff', fontSize: 11 },
        formatter: (params: any) => {
          const pt = params.data?.raw;
          if (!pt) {
            if (Array.isArray(params.data) && params.data.length >= 2) {
              return `
                <div style="padding: 2px 4px;">
                  <div style="font-weight: 800; font-size: 12px; margin-bottom: 4px; color: #38bdf8;">Curva Benchmark</div>
                  <div>Modified Duration: <strong>${params.data[0]} años</strong></div>
                  <div>Tasa Teórica: <strong>${params.data[1]}%</strong></div>
                </div>
              `;
            }
            return '';
          }
          const priceLabel = isLecap 
            ? `A$ ${pt.precio ? Number(pt.precio).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}` 
            : `U$ ${pt.precio ? Number(pt.precio).toFixed(2) : '—'}`;
          return `
            <div style="padding: 2px 4px;">
              <div style="font-weight: 800; font-size: 12px; margin-bottom: 4px; color: #60a5fa;">${pt.ticker}</div>
              <div>Modified Duration: <strong>${pt.md} años</strong></div>
              <div>${yAxisLabel}: <strong>${pt.yield_val}%</strong></div>
              ${pt.spread_curva_bps !== null && pt.spread_curva_bps !== undefined ? `<div>Spread vs Curva: <strong style="color: ${pt.spread_curva_bps >= 0 ? '#49d090' : '#ff453a'};">${pt.spread_curva_bps > 0 ? '+' : ''}${pt.spread_curva_bps} bps</strong></div>` : ''}
              ${pt.precio ? `<div>Precio: <strong>${priceLabel}</strong></div>` : ''}
              ${pt.paridad ? `<div>Paridad: <strong>${pt.paridad.toFixed(1)}%</strong></div>` : ''}
            </div>
          `;
        }
      },
      grid: { left: 50, right: 30, top: 30, bottom: 35 },
      xAxis: {
        type: 'value',
        scale: true,
        name: 'Modified Duration (Años)',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: '#a1a1aa', fontSize: 10 },
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
        axisLabel: { color: '#a1a1aa', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } }
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: yAxisLabel,
        nameTextStyle: { color: '#a1a1aa', fontSize: 10 },
        axisLabel: { color: '#a1a1aa', formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.06)' } }
      },
      series: [
        {
          name: 'Títulos',
          type: 'scatter',
          symbolSize: 12,
          label: {
            show: true,
            formatter: '{b}',
            position: 'top',
            color: '#e4e4e7',
            fontSize: 10,
            fontFamily: 'monospace'
          },
          data: pointsData
        },
        ...(data.curve_line && data.curve_line.length > 0 ? [{
          name: 'Curva Benchmark',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#38bdf8', width: 2, type: 'dashed' },
          data: data.curve_line
        }] : [])
      ]
    };
  }, [data]);

  // TanStack Table columns
  const columnHelper = createColumnHelper<BondRow>();
  const isLecap = data?.category === 'lecap';

  const columns = useMemo(() => {
    if (isLecap) {
      return [
        columnHelper.accessor('ticker', {
          header: 'TÍTULO',
          cell: info => <span className="font-extrabold text-foreground text-xs tracking-wide">{info.getValue()}</span>,
        }),
        columnHelper.accessor('tipo', {
          header: 'INSTRUMENTO',
          cell: info => {
            const val = info.getValue();
            return (
              <span className="text-[10px] px-2 py-0.5 rounded bg-secondary/50 text-muted-foreground border border-border font-bold">
                {val || 'LECAP'}
              </span>
            );
          },
        }),
        columnHelper.accessor('precio', {
          header: 'PRECIO ARS',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return (
              <span className="font-mono text-xs text-foreground font-bold tabular-nums">
                A$ {val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            );
          },
        }),
        columnHelper.accessor('tem_mkt', {
          header: 'TEM MENSUAL (%)',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return (
              <span className="font-mono text-xs font-black text-positive bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded tabular-nums inline-block">
                {val.toFixed(2)}%
              </span>
            );
          },
        }),
        columnHelper.accessor('tea', {
          header: 'TEA (%)',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return (
              <span className="font-mono text-xs font-bold text-positive tabular-nums">
                {val.toFixed(2)}%
              </span>
            );
          },
        }),
        columnHelper.accessor('tna', {
          header: 'TNA (%)',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {val.toFixed(2)}%
              </span>
            );
          },
        }),
        columnHelper.accessor('md', {
          header: 'MODIFIED DURATION',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return <span className="font-mono text-xs text-muted-foreground tabular-nums">{val.toFixed(2)} a</span>;
          },
        }),
        columnHelper.accessor('spread_curva_bps', {
          header: 'SPREAD VS CURVA',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            const color = val >= 0 
              ? 'text-positive bg-emerald-500/10 border-emerald-500/30' 
              : 'text-negative bg-red-500/10 border-red-500/30';
            return (
              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${color}`}>
                {val > 0 ? '+' : ''}{val} bps
              </span>
            );
          },
        }),
        columnHelper.accessor('vf', {
          header: 'VALOR FINAL (VF)',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return <span className="font-mono text-xs text-muted-foreground tabular-nums">A$ {val.toFixed(2)}</span>;
          },
        }),
        columnHelper.accessor('dias', {
          header: 'DÍAS AL VTO',
          cell: info => {
            const val = info.getValue();
            if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
            return <span className="font-mono text-xs text-muted-foreground tabular-nums">{val}d</span>;
          },
        }),
      ];
    }

    // Soberanos USD & BOPREAL columns
    return [
      columnHelper.accessor('ticker', {
        header: 'TÍTULO',
        cell: info => <span className="font-extrabold text-foreground text-xs tracking-wide">{info.getValue()}</span>,
      }),
      columnHelper.accessor(row => row.ley || row.tipo, {
        id: 'ley_tipo',
        header: 'JURISDICCIÓN / LEY',
        cell: info => {
          const val = (info.getValue() || '').trim();
          const isNY = val.includes('NY');
          const isLocal = val.includes('Local');
          const badgeClass = isNY 
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
            : isLocal 
              ? 'bg-blue-500/10 text-foreground border-blue-500/30'
              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
          return (
            <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${badgeClass}`}>
              {val || 'Soberano'}
            </span>
          );
        },
      }),
      columnHelper.accessor('precio', {
        header: 'PRECIO USD',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          return (
            <span className="font-mono text-xs text-foreground font-bold tabular-nums">
              U$ {val.toFixed(2)}
            </span>
          );
        },
      }),
      columnHelper.accessor(row => row.tir ?? row.tir_real, {
        id: 'tir',
        header: 'TIR ANUAL (%)',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          return (
            <span className="font-mono text-xs font-black text-positive tabular-nums">
              {val.toFixed(2)}%
            </span>
          );
        },
      }),
      columnHelper.accessor('paridad', {
        header: 'PARIDAD (%)',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          return <span className="font-mono text-xs text-muted-foreground tabular-nums">{val.toFixed(1)}%</span>;
        },
      }),
      columnHelper.accessor('md', {
        header: 'MODIFIED DURATION',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          return <span className="font-mono text-xs text-muted-foreground tabular-nums">{val.toFixed(2)} años</span>;
        },
      }),
      columnHelper.accessor('spread_curva_bps', {
        header: 'SPREAD VS CURVA',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          const color = val >= 0 
            ? 'text-positive bg-emerald-500/10 border-emerald-500/30' 
            : 'text-negative bg-red-500/10 border-red-500/30';
          return (
            <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${color}`}>
              {val > 0 ? '+' : ''}{val} bps
            </span>
          );
        },
      }),
      columnHelper.accessor('cupones', {
        header: 'CUPONES',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          return <span className="font-mono text-xs text-muted-foreground tabular-nums">{val}</span>;
        },
      }),
    ];
  }, [isLecap]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
            Curvas de Renta Fija Soberana
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-blue-500/10 text-foreground border border-blue-500/30">
              MAE / BYMA Live
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análisis de rendimiento, Modified Duration y spreads de compresión vs. curva benchmark.
          </p>
        </div>

        {/* Category Selector Tabs */}
        <div className="flex items-center gap-2 bg-secondary p-1.5 rounded-2xl border border-border">
          <button
            onClick={() => setCategory('lecap')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              category === 'lecap'
                ? 'bg-blue-600 text-foreground shadow-md scale-[1.02]'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            LECAPs & BONCAPs
          </button>
          <button
            onClick={() => setCategory('soberanos')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              category === 'soberanos'
                ? 'bg-blue-600 text-foreground shadow-md scale-[1.02]'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            Soberanos USD
          </button>
          <button
            onClick={() => setCategory('bopreal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              category === 'bopreal'
                ? 'bg-blue-600 text-foreground shadow-md scale-[1.02]'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            BOPREAL
          </button>
        </div>
      </div>

      {/* Sub-Filters Bar */}
      <div className="bg-secondary/80 border border-border p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          {category === 'lecap' && (
            <div className="flex items-center gap-1.5 bg-secondary p-1 rounded-xl border border-border text-xs font-bold">
              {['Todos', 'LECAP', 'BONCAP', 'BONTE'].map(t => (
                <button
                  key={t}
                  onClick={() => setTipoInst(t)}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${tipoInst === t ? 'bg-blue-600 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {category === 'soberanos' && (
            <div className="flex items-center gap-1.5 bg-secondary p-1 rounded-xl border border-border text-xs font-bold">
              {['Ambas', 'Ley NY', 'Ley Local'].map(l => (
                <button
                  key={l}
                  onClick={() => setLey(l)}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${ley === l ? 'bg-blue-600 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar título..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="h-9 pl-9 pr-3 bg-secondary border border-border rounded-xl text-xs font-bold text-foreground placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors w-40"
            />
          </div>
        </div>

        <button
          onClick={fetchCurveData}
          disabled={refreshing}
          className="h-9 px-4 rounded-xl bg-secondary/50 hover:bg-secondary/50 text-muted-foreground font-bold text-xs flex items-center gap-2 border border-border transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar Curva
        </button>
      </div>

      {loading && !data ? (
        <div className="bg-secondary/80 border border-border h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-muted-foreground backdrop-blur-md">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Descargando cotizaciones y flujos de fondos desde MAE/BYMA...</span>
        </div>
      ) : data ? (
        <>
          {/* Highlights KPI Cards */}
          {data.highlights && Object.keys(data.highlights).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data.highlights.best_tir && (
                <div className="bg-secondary/80 border border-border p-4 rounded-2xl flex flex-col justify-between backdrop-blur-md">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Mayor Rendimiento</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-positive tabular-nums">{data.highlights.best_tir.val}</span>
                    <span className="text-xs text-foreground font-bold">{data.highlights.best_tir.ticker}</span>
                  </div>
                </div>
              )}

              {data.highlights.lowest_parity && (
                <div className="bg-secondary/80 border border-border p-4 rounded-2xl flex flex-col justify-between backdrop-blur-md">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Menor Paridad (Margen)</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-foreground tabular-nums">{data.highlights.lowest_parity.val}</span>
                    <span className="text-xs text-foreground font-bold">{data.highlights.lowest_parity.ticker}</span>
                  </div>
                </div>
              )}

              {data.highlights.most_liquid && (
                <div className="bg-secondary/80 border border-border p-4 rounded-2xl flex flex-col justify-between backdrop-blur-md">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Mayor Liquidez MAE</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-foreground tabular-nums">{data.highlights.most_liquid.val}</span>
                    <span className="text-xs text-muted-foreground font-bold">{data.highlights.most_liquid.ticker}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scatter Yield Curve Chart */}
          <div className="bg-secondary/80 border border-border p-5 rounded-2xl flex flex-col gap-3 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Curva de Rendimiento vs. Modified Duration (Benchmark Spline)
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Posición de cada título respecto a la curva teórica del mercado.
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#49d090] shadow-[0_0_8px_rgba(73,208,144,0.4)]" />
                  <span>Tasa con Premio (Mayor rendimiento)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff453a] shadow-[0_0_8px_rgba(255,69,58,0.4)]" />
                  <span>Tasa Comprimida (Menor rendimiento)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 border-t-2 border-dashed border-sky-400 inline-block" />
                  <span>Benchmark</span>
                </div>
              </div>
            </div>

            {data.scatter_points && data.scatter_points.length > 0 ? (
              <ReactECharts echarts={echarts} option={chartOption} style={{ height: '320px' }} />
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                No hay suficientes puntos negociados para trazar la curva en esta categoría.
              </div>
            )}
          </div>

          {/* TanStack Table */}
          <div className="bg-secondary/80 border border-border p-5 rounded-2xl flex flex-col gap-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black uppercase tracking-wider text-foreground">
                  Títulos y Fichas Técnicas
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Instrumentos filtrados con rendimientos, Modified Duration y spreads relativos.
                </p>
              </div>
            </div>

            {filteredRows.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-secondary/50 border-b border-border">
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => {
                          const canSort = header.column.getCanSort();
                          const isSorted = header.column.getIsSorted();
                          return (
                            <th 
                              key={header.id} 
                              onClick={header.column.getToggleSortingHandler()}
                              className={`px-2.5 py-2 font-bold uppercase tracking-wider text-[11px] select-none ${
                                canSort ? 'cursor-pointer hover:text-foreground transition-colors' : ''
                              } ${isSorted ? 'text-foreground' : 'text-muted-foreground'}`}
                            >
                              <div className="flex items-center gap-1">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {isSorted === 'asc' && <span className="text-[10px]">▲</span>}
                                {isSorted === 'desc' && <span className="text-[10px]">▼</span>}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {table.getRowModel().rows.map(row => (
                      <tr key={row.id} className="hover:bg-secondary/50 transition-colors">
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-3 py-2">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No se encontraron activos para los filtros seleccionados.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
