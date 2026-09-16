import React, { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, 
  TrendingUp, 
  ArrowRight, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Scale, 
  Clock, 
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { FixedIncomeItem } from './PortfolioFixedIncomeTable';

interface CurveRecord {
  ticker: string;
  nombre?: string;
  tipo?: string;
  ley?: string;
  vence?: string;
  dias?: number;
  precio?: number | null;
  tir?: number | null;
  tea?: number | null;
  md?: number | null;
  spread_curva_bps?: number | null;
  posicion_curva?: string | null;
}

interface ArbitrageOpportunity {
  heldTicker: string;
  heldTir: number;
  heldMd: number;
  betterTicker: string;
  betterTir: number;
  betterMd: number;
  diffBps: number;
  curveCategory: string;
}

interface EnrichedHeldItem extends FixedIncomeItem {
  matchedTir: number;
  matchedMd: number | null;
  category: string;
  spreadBps: number | null;
  posicion: string;
  bestAlt: CurveRecord | null;
  maxDiffBps: number;
}

interface FixedIncomePortfolioCardProps {
  items: FixedIncomeItem[];
  pfType: string;
  onNavigateToCurve?: (category: string) => void;
  onRefresh?: () => void;
}

export const FixedIncomePortfolioCard: React.FC<FixedIncomePortfolioCardProps> = ({
  items,
  pfType,
  onNavigateToCurve,
  onRefresh,
}) => {
  const [lecapCurve, setLecapCurve] = useState<CurveRecord[]>([]);
  const [soberanoCurve, setSoberanoCurve] = useState<CurveRecord[]>([]);
  const [boncerCurve, setBoncerCurve] = useState<CurveRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Fetch curvas de renta fija
  const fetchCurves = async () => {
    try {
      const [resLecap, resSob, resCer] = await Promise.all([
        fetch('/api/renta_fija/curve_json?category=lecap&tipo_inst=Todos'),
        fetch('/api/renta_fija/curve_json?category=soberanos&ley=Ambas'),
        fetch('/api/renta_fija/curve_json?category=bonceres'),
      ]);

      if (resLecap.ok) {
        const d = await resLecap.json();
        setLecapCurve(d.table_data || []);
      }
      if (resSob.ok) {
        const d = await resSob.json();
        setSoberanoCurve(d.table_data || []);
      }
      if (resCer.ok) {
        const d = await resCer.json();
        setBoncerCurve(d.table_data || []);
      }
    } catch (e) {
      console.error('Error fetching curves for portfolio cross-check:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCurves();
  }, [pfType]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchCurves();
    if (onRefresh) onRefresh();
  };

  // Cruce de bonos de la cartera contra las curvas para detectar arbitrajes
  const analysis = useMemo<{ enrichedHeldItems: EnrichedHeldItem[]; opportunities: ArbitrageOpportunity[] }>(() => {
    const allCurveItems: (CurveRecord & { _cat: string })[] = [
      ...lecapCurve.map(c => ({ ...c, _cat: 'lecap' })),
      ...soberanoCurve.map(c => ({ ...c, _cat: 'soberanos' })),
      ...boncerCurve.map(c => ({ ...c, _cat: 'bonceres' })),
    ];

    const opportunities: ArbitrageOpportunity[] = [];
    const enrichedHeldItems: EnrichedHeldItem[] = items.map((held) => {
      const heldTicker = held.ticker.toUpperCase().trim();
      const match = allCurveItems.find(c => c.ticker && c.ticker.toUpperCase() === heldTicker);

      const heldTir = held.tea ?? held.tem_mkt ?? match?.tea ?? match?.tir ?? 0;
      const heldMd = held.md ?? match?.md ?? (held.dias ? held.dias / 365 : null);
      const cat = match?._cat || (heldTicker.startsWith('S') ? 'lecap' : 'soberanos');

      // Buscar si en la misma curva hay un bono alternativo del mismo tramo con mayor TIR
      let bestAlt: CurveRecord | null = null;
      let maxDiffBps = 0;

      if (heldMd !== null && heldTir > 0) {
        const peers = allCurveItems.filter(c => {
          if (c._cat !== cat || c.ticker.toUpperCase() === heldTicker) return false;
          const cMd = c.md ?? (c.dias ? c.dias / 365 : null);
          if (cMd === null) return false;
          // Mismo tramo de duration (± 0.5 años para soberanos/bonceres, ± 45 días para lecaps)
          const mdDiff = Math.abs(cMd - heldMd);
          const maxAllowedDiff = cat === 'lecap' ? 0.25 : 0.6;
          return mdDiff <= maxAllowedDiff;
        });

        peers.forEach(peer => {
          const peerTir = peer.tea ?? peer.tir ?? 0;
          const diff = (peerTir - heldTir) * 100; // en bps
          if (diff >= 120 && diff > maxDiffBps) { // Al menos +120 bps para considerar arbitraje viable
            maxDiffBps = Math.round(diff);
            bestAlt = peer;
          }
        });
      }

      if (bestAlt && heldMd !== null) {
        const altRec = bestAlt as CurveRecord;
        opportunities.push({
          heldTicker,
          heldTir,
          heldMd,
          betterTicker: altRec.ticker,
          betterTir: altRec.tea ?? altRec.tir ?? 0,
          betterMd: altRec.md ?? 0,
          diffBps: maxDiffBps,
          curveCategory: cat,
        });
      }

      return {
        ...held,
        matchedTir: heldTir,
        matchedMd: heldMd,
        category: cat,
        spreadBps: match?.spread_curva_bps ?? null,
        posicion: match?.posicion_curva || (maxDiffBps > 0 ? 'arbitrable' : 'alineado'),
        bestAlt,
        maxDiffBps,
      };
    });

    return {
      enrichedHeldItems,
      opportunities,
    };
  }, [items, lecapCurve, soberanoCurve, boncerCurve]);

  // Si no hay bonos en cartera, extraemos el top 3 de mejores oportunidades de las curvas
  const topMarketYields = useMemo(() => {
    const list: { ticker: string; tir: number; cat: string; nombre: string; dias?: number }[] = [];
    
    // Top Lecap
    if (lecapCurve.length > 0) {
      const sorted = [...lecapCurve]
        .filter(l => (l.tea || l.tir || 0) > 0)
        .sort((a, b) => (b.tea || b.tir || 0) - (a.tea || a.tir || 0));
      if (sorted[0]) {
        list.push({
          ticker: sorted[0].ticker,
          tir: sorted[0].tea || sorted[0].tir || 0,
          cat: 'LECAP (Pesos)',
          nombre: sorted[0].nombre || sorted[0].ticker,
          dias: sorted[0].dias,
        });
      }
    }

    // Top Soberano
    if (soberanoCurve.length > 0) {
      const sorted = [...soberanoCurve]
        .filter(s => (s.tir || 0) > 0)
        .sort((a, b) => (b.tir || 0) - (a.tir || 0));
      if (sorted[0]) {
        list.push({
          ticker: sorted[0].ticker,
          tir: sorted[0].tir || 0,
          cat: 'Soberano USD',
          nombre: sorted[0].ticker,
        });
      }
    }

    // Top Boncer
    if (boncerCurve.length > 0) {
      const sorted = [...boncerCurve]
        .filter(c => (c.tir || 0) > 0)
        .sort((a, b) => (b.tir || 0) - (a.tir || 0));
      if (sorted[0]) {
        list.push({
          ticker: sorted[0].ticker,
          tir: sorted[0].tir || 0,
          cat: 'BONCER (CER + %)',
          nombre: sorted[0].ticker,
        });
      }
    }

    return list;
  }, [lecapCurve, soberanoCurve, boncerCurve]);

  if (loading) {
    return (
      <div className="p-5 rounded-2xl bg-[#181920] border border-white/10 flex items-center justify-center gap-3 text-xs text-zinc-400">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Sincronizando curvas de rendimiento BYMA / MAE...</span>
      </div>
    );
  }

  const hasHeldItems = items && items.length > 0;

  return (
    <div className="p-5 rounded-2xl bg-[#181920] border border-white/10 shadow-sm flex flex-col gap-4 relative overflow-hidden">
      {/* Luz ambiental sutil */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header de la tarjeta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Monitor de Curva & Arbitrajes
              </h3>
              {analysis.opportunities.length > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold animate-pulse">
                  {analysis.opportunities.length} Arbitrajes Detectados
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              Cruce cuantitativo en tiempo real entre tus títulos y la curva teórica spot
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer text-xs flex items-center gap-1"
            title="Actualizar datos de curvas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="hidden sm:inline text-[10px]">Actualizar</span>
          </button>

          {onNavigateToCurve && (
            <button
              onClick={() => onNavigateToCurve('renta-fija')}
              className="px-2.5 py-1.5 rounded-[3px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Ver Curvas</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* CASO A: LA CARTERA TIENE INSTRUMENTOS DE RENTA FIJA */}
      {hasHeldItems ? (
        <div className="space-y-3">
          {/* Banner de Arbitrajes si existen */}
          {analysis.opportunities.length > 0 && (
            <div className="space-y-2">
              {analysis.opportunities.map((opp, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-300 shrink-0 mt-0.5 sm:mt-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Rotación Sugerida:</span>
                        <span className="font-mono text-zinc-300">{opp.heldTicker} ({opp.heldTir.toFixed(1)}%)</span>
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-emerald-400">{opp.betterTicker} ({opp.betterTir.toFixed(1)}%)</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Mismo tramo de duration (~{opp.heldMd.toFixed(1)} años) con ganancia de spread de{' '}
                        <strong className="text-amber-300 font-mono">+{opp.diffBps} bps</strong> de rendimiento.
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      +{opp.diffBps} bps
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grilla Comparativa de Bonos en Cartera vs Curva */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analysis.enrichedHeldItems.map((item) => (
              <div
                key={item.ticker}
                className="p-3.5 rounded-xl bg-[#14151c] border border-white/5 flex flex-col justify-between gap-2.5 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black text-white">{item.ticker}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-zinc-400 uppercase">
                      {item.tipo}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                    item.maxDiffBps > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {item.maxDiffBps > 0 ? `+${item.maxDiffBps} bps arb.` : 'En curva'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-white/5">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">TIR / TEA Spot</span>
                    <span className="font-bold text-white">
                      {item.matchedTir ? `${item.matchedTir.toFixed(2)}%` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Modified Duration</span>
                    <span className="font-bold text-zinc-300">
                      {item.matchedMd ? `${item.matchedMd.toFixed(2)}a` : '-'}
                    </span>
                  </div>
                </div>

                {item.bestAlt && (
                  <div className="text-[10px] text-zinc-400 bg-black/30 p-2 rounded border border-white/5 flex items-center justify-between">
                    <span>Alternativa: <strong className="text-emerald-400 font-mono">{item.bestAlt.ticker}</strong></span>
                    <span className="text-amber-300 font-mono font-bold">+{item.maxDiffBps} bps</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* CASO B: LA CARTERA NO TIENE INSTRUMENTOS DE RENTA FIJA TODAVÍA */
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-[#14151c] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Oportunidades de Tasa en Curva Soberana & LECAPs</h4>
                <p className="text-[11px] text-zinc-400">
                  Esta cartera aún no tiene títulos de renta fija. Conoce los rendimientos destacados para diversificar con cobro predecible.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topMarketYields.map((yieldItem) => (
              <div
                key={yieldItem.ticker}
                className="p-3.5 rounded-xl bg-[#14151c] border border-white/5 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">{yieldItem.cat}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Líder de Tramo
                  </span>
                </div>
                <div>
                  <div className="text-base font-mono font-black text-white">{yieldItem.ticker}</div>
                  <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                    TIR: {yieldItem.tir.toFixed(2)}%
                  </div>
                </div>
                {yieldItem.dias && (
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Plazo remanente: {yieldItem.dias} días
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
