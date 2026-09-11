import React, { useState } from 'react';
import { BarChart3, Calendar, Award, Shield, TrendingUp, Layers, HelpCircle } from 'lucide-react';
import { AnnualReturnsBarChart } from './AnnualReturnsBarChart';

interface StatsItem {
  start_balance?: number;
  end_balance?: number;
  total_return?: number;
  cagr?: number;
  volatility?: number;
  sharpe?: number;
  sortino?: number;
  max_drawdown?: number;
  calmar?: number;
  best_year?: { year: number; return: number } | null;
  worst_year?: { year: number; return: number } | null;
  active_return?: number;
  tracking_error?: number;
  information_ratio?: number;
  annual_returns?: Record<string | number, number>;
}

interface AnnualReturnRow {
  year: number;
  sharpe?: number | null;
  min_vol?: number | null;
  cartera_actual?: number | null;
  spy?: number | null;
}

interface PortfolioStatsTableProps {
  data: {
    selected_pf?: string;
    global_stats?: {
      sharpe_optimo?: StatsItem;
      min_volatilidad?: StatsItem;
      cartera_actual?: StatsItem | null;
      benchmark_spy?: StatsItem | null;
    };
    annual_returns_table?: AnnualReturnRow[];
    [key: string]: any;
  };
}

export const PortfolioStatsTable: React.FC<PortfolioStatsTableProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'annual'>('metrics');

  const stats = data?.global_stats;
  if (!stats || !stats.sharpe_optimo) {
    return null;
  }

  const sharpe = stats.sharpe_optimo;
  const minVol = stats.min_volatilidad;
  const current = stats.cartera_actual;
  const spy = stats.benchmark_spy;
  const annualRows = data.annual_returns_table || [];

  const formatPct = (val?: number | null, isPlus = true) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    const sign = val > 0 && isPlus ? '+' : '';
    return `${sign}${val.toFixed(2).replace('.', ',')}%`;
  };

  const formatNum = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return val.toFixed(2).replace('.', ',');
  };

  const formatCurrency = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return `$${Math.round(val).toLocaleString('es-AR')}`;
  };

  const hasCurrent = Boolean(current && current.total_return !== undefined);
  const currentPfName = data.selected_pf && data.selected_pf !== 'custom' 
    ? data.selected_pf.toUpperCase() 
    : 'ACTUAL';

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5 border border-slate-200/80 dark:border-white/10 shadow-sm">
      {/* Encabezado del Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Estadísticas Globales de Rendimiento & Riesgo
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                  QUANT BACKTEST
                </span>
                {data.rebalance_regime && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    {data.rebalance_regime === 'annual' ? 'Rebalanceo Anual' : (data.rebalance_regime === 'daily' ? 'Rebalanceo Diario' : 'Buy & Hold')}
                  </span>
                )}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
              Métricas cuantitativas normalizadas históricas ex-post (Estilo Portfolio Visualizer)
            </p>
          </div>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900/90 p-1 rounded-xl border border-slate-200 dark:border-white/10 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('metrics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'metrics'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Métricas Globales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('annual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'annual'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Retornos por Año ({annualRows.length})
          </button>
        </div>
      </div>

      {/* Vista 1: Tabla de Métricas Cuantitativas Globales */}
      {activeTab === 'metrics' && (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-bold">
                <th className="p-3 w-1/3">Métrica Cuantitativa</th>
                <th className="p-3 text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black tracking-wide bg-amber-50 text-amber-900 border border-amber-200 dark:bg-yellow-500/15 dark:text-[#ffd600] dark:border-yellow-500/30">
                    SHARPE ÓPTIMO
                  </span>
                </th>
                <th className="p-3 text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black tracking-wide bg-rose-50 text-rose-900 border border-rose-200 dark:bg-red-500/15 dark:text-[#ff6b6b] dark:border-red-500/30">
                    MÍN. VOLATILIDAD
                  </span>
                </th>
                {hasCurrent && (
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black tracking-wide bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                      {currentPfName}
                    </span>
                  </th>
                )}
                {spy && (
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black tracking-wide bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30">
                      SPY (BENCHMARK)
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
              {/* Sección 1: Crecimiento y Retorno */}
              <tr className="bg-slate-100/50 dark:bg-white/[0.02]">
                <td colSpan={hasCurrent ? 5 : 4} className="px-3 py-1.5 text-[10px] font-sans font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                  Crecimiento Patrimonial & Retorno
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <span>Saldo Final (Base $10.000 USD)</span>
                </td>
                <td className="p-3 text-right font-black text-amber-600 dark:text-[#ffd600] text-sm tabular-nums">
                  {formatCurrency(sharpe.end_balance)}
                </td>
                <td className="p-3 text-right font-black text-slate-900 dark:text-white text-sm tabular-nums">
                  {formatCurrency(minVol?.end_balance)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(current?.end_balance)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatCurrency(spy.end_balance)}
                  </td>
                )}
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-medium text-slate-700 dark:text-zinc-300">
                  Retorno Total Acumulado
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatPct(sharpe.total_return)}
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatPct(minVol?.total_return)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatPct(current?.total_return)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-slate-500 dark:text-zinc-400 tabular-nums">
                    {formatPct(spy.total_return)}
                  </td>
                )}
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                  CAGR (Retorno Anualizado Compuesto)
                </td>
                <td className="p-3 text-right font-black text-amber-600 dark:text-[#ffd600] tabular-nums">
                  {formatPct(sharpe.cagr)}
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatPct(minVol?.cagr)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatPct(current?.cagr)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatPct(spy.cagr)}
                  </td>
                )}
              </tr>

              {/* Sección 2: Riesgo & Volatilidad */}
              <tr className="bg-slate-100/50 dark:bg-white/[0.02]">
                <td colSpan={hasCurrent ? 5 : 4} className="px-3 py-1.5 text-[10px] font-sans font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                  Riesgo & Preservación de Capital
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                  Volatilidad Anualizada (σ)
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatPct(sharpe.volatility, false)}
                </td>
                <td className="p-3 text-right font-black text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatPct(minVol?.volatility, false)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatPct(current?.volatility, false)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-slate-500 dark:text-zinc-400 tabular-nums">
                    {formatPct(spy.volatility, false)}
                  </td>
                )}
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                  Máximo Drawdown (Max DD)
                </td>
                <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatPct(sharpe.max_drawdown, false)}
                </td>
                <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatPct(minVol?.max_drawdown, false)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                    {formatPct(current?.max_drawdown, false)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-rose-500/80 dark:text-rose-400/80 tabular-nums">
                    {formatPct(spy.max_drawdown, false)}
                  </td>
                )}
              </tr>

              {/* Sección 3: Ratios Ajustados por Riesgo */}
              <tr className="bg-slate-100/50 dark:bg-white/[0.02]">
                <td colSpan={hasCurrent ? 5 : 4} className="px-3 py-1.5 text-[10px] font-sans font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                  Ratios Ajustados por Riesgo
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                  Ratio de Sharpe (Ex-post)
                </td>
                <td className="p-3 text-right font-black text-amber-600 dark:text-[#ffd600] text-sm tabular-nums">
                  {formatNum(sharpe.sharpe)}
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatNum(minVol?.sharpe)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatNum(current?.sharpe)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatNum(spy.sharpe)}
                  </td>
                )}
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                  Ratio de Sortino (Penaliza solo caídas)
                </td>
                <td className="p-3 text-right font-black text-amber-600 dark:text-[#ffd600] tabular-nums">
                  {formatNum(sharpe.sortino)}
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatNum(minVol?.sortino)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatNum(current?.sortino)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatNum(spy.sortino)}
                  </td>
                )}
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                  Ratio de Calmar (CAGR / |Max DD|)
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatNum(sharpe.calmar)}
                </td>
                <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatNum(minVol?.calmar)}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatNum(current?.calmar)}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right font-bold text-slate-500 dark:text-zinc-400 tabular-nums">
                    {formatNum(spy.calmar)}
                  </td>
                )}
              </tr>

              {/* Sección 4: Extremos Anuales */}
              <tr className="bg-slate-100/50 dark:bg-white/[0.02]">
                <td colSpan={hasCurrent ? 5 : 4} className="px-3 py-1.5 text-[10px] font-sans font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                  Extremos de Año Calendario
                </td>
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-medium text-slate-700 dark:text-zinc-300">
                  Mejor Año (Best Year)
                </td>
                <td className="p-3 text-right text-slate-900 dark:text-white tabular-nums">
                  {sharpe.best_year ? (
                    <span>
                      <b className="text-emerald-500">+{sharpe.best_year.return.toFixed(2)}%</b>{' '}
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">({sharpe.best_year.year})</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="p-3 text-right text-slate-900 dark:text-white tabular-nums">
                  {minVol?.best_year ? (
                    <span>
                      <b className="text-emerald-500">+{minVol.best_year.return.toFixed(2)}%</b>{' '}
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">({minVol.best_year.year})</span>
                    </span>
                  ) : '—'}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right text-slate-900 dark:text-white tabular-nums">
                    {current?.best_year ? (
                      <span>
                        <b className="text-emerald-500">+{current.best_year.return.toFixed(2)}%</b>{' '}
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">({current.best_year.year})</span>
                      </span>
                    ) : '—'}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                    {spy.best_year ? (
                      <span>
                        <b className="text-emerald-500">+{spy.best_year.return.toFixed(2)}%</b>{' '}
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">({spy.best_year.year})</span>
                      </span>
                    ) : '—'}
                  </td>
                )}
              </tr>
              <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                <td className="p-3 font-sans font-medium text-slate-700 dark:text-zinc-300">
                  Peor Año (Worst Year)
                </td>
                <td className="p-3 text-right text-slate-900 dark:text-white tabular-nums">
                  {sharpe.worst_year ? (
                    <span>
                      <b className={sharpe.worst_year.return < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                        {sharpe.worst_year.return > 0 ? '+' : ''}{sharpe.worst_year.return.toFixed(2)}%
                      </b>{' '}
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">({sharpe.worst_year.year})</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="p-3 text-right text-slate-900 dark:text-white tabular-nums">
                  {minVol?.worst_year ? (
                    <span>
                      <b className={minVol.worst_year.return < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                        {minVol.worst_year.return > 0 ? '+' : ''}{minVol.worst_year.return.toFixed(2)}%
                      </b>{' '}
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">({minVol.worst_year.year})</span>
                    </span>
                  ) : '—'}
                </td>
                {hasCurrent && (
                  <td className="p-3 text-right text-slate-900 dark:text-white tabular-nums">
                    {current?.worst_year ? (
                      <span>
                        <b className={current.worst_year.return < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                          {current.worst_year.return > 0 ? '+' : ''}{current.worst_year.return.toFixed(2)}%
                        </b>{' '}
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">({current.worst_year.year})</span>
                      </span>
                    ) : '—'}
                  </td>
                )}
                {spy && (
                  <td className="p-3 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                    {spy.worst_year ? (
                      <span>
                        <b className={spy.worst_year.return < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                          {spy.worst_year.return > 0 ? '+' : ''}{spy.worst_year.return.toFixed(2)}%
                        </b>{' '}
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">({spy.worst_year.year})</span>
                      </span>
                    ) : '—'}
                  </td>
                )}
              </tr>

              {/* Sección 5: Métricas Activas vs SPY */}
              {spy && sharpe.active_return !== undefined && (
                <>
                  <tr className="bg-slate-100/50 dark:bg-white/[0.02]">
                    <td colSpan={hasCurrent ? 5 : 4} className="px-3 py-1.5 text-[10px] font-sans font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                      Métricas Activas de Desempeño vs. SPY Benchmark
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                      Retorno Activo (Alpha Anual vs SPY)
                    </td>
                    <td className="p-3 text-right font-black tabular-nums">
                      <span className={sharpe.active_return >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        {formatPct(sharpe.active_return)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums">
                      <span className={(minVol?.active_return || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                        {formatPct(minVol?.active_return)}
                      </span>
                    </td>
                    {hasCurrent && (
                      <td className="p-3 text-right font-bold tabular-nums">
                        <span className={(current?.active_return || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {formatPct(current?.active_return)}
                        </span>
                      </td>
                    )}
                    <td className="p-3 text-right font-bold text-slate-400 dark:text-zinc-600 tabular-nums">
                      Base (0,00%)
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="p-3 font-sans font-medium text-slate-700 dark:text-zinc-300">
                      Tracking Error (Volatilidad vs SPY)
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatPct(sharpe.tracking_error, false)}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatPct(minVol?.tracking_error, false)}
                    </td>
                    {hasCurrent && (
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatPct(current?.tracking_error, false)}
                      </td>
                    )}
                    <td className="p-3 text-right font-bold text-slate-400 dark:text-zinc-600 tabular-nums">
                      —
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="p-3 font-sans font-bold text-slate-800 dark:text-zinc-200">
                      Information Ratio (Alpha / Tracking Error)
                    </td>
                    <td className="p-3 text-right font-black text-amber-600 dark:text-[#ffd600] tabular-nums">
                      {formatNum(sharpe.information_ratio)}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatNum(minVol?.information_ratio)}
                    </td>
                    {hasCurrent && (
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatNum(current?.information_ratio)}
                      </td>
                    )}
                    <td className="p-3 text-right font-bold text-slate-400 dark:text-zinc-600 tabular-nums">
                      —
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Vista 2: Desglose de Retornos por Año Calendario */}
      {activeTab === 'annual' && (
        <div className="flex flex-col gap-4">
          <AnnualReturnsBarChart
            annualRows={annualRows}
            hasCurrent={hasCurrent}
            currentPfName={currentPfName}
            hasSpy={!!spy}
          />

          <div className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-bold">
                  <th className="p-3">Año Calendario</th>
                  <th className="p-3 text-right">Sharpe Óptimo</th>
                  <th className="p-3 text-right">Mín. Volatilidad</th>
                  {hasCurrent && <th className="p-3 text-right">{currentPfName}</th>}
                  {spy && <th className="p-3 text-right">SPY (Benchmark)</th>}
                  {spy && <th className="p-3 text-right">Alpha (Sharpe - SPY)</th>}
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
              {annualRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 dark:text-zinc-500 italic">
                    No hay suficientes datos de años completos para el período seleccionado.
                  </td>
                </tr>
              ) : (
                annualRows.map(row => {
                  const sharpeVal = row.sharpe;
                  const spyVal = row.spy;
                  const alpha = (sharpeVal !== undefined && sharpeVal !== null && spyVal !== undefined && spyVal !== null)
                    ? sharpeVal - spyVal
                    : null;

                  return (
                    <tr key={row.year} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 font-sans font-black text-slate-900 dark:text-white text-sm">
                        {row.year}
                      </td>
                      <td className="p-3 text-right font-black tabular-nums">
                        <span className={(sharpeVal || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {formatPct(sharpeVal)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        <span className={(row.min_vol || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {formatPct(row.min_vol)}
                        </span>
                      </td>
                      {hasCurrent && (
                        <td className="p-3 text-right font-bold tabular-nums">
                          <span className={(row.cartera_actual || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            {formatPct(row.cartera_actual)}
                          </span>
                        </td>
                      )}
                      {spy && (
                        <td className="p-3 text-right font-bold tabular-nums text-slate-700 dark:text-zinc-300">
                          <span className={(spyVal || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {formatPct(spyVal)}
                          </span>
                        </td>
                      )}
                      {spy && (
                        <td className="p-3 text-right font-black tabular-nums">
                          {alpha !== null ? (
                            <span className={alpha >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {formatPct(alpha)}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);
};
