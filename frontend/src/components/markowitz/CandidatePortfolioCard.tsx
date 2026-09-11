import React from 'react';
import { 
  TrendingUp, 
  Shield, 
  Award, 
  Save, 
  Activity, 
  Percent, 
  BarChart2,
  FileSpreadsheet,
  FileCode
} from 'lucide-react';

export interface CandidateCompositionItem {
  ticker: string;
  weight: number;
  weight_fmt: string;
}

export interface CandidatePortfolioData {
  name: string;
  weights: Record<string, number>;
  composition: CandidateCompositionItem[];
  stats?: {
    cagr?: number;
    volatility?: number;
    sharpe?: number;
    sortino?: number;
    max_drawdown?: number;
    calmar?: number;
    active_return?: number;
    tracking_error?: number;
    information_ratio?: number;
    best_year?: { year: number; return: number } | null;
    worst_year?: { year: number; return: number } | null;
  };
  rsi?: {
    weighted: number;
    simple: number;
    status: string;
    color: string;
    show_status: boolean;
  } | null;
  alpha?: Record<string, {
    portfolio: number;
    spy: number;
    alpha: number;
    formatted: string;
    class: string;
  }>;
}

interface CandidatePortfolioCardProps {
  type: 'max_sharpe' | 'min_volatility' | 'current';
  candidate: CandidatePortfolioData;
  onSaveClick: (candidate: CandidatePortfolioData) => void;
  onExportJson: (candidate: CandidatePortfolioData) => void;
  onExportCsv: (candidate: CandidatePortfolioData) => void;
}

export const CandidatePortfolioCard: React.FC<CandidatePortfolioCardProps> = ({
  type,
  candidate,
  onSaveClick,
  onExportJson,
  onExportCsv,
}) => {
  const isSharpe = type === 'max_sharpe';
  const isMinVol = type === 'min_volatility';
  const stats = candidate.stats || {};
  const rsi = candidate.rsi;
  const alpha = candidate.alpha || {};

  const themeConfig = isSharpe
    ? {
        border: 'border-amber-500/30 hover:border-amber-500/50',
        badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: <Award className="w-5 h-5 text-amber-400" />,
        accentColor: '#f59e0b',
        title: 'Candidato: Máximo Sharpe (Tangente)',
        subtitle: 'Optimización de máxima eficiencia por unidad de riesgo asumido',
      }
    : isMinVol
    ? {
        border: 'border-emerald-500/30 hover:border-emerald-500/50',
        badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: <Shield className="w-5 h-5 text-emerald-400" />,
        accentColor: '#10b981',
        title: 'Candidato: Mínima Volatilidad Global',
        subtitle: 'Cartera de menor dispersión y máxima preservación de capital',
      }
    : {
        border: 'border-blue-500/30 hover:border-blue-500/50',
        badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: <BarChart2 className="w-5 h-5 text-blue-400" />,
        accentColor: '#3b82f6',
        title: 'Cartera Actual Ingresada',
        subtitle: 'Estructura ponderada de referencia en simulación',
      };

  return (
    <div className={`glass-panel p-5 rounded-2xl flex flex-col justify-between border transition-all ${themeConfig.border} bg-[#181920]/80`}>
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              {themeConfig.icon}
            </div>
            <div>
              <h4 className="text-base font-black text-white leading-tight">{themeConfig.title}</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">{themeConfig.subtitle}</p>
            </div>
          </div>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${themeConfig.badgeBg}`}>
            {isSharpe ? 'MAX SHARPE' : isMinVol ? 'MIN VOL' : 'CURRENT'}
          </span>
        </div>

        {/* Métricas Principales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">CAGR</span>
            <span className={`text-sm font-black font-mono mt-0.5 ${(stats.cagr ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.cagr !== undefined ? `${stats.cagr > 0 ? '+' : ''}${stats.cagr.toFixed(1)}%` : '—'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">Volatilidad</span>
            <span className="text-sm font-black font-mono text-zinc-200 mt-0.5">
              {stats.volatility !== undefined ? `${stats.volatility.toFixed(1)}%` : '—'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">Sharpe</span>
            <span className="text-sm font-black font-mono text-amber-400 mt-0.5">
              {stats.sharpe !== undefined ? stats.sharpe.toFixed(2) : '—'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
            <span className="text-[10px] text-zinc-400 uppercase font-semibold">Max DD</span>
            <span className="text-sm font-black font-mono text-rose-400 mt-0.5">
              {stats.max_drawdown !== undefined ? `${stats.max_drawdown.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>

        {/* Métricas Cuantitativas Secundarias (Sortino, Calmar, Alpha, RSI) */}
        <div className="space-y-2 mb-4 text-xs">
          {/* Fila Sortino & Calmar */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
            <span className="text-zinc-400 text-[11px]">Ratio Sortino / Calmar:</span>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-zinc-200">Sortino: <b>{stats.sortino !== undefined ? stats.sortino.toFixed(2) : '—'}</b></span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-200">Calmar: <b>{stats.calmar !== undefined ? stats.calmar.toFixed(2) : '—'}</b></span>
            </div>
          </div>

          {/* Fila Alpha vs SPY */}
          {stats.active_return !== undefined && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
              <span className="text-zinc-400 text-[11px]">Alpha vs SPY (Anual):</span>
              <div className="flex items-center gap-2 font-mono">
                <span className={stats.active_return >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {stats.active_return >= 0 ? '+' : ''}{stats.active_return.toFixed(2)}%
                </span>
                {stats.information_ratio !== undefined && (
                  <span className="text-[10px] text-zinc-500">
                    (IR: {stats.information_ratio.toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Desglose Alpha multi-ventana si existe */}
          {Object.keys(alpha).length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
              <span className="text-zinc-400 text-[11px]">Alpha (3M / 6M / YTD / 1A):</span>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                {['3M', '6M', 'YTD', '1A'].map(periodKey => {
                  const m = alpha[periodKey];
                  if (!m) return null;
                  return (
                    <span 
                      key={periodKey} 
                      className={`px-1 rounded ${m.alpha >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}
                      title={`${periodKey}: Cartera ${m.portfolio}% vs SPY ${m.spy}%`}
                    >
                      {periodKey}:{m.alpha >= 0 ? '+' : ''}{m.alpha.toFixed(0)}%
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Termómetro RSI Ponderado */}
          {rsi && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
              <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-zinc-500" />
                RSI Ponderado:
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs" style={{ color: rsi.color }}>
                  {rsi.weighted.toFixed(1)}
                </span>
                <span 
                  className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                  style={{ backgroundColor: `${rsi.color}20`, color: rsi.color }}
                >
                  {rsi.status}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Desglose de Composición y Ponderaciones */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-zinc-500" />
              Composición de Activos ({candidate.composition.length})
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              Total 100%
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {candidate.composition.map((item) => (
              <div 
                key={item.ticker}
                className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-xs"
              >
                <span className="font-bold text-white font-mono">{item.ticker}</span>
                <div className="flex items-center gap-2 flex-1 max-w-[160px] ml-3">
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full"
                      style={{ 
                        width: `${Math.min(100, item.weight)}%`,
                        backgroundColor: themeConfig.accentColor
                      }}
                    />
                  </div>
                  <span className="font-mono text-zinc-300 text-[11px] w-12 text-right">
                    {item.weight.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Botones de Acción: Guardar Permanentemente en Sistema y Descargar */}
      <div className="pt-3 border-t border-white/10 flex flex-wrap gap-2">
        <button
          onClick={() => onSaveClick(candidate)}
          className="flex-1 min-w-[130px] h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
          title="Guardar de forma permanente en el sistema (data/portfolios.json)"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Guardar en Sistema</span>
        </button>

        <button
          onClick={() => onExportJson(candidate)}
          className="h-9 px-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl transition-colors border border-white/10 flex items-center justify-center gap-1 text-xs cursor-pointer"
          title="Descargar estructura en formato JSON"
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>JSON</span>
        </button>

        <button
          onClick={() => onExportCsv(candidate)}
          className="h-9 px-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl transition-colors border border-white/10 flex items-center justify-center gap-1 text-xs cursor-pointer"
          title="Descargar composición en formato CSV"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>CSV</span>
        </button>
      </div>
    </div>
  );
};
