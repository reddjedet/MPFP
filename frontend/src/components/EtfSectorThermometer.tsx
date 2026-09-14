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
  rsi: number | null;
  trend_sma50: "BULLISH" | "BEARISH" | "NEUTRAL";
  trend_sma200: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export const EtfSectorThermometer: React.FC = () => {
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
        <span>Cargando termómetro de ETFs sectoriales...</span>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="bg-[#181920] border border-white/10 rounded-xl overflow-hidden shadow-sm">
      {/* Header colapsable */}
      <div 
        onClick={() => setCollapsed(!collapsed)}
        className="px-4 py-2.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">
            Termómetro Sectorial S&P 500 (ETFs)
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono font-medium border border-blue-500/30">
            1W / 5 ruedas
          </span>
          <span className="text-[11px] text-zinc-400 hidden sm:inline">
            • Flujo del dinero y rotación de capital entre semanas
          </span>
        </div>
        <button className="text-zinc-400 hover:text-white p-1">
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Contenido / Matriz de sectores */}
      {!collapsed && (
        <div className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2">
            {data.map((item) => {
              const pw = item.perf_w;
              const isPositive = pw !== null && pw > 0;
              const isNegative = pw !== null && pw < 0;

              // Color de fondo sutil según rendimiento semanal
              const perfBg = isPositive 
                ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                : isNegative
                ? "bg-rose-950/30 border-rose-500/30 text-rose-400"
                : "bg-white/5 border-white/10 text-zinc-400";

              return (
                <div
                  key={item.ticker}
                  className="bg-[#121318] border border-white/5 hover:border-white/20 rounded-lg p-2 flex flex-col justify-between transition-all"
                  title={`${item.ticker} - ${item.name} (${item.sector})\nRSI(14): ${item.rsi ?? "N/D"} | SMA50: ${item.trend_sma50}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono font-bold text-xs text-white">
                      {item.ticker}
                    </span>
                    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${perfBg}`}>
                      {pw !== null ? `${pw > 0 ? "+" : ""}${pw.toFixed(1)}%` : "—"}
                    </span>
                  </div>

                  <div className="text-[10px] text-zinc-400 font-medium truncate mb-2" title={item.name}>
                    {item.name}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] font-mono text-zinc-400">
                    <span title="RSI Wilder 14d">
                      RSI: <strong className={item.rsi && item.rsi >= 70 ? "text-amber-400" : item.rsi && item.rsi <= 30 ? "text-blue-400" : "text-zinc-300"}>{item.rsi ? Math.round(item.rsi) : "—"}</strong>
                    </span>
                    <span 
                      title={`Tendencia vs SMA50: ${item.trend_sma50}`}
                      className={item.trend_sma50 === "BULLISH" ? "text-emerald-400 font-bold" : item.trend_sma50 === "BEARISH" ? "text-rose-400 font-bold" : "text-zinc-500"}
                    >
                      {item.trend_sma50 === "BULLISH" ? "▲ 50" : item.trend_sma50 === "BEARISH" ? "▼ 50" : "— 50"}
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
