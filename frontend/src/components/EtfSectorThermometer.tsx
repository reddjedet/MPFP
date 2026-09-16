import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Activity, ChevronDown, ChevronUp } from "lucide-react";

export interface SectorEtfItem {
  ticker: string;
  name: string;
  sector: string;
  close: number;
  change_d: number;
  perf_w: number | null;
  perf_1m: number | null;
  spy_perf_w?: number | null;
  diff_vs_spy_w?: number | null;
  spy_perf_1m?: number | null;
  diff_vs_spy_1m?: number | null;
  rsi: number | null;
  trend_sma50: "BULLISH" | "BEARISH" | "NEUTRAL";
  trend_sma200: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface EtfSectorThermometerProps {
  onNavigateToRotation?: () => void;
}

export const EtfSectorThermometer: React.FC<EtfSectorThermometerProps> = ({ onNavigateToRotation }) => {
  const [data, setData] = useState<SectorEtfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/cedears/etf_thermometer")
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        if (isMounted) {
          setData(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-center gap-2 text-xs text-zinc-400">
        <Activity className="w-4 h-4 animate-pulse text-blue-400" />
        <span>Cargando termómetro de rotación sectorial vs SPY...</span>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  // Rendimiento de referencia de SPY en la última semana
  const spyPerfW = data.length > 0 && data[0].spy_perf_w !== undefined && data[0].spy_perf_w !== null
    ? data[0].spy_perf_w
    : null;

  return (
    <div className="bg-[#181920] border border-white/10 rounded-xl overflow-hidden shadow-sm">
      {/* Header colapsable */}
      <button 
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="w-full px-4 py-2.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors select-none text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Activity className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">
            Termómetro Sectorial S&P 500 (ETFs vs SPY)
          </h2>
          {spyPerfW !== null && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono font-bold border border-blue-500/30">
              SPY Base: {spyPerfW > 0 ? "+" : ""}{spyPerfW.toFixed(1)}% (1W)
            </span>
          )}
          <span className="text-[11px] text-zinc-400 hidden sm:inline">
            • Fuerza relativa y rotación de capital sectorial frente al mercado general
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToRotation && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToRotation();
              }}
              className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors cursor-pointer"
              title="Abrir vista analítica completa de rotación de ETFs y sectores vs SPY"
            >
              Radar Completo ↗
            </span>
          )}
          <span className="text-zinc-400 hover:text-white p-1 flex items-center">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {/* Contenido / Matriz de sectores con jerarquía estricta: 1ª Info (Sector, Ticker mini, Diferencial) vs 2ª Info (RSI, SMA50) */}
      {!collapsed && (
        <div className="p-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2">
            {data.map((item) => {
              const diff = item.diff_vs_spy_w;
              const hasDiff = diff !== null && diff !== undefined;
              const isOutperforming = hasDiff && diff > 0;
              const isUnderperforming = hasDiff && diff < 0;

              // Borde y acento según si supera o queda rezagado respecto a SPY
              const cardBorder = isOutperforming
                ? "border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-950/15"
                : isUnderperforming
                ? "border-rose-500/25 hover:border-rose-500/50 bg-rose-950/15"
                : "border-white/10 hover:border-white/25 bg-[#121318]";

              // Formateo limpio del diferencial: ej: +3% o +3.2%
              const diffFormatted = hasDiff
                ? `${diff > 0 ? "+" : ""}${Number.isInteger(diff) ? diff : diff.toFixed(1)}%`
                : "—";

              return (
                <div
                  key={item.ticker}
                  className={`border rounded-lg p-2 flex flex-col justify-between transition-all select-none ${cardBorder}`}
                  title={`${item.name} (${item.ticker}) • ${item.sector}\n• Diferencial: ${hasDiff ? (diff > 0 ? '+' : '') + diff + '%' : '—'} vs SPY\n• Retorno ETF 1W: ${item.perf_w !== null ? (item.perf_w > 0 ? '+' : '') + item.perf_w + '%' : '—'}\n• Retorno SPY 1W: ${spyPerfW !== null ? (spyPerfW > 0 ? '+' : '') + spyPerfW + '%' : '—'}\n• RSI (14): ${item.rsi ?? 'N/D'}\n• Tendencia vs SMA50: ${item.trend_sma50}`}
                >
                  {/* INFORMACIÓN DE PRIMERA: PRIORIDAD MÁXIMA EN ESPACIO REDUCIDO */}
                  <div>
                    {/* Sector & Ticker en miniatura */}
                    <div className="flex items-start justify-between gap-1 min-h-[28px] mb-1">
                      <span className="font-bold text-[11px] leading-tight text-white line-clamp-2" title={item.name}>
                        {item.name}
                      </span>
                      <span className="font-mono text-[9px] font-semibold px-1 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/10 shrink-0">
                        {item.ticker}
                      </span>
                    </div>

                    {/* Diferencial vs SPY (Hero metric) */}
                    <div className="my-1 py-1 px-1 rounded-md bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center">
                      <span className={`text-base font-black font-mono tracking-tight leading-none ${
                        isOutperforming ? "text-emerald-400" : isUnderperforming ? "text-rose-400" : "text-zinc-400"
                      }`}>
                        {diffFormatted}
                      </span>
                      <span className="text-[9px] font-semibold text-zinc-400 mt-1 uppercase tracking-wider">
                        vs SPY
                      </span>
                    </div>
                  </div>

                  {/* INFORMACIÓN DE SEGUNDA: ORDEN INFERIOR DE IMPORTANCIA (RSI Y SMA50) */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] font-mono text-zinc-400">
                    <span title={`RSI (14 Wilder): ${item.rsi ?? 'N/D'}`}>
                      RSI <strong className={item.rsi && item.rsi >= 70 ? "text-amber-400 font-semibold" : item.rsi && item.rsi <= 30 ? "text-blue-400 font-semibold" : "text-zinc-300"}>
                        {item.rsi ? Math.round(item.rsi) : "—"}
                      </strong>
                    </span>
                    <span 
                      title={`Tendencia respecto a SMA50: ${item.trend_sma50}`}
                      className={
                        item.trend_sma50 === "BULLISH" 
                          ? "text-emerald-400/80 font-medium" 
                          : item.trend_sma50 === "BEARISH" 
                          ? "text-rose-400/80 font-medium" 
                          : "text-zinc-600"
                      }
                    >
                      {item.trend_sma50 === "BULLISH" ? "▲ SMA50" : item.trend_sma50 === "BEARISH" ? "▼ SMA50" : "— 50"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
