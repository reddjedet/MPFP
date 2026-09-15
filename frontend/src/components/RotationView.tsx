import React, { useEffect, useState, useMemo } from 'react';
import { 
  ArrowLeftRight, 
  Wallet, 
  TrendingUp, 
  AlertTriangle, 
  RefreshCw, 
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Sparkles,
  HelpCircle,
  Calculator
} from 'lucide-react';
import { Dropdown } from './ui/Dropdown';
import { PurchaseCalculator } from './rotation/PurchaseCalculator';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { 
  TooltipComponent, 
  GridComponent, 
  LegendComponent 
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getSortedRowModel, 
  useReactTable, 
  SortingState 
} from '@tanstack/react-table';
import { HoldingsDrawer } from './rotation/HoldingsDrawer';
import { useChartTheme } from '../hooks/useChartTheme';

echarts.use([
  BarChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

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

export const RotationView: React.FC = () => {
  const chartTheme = useChartTheme();
  const [data, setData] = useState<RotationData | null>(null);
  const [targetPf, setTargetPf] = useState<string>(() => {
    try {
      return localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    } catch {
      return 'min_drawdown_15';
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [calculatorOpen, setCalculatorOpen] = useState<boolean>(false);
  const [calculatorTicker, setCalculatorTicker] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Escuchar cambios remotos de cartera activa (ej: desde Cartera & Rebalanceo)
  useEffect(() => {
    const handleRemoteChange = (e: any) => {
      const newPf = e.detail;
      if (newPf && newPf !== targetPf) {
        setTargetPf(newPf);
      }
    };
    window.addEventListener('finapp-portfolio-change', handleRemoteChange);
    return () => window.removeEventListener('finapp-portfolio-change', handleRemoteChange);
  }, [targetPf]);

  const handleSelectPortfolio = (pfKey: string) => {
    if (pfKey === targetPf) return;
    setTargetPf(pfKey);
    try {
      localStorage.setItem('finapp_active_portfolio', pfKey);
      window.dispatchEvent(new CustomEvent('finapp-portfolio-change', { detail: pfKey }));
    } catch {}
  };

  const selectedPortfolioName = useMemo(() => {
    const found = data?.available_portfolios?.find(p => p.id === targetPf);
    return found?.name || targetPf.toUpperCase();
  }, [data?.available_portfolios, targetPf]);

  const fetchAnalysis = async (pfKey: string = targetPf) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rotation/analysis?target_pf=${encodeURIComponent(pfKey)}`);
      if (!res.ok) throw new Error('Error al cargar análisis de rotación');
      const json: RotationData = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis(targetPf);
  }, [targetPf]);

  // ECharts Bar Comparison Option
  const barOption = useMemo(() => {
    if (!data?.items || data.items.length === 0) return {};

    const tickers = data.items.map(i => i.ticker);
    const realNominals = data.items.map(i => i.real_nominals);
    const targetNominals = data.items.map(i => i.target_nominals);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 }
      },
      legend: {
        data: ['Tenencia Real (VN)', 'Cartera Objetivo (VN)'],
        textStyle: { color: chartTheme.textMuted, fontSize: 11 },
        top: 0
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '5%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: tickers,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' }
      },
      yAxis: {
        type: 'value',
        name: 'Nominales',
        nameTextStyle: { color: chartTheme.textMuted, fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10 }
      },
      series: [
        {
          name: 'Tenencia Real (VN)',
          type: 'bar',
          data: realNominals,
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [4, 4, 0, 0]
          }
        },
        {
          name: 'Cartera Objetivo (VN)',
          type: 'bar',
          data: targetNominals,
          itemStyle: {
            color: '#10b981',
            borderRadius: [4, 4, 0, 0]
          }
        }
      ]
    };
  }, [data, chartTheme]);

  // TanStack Table Setup
  const columnHelper = createColumnHelper<RotationItem>();
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex items-center justify-between gap-1.5 group">
            <div className="flex flex-col">
              <span className="font-extrabold text-slate-900 dark:text-white text-sm tracking-wide">{info.getValue()}</span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">Ratio {row.ratio}:1</span>
            </div>
            <button
              onClick={() => {
                setCalculatorTicker(row.ticker);
                setCalculatorOpen(true);
              }}
              className="p-1 rounded text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors opacity-70 group-hover:opacity-100"
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
      cell: info => <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">${info.getValue().toLocaleString('es-AR')}</span>,
    }),
    columnHelper.accessor('real_nominals', {
      header: 'TENENCIA REAL',
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex flex-col font-mono text-xs">
            <span className="font-bold text-slate-900 dark:text-white">{info.getValue()} VN</span>
            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">
              ${row.real_value.toLocaleString('es-AR')} ({row.real_weight.toFixed(1)}%)
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
              ${row.target_value.toLocaleString('es-AR')} ({row.target_weight.toFixed(1)}%)
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('rsi', {
      header: 'RSI / SEÑALES',
      cell: info => {
        const rsiVal = info.getValue();
        const row = info.row.original;
        const isOB = rsiVal !== null && rsiVal >= 65;
        const isOS = rsiVal !== null && rsiVal <= 40;

        // Determinar la señal principal prioritaria para no saturar visualmente
        let signalBadge = null;
        if (row.is_take_profit || row.ppc_return?.is_take_profit) {
          signalBadge = (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30">
              Take Profit {row.ppc_return ? `+${row.ppc_return.return_pct.toFixed(0)}%` : ''}
            </span>
          );
        } else if (row.ppc_return?.is_attention) {
          signalBadge = (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
              Atención +{row.ppc_return.return_pct.toFixed(0)}%
            </span>
          );
        } else if (row.gf_signal && row.gf_signal.badge_text.toLowerCase().includes('margen')) {
          signalBadge = (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
              {row.gf_signal.badge_text}
            </span>
          );
        } else if (row.pfcf_signal && (row.pfcf_signal.state_key === 'optimo' || row.pfcf_signal.state_key === 'compra_optima')) {
          signalBadge = (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
              {row.pfcf_signal.badge_text}
            </span>
          );
        } else if (row.ppc_return && Math.abs(row.ppc_return.return_pct) >= 5) {
          const isPos = row.ppc_return.return_pct > 0;
          signalBadge = (
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              isPos 
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                : 'text-rose-700 bg-rose-50 border-rose-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30'
            }`}>
              PPC {isPos ? '+' : ''}{row.ppc_return.return_pct.toFixed(1)}%
            </span>
          );
        }

        const tooltipLines = [
          `RSI (14 ruedas): ${rsiVal !== null ? rsiVal.toFixed(1) : 'Sin datos'} (${isOB ? 'Sobrecompra' : isOS ? 'Sobreventa' : 'Rango Neutral'})`,
          row.ppc_return ? `Rendimiento PPC: ${row.ppc_return.badge_text}` : null,
          row.gf_signal ? `GuruFocus: ${row.gf_signal.badge_text}` : null,
          row.pfcf_signal ? `P/FCF Normalizado: ${row.pfcf_signal.badge_text}` : null,
        ].filter(Boolean).join('\n');

        return (
          <div className="flex items-center gap-2" title={tooltipLines}>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border tabular-nums ${
              isOB ? 'text-rose-700 bg-rose-50 border-rose-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/30' : 
              isOS ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30' : 
              'text-slate-600 bg-slate-100 border-slate-200 dark:text-zinc-400 dark:bg-white/5 dark:border-white/10'
            }`}>
              RSI {rsiVal !== null ? rsiVal.toFixed(1) : '—'}
            </span>
            {signalBadge}
          </div>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: 'ESTADO ROTACIÓN',
      cell: info => {
        const status = info.getValue();
        const row = info.row.original;

        if (row.is_take_profit) {
          return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40">
              TAKE PROFIT
            </span>
          );
        }
        if (status === 'surplus') {
          return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30">
              VENDER SOBRANTE
            </span>
          );
        }
        if (status === 'deficit') {
          if (row.is_buy_blocked || row.timing_status === 'wait_pullback') {
            return (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30" title={row.timing_badge_text || 'RSI en sobrecompra'}>
                ESPERAR RETROCESO
              </span>
            );
          }
          if (row.timing_status === 'buy_optimal' || row.is_undervalued || row.is_oversold) {
            return (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 shadow-sm">
                COMPRA ÓPTIMA
              </span>
            );
          }
          return (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30">
              COMPLETAR CUOTA
            </span>
          );
        }
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10">
            BALANCEADO
          </span>
        );
      },
    }),
  ], []);

  const table = useReactTable({
    data: data?.items || [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      
      {/* CABECERA Y SELECTOR */}
      <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-20 shadow-sm">
        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-xl shadow-blue-500/20">
            <ArrowLeftRight className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Rotación Inteligente & Cartera Real</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 uppercase tracking-widest">
                V4 Cuant
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Compara tu tenencia informada contra tu cartera objetivo y planifica los próximos rebalanceos.
            </p>
          </div>
        </div>

        {/* Controles de Selección */}
        <div className="flex flex-wrap items-center gap-3 relative z-30">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Cartera Objetivo:</label>
            <Dropdown
              value={targetPf}
              options={
                data?.available_portfolios?.map(p => ({
                  value: p.id,
                  label: p.name,
                })) || []
              }
              onChange={handleSelectPortfolio}
              title="Seleccionar Cartera Modelo"
              minWidth="210px"
            />
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Gestionar Tenencia ({selectedPortfolioName})</span>
          </button>

          <button
            onClick={() => setCalculatorOpen(prev => !prev)}
            className={`h-10 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              calculatorOpen
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:text-zinc-200'
            }`}
            title="Calculadora rápida de compra por capital"
          >
            <Calculator className="w-4 h-4" />
            <span>Calculadora de Compra</span>
          </button>

          <button
            onClick={() => fetchAnalysis()}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:text-zinc-300 dark:hover:text-white transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel p-4 rounded-2xl border-red-500/30 bg-red-500/5 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
        </div>
      )}

      {/* CALCULADORA RÁPIDA DE COMPRA */}
      {calculatorOpen && data && data.items && data.items.length > 0 && (
        <PurchaseCalculator
          items={data.items}
          cashArs={data.cash_ars}
          selectedTicker={calculatorTicker || data.items[0]?.ticker}
          onSelectTicker={(tk) => setCalculatorTicker(tk)}
          onClose={() => setCalculatorOpen(false)}
        />
      )}

      {/* KPI CARDS */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex flex-col gap-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Patrimonio Real Total</span>
              <Wallet className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
              ${data.total_real_equity.toLocaleString('es-AR')}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
              {data.cash_ars > 0 ? (
                <>Acciones: ${data.total_real_stock_value.toLocaleString('es-AR')} • Caja: ${data.cash_ars.toLocaleString('es-AR')}</>
              ) : (
                <>100% en acciones ({data.items.filter(i => i.real_nominals > 0).length} activos en tenencia)</>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex flex-col gap-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Rendimiento Real (PPC)</span>
              <TrendingUp className={`w-4 h-4 ${data.total_pnl_ars >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-red-400'}`} />
            </div>
            <div className={`text-xl font-black font-mono mt-1 ${data.total_pnl_ars >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-red-400'}`}>
              {data.total_pnl_ars >= 0 ? '+' : ''}${data.total_pnl_ars.toLocaleString('es-AR')}
            </div>
            <div className={`text-[10px] font-bold font-mono ${data.total_pnl_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-red-400'}`}>
              {data.total_pnl_pct >= 0 ? '+' : ''}{data.total_pnl_pct.toFixed(2)}% vs. Costo Invertido
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex flex-col gap-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <div className="flex items-center gap-1.5 cursor-help" title="Distancia promedio entre los pesos reales de tus activos y los objetivos del modelo. Un valor bajo indica alta fidelidad; un valor alto señala necesidad de rebalancear.">
                <span className="text-[11px] font-bold uppercase tracking-wider">Desvío Promedio (Gap)</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
              </div>
              <Scale className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
              {data.avg_tracking_error.toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-500 cursor-help" title="Distancia promedio entre los pesos reales de tus activos y los objetivos del modelo. Un valor bajo indica alta fidelidad; un valor alto señala necesidad de rebalancear.">
              Tracking error medio vs. {data.target_portfolio_name}
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-5 rounded-2xl flex flex-col gap-1 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Oportunidades de Rotación</span>
              <Sparkles className="w-4 h-4 text-amber-500 dark:text-yellow-400" />
            </div>
            <div className="text-xl font-black text-amber-600 dark:text-yellow-400 font-mono mt-1">
              {data.rotation_trades.length} sugeridas
            </div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-500">
              Toma de ganancias &gt; Rebalanceo inteligente
            </div>
          </div>
        </div>
      )}

      {/* GENERADOR DE ÓRDENES DE ROTACIÓN INTELIGENTE */}
      {data && data.rotation_trades.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500 dark:text-yellow-400" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Sugerencias de Rotación de Capital (Accionables)
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">Financiadas por toma de ganancias y superávit</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.rotation_trades.map(trade => {
              const isHigh = trade.priority?.toUpperCase() === 'ALTA';
              return (
                <div 
                  key={trade.id} 
                  className="bg-white dark:bg-white/[0.02] p-5 rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-4 relative overflow-hidden shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider border ${
                      isHigh
                        ? 'bg-white text-amber-800 border-amber-400 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30'
                        : 'bg-white text-slate-700 border-slate-300 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700/50'
                    }`}>
                      Prioridad {trade.priority}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500 dark:text-zinc-400">
                      Saldo neto: <strong className="text-slate-900 dark:text-white font-black">${trade.net_cash_ars.toLocaleString('es-AR')}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* SELL CARD */}
                    {trade.sell ? (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30 uppercase tracking-wider flex items-center gap-1 w-fit">
                            <ArrowDownRight className="w-3.5 h-3.5" /> VENDER
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white font-mono">{trade.sell.ticker}</span>
                        </div>
                        <div className="text-sm font-black text-slate-900 dark:text-white font-mono">
                          {trade.sell.nominals} VN <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">(${(trade.sell.total_cash).toLocaleString('es-AR')})</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-snug font-normal">{trade.sell.reason}</p>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700/50 bg-white dark:bg-transparent flex flex-col items-center justify-center text-slate-600 dark:text-zinc-400 text-xs text-center">
                        Sin venta<br/>(Aporte de capital)
                      </div>
                    )}

                    {/* BUY CARD */}
                    {trade.buy ? (
                      <div className="p-3.5 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 uppercase tracking-wider flex items-center gap-1 w-fit">
                            <ArrowUpRight className="w-3.5 h-3.5" /> COMPRAR
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white font-mono">{trade.buy.ticker}</span>
                            <button
                              onClick={() => {
                                if (trade.buy) {
                                  setCalculatorTicker(trade.buy.ticker);
                                  setCalculatorOpen(true);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                              title={`Calcular compra de ${trade.buy.ticker}`}
                            >
                              <Calculator className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-sm font-black text-slate-900 dark:text-white font-mono">
                          {trade.buy.nominals} VN <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">(${(trade.buy.total_cash).toLocaleString('es-AR')})</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-snug font-normal">{trade.buy.reason}</p>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700/60 bg-white dark:bg-transparent flex flex-col items-center justify-center text-center gap-1">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-zinc-200">Mantener en Caja</span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400">Esperar pullback en activos objetivo</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GRÁFICO COMPARATIVO DE NOMINALES */}
      <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-900 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <span>Comparativa de Nominales: Tenencia Real vs. Cartera Objetivo</span>
          </h2>
          <span className="text-xs font-mono text-slate-500 dark:text-zinc-500">Escalado al capital real de tu cuenta</span>
        </div>
        <div className="h-72 w-full">
          <ReactECharts 
            echarts={echarts}
            option={barOption} 
            notMerge={true}
            style={{ height: '100%', width: '100%' }} 
            opts={{ renderer: 'canvas' }}
          />
        </div>
      </div>

      {/* TABLA DE BRECHAS Y ANÁLISIS DETALLADO */}
      <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-900 dark:text-zinc-300 uppercase tracking-wider">
            Detalle de Brecha Cuantitativa por Activo
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-[10px]">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-2.5 py-2 select-none">
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

      {/* DRAWER MODAL DE TENENCIA */}
      <HoldingsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={() => fetchAnalysis(targetPf)}
        currentPortfolio={targetPf}
        availablePortfolios={data?.available_portfolios || []}
        onPortfolioChange={(newPf) => setTargetPf(newPf)}
      />

    </div>
  );
};
