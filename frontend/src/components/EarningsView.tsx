import React, { useEffect, useState, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import {
  TooltipComponent,
  VisualMapComponent,
  GridComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '../hooks/useChartTheme';

echarts.use([
  HeatmapChart,
  TooltipComponent,
  VisualMapComponent,
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
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  RefreshCw, 
  CalendarDays, 
  Edit3, 
  Save, 
  X,
  Flame,
  LayoutList,
  Layers
} from 'lucide-react';

interface EarningsItem {
  ticker: string;
  company: string;
  fiscal_close?: string;
  report_months_text?: string;
  report_months: number[];
  typical_window?: string;
  confirmed_date?: string | null;
  confirmed_date_formatted?: string | null;
  target_month?: number;
  target_month_name?: string;
  months_diff?: number;
  delta_days?: number | null;
  status_tier: 'current_month' | 'next_month' | 'later' | 'past';
  status_text: string;
  badge_class: string;
  is_active: boolean;
}

interface EarningsResponse {
  today_str: string;
  current_month: number;
  current_month_name: string;
  next_month_name: string;
  months_es: string[];
  months_full_es: string[];
  earnings: EarningsItem[];
  heatmap: {
    tickers: string[];
    data: number[][];
  };
  stats: {
    current_month_count: number;
    next_month_count: number;
    later_count: number;
    past_count: number;
    total_count: number;
  };
}

export const EarningsView: React.FC = () => {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTier, setActiveTier] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);
  
  // Date Editing modal / inline state
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [savingDate, setSavingDate] = useState<boolean>(false);

  const fetchEarningsData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/earnings/summary_json');
      if (!res.ok) throw new Error('Error al cargar cronograma de reportes');
      const json: EarningsResponse = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEarningsData();
  }, []);

  const handleSaveDate = async (ticker: string, confirmedDate: string | null) => {
    setSavingDate(true);
    try {
      const res = await fetch('/api/earnings/save_date_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, confirmed_date: confirmedDate || null })
      });
      if (res.ok) {
        setEditingTicker(null);
        await fetchEarningsData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingDate(false);
    }
  };

  // Filtered earnings list
  const filteredEarnings = useMemo(() => {
    if (!data?.earnings) return [];
    return data.earnings.filter(item => {
      // Search
      const q = searchFilter.toLowerCase().trim();
      const matchesSearch = !q || item.ticker.toLowerCase().includes(q) || item.company.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      // Tier filter
      if (activeTier === 'current_month') return item.status_tier === 'current_month';
      if (activeTier === 'next_month') return item.status_tier === 'next_month';
      if (activeTier === 'later') return item.status_tier === 'later';
      if (activeTier === 'past') return item.status_tier === 'past';
      return true;
    });
  }, [data, searchFilter, activeTier]);

  // TanStack Table columns
  const columnHelper = createColumnHelper<EarningsItem>();
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO / EMPRESA',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-900 dark:text-white text-sm tracking-wide">{row.ticker}</span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">{row.company}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('delta_days', {
      header: 'PRÓXIMO REPORTE (DÍAS)',
      cell: info => {
        const row = info.row.original;
        const d = info.getValue();
        const isPast = row.status_tier === 'past';
        const isCurrent = row.status_tier === 'current_month';
        const isNext = row.status_tier === 'next_month';

        let badgeText = '';
        let badgeStyle = 'bg-white/5 text-zinc-300 border-white/10';

        if (d === 0) {
          badgeText = '🚨 ¡Reporta hoy!';
          badgeStyle = 'bg-red-500/20 text-red-400 border-red-500/40 font-black animate-pulse shadow-sm shadow-red-500/20';
        } else if (d === 1) {
          badgeText = '⚡ Mañana (1d)';
          badgeStyle = 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold';
        } else if (d !== null && d !== undefined && d > 1) {
          if (d < 14) {
            badgeText = `en ${d} días`;
            badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold';
          } else if (isCurrent) {
            badgeText = `en ${d} días`;
            badgeStyle = 'bg-blue-500/15 text-blue-300 border-blue-500/30 font-semibold';
          } else {
            badgeText = `en ${d} días`;
            badgeStyle = 'bg-white/5 text-zinc-300 border-white/10 font-mono';
          }
        } else if (d !== null && d !== undefined && d < 0) {
          badgeText = `hace ${Math.abs(d)} días`;
          badgeStyle = 'bg-zinc-800/60 text-zinc-500 border-zinc-700 font-mono';
        } else {
          badgeText = row.status_text || (row.target_month_name ? `Mes de ${row.target_month_name}` : '—');
          badgeStyle = isCurrent 
            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
            : isNext 
            ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
            : isPast
            ? 'bg-zinc-800/60 text-zinc-500 border-zinc-700'
            : 'bg-white/5 text-zinc-400 border-white/10';
        }

        return (
          <div className="relative group/tip inline-flex items-center gap-2 cursor-help">
            <span className={`text-[11px] px-2.5 py-1 rounded-lg border uppercase tracking-wider font-mono ${badgeStyle}`}>
              {badgeText}
            </span>
            {/* Tooltip flotante al hover con fecha exacta */}
            <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tip:flex flex-col gap-1 z-50 bg-[#121318] border border-white/20 text-[11px] p-2.5 rounded-lg shadow-2xl pointer-events-none whitespace-nowrap text-left">
              <div className="text-white font-bold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Reporte Corporativo ({row.ticker})</span>
              </div>
              <div className="text-zinc-300 font-mono text-xs">
                {row.confirmed_date ? (
                  <>Fecha exacta: <strong className="text-blue-300 font-bold">{row.confirmed_date_formatted || row.confirmed_date}</strong> (Confirmada)</>
                ) : (
                  <>Fecha tentativa: <strong className="text-amber-300 font-medium">No confirmada aún</strong></>
                )}
              </div>
              {row.typical_window && (
                <div className="text-[10px] text-zinc-400">
                  Ventana histórica habitual: {row.typical_window}
                </div>
              )}
              {d !== null && d !== undefined && (
                <div className="text-[10px] text-zinc-400 border-t border-white/10 pt-1 mt-0.5 font-mono">
                  {d >= 0 ? `Faltan exactamente ${d} días corridos` : `Reportó hace ${Math.abs(d)} días`}
                </div>
              )}
            </div>
          </div>
        );
      },
    }),

    columnHelper.accessor('confirmed_date', {
      header: 'FECHA CONFIRMADA',
      cell: info => {
        const row = info.row.original;
        const isEditing = editingTicker === row.ticker;

        if (isEditing) {
          return (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={editDateValue}
                onChange={e => setEditDateValue(e.target.value)}
                className="h-8 px-2 bg-slate-50 dark:bg-black/60 border border-blue-500 rounded-lg text-xs text-slate-900 dark:text-white font-mono outline-none"
              />
              <button
                onClick={() => handleSaveDate(row.ticker, editDateValue)}
                disabled={savingDate}
                className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                title="Guardar Fecha"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setEditingTicker(null)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-white/10 dark:hover:bg-white/20 dark:text-zinc-300 rounded-lg transition-colors"
                title="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2 group">
            {row.confirmed_date ? (
              <span className="font-mono text-xs text-blue-700 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">
                {row.confirmed_date_formatted || row.confirmed_date}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">No fijada</span>
            )}
            <button
              onClick={() => {
                setEditingTicker(row.ticker);
                setEditDateValue(row.confirmed_date || '');
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
              title="Modificar fecha exacta"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    }),
    columnHelper.accessor('typical_window', {
      header: 'VENTANA HISTÓRICA',
      cell: info => <span className="text-xs text-slate-600 dark:text-zinc-400 font-medium">{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('report_months_text', {
      header: 'CICLO TRIMESTRAL',
      cell: info => {
        const val = info.getValue();
        return (
          <span className="text-[11px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-black/30 px-2 py-1 rounded border border-slate-200 dark:border-white/5">
            {val || '—'}
          </span>
        );
      },
    }),
  ], [editingTicker, editDateValue, savingDate]);

  const table = useReactTable({
    data: filteredEarnings,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const chartTheme = useChartTheme();

  // ECharts: Heatmap Option
  const heatmapOption = useMemo(() => {
    if (!data?.heatmap) return {};
    const months = data.months_es || [];
    const tickers = data.heatmap.tickers || [];
    const rawData = data.heatmap.data || [];

    const emptyColor = chartTheme.isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc';
    const habitColor = chartTheme.isDark ? '#1e3a8a' : '#bfdbfe';
    const confirmedColor = chartTheme.isDark ? '#0082ff' : '#2563eb';

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        formatter: (params: any) => {
          const m = months[params.data[0]];
          const t = tickers[params.data[1]];
          const status = params.data[2] === 2 ? 'Fecha Confirmada' : (params.data[2] === 1 ? 'Mes Habitual' : 'Sin reporte');
          return `<strong>${t}</strong> • ${m}<br/>${status}`;
        }
      },
      grid: {
        top: 20,
        bottom: 25,
        left: 60,
        right: 15,
      },
      xAxis: {
        type: 'category',
        data: months,
        splitArea: { show: false },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: chartTheme.axisLine } }
      },
      yAxis: {
        type: 'category',
        data: tickers,
        axisLabel: { color: chartTheme.textPrimary, fontSize: 9, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: chartTheme.axisLine } }
      },
      visualMap: {
        min: 0,
        max: 2,
        show: false,
        inRange: {
          color: [emptyColor, habitColor, confirmedColor]
        }
      },
      series: [
        {
          name: 'Calendario',
          type: 'heatmap',
          data: rawData,
          itemStyle: {
            borderColor: chartTheme.cardBorder,
            borderWidth: 1.5,
            borderRadius: 3
          }
        }
      ]
    };
  }, [data, chartTheme]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            Calendario de Reportes Trimestrales
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30">
              Earnings Hub
            </span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
            Seguimiento de fechas de balances, alertas inminentes y matriz de ciclos corporativos.
          </p>
        </div>

        <button
          onClick={fetchEarningsData}
          disabled={refreshing}
          className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:text-zinc-300 font-bold text-xs flex items-center gap-2 border border-slate-200 dark:border-white/10 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar Cronograma
        </button>
      </div>

      {loading && !data ? (
        <div className="glass-panel h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Calculando fechas y ciclos de reportes trimestrales...</span>
        </div>
      ) : data ? (
        <>
          {/* Status KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Este Mes */}
            <div 
              onClick={() => setActiveTier('current_month')}
              className={`glass-panel p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'current_month' ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">Este Mes ({data.current_month_name})</span>
                <Flame className="w-4 h-4 text-red-500 dark:text-red-400" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                {data.stats.current_month_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1 font-mono">Reportes inminentes</span>
            </div>

            {/* Próximo Mes */}
            <div 
              onClick={() => setActiveTier('next_month')}
              className={`glass-panel p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'next_month' ? 'border-orange-400 bg-orange-50/50 dark:border-orange-500/50 dark:bg-orange-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">Próximo Mes ({data.next_month_name})</span>
                <CalendarDays className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                {data.stats.next_month_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1 font-mono">Próxima ventana</span>
            </div>

            {/* Más Adelante */}
            <div 
              onClick={() => setActiveTier('later')}
              className={`glass-panel p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'later' ? 'border-blue-400 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">Más Adelante</span>
                <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                {data.stats.later_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1 font-mono">Ciclos posteriores</span>
            </div>

            {/* Ya Reportaron */}
            <div 
              onClick={() => setActiveTier('past')}
              className={`glass-panel p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'past' ? 'border-slate-400 bg-slate-100 dark:border-zinc-500/50 dark:bg-zinc-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">Ya Reportaron</span>
                <CheckCircle2 className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                {data.stats.past_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1 font-mono">Reportes pasados</span>
            </div>
          </div>

          {/* Heatmap Section */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  Matriz Térmica de Reportes Trimestrales (12 Meses)
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5">
                  Mapa de calor anual: las celdas brillantes representan fechas confirmadas.
                </p>
              </div>
            </div>
            <ReactECharts echarts={echarts} option={heatmapOption} style={{ height: '340px' }} />
          </div>

          {/* Table Controls & Filter Bar */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Cronograma Detallado de Balances
                </h2>
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                  Pasa el cursor sobre la fecha para fijar o modificar la fecha confirmada de cualquier activo.
                </p>
              </div>

              {/* Search & Tabs */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Buscar activo..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="h-9 pl-9 pr-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors w-44"
                  />
                </div>

                <div className="flex items-center bg-slate-100 dark:bg-black/40 p-1 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold">
                  <button
                    onClick={() => setActiveTier('all')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'}`}
                  >
                    Todos ({data.stats.total_count})
                  </button>
                  <button
                    onClick={() => setActiveTier('current_month')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'current_month' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'}`}
                  >
                    Este Mes ({data.stats.current_month_count})
                  </button>
                  <button
                    onClick={() => setActiveTier('next_month')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'next_month' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5'}`}
                  >
                    Próximo ({data.stats.next_month_count})
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th key={header.id} className="p-2.5 font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
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
