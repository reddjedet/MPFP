import { EtfSectorThermometer } from "./EtfSectorThermometer";
import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  Plus, 
  Trash2, 
  RefreshCw, 
  LayoutGrid, 
  Table as TableIcon, 
  AlertCircle, 
  Briefcase,
  X
} from 'lucide-react';

interface CedearCatalogItem {
  ticker: string;
  name: string;
  sector_id: string;
  ratio: number;
}

interface CedearQuote {
  symbol: string;
  adr: number | null;
  cedear_usd: number | null;
  local: number | null;
  ratio: number;
  rsi: number | null;
  alert: boolean;
  in_portfolio?: boolean;
  earnings_badge?: {
    badge_text: string;
    badge_class: string;
    target_month_name?: string;
  } | null;
  gf_value?: number | null;
  gf_signal?: {
    badge_text: string;
    badge_class: string;
    tooltip?: string;
  } | null;
  pfcf?: number | null;
  pfcf_signal?: {
    state_key?: string;
    badge_text: string;
    badge_class: string;
    color?: string;
    tooltip?: string;
  } | null;
  is_etf?: boolean;
}

const KNOWN_ETFS = new Set([
  'SPY', 'QQQ', 'DIA', 'IWM', 'EEM', 'EWZ', 'ARKK', 'SMH', 'URA', 'GLD', 'SLV', 'USO', 'VEA',
  'XLB', 'XLC', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLU', 'XLV', 'XLY',
  'FXI', 'ILF', 'IVW', 'EWJ', 'GDX', 'IBIT', 'ARGT'
]);

const DEFAULT_TICKERS = ["AAPL", "NVDA", "MSFT", "MELI", "LLY", "GOOGL", "AMZN", "SPY", "QQQ", "VIST", "MSTR", "JPM"];
const SUGGESTED_TICKERS = ["AAPL", "NVDA", "MSFT", "MELI", "LLY", "GOOGL", "AMZN", "TSLA", "META", "SPY", "QQQ", "VIST", "MSTR", "JPM", "KO", "MCD", "BRKB", "AMD", "PLTR", "NU"];

export const CedearsView: React.FC = () => {
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('finapp_cedears_watchlist_v2');
      return saved ? JSON.parse(saved) : DEFAULT_TICKERS;
    } catch {
      return DEFAULT_TICKERS;
    }
  });

  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<CedearQuote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [newTicker, setNewTicker] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'in_portfolio' | 'rsi_alerts' | 'valuation_signals' | 'earnings'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Catálogo completo de CEDEARs para autocompletado inteligente
  const [catalog, setCatalog] = useState<CedearCatalogItem[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Save watchlist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('finapp_cedears_watchlist_v2', JSON.stringify(watchlist));
    } catch (e) {
      console.error(e);
    }
  }, [watchlist]);

  // Carga inicial del catálogo de 305 CEDEARs
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch('/api/cedears/tickers');
        if (res.ok) {
          const data = await res.json();
          if (data.catalog) {
            setCatalog(data.catalog);
          }
        }
      } catch (e) {
        console.error("Error al cargar catálogo de CEDEARs:", e);
      }
    };
    fetchCatalog();
  }, []);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial fetch of portfolio tickers and auto-merging into watchlist
  useEffect(() => {
    const fetchPortfolioTickers = async () => {
      try {
        const res = await fetch('/api/cedears/portfolio_tickers');
        if (res.ok) {
          const data = await res.json();
          const pfTickers: string[] = data.portfolio_tickers || [];
          setPortfolioTickers(pfTickers);
          if (pfTickers.length > 0) {
            setWatchlist(prev => Array.from(new Set([...pfTickers, ...prev])));
          }
        }
      } catch (err) {
        console.error("Error fetching portfolio tickers:", err);
      }
    };

    fetchPortfolioTickers();
  }, []);

  const fetchQuotes = async (tickersToFetch = watchlist) => {
    if (tickersToFetch.length === 0) {
      setQuotes([]);
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/cedears/quotes_json?tickers=${tickersToFetch.join(',')}`);
      if (!res.ok) throw new Error('Error al cargar cotizaciones');
      const data = await res.json();
      setQuotes(data.quotes || []);
      if (data.portfolio_tickers) {
        setPortfolioTickers(data.portfolio_tickers);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Error de conexión');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (watchlist.length === 0) {
      setQuotes([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setRefreshing(true);
    setErrorMsg(null);

    const runFetch = async () => {
      try {
        const res = await fetch(`/api/cedears/quotes_json?tickers=${watchlist.join(',')}`, {
          signal: controller.signal
        });
        if (!res.ok) throw new Error('Error al cargar cotizaciones');
        const data = await res.json();
        setQuotes(data.quotes || []);
        if (data.portfolio_tickers) {
          setPortfolioTickers(data.portfolio_tickers);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setErrorMsg(err.message || 'Error de conexión');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    runFetch();

    return () => {
      controller.abort();
    };
  }, [watchlist]);

  const handleAddTicker = (tickerToAdd: string) => {
    const clean = tickerToAdd.trim().toUpperCase();
    if (!clean) return;
    if (watchlist.includes(clean)) {
      setErrorMsg(`El ticker ${clean} ya está en tu lista`);
      return;
    }
    setWatchlist(prev => [clean, ...prev]);
    setNewTicker('');
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    setWatchlist(prev => prev.filter(t => t !== tickerToRemove));
  };

  // Sugerencias reactivas del catálogo según lo que escribe el usuario
  const suggestions = useMemo(() => {
    const query = newTicker.trim().toLowerCase();
    if (!query) return [];
    return catalog
      .filter(item => 
        item.ticker.toLowerCase().includes(query) || 
        item.name.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [catalog, newTicker]);

  // Manejo de navegación por teclado en el input de búsqueda
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      e.preventDefault();
      const chosen = suggestions[selectedIndex];
      if (!watchlist.includes(chosen.ticker)) {
        handleAddTicker(chosen.ticker);
      }
      setShowDropdown(false);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Filtered quotes based on search input & category filter
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      // Text search
      const matchesSearch = q.symbol.toLowerCase().includes(searchFilter.toLowerCase().trim());
      if (!matchesSearch) return false;

      // Category filter
      if (activeFilter === 'in_portfolio') {
        return !!q.in_portfolio;
      }
      if (activeFilter === 'rsi_alerts') {
        return q.alert || (q.rsi !== null && (q.rsi >= 65 || q.rsi <= 35));
      }
      if (activeFilter === 'valuation_signals') {
        return !!q.gf_signal || !!q.pfcf_signal;
      }
      if (activeFilter === 'earnings') {
        return !!q.earnings_badge;
      }
      return true;
    });
  }, [quotes, searchFilter, activeFilter]);

  // TanStack Table columns
  const columnHelper = createColumnHelper<CedearQuote>();
  const columns = useMemo(() => [
    columnHelper.accessor('symbol', {
      header: 'ACTIVO',
      cell: info => {
        const row = info.row.original;
        const isEtf = row.is_etf || KNOWN_ETFS.has(info.getValue());
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-slate-900 dark:text-white text-sm tracking-wide">{info.getValue()}</span>
              {isEtf && (
                <span 
                  className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  title="Fondo Indexado (Exchange Traded Fund)"
                >
                  ETF
                </span>
              )}
              {row.in_portfolio && (
                <span 
                  className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40"
                  title="Activo presente en tus carteras"
                >
                  Cartera
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">Ratio {row.ratio}:1</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('local', {
      header: 'PRECIO ARS',
      cell: info => {
        const val = info.getValue();
        return (
          <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums text-xs">
            {typeof val === 'number' ? `A$ ${val.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('cedear_usd', {
      header: 'CEDEAR (USD)',
      cell: info => {
        const val = info.getValue();
        return (
          <span 
            className="font-mono font-bold text-emerald-400 tabular-nums text-xs"
            title="Precio implícito de 1 CEDEAR en USD (ADR / Ratio)"
          >
            {typeof val === 'number' ? `U$ ${val.toFixed(2)}` : '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('adr', {
      header: 'ADR (USD)',
      cell: info => {
        const val = info.getValue();
        return (
          <span 
            className="font-mono text-slate-500 dark:text-zinc-400 tabular-nums text-xs"
            title="Precio de la acción subyacente en EE.UU."
          >
            {typeof val === 'number' ? `U$ ${val.toFixed(2)}` : '—'}
          </span>
        );
      },
    }),
    columnHelper.accessor('rsi', {
      header: 'RSI (14)',
      cell: info => {
        const val = info.getValue();
        if (typeof val !== 'number') return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        const isOverbought = val >= 65;
        const isOversold = val <= 35;
        const colorClass = isOverbought 
          ? 'text-rose-700 bg-rose-50 border-rose-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30' 
          : (isOversold 
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30' 
            : 'text-slate-700 bg-slate-100 border-slate-200 dark:text-zinc-300 dark:bg-white/5 dark:border-white/10');
        return (
          <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border tabular-nums ${colorClass}`}>
            {val.toFixed(1)}
          </span>
        );
      },
    }),
    columnHelper.accessor('earnings_badge', {
      header: 'REPORTES',
      cell: info => {
        const b = info.getValue();
        if (!b) return <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>;
        return (
          <span className="text-[10px] px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-bold border border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30">
            {b.badge_text}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'valuation_signals',
      header: 'SEÑALES (GF / P/FCF)',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {row.gf_signal && (
              <span
                title={row.gf_signal.tooltip || (row.gf_value ? `GuruFocus Fair Value: $${row.gf_value}` : undefined)}
                className="cursor-help text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25"
              >
                {row.gf_signal.badge_text}
              </span>
            )}
            {row.pfcf_signal && (
              <span
                title={row.pfcf_signal.tooltip}
                className={`cursor-help text-[10px] px-2 py-0.5 rounded font-semibold border transition-colors ${
                  row.pfcf_signal.state_key === 'optimo' || row.pfcf_signal.state_key === 'compra_optima'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25'
                    : (row.pfcf_signal.state_key === 'no_comprar' || row.pfcf_signal.state_key === 'sobrevaluado'
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/25'
                      : (row.pfcf_signal.state_key === 'sub_optimo'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25'
                        : (row.pfcf_signal.state_key === 'hold'
                          ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/25'
                          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700')))
                }`}
              >
                {row.pfcf_signal.badge_text}
              </span>
            )}
            {!row.gf_signal && !row.pfcf_signal && (
              <span className="text-slate-400 dark:text-zinc-600 font-mono text-xs">—</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: info => (
        <button
          onClick={() => handleRemoveTicker(info.row.original.symbol)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Eliminar de la lista"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    }),
  ], []);

  const table = useReactTable({
    data: filteredQuotes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            Cotizaciones CEDEAR
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30">
              Live Feed • BYMA / US
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Monitor institucional de cotizaciones en tiempo real, precios en ARS y USD, ratio de conversión, RSI y valuación fundamental.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-black/40 p-1 rounded-xl border border-slate-200 dark:border-white/10">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}
              title="Vista de Tabla"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}
              title="Vista de Cuadrícula"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => fetchQuotes(watchlist)}
            disabled={refreshing}
            className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-zinc-300 dark:hover:text-white dark:border-white/10 font-bold text-xs flex items-center gap-2 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ETF Sector Thermometer */}
      <EtfSectorThermometer />

      {/* Ticker Search & Quick Add Bar */}
      <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-5 rounded-2xl shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Add form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleAddTicker(newTicker);
            }}
            className="flex items-center gap-2 flex-1 max-w-md"
          >
            <div ref={searchContainerRef} className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar y agregar CEDEAR (ej: TSLA, BABA, MMM, Salud)..."
                value={newTicker}
                onChange={e => {
                  setNewTicker(e.target.value);
                  setShowDropdown(true);
                  setSelectedIndex(-1);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                className="w-full h-10 pl-9 pr-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-900 dark:text-white uppercase placeholder:normal-case placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors"
              />

              {/* Dropdown flotante de sugerencias */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#181920] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden py-1 max-h-72 overflow-y-auto">
                  {suggestions.map((item, idx) => {
                    const isAdded = watchlist.includes(item.ticker);
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={item.ticker}
                        type="button"
                        disabled={isAdded}
                        onClick={() => {
                          handleAddTicker(item.ticker);
                          setShowDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors ${
                          isSelected ? 'bg-blue-600/15 text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-white/5'
                        } ${isAdded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{item.ticker}</span>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-white/5">
                            Ratio {item.ratio}:1
                          </span>
                          {isAdded ? (
                            <span className="text-[10px] text-emerald-400 font-semibold">En lista</span>
                          ) : (
                            <span className="text-[10px] text-blue-500 font-bold">+ Agregar</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-500/25 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </form>

          {/* Quick Filter Search */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filtrar en lista..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="h-10 px-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors w-40"
            />
          </div>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider mr-1">Sugeridos:</span>
            {SUGGESTED_TICKERS.filter(t => !watchlist.includes(t)).slice(0, 8).map(ticker => (
              <button
                key={ticker}
                onClick={() => handleAddTicker(ticker)}
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-zinc-300 dark:hover:text-white dark:border-white/10 transition-colors flex items-center gap-1"
              >
                +{ticker}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
          >
            Todos ({quotes.length})
          </button>
          <button
            onClick={() => setActiveFilter('in_portfolio')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${activeFilter === 'in_portfolio' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            En Cartera ({quotes.filter(q => q.in_portfolio).length})
          </button>
          <button
            onClick={() => setActiveFilter('rsi_alerts')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeFilter === 'rsi_alerts' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
          >
            Alertas RSI ({quotes.filter(q => q.alert || (q.rsi !== null && (q.rsi >= 65 || q.rsi <= 35))).length})
          </button>
          <button
            onClick={() => setActiveFilter('valuation_signals')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeFilter === 'valuation_signals' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
          >
            Valuación & Señales ({quotes.filter(q => q.gf_signal || q.pfcf_signal).length})
          </button>
          <button
            onClick={() => setActiveFilter('earnings')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${activeFilter === 'earnings' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
          >
            Balances Próximos ({quotes.filter(q => q.earnings_badge).length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-xs text-rose-700 dark:border-red-500/30 dark:bg-red-500/5 dark:text-red-400 flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-800 dark:text-zinc-400 dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area: Grid vs Table */}
      {loading && quotes.length === 0 ? (
        <div className="glass-panel h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Descargando cotizaciones de mercado en tiempo real...</span>
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-zinc-600" />
          <p className="text-xs text-zinc-400">No se encontraron activos para los filtros seleccionados.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredQuotes.map(quote => {
            const isOverbought = quote.rsi !== null && quote.rsi >= 65;
            const isOversold = quote.rsi !== null && quote.rsi <= 35;
            const rsiColor = isOverbought 
              ? 'text-rose-700 bg-rose-50 border-rose-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30' 
              : (isOversold ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30' : 'text-slate-600 bg-slate-100 border-slate-200 dark:text-zinc-300 dark:bg-white/5 dark:border-white/10');

            return (
              <div
                key={quote.symbol}
                className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex flex-col justify-between gap-3 shadow-sm hover:border-slate-300 dark:hover:border-white/20 transition-all group"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">{quote.symbol}</span>
                    {quote.in_portfolio && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40">
                        Cartera
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">Ratio {quote.ratio}:1</span>
                  </div>
                  <button
                    onClick={() => handleRemoveTicker(quote.symbol)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-zinc-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition-all"
                    title="Eliminar de la lista"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Prices: Local ARS, CEDEAR USD, ADR USD */}
                <div className="flex flex-col gap-1.5 my-1 p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-100 dark:border-white/5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Local (ARS):</span>
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {quote.local !== null ? `A$ ${quote.local.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">CEDEAR (USD):</span>
                    <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {quote.cedear_usd !== null ? `U$ ${quote.cedear_usd.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium">ADR Subyacente:</span>
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-zinc-400 tabular-nums">
                      {quote.adr !== null ? `U$ ${quote.adr.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>

                {/* Indicator Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
                  {/* RSI */}
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border tabular-nums ${rsiColor}`}>
                    RSI {quote.rsi !== null ? quote.rsi.toFixed(1) : '—'}
                  </span>

                  {/* Earnings */}
                  {quote.earnings_badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-bold border border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30">
                      {quote.earnings_badge.badge_text}
                    </span>
                  )}

                  {/* GuruFocus Fair Value */}
                  {quote.gf_signal && (
                    <span 
                      title={quote.gf_signal.tooltip || (quote.gf_value ? `GuruFocus Fair Value: $${quote.gf_value}` : undefined)}
                      className="cursor-help text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25"
                    >
                      {quote.gf_signal.badge_text}
                    </span>
                  )}

                  {/* P/FCF Signal */}
                  {quote.pfcf_signal && (
                    <span
                      title={quote.pfcf_signal.tooltip}
                      className={`cursor-help text-[10px] px-2 py-0.5 rounded font-semibold border transition-colors ${
                        quote.pfcf_signal.state_key === 'optimo' || quote.pfcf_signal.state_key === 'compra_optima'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25'
                          : (quote.pfcf_signal.state_key === 'no_comprar' || quote.pfcf_signal.state_key === 'sobrevaluado'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/25'
                            : (quote.pfcf_signal.state_key === 'sub_optimo'
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25'
                              : (quote.pfcf_signal.state_key === 'hold'
                                ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/25'
                                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700')))
                      }`}
                    >
                      {quote.pfcf_signal.badge_text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th key={header.id} className="px-2.5 py-2 font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 select-none">
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
                      <td key={cell.id} className="px-2.5 py-2 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
