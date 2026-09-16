import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Scale, 
  Coins, 
  RefreshCw, 
  Sliders, 
  ShieldCheck, 
  PieChart, 
  Plus, 
  Trash2, 
  Edit2, 
  Archive, 
  ArrowLeftRight, 
  Landmark, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calculator, 
  Check, 
  HelpCircle,
  Layers,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getSortedRowModel, 
  useReactTable, 
  SortingState 
} from '@tanstack/react-table';

import { Dropdown } from '../ui/Dropdown';
import { PortfolioCharts } from './PortfolioCharts';
import { PortfolioTable } from './PortfolioTable';
import { PortfolioFixedIncomeTable, FixedIncomeSummary } from './PortfolioFixedIncomeTable';
import { CreatePortfolioModal } from './CreatePortfolioModal';
import { PortfolioWizardModal } from './PortfolioWizardModal';
import { FixedIncomePortfolioCard } from './FixedIncomePortfolioCard';
import { RenamePortfolioModal } from './RenamePortfolioModal';
import { PortfolioTrashModal } from './PortfolioTrashModal';
import { HoldingsDrawer } from '../rotation/HoldingsDrawer';
import { PurchaseCalculator, CalculatorItem } from '../rotation/PurchaseCalculator';
import { useTicker360 } from '../../context/Ticker360Context';
import { useChartTheme } from '../../hooks/useChartTheme';

export interface UnifiedPortfolioViewProps {
  initialSubTab?: 'operation' | 'model' | 'fixed_income';
  onNavigateToTab?: (area: 'portfolios' | 'market' | 'lab', defaultSubTab: string) => void;
}

interface RotationItem {
  ticker: string;
  in_target: boolean;
  price: number;
  ratio: number;
  rsi: number | null;
  real_nominals: number;
  real_value: number;
  real_weight: number;
  target_nominals: number;
  target_value: number;
  target_weight: number;
  delta_nominals: number;
  delta_value: number;
  weight_gap: number;
  status: 'surplus' | 'deficit' | 'balanced';
  ppc: number | null;
  ppc_return?: {
    return_pct: number;
    badge_text: string;
    badge_class: string;
    is_take_profit?: boolean;
    is_attention?: boolean;
  } | null;
  gf_signal?: {
    badge_text: string;
    badge_class: string;
    tooltip?: string;
  } | null;
  pfcf_signal?: {
    badge_text: string;
    badge_class: string;
    state_key?: string;
    tooltip?: string;
  } | null;
  is_take_profit: boolean;
  is_overbought: boolean;
  is_oversold: boolean;
  is_undervalued: boolean;
  is_buy_blocked?: boolean;
  timing_status?: 'buy_optimal' | 'buy_neutral' | 'wait_pullback' | 'neutral';
  timing_badge_text?: string | null;
}

interface RotationTrade {
  id: string;
  sell?: {
    ticker: string;
    nominals: number;
    price: number;
    total_cash: number;
    reason: string;
  } | null;
  buy?: {
    ticker: string;
    nominals: number;
    price: number;
    total_cash: number;
    reason: string;
  } | null;
  net_cash_ars: number;
  priority: string;
}

interface RotationData {
  target_portfolio_key: string;
  target_portfolio_name: string;
  total_real_equity: number;
  total_real_stock_value: number;
  total_cost_invested: number;
  total_pnl_ars: number;
  total_pnl_pct: number;
  cash_ars: number;
  avg_tracking_error: number;
  items: RotationItem[];
  rotation_trades: RotationTrade[];
  available_portfolios: { id: string; name: string }[];
}

export const UnifiedPortfolioView: React.FC<UnifiedPortfolioViewProps> = ({
  initialSubTab = 'operation',
  onNavigateToTab
}) => {
  const chartTheme = useChartTheme();
  const { openTicker360 } = useTicker360();

  // Cartera seleccionada
  const [selectedPf, setSelectedPf] = useState<string>(() => {
    try {
      return localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    } catch {
      return 'min_drawdown_15';
    }
  });

  // Sub-pestaña interna activa
  const [activeTab, setActiveTab] = useState<'operation' | 'model' | 'fixed_income'>(initialSubTab);

  // Estados de datos
  const [rotationData, setRotationData] = useState<RotationData | null>(null);
  const [rebalanceData, setRebalanceData] = useState<any>(null);
  const [portfoliosList, setPortfoliosList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modales y Drawers
  const [holdingsDrawerOpen, setHoldingsDrawerOpen] = useState<boolean>(false);
  const [calculatorOpen, setCalculatorOpen] = useState<boolean>(false);
  const [calculatorTicker, setCalculatorTicker] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState<boolean>(false);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState<boolean>(false);
  const [trashCount, setTrashCount] = useState<number>(0);

  // Controles de rebalanceo modelo
  const [anchor, setAnchor] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Guardar en localStorage cartera activa
  const handlePortfolioChange = (newPf: string) => {
    setSelectedPf(newPf);
    try {
      localStorage.setItem('finapp_active_portfolio', newPf);
      window.dispatchEvent(new CustomEvent('finapp_portfolio_change', { detail: newPf }));
    } catch (e) {
      console.error(e);
    }
  };

  // Cargar lista de carteras y conteo de papelera
  const fetchMetadata = async () => {
    try {
      const [resList, resTrash] = await Promise.all([
        fetch('/api/portfolios/list_json'),
        fetch('/api/portfolios/trash_json')
      ]);

      if (resList.ok) {
        const jsonList = await resList.json();
        const pfs = jsonList.portfolios || {};
        const items = Object.entries(pfs).map(([k, v]: [string, any]) => ({
          id: k,
          name: v.name || k
        }));
        setPortfoliosList(items);
      }

      if (resTrash.ok) {
        const jsonTrash = await resTrash.json();
        setTrashCount(jsonTrash.count || 0);
      }
    } catch (e) {
      console.error("Error cargando metadatos de carteras:", e);
    }
  };

  // Carga unificada de datos: Rotación Real + Modelo Teórico
  const fetchAllData = useCallback(async (pfKey = selectedPf, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (anchor.trim()) {
        params.append('anchor', anchor.trim());
        if (qty > 1) params.append('qty', String(qty));
      }

      const [resRotation, resRebalance] = await Promise.all([
        fetch(`/api/rotation/analysis?target_pf=${encodeURIComponent(pfKey)}`),
        fetch(`/api/portfolios/rebalance_json/${encodeURIComponent(pfKey)}?${params.toString()}`)
      ]);

      if (!resRotation.ok || !resRebalance.ok) {
        throw new Error('Error al sincronizar datos de la cartera.');
      }

      const [dataRot, dataReb] = await Promise.all([
        resRotation.json(),
        resRebalance.json()
      ]);

      setRotationData(dataRot);
      setRebalanceData(dataReb);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error de conexión con el backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPf, anchor, qty]);

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchAllData(selectedPf);
  }, [selectedPf, fetchAllData]);

  // Items para la calculadora
  const calculatorItems: CalculatorItem[] = useMemo(() => {
    if (!rotationData?.items) return [];
    return rotationData.items.map(item => ({
      ticker: item.ticker,
      price: item.price,
      ratio: item.ratio,
    }));
  }, [rotationData]);

  // TanStack Table columns para Operación & Rotación
  const columnHelper = createColumnHelper<RotationItem>();
  const rotationColumns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex items-center justify-between gap-1.5 group">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => openTicker360(info.getValue(), row)}
                className="font-extrabold text-slate-900 dark:text-white text-sm tracking-wide hover:text-blue-400 hover:underline transition-colors text-left cursor-pointer"
                title={`Ver Ficha 360° de ${info.getValue()}`}
              >
                {info.getValue()}
              </button>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">Ratio {row.ratio}:1</span>
            </div>
            <button
              onClick={() => {
                setCalculatorTicker(row.ticker);
                setCalculatorOpen(true);
              }}
              className="p-1 rounded text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
              title={`Calcular compra de ${row.ticker}`}
            >
              <Calculator className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    }),
    columnHelper.accessor('price', {
      header: 'PRECIO ARS',
      cell: info => (
        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
          ${info.getValue().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    }),
    columnHelper.accessor('ppc', {
      header: 'PPC & PnL %',
      cell: info => {
        const ppcVal = info.getValue();
        const row = info.row.original;
        const ppcRet = row.ppc_return;

        return (
          <div className="flex flex-col font-mono text-xs">
            <span className="font-bold text-slate-900 dark:text-white">
              {ppcVal !== null ? `$${ppcVal.toLocaleString('es-AR')}` : '—'}
            </span>
            {ppcRet && (
              <span className={`text-[10px] font-bold ${ppcRet.return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ppcRet.return_pct >= 0 ? '+' : ''}{ppcRet.return_pct.toFixed(1)}%
              </span>
            )}
          </div>
        );
      }
    }),
    columnHelper.accessor('rsi', {
      header: 'RSI / SEÑALES',
      cell: info => {
        const rsiVal = info.getValue();
        const row = info.row.original;
        const isOB = rsiVal !== null && rsiVal >= 65;
        const isOS = rsiVal !== null && rsiVal <= 40;

        let signalBadge = null;
        if (row.is_take_profit || row.ppc_return?.is_take_profit) {
          signalBadge = (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
              Take Profit {row.ppc_return ? `+${row.ppc_return.return_pct.toFixed(0)}%` : ''}
            </span>
          );
        } else if (row.ppc_return?.is_attention) {
          signalBadge = (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Atención +{row.ppc_return.return_pct.toFixed(0)}%
            </span>
          );
        } else if (row.gf_signal && row.gf_signal.badge_text.toLowerCase().includes('margen')) {
          signalBadge = (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
              {row.gf_signal.badge_text}
            </span>
          );
        } else if (row.pfcf_signal && (row.pfcf_signal.state_key === 'optimo' || row.pfcf_signal.state_key === 'compra_optima')) {
          signalBadge = (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {row.pfcf_signal.badge_text}
            </span>
          );
        }

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border tabular-nums ${
              isOB ? 'text-red-400 bg-red-500/10 border-red-500/30' : 
              isOS ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 
              'text-zinc-400 bg-white/5 border-white/10'
            }`}>
              RSI {rsiVal !== null ? rsiVal.toFixed(1) : '—'}
            </span>
            {signalBadge}
          </div>
        );
      }
    }),
    columnHelper.accessor('real_nominals', {
      header: 'TENENCIA REAL',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col font-mono text-xs">
            <span className="font-bold text-slate-900 dark:text-white">{info.getValue()} VN</span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">
              ${row.real_value.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({row.real_weight.toFixed(1)}%)
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('target_nominals', {
      header: 'OBJETIVO MODELO',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col font-mono text-xs">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{info.getValue()} VN</span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">
              ${row.target_value.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({row.target_weight.toFixed(1)}%)
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('delta_nominals', {
      header: 'DIFERENCIA (BRECHA)',
      cell: info => {
        const val = info.getValue();
        const row = info.row.original;
        const isSurplus = val > 0;
        const isDeficit = val < 0;

        return (
          <div className="flex flex-col font-mono text-xs">
            <span className={`font-bold ${isSurplus ? 'text-blue-400' : isDeficit ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {val > 0 ? `+${val}` : val} VN
            </span>
            <span className="text-[10px] text-zinc-500">
              {row.delta_value !== 0 ? `$${Math.abs(row.delta_value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : 'En cuota'}
            </span>
          </div>
        );
      }
    }),
    columnHelper.accessor('status', {
      header: 'ACCIÓN RECOMENDADA',
      cell: info => {
        const status = info.getValue();
        const row = info.row.original;

        if (row.is_take_profit) {
          return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
              TAKE PROFIT
            </span>
          );
        }
        if (status === 'surplus') {
          return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
              VENDER SOBRANTE
            </span>
          );
        }
        if (status === 'deficit') {
          if (row.is_buy_blocked || row.timing_status === 'wait_pullback') {
            return (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30" title="RSI en sobrecompra">
                ESPERAR RETROCESO
              </span>
            );
          }
          if (row.timing_status === 'buy_optimal' || row.is_undervalued || row.is_oversold) {
            return (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                COMPRA ÓPTIMA
              </span>
            );
          }
          return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              COMPLETAR CUOTA
            </span>
          );
        }
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/10">
            BALANCEADO
          </span>
        );
      }
    })
  ], [openTicker360]);

  const rotationTable = useReactTable({
    data: rotationData?.items || [],
    columns: rotationColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Métricas Consolidadas para KPIs
  const totalEquity = rotationData?.total_real_equity || rebalanceData?.summary?.total_consolidated_value || rebalanceData?.summary?.total_portfolio_value || 0;
  const stockVal = rotationData?.total_real_stock_value || rebalanceData?.summary?.total_portfolio_value || 0;
  const fixedIncomeVal = rebalanceData?.fixed_income_summary?.total_market_value || 0;
  const cashArs = rotationData?.cash_ars || 0;
  const pnlArs = rotationData?.total_pnl_ars || 0;
  const pnlPct = rotationData?.total_pnl_pct || 0;
  const trackingError = rotationData?.avg_tracking_error || 0;
  const rsiSummary = rebalanceData?.summary?.portfolio_rsi;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. HEADER DE CONTROL Y KPIS CONSOLIDADOS */}
      <div className="p-5 rounded-2xl bg-[#14151c] border border-white/10 shadow-xl flex flex-col gap-5">
        
        {/* Fila Superior: Selector de Cartera, Acciones y Refresh */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-wide">
                  Centro de Cartera
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 uppercase">
                  Cockpit V4
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Gestión patrimonial consolidada: tenencias reales, objetivos teóricos y rotación táctica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector Canónico de Cartera */}
            <Dropdown
              value={selectedPf}
              options={
                portfoliosList.length > 0
                  ? portfoliosList.map(p => ({ value: p.id, label: p.name }))
                  : [
                      { value: 'min_drawdown_15', label: 'MIN DRAWDOWN 15' },
                      { value: 'bal', label: 'BAL' },
                      { value: 'bmb', label: 'BMB' },
                    ]
              }
              onChange={handlePortfolioChange}
              title="Cartera Activa"
              minWidth="180px"
            />

            {/* Refresh */}
            <button
              onClick={() => fetchAllData(selectedPf, true)}
              disabled={refreshing || loading}
              className="p-2 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Gestionar Tenencia Real */}
            <button
              onClick={() => setHoldingsDrawerOpen(true)}
              className="px-3 h-9 rounded-[3px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Cargar Tenencia</span>
            </button>

            {/* Nueva Cartera */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3 h-9 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva</span>
            </button>

            {/* Renombrar */}
            <button
              onClick={() => setIsRenameModalOpen(true)}
              className="p-2 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
              title="Renombrar cartera actual"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            {/* Papelera */}
            <button
              onClick={() => setIsTrashModalOpen(true)}
              className="p-2 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition-colors relative cursor-pointer"
              title="Papelera de carteras"
            >
              <Archive className="w-4 h-4" />
              {trashCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {trashCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Fila de KPIs Institucionales */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Patrimonio Total */}
          <div className="p-3.5 rounded-xl bg-[#1a1b24] border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Patrimonio Total</span>
            <span className="text-base font-black text-white font-mono tabular-nums">
              ${totalEquity.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Consolidado ARS</span>
          </div>

          {/* Acciones / CEDEARs */}
          <div className="p-3.5 rounded-xl bg-[#1a1b24] border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">En CEDEARs</span>
            <span className="text-base font-black text-blue-400 font-mono tabular-nums">
              ${stockVal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {totalEquity > 0 ? `${((stockVal / totalEquity) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>

          {/* Renta Fija */}
          <div className="p-3.5 rounded-xl bg-[#1a1b24] border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Renta Fija</span>
            <span className="text-base font-black text-amber-400 font-mono tabular-nums">
              ${fixedIncomeVal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {totalEquity > 0 ? `${((fixedIncomeVal / totalEquity) * 100).toFixed(1)}%` : '0%'}
            </span>
          </div>

          {/* Saldo en Caja */}
          <div className="p-3.5 rounded-xl bg-[#1a1b24] border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Saldo en Caja</span>
            <span className="text-base font-black text-emerald-400 font-mono tabular-nums">
              ${cashArs.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Disponible ARS</span>
          </div>

          {/* Ganancia Global PnL */}
          <div className="p-3.5 rounded-xl bg-[#1a1b24] border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Rendimiento Latente</span>
            <span className={`text-base font-black font-mono tabular-nums ${pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
            </span>
            <span className={`text-[10px] font-mono ${pnlArs >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
              {pnlArs >= 0 ? '+$' : '-$'}{Math.abs(pnlArs).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
          </div>

          {/* Tracking Error vs Modelo */}
          <div className="p-3.5 rounded-xl bg-[#1a1b24] border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Tracking Error</span>
            <span className="text-base font-black text-purple-400 font-mono tabular-nums">
              {trackingError.toFixed(2)}%
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Desvío vs Modelo</span>
          </div>

        </div>

        {/* Termómetro de RSI Ponderado de la Cartera */}
        {rsiSummary && (
          <div className="p-3 rounded-xl bg-[#161720] border border-white/5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400 uppercase font-bold text-[10px] tracking-wider">Termómetro RSI Cartera:</span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs border ${
                rsiSummary.weighted <= 35 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                  : rsiSummary.weighted >= 65 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                    : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
              }`}>
                Ponderado {rsiSummary.weighted.toFixed(1)} — {rsiSummary.status}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-zinc-500">
              <span>RSI Simple: {rsiSummary.simple.toFixed(1)}</span>
              <span>•</span>
              <span className="text-zinc-400">Wilder 14 Períodos</span>
            </div>
          </div>
        )}

      </div>

      {/* 2. BARRA DE SUB-PESTAÑAS INTERNAS */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          onClick={() => setActiveTab('operation')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-[3px] text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'operation'
              ? 'bg-blue-600/15 text-blue-300 border-blue-500'
              : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4 text-blue-400" />
          <span>Operación & Rotación</span>
          {rotationData?.rotation_trades && rotationData.rotation_trades.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500 text-white font-mono">
              {rotationData.rotation_trades.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('model')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-[3px] text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'model'
              ? 'bg-purple-600/15 text-purple-300 border-purple-500'
              : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
          }`}
        >
          <PieChart className="w-4 h-4 text-purple-400" />
          <span>Arquitectura & Modelo</span>
        </button>

        <button
          onClick={() => setActiveTab('fixed_income')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-[3px] text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'fixed_income'
              ? 'bg-amber-600/15 text-amber-300 border-amber-500'
              : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
          }`}
        >
          <Landmark className="w-4 h-4 text-amber-400" />
          <span>Renta Fija en Cartera</span>
          {rebalanceData?.fixed_income_summary?.items && rebalanceData.fixed_income_summary.items.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-300 font-mono">
              {rebalanceData.fixed_income_summary.items.length}
            </span>
          )}
        </button>
      </div>

      {/* 3. CONTENIDO POR SUB-PESTAÑA */}
      {loading ? (
        <div className="py-24 text-center flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-zinc-400 font-mono">Cargando datos consolidados de cartera...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          <p className="font-bold mb-1">Error al sincronizar cartera</p>
          <p className="font-mono">{error}</p>
        </div>
      ) : activeTab === 'operation' ? (
        /* PESTAÑA A: OPERACIÓN & ROTACIÓN */
        <div className="space-y-5">
          
          {/* Cajón de Órdenes de Rotación Sugeridas */}
          {rotationData?.rotation_trades && rotationData.rotation_trades.length > 0 && (
            <div className="p-4 rounded-xl bg-[#14151c] border border-blue-500/30 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    Órdenes Tácticas de Rotación Sugeridas
                  </h3>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">
                  Basado en sobrecompra, take profit y sobreventa fundamental
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rotationData.rotation_trades.map(trade => (
                  <div 
                    key={trade.id}
                    className="p-3 rounded-lg bg-black/40 border border-white/5 flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1.5 text-xs">
                      {trade.sell && (
                        <div className="flex items-center justify-between">
                          <span className="text-rose-400 font-bold flex items-center gap-1">
                            <ArrowDownRight className="w-3.5 h-3.5" /> Vender {trade.sell.ticker}
                          </span>
                          <span className="font-mono text-zinc-300">{trade.sell.nominals} VN</span>
                        </div>
                      )}
                      {trade.buy && (
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <ArrowUpRight className="w-3.5 h-3.5" /> Comprar {trade.buy.ticker}
                          </span>
                          <span className="font-mono text-zinc-300">{trade.buy.nominals} VN</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                      <span className="text-zinc-500">
                        Neto: ${Math.abs(trade.net_cash_ars).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                      {trade.buy && (
                        <button
                          onClick={() => {
                            setCalculatorTicker(trade.buy!.ticker);
                            setCalculatorOpen(true);
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Calculator className="w-3 h-3" /> Calcular
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla Maestra Híbrida de Rotación */}
          <div className="rounded-xl border border-white/10 bg-[#13141b] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  {rotationTable.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} className="border-b border-white/10 bg-black/40">
                      {headerGroup.headers.map(header => (
                        <th 
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          className="px-3 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: ' ↑',
                              desc: ' ↓',
                            }[header.column.getIsSorted() as string] ?? null}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rotationTable.getRowModel().rows.map(row => (
                    <tr 
                      key={row.id}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
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
          </div>

        </div>
      ) : activeTab === 'model' ? (
        /* PESTAÑA B: ARQUITECTURA & MODELO */
        <div className="space-y-6">
          {/* Controles de Anclaje & MCM */}
          <div className="p-4 rounded-xl bg-[#14151c] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">Calibración por Activo Ancla</span>
                <span className="text-[10px] text-zinc-400">Define el activo base para escalar la cartera nominal</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Anchor (ej: AAPL)"
                value={anchor}
                onChange={e => setAnchor(e.target.value.toUpperCase())}
                className="w-28 h-8 px-2 bg-black/40 border border-white/10 rounded text-xs font-mono font-bold text-white outline-none focus:border-purple-500"
              />
              <input
                type="number"
                min="1"
                placeholder="Qty"
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-8 px-2 bg-black/40 border border-white/10 rounded text-xs font-mono font-bold text-white outline-none focus:border-purple-500"
              />
              <button
                onClick={() => fetchAllData(selectedPf, true)}
                className="px-3 h-8 rounded-[3px] bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Recalcular
              </button>
            </div>
          </div>

          {/* Gráficos de Arquitectura (Donut Sectorial & Alpha vs SPY) */}
          {rebalanceData && (
            <PortfolioCharts data={rebalanceData} />
          )}

          {/* Tabla de Cartera Modelo */}
          {rebalanceData && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Matriz de Pesos Objetivos y Anclaje
              </h3>
              <PortfolioTable 
                data={rebalanceData} 
                pfType={selectedPf} 
                onRefresh={() => fetchAllData(selectedPf, true)} 
              />
            </div>
          )}
        </div>
      ) : (
        /* PESTAÑA C: RENTA FIJA EN CARTERA */
        <div className="space-y-5">
          {/* Monitor Cuantitativo de Curva & Arbitrajes */}
          <FixedIncomePortfolioCard
            items={rebalanceData?.fixed_income_summary?.items || []}
            pfType={selectedPf}
            onNavigateToCurve={() => onNavigateToTab?.('market', 'renta-fija')}
            onRefresh={() => fetchAllData(selectedPf, true)}
          />

          {rebalanceData?.fixed_income_summary?.has_fixed_income ? (
            <PortfolioFixedIncomeTable
              summary={rebalanceData.fixed_income_summary}
              pfType={selectedPf}
              onRefresh={() => fetchAllData(selectedPf, true)}
            />
          ) : (
            <div className="p-12 rounded-xl bg-[#14151c] border border-white/10 text-center flex flex-col items-center gap-3">
              <Landmark className="w-8 h-8 text-zinc-600" />
              <h3 className="text-sm font-bold text-white">Sin instrumentos de renta fija asignados</h3>
              <p className="text-xs text-zinc-400 max-w-md">
                Esta cartera no tiene bonos ni letras configurados. Puedes cargar nominales en la pestaña &ldquo;Cargar Tenencia&rdquo; o calibrar activos de renta fija en la curva BYMA/MAE.
              </p>
              <button
                onClick={() => setHoldingsDrawerOpen(true)}
                className="mt-2 px-4 py-2 rounded-[3px] bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors cursor-pointer"
              >
                Cargar Bonos en Tenencia
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODALES Y DRAWERS AUXILIARES */}
      <HoldingsDrawer
        isOpen={holdingsDrawerOpen}
        onClose={() => setHoldingsDrawerOpen(false)}
        onSuccess={() => fetchAllData(selectedPf, true)}
        currentPortfolio={selectedPf}
        availablePortfolios={portfoliosList}
        onPortfolioChange={handlePortfolioChange}
      />

      {calculatorOpen && (
        <PurchaseCalculator
          items={calculatorItems}
          cashArs={cashArs}
          selectedTicker={calculatorTicker}
          onSelectTicker={setCalculatorTicker}
          onClose={() => setCalculatorOpen(false)}
        />
      )}

      <PortfolioWizardModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newPfId: string) => {
          fetchMetadata();
          handlePortfolioChange(newPfId);
        }}
      />

      <RenamePortfolioModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onRenamed={() => {
          fetchMetadata();
          fetchAllData(selectedPf, true);
        }}
        currentName={portfoliosList.find(p => p.id === selectedPf)?.name || selectedPf}
      />

      <PortfolioTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
        onRestore={() => {
          fetchMetadata();
          fetchAllData(selectedPf, true);
        }}
        onTrashChanged={fetchMetadata}
      />

    </div>
  );
};
