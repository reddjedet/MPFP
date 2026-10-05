import React from 'react';
import { Compass, RefreshCw, Activity, Sparkles, ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useEtfRotation, EtfItem } from '@/hooks/useEtfRotation';
import { EtfRotationBarChart } from './EtfRotationBarChart';

export const EtfRotationView: React.FC = () => {
  const { openTickerDrawer: openTicker360 } = useAppStore();
  const {
    data, loading, refreshing, searchFilter, setSearchFilter,
    universeFilter, setUniverseFilter,
    fetchData, spyItem, majorIndices, filteredMajorIndices,
    filteredSectorItems, displayedItems, topLeader, topLaggard
  } = useEtfRotation();

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
        <Compass className="w-8 h-8 text-positive animate-spin" />
        <span className="text-xs font-mono">Cargando seguimiento de ETFs vs SPY...</span>
      </div>
    );
  }

  // const topLeader = data?.top_leader;
  // const topLaggard = data?.top_laggard;

  return (
    <div className="space-y-4">
      {/* 1. Barra Superior Limpia */}
      <div className="bg-secondary border border-border rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Compass className="w-5 h-5 text-positive" />
          <h1 className="text-sm font-bold text-foreground tracking-tight">
            Seguimiento Semanal de ETFs vs SPY
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30">
            SPY Base: {data?.benchmark?.perf_w !== null && data?.benchmark?.perf_w !== undefined ? `${data.benchmark.perf_w > 0 ? '+' : ''}${data.benchmark.perf_w.toFixed(1)}%` : '—'} (1W)
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Toggle universo */}
          <div className="flex items-center bg-secondary border border-border p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setUniverseFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                universeFilter === 'all' ? 'bg-emerald-600 text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos ({data?.items.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setUniverseFilter('sectors')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                universeFilter === 'sectors' ? 'bg-emerald-600 text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              11 Sectores S&P
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-8 px-3 rounded-lg bg-secondary/50 hover:bg-secondary/50 border border-border text-muted-foreground hover:text-foreground font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-positive' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* 2. Menú Superior: EXACTAMENTE las 2 tarjetas de la imagen del usuario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tarjeta 1: AMPLITUD DE MERCADO */}
        <div className="bg-secondary border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
              AMPLITUD DE MERCADO
            </span>
            <Activity className="w-4 h-4 text-positive" />
          </div>

          <div className="my-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-foreground">
              {data?.breadth_w ? `${Math.round(data.breadth_w)}%` : '0%'}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              superan a SPY (1W)
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="w-full bg-secondary/50 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${data?.breadth_w ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>Amplitud 1M: <strong className="text-foreground">{data?.breadth_1m ? `${Math.round(data.breadth_1m)}%` : '0%'}</strong></span>
              <span className="text-muted-foreground font-semibold">{data?.breadth_w && data.breadth_w >= 50 ? 'Saludable' : 'Selectiva'}</span>
            </div>
          </div>
        </div>

        {/* Tarjeta 2: Diferenciales extremos semanales vs SPY */}
        <div className="bg-secondary border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
              EXTREMOS TÁCTICOS VS SPY (1W)
            </span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>

          <div className="space-y-1.5 my-1.5 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs truncate max-w-[240px]">
                🥇 {topLeader ? `${topLeader.ticker} (${topLeader.name})` : '—'}
              </span>
              <span className="font-bold text-positive">
                {topLeader?.diff_vs_spy_w !== null && topLeader?.diff_vs_spy_w !== undefined
                  ? `${topLeader.diff_vs_spy_w > 0 ? '+' : ''}${topLeader.diff_vs_spy_w.toFixed(1)} p.p.`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs truncate max-w-[240px]">
                🔻 {topLaggard ? `${topLaggard.ticker} (${topLaggard.name})` : '—'}
              </span>
              <span className="font-bold text-rose-400">
                {topLaggard?.diff_vs_spy_w !== null && topLaggard?.diff_vs_spy_w !== undefined
                  ? `${topLaggard.diff_vs_spy_w > 0 ? '+' : ''}${topLaggard.diff_vs_spy_w.toFixed(1)} p.p.`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-border text-[11px] text-muted-foreground flex justify-between font-mono">
            <span>Spread Líder/Rezagado (p.p.):</span>
            <strong className="text-foreground font-bold">
              {data?.spread_extremos !== null && data?.spread_extremos !== undefined ? `${data.spread_extremos.toFixed(1)} p.p.` : '—'}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. Ranking de diferencial semanal vs SPY */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-secondary border border-border rounded-xl p-4 flex flex-col shadow-sm">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-positive" />
                Diferencial Semanal vs SPY (1W, p.p.)
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Sobre-rendimiento (+) o rezago (-) respecto a SPY durante una semana
              </p>
            </div>
          </div>

          <div className="w-full h-[360px]">
            <EtfRotationBarChart data={data} displayedItems={displayedItems} />
          </div>
        </div>
      </div>

      {/* 4. Tabla Cuantitativa: Foco 100% en Comparar con el Benchmark */}
      <div className="bg-secondary border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Compass className="w-4 h-4 text-positive" />
              Comparativa de ETFs vs SPY ({filteredMajorIndices.length + filteredSectorItems.length} activos)
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tríada de Índices Principales (SPY, QQQ, DIA) agrupada y rotación sectorial vs Benchmark
            </p>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Buscar ticker o sector..."
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-white/[0.02]">
                <th className="px-3 py-2.5">Ticker</th>
                <th className="px-3 py-2.5">Sector / Nombre</th>
                <th className="px-3 py-2.5 text-right">Precio Spot</th>
                <th className="px-3 py-2.5 text-right font-black text-foreground bg-white/[0.04] border-x border-border">
                  DIFERENCIAL VS SPY (1W, p.p.)
                </th>
                <th className="px-3 py-2.5 text-right">Retorno ETF (1W)</th>
                <th className="px-3 py-2.5 text-center">RSI (14)</th>
                <th className="px-3 py-2.5 text-center">Tendencia SMA50</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {/* SECCIÓN 1: ÍNDICES PRINCIPALES (SPY • QQQ • DIA • IWM) */}
              {filteredMajorIndices.length > 0 && (
                <tr className="bg-amber-500/10 border-y border-amber-500/25 text-amber-300 select-none">
                  <td colSpan={7} className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        🏛️ Índices Principales de Wall Street (SPY • QQQ • DIA • IWM)
                      </span>
                      <span className="text-[9px] text-amber-400/80 font-mono font-medium">
                        Cuarteto de Benchmarks Macro
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {filteredMajorIndices.map((item: EtfItem) => {
                const isSpy = item.ticker === 'SPY';
                const diff = item.diff_vs_spy_w ?? 0;
                const isPositive = diff > 0;
                const isNegative = diff < 0;

                return (
                  <tr 
                    key={item.ticker} 
                    className={`transition-colors select-none ${
                      isSpy ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]' : 'hover:bg-secondary/50'
                    }`}
                  >
                    {/* Ticker */}
                    <td className="px-3 py-2 font-bold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openTicker360(item.ticker)}
                          className={`font-black transition-colors cursor-pointer ${
                            isSpy 
                              ? 'text-amber-400 hover:text-amber-300' 
                              : item.ticker === 'IWM' 
                              ? 'text-foreground hover:text-purple-300' 
                              : 'text-foreground hover:text-positive'
                          }`}
                          title={`Ver ficha 360 de ${item.ticker}`}
                        >
                          {item.ticker}
                        </button>
                        {isSpy ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold border border-amber-400/40">
                            BENCHMARK
                          </span>
                        ) : item.ticker === 'QQQ' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
                            NASDAQ
                          </span>
                        ) : item.ticker === 'DIA' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40">
                            DOW
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40">
                            RUSSELL
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-2 font-sans font-medium text-foreground">
                      {item.name}
                    </td>

                    {/* Precio Spot */}
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      ${item.close.toFixed(2)}
                    </td>

                    {/* HERO: DIFERENCIAL VS SPY */}
                    <td className={`px-3 py-2 text-right font-black text-sm border-x border-border ${
                      isSpy
                        ? 'text-amber-400 bg-amber-400/10'
                        : isPositive 
                        ? 'text-positive bg-emerald-950/20' 
                        : isNegative 
                        ? 'text-rose-400 bg-rose-950/20' 
                        : 'text-muted-foreground bg-white/[0.02]'
                    }`}>
                      {isSpy 
                        ? '0.0 p.p. (Base)'
                        : item.diff_vs_spy_w !== null && item.diff_vs_spy_w !== undefined
                        ? `${item.diff_vs_spy_w > 0 ? '+' : ''}${item.diff_vs_spy_w.toFixed(1)} p.p.`
                        : '—'}
                    </td>

                    {/* Retorno 1W ETF */}
                    <td className={`px-3 py-2 text-right font-bold ${
                      isSpy 
                        ? 'text-amber-300'
                        : (item.perf_w ?? 0) >= 0 
                        ? 'text-positive/80' 
                        : 'text-rose-400/80'
                    }`}>
                      {item.perf_w !== null ? `${item.perf_w > 0 ? '+' : ''}${item.perf_w.toFixed(1)}%` : '—'}
                    </td>

                    {/* RSI */}
                    <td className="px-3 py-2 text-center">
                      <span className={
                        item.rsi && item.rsi >= 70 ? 'text-amber-400 font-bold' : item.rsi && item.rsi <= 30 ? 'text-foreground font-bold' : 'text-muted-foreground'
                      }>
                        {item.rsi ? Math.round(item.rsi) : '—'}
                      </span>
                    </td>

                    {/* SMA50 */}
                    <td className="px-3 py-2 text-center font-sans font-medium">
                      <span className={
                        item.trend_sma50 === 'BULLISH'
                          ? 'text-positive/90'
                          : item.trend_sma50 === 'BEARISH'
                          ? 'text-rose-400/90'
                          : 'text-muted-foreground'
                      }>
                        {item.trend_sma50 === 'BULLISH' ? '▲ Alcista' : item.trend_sma50 === 'BEARISH' ? '▼ Bajista' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* SECCIÓN 2: SECTORES Y ACTIVOS DE MERCADO */}
              {filteredSectorItems.length > 0 && (
                <tr className="bg-secondary/50 border-y border-border text-muted-foreground select-none">
                  <td colSpan={7} className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        📊 {universeFilter === 'sectors' ? '11 Sectores Oficiales del S&P 500' : 'Sectores y ETFs Temáticos'} ({filteredSectorItems.length} activos)
                      </span>
                      <span className="text-[9px] text-muted-foreground font-mono font-normal">
                        Fuerza Relativa Sectorial
                      </span>
                    </div>
                  </td>
                </tr>
              )}

              {filteredSectorItems.map((item: EtfItem) => {
                const diff = item.diff_vs_spy_w ?? 0;
                const isPositive = diff > 0;
                const isNegative = diff < 0;

                return (
                  <tr key={item.ticker} className="hover:bg-white/[0.02] transition-colors select-none">
                    {/* Ticker */}
                    <td className="px-3 py-2 font-bold text-foreground">
                      <button
                        type="button"
                        onClick={() => openTicker360(item.ticker)}
                        className="hover:text-positive transition-colors cursor-pointer"
                        title={`Ver ficha 360 de ${item.ticker}`}
                      >
                        {item.ticker}
                      </button>
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-2 font-sans font-medium text-foreground">
                      {item.name}
                    </td>

                    {/* Precio Spot */}
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      ${item.close.toFixed(2)}
                    </td>

                    {/* HERO: DIFERENCIAL VS SPY */}
                    <td className={`px-3 py-2 text-right font-black text-sm border-x border-border ${
                      isPositive 
                        ? 'text-positive bg-emerald-950/20' 
                        : isNegative 
                        ? 'text-rose-400 bg-rose-950/20' 
                        : 'text-muted-foreground bg-white/[0.02]'
                    }`}>
                      {item.diff_vs_spy_w !== null && item.diff_vs_spy_w !== undefined
                        ? `${item.diff_vs_spy_w > 0 ? '+' : ''}${item.diff_vs_spy_w.toFixed(1)} p.p.`
                        : '—'}
                    </td>

                    {/* Retorno 1W ETF */}
                    <td className={`px-3 py-2 text-right ${
                      (item.perf_w ?? 0) >= 0 ? 'text-positive/80' : 'text-rose-400/80'
                    }`}>
                      {item.perf_w !== null ? `${item.perf_w > 0 ? '+' : ''}${item.perf_w.toFixed(1)}%` : '—'}
                    </td>

                    {/* RSI */}
                    <td className="px-3 py-2 text-center">
                      <span className={
                        item.rsi && item.rsi >= 70 ? 'text-amber-400 font-bold' : item.rsi && item.rsi <= 30 ? 'text-foreground font-bold' : 'text-muted-foreground'
                      }>
                        {item.rsi ? Math.round(item.rsi) : '—'}
                      </span>
                    </td>

                    {/* SMA50 */}
                    <td className="px-3 py-2 text-center font-sans font-medium">
                      <span className={
                        item.trend_sma50 === 'BULLISH'
                          ? 'text-positive/90'
                          : item.trend_sma50 === 'BEARISH'
                          ? 'text-rose-400/90'
                          : 'text-muted-foreground'
                      }>
                        {item.trend_sma50 === 'BULLISH' ? '▲ Alcista' : item.trend_sma50 === 'BEARISH' ? '▼ Bajista' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
