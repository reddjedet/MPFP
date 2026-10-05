import React, { useEffect, useState, useMemo } from 'react';
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
  Search, 
  RefreshCw, 
  Edit3, 
  Save, 
  X,
  Flame
} from 'lucide-react';

interface EarningsItem {
  ticker: string;
  company: string;
  in_portfolio: boolean;
  confirmed_date?: string | null;
  confirmed_date_formatted?: string | null;
  delta_days?: number | null;
  status_tier: 'current_month' | 'next_month' | 'later' | 'past' | 'unconfirmed';
  status_text: string;
  badge_class: string;
  is_active: boolean;
}

interface EarningsResponse {
  today_str: string;
  current_month: number;
  current_month_name: string;
  next_month_name: string;
  earnings: EarningsItem[];
  stats: {
    current_month_count: number;
    next_month_count: number;
    later_count: number;
    past_count: number;
    unconfirmed_count: number;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRest, setShowRest] = useState<boolean>(false);
  
  // Date Editing modal / inline state
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [savingDate, setSavingDate] = useState<boolean>(false);

  const fetchEarningsData = async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/earnings/summary_json');
      if (!res.ok) throw new Error('Error al cargar cronograma de reportes');
      const json: EarningsResponse = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
      setErrorMessage('No se pudo cargar el calendario. Intenta actualizarlo nuevamente.');
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
    setErrorMessage(null);
    try {
      const res = await fetch('/api/earnings/save_date_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, confirmed_date: confirmedDate || null })
      });
      if (!res.ok) throw new Error('No se pudo guardar la fecha');
      setEditingTicker(null);
      await fetchEarningsData();
    } catch (e) {
      console.error(e);
      setErrorMessage('No se pudo guardar la fecha confirmada. Verifica el valor e inténtalo nuevamente.');
    } finally {
      setSavingDate(false);
    }
  };

  const visibleEarnings = useMemo(() => {
    const earnings = data?.earnings ?? [];
    return showRest ? earnings : earnings.filter(item => item.in_portfolio);
  }, [data, showRest]);

  const visibleStats = useMemo(() => ({
    current_month_count: visibleEarnings.filter(item => item.status_tier === 'current_month').length,
    next_month_count: visibleEarnings.filter(item => item.status_tier === 'next_month').length,
    later_count: visibleEarnings.filter(item => item.status_tier === 'later').length,
    past_count: visibleEarnings.filter(item => item.status_tier === 'past').length,
    unconfirmed_count: visibleEarnings.filter(item => item.status_tier === 'unconfirmed').length,
    total_count: visibleEarnings.length,
  }), [visibleEarnings]);

  const restCount = data?.earnings.filter(item => !item.in_portfolio).length ?? 0;

  // Search and status filters apply only to the currently visible universe.
  const filteredEarnings = useMemo(() => {
    return visibleEarnings.filter(item => {
      // Search
      const q = searchFilter.toLowerCase().trim();
      const matchesSearch = !q || item.ticker.toLowerCase().includes(q) || item.company.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      // Tier filter
      if (activeTier === 'current_month') return item.status_tier === 'current_month';
      if (activeTier === 'next_month') return item.status_tier === 'next_month';
      if (activeTier === 'later') return item.status_tier === 'later';
      if (activeTier === 'past') return item.status_tier === 'past';
      if (activeTier === 'unconfirmed') return item.status_tier === 'unconfirmed';
      return true;
    });
  }, [visibleEarnings, searchFilter, activeTier]);

  // TanStack Table columns
  const columnHelper = createColumnHelper<EarningsItem>();
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO / EMPRESA',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col">
            <span className="font-extrabold text-slate-900 dark:text-foreground text-sm tracking-wide">{row.ticker}</span>
            {row.company !== row.ticker && (
              <span className="text-[11px] text-slate-500 dark:text-muted-foreground font-medium">{row.company}</span>
            )}
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
        let badgeStyle = 'bg-secondary/50 text-muted-foreground border-border';

        if (d === 0) {
          badgeText = '🚨 ¡Reporta hoy!';
          badgeStyle = 'bg-red-500/20 text-negative border-red-500/40 font-black animate-pulse shadow-sm shadow-red-500/20';
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
            badgeStyle = 'bg-secondary/50 text-muted-foreground border-border font-mono';
          }
        } else if (d !== null && d !== undefined && d < 0) {
          badgeText = `hace ${Math.abs(d)} días`;
          badgeStyle = 'bg-zinc-800/60 text-muted-foreground border-zinc-700 font-mono';
        } else {
          badgeText = row.status_text || '—';
          badgeStyle = isCurrent 
            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
            : isNext 
            ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
            : isPast
            ? 'bg-zinc-800/60 text-muted-foreground border-zinc-700'
            : 'bg-secondary/50 text-muted-foreground border-border';
        }

        return (
          <div className="relative group/tip inline-flex items-center gap-2 cursor-help">
            <span className={`text-[11px] px-2.5 py-1 rounded-lg border uppercase tracking-wider font-mono ${badgeStyle}`}>
              {badgeText}
            </span>
            {/* Tooltip flotante al hover con fecha exacta */}
            <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tip:flex flex-col gap-1 z-50 bg-[#121318] border border-border text-[11px] p-2.5 rounded-lg shadow-2xl pointer-events-none whitespace-nowrap text-left">
              <div className="text-foreground font-bold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-foreground" />
                <span>Reporte Corporativo ({row.ticker})</span>
              </div>
              <div className="text-muted-foreground font-mono text-xs">
                {row.confirmed_date ? (
                  <>Fecha exacta: <strong className="text-blue-300 font-bold">{row.confirmed_date_formatted || row.confirmed_date}</strong> (Confirmada)</>
                ) : (
                  <>Fecha: <strong className="text-amber-300 font-medium">Sin confirmar</strong></>
                )}
              </div>
              {d !== null && d !== undefined && (
                <div className="text-[10px] text-muted-foreground border-t border-border pt-1 mt-0.5 font-mono">
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
                className="h-8 px-2 bg-slate-50 dark:bg-black/60 border border-blue-500 rounded-lg text-xs text-slate-900 dark:text-foreground font-mono outline-none"
              />
              <button
                onClick={() => handleSaveDate(row.ticker, editDateValue)}
                disabled={savingDate}
                className="p-1.5 bg-blue-600 hover:bg-blue-500 text-foreground rounded-lg transition-colors"
                title="Guardar Fecha"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setEditingTicker(null)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-secondary/50 dark:hover:bg-white/20 dark:text-muted-foreground rounded-lg transition-colors"
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
              <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">Sin fecha confirmada</span>
            )}
            <button
              onClick={() => {
                setEditingTicker(row.ticker);
                setEditDateValue(row.confirmed_date || '');
              }}
              className={`${row.confirmed_date ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} p-1 text-slate-400 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground rounded hover:bg-slate-100 dark:hover:bg-secondary/50 transition-all`}
              title={row.confirmed_date ? 'Modificar fecha confirmada' : 'Ingresar fecha confirmada'}
              aria-label={row.confirmed_date ? `Modificar fecha de ${row.ticker}` : `Ingresar fecha de ${row.ticker}`}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
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

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-foreground flex items-center gap-3">
            Calendario de Reportes
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30">
              Earnings Hub
            </span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-muted-foreground mt-1">
            Fechas confirmadas ingresadas por el usuario y empresas pendientes de completar.
          </p>
        </div>

        <button
          onClick={fetchEarningsData}
          disabled={refreshing}
          className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-secondary/50 dark:hover:bg-secondary/50 dark:text-muted-foreground font-bold text-xs flex items-center gap-2 border border-slate-200 dark:border-border transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar Cronograma
        </button>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {loading && !data ? (
        <div className="bg-card border border-border h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Cargando fechas de reportes...</span>
        </div>
      ) : data ? (
        <>
          {/* Status KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Este Mes */}
            <div 
              onClick={() => setActiveTier('current_month')}
              className={`bg-card border border-border p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'current_month' ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider">Este Mes ({data.current_month_name})</span>
                <Flame className="w-4 h-4 text-negative dark:text-negative" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-foreground mt-1 tabular-nums">
                {visibleStats.current_month_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-muted-foreground mt-1 font-mono">Reportes inminentes</span>
            </div>

            {/* Próximo Mes */}
            <div 
              onClick={() => setActiveTier('next_month')}
              className={`bg-card border border-border p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'next_month' ? 'border-orange-400 bg-orange-50/50 dark:border-orange-500/50 dark:bg-orange-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider">Próximo Mes ({data.next_month_name})</span>
                <Calendar className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-foreground mt-1 tabular-nums">
                {visibleStats.next_month_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-muted-foreground mt-1 font-mono">Fecha confirmada</span>
            </div>

            {/* Más Adelante */}
            <div 
              onClick={() => setActiveTier('later')}
              className={`bg-card border border-border p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'later' ? 'border-blue-400 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider">Más Adelante</span>
                <Clock className="w-4 h-4 text-blue-500 dark:text-foreground" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-foreground mt-1 tabular-nums">
                {visibleStats.later_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-muted-foreground mt-1 font-mono">Fecha exacta confirmada</span>
            </div>

            {/* Ya Reportaron */}
            <div 
              onClick={() => setActiveTier('past')}
              className={`bg-card border border-border p-4 rounded-2xl cursor-pointer transition-all border ${activeTier === 'past' ? 'border-slate-400 bg-slate-100 dark:border-zinc-500/50 dark:bg-zinc-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider">Ya Reportaron</span>
                <CheckCircle2 className="w-4 h-4 text-slate-400 dark:text-muted-foreground" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-foreground mt-1 tabular-nums">
                {visibleStats.past_count}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-muted-foreground mt-1 font-mono">Reportes pasados</span>
            </div>
          {/* Sin fecha confirmada */}
          <div
            onClick={() => setActiveTier('unconfirmed')}
            className={`bg-card border border-border p-4 rounded-2xl cursor-pointer transition-all ${activeTier === 'unconfirmed' ? 'border-amber-400 bg-amber-50/50 dark:border-amber-500/50 dark:bg-amber-500/10 scale-[1.02] shadow-sm' : 'border-slate-200 dark:border-border hover:border-slate-300 dark:hover:border-border'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider">Sin fecha confirmada</span>
              <Calendar className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-foreground mt-1 tabular-nums">
              {visibleStats.unconfirmed_count}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-muted-foreground mt-1 font-mono">Pendientes de ingresar</span>
          </div>
          </div>

          {/* Table Controls & Filter Bar */}
          <div className="bg-card border border-border p-6 rounded-2xl flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-foreground">
                  Fechas de Reportes
                </h2>
                <p className="text-xs text-slate-600 dark:text-muted-foreground mt-0.5">
                  Por defecto se muestran las carteras activas. Puedes ampliar la lista con el resto del catálogo CEDEAR.
                </p>
              </div>

              {/* Search & Tabs */}
              <div className="flex flex-wrap items-center gap-3">
                {restCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRest(value => !value)}
                    aria-pressed={showRest}
                    className="h-9 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 text-xs font-bold transition-colors"
                  >
                    {showRest ? 'Ocultar el resto' : `Mostrar el resto (${restCount})`}
                  </button>
                )}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar activo..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="h-9 pl-9 pr-3 bg-slate-50 dark:bg-secondary border border-slate-200 dark:border-border rounded-xl text-xs font-bold text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors w-44"
                  />
                </div>

                <div className="flex items-center bg-slate-100 dark:bg-secondary p-1 rounded-xl border border-slate-200 dark:border-border text-xs font-bold">
                  <button
                    onClick={() => setActiveTier('all')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'all' ? 'bg-blue-600 text-foreground shadow-sm' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/60 dark:hover:bg-secondary/50'}`}
                  >
                    Todos ({visibleStats.total_count})
                  </button>
                  <button
                    onClick={() => setActiveTier('current_month')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'current_month' ? 'bg-blue-600 text-foreground shadow-sm' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/60 dark:hover:bg-secondary/50'}`}
                  >
                    Este Mes ({visibleStats.current_month_count})
                  </button>
                  <button
                    onClick={() => setActiveTier('next_month')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'next_month' ? 'bg-blue-600 text-foreground shadow-sm' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/60 dark:hover:bg-secondary/50'}`}
                  >
                    Próximo ({visibleStats.next_month_count})
                  </button>
                  <button
                    onClick={() => setActiveTier('unconfirmed')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${activeTier === 'unconfirmed' ? 'bg-blue-600 text-foreground shadow-sm' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/60 dark:hover:bg-secondary/50'}`}
                  >
                    Sin fecha ({visibleStats.unconfirmed_count})
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-border">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-secondary/50 border-b border-slate-200 dark:border-border">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th key={header.id} className="p-2.5 font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
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
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-sm text-slate-500 dark:text-muted-foreground">
                        No hay empresas para este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
