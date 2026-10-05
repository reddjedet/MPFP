import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useDraggableScroll } from '@/hooks/useDraggableScroll';

export function BuyerModeView() {
  const { toggleBuyerMode, openTickerDrawer } = useAppStore();
  const selectedPf = useAppStore(s => s.selectedPf);
  const setSelectedPf = useAppStore(s => s.setSelectedPf);
  const [portfolios, setPortfolios] = useState<Record<string, any>>({});
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const scrollRef = useDraggableScroll<HTMLDivElement>();

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [pfRes, qRes] = await Promise.all([
          fetch('/api/portfolios/list_json'),
          fetch('/api/cedears/quotes_json')
        ]);
        if (!isMounted) return;
        
        if (pfRes.ok && qRes.ok) {
          const pfData = await pfRes.json();
          const qData = await qRes.json();
          
          setPortfolios(pfData.portfolios || {});
          // Preservar la seleccion global
          const currentSelected = useAppStore.getState().selectedPf;
          const hasSelected = currentSelected && pfData.portfolios && pfData.portfolios[currentSelected];
          if (!hasSelected) {
            if (pfData.selected_pf && pfData.portfolios[pfData.selected_pf]) {
              setSelectedPf(pfData.selected_pf);
            } else if (Object.keys(pfData.portfolios || {}).length > 0) {
              setSelectedPf(Object.keys(pfData.portfolios)[0]);
            }
          }
          
          setQuotes(qData.quotes || []);
        }
      } catch (err) {
        console.error("Error fetching data", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, []);

  const handleDeepScan = async () => {
    setIsDeepScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch('/api/cedears/quotes_json?tickers=ALL_BYMA');
      if (!res.ok) {
        setScanMsg('No se pudo consultar el panel de BYMA. Revisá la conexión e intentá de nuevo.');
        return;
      }
      const data = await res.json();
      const incoming: any[] = data.quotes || [];

      if (incoming.length === 0) {
        setScanMsg('BYMA no devolvió ningún CEDEAR. El panel puede estar caído o fuera de horario.');
        return;
      }

      // Se cuenta contra el estado actual (no dentro del updater) para evitar
      // doble conteo: React puede invocar el updater más de una vez.
      const known = new Set(quotes.map(q => q.symbol));
      const added = incoming.filter(q => !known.has(q.symbol)).length;

      setQuotes(prev => {
        const existing = new Map(prev.map(q => [q.symbol, q]));
        incoming.forEach((q: any) => existing.set(q.symbol, q));
        return Array.from(existing.values());
      });

      setScanMsg(
        added > 0
          ? `BYMA aportó ${added} CEDEAR${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'} al universo.`
          : `Sin novedades: BYMA no devolvió CEDEARs adicionales a los ${known.size} ya cargados.`
      );
    } catch (err) {
      console.error('Error deep scanning', err);
      setScanMsg('Error de conexión al consultar el panel de BYMA.');
    } finally {
      setIsDeepScanning(false);
    }
  };

  const pfNames = Object.keys(portfolios);
  
  // Calculate oversold assets in current portfolio (RSI <= 35) to average down
  const portfolioOversold = (() => {
    if (!selectedPf || !portfolios[selectedPf]) return [];
    const assets = portfolios[selectedPf].assets || {};
    const sources = [];
    for (const [tk, weight] of Object.entries(assets)) {
      const q = quotes.find(q => q.symbol === tk);
      if (q && q.rsi !== null && q.rsi <= 35) {
        sources.push({ ticker: tk, rsi: q.rsi, weight: Number(weight), price: q.local || q.cedear_usd });
      }
    }
    return sources.sort((a, b) => a.rsi - b.rsi); // Lowest RSI first
  })();

  // Oportunidades FUERA de cualquier cartera (RSI <= 35). Se excluyen los activos
  // que ya se poseen porque esa información la muestra la columna "Oportunidades
  // en Cartera"; incluirlos acá duplicaba filas bajo el título "Destinos Estratégicos".
  const buyCandidates = quotes
    .filter(q => q.rsi !== null && q.rsi <= 35 && !q.in_portfolio)
    .sort((a, b) => a.rsi - b.rsi)
    .slice(0, 10); // top 10 most oversold

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="absolute inset-0 z-50 bg-background flex flex-col"
    >
      {/* Header Modal */}
      <div className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-positive/10 rounded-lg">
            <Zap className="w-6 h-6 text-positive" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Planificador Estratégico (Comprador)</h1>
            <p className="text-xs text-muted-foreground">Diagnóstico de liquidez y oportunidades de compra en zona de sobreventa.</p>
          </div>
        </div>
        <button 
          onClick={toggleBuyerMode}
          className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-border text-foreground rounded-lg transition-colors font-medium text-sm"
        >
          <X className="w-4 h-4" />
          Cerrar Vista
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
          
          {/* Horizontal Portfolio Selector */}
          <div ref={scrollRef} className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar select-none cursor-grab active:cursor-grabbing">
            <span className="text-xs font-bold text-muted-foreground uppercase mr-2 shrink-0">Evaluando:</span>
            {loading && <span className="text-sm text-muted-foreground">Cargando...</span>}
            {!loading && pfNames.length === 0 && <span className="text-sm text-muted-foreground">Sin carteras</span>}
            {pfNames.map(pf => (
              <button
                key={pf}
                onClick={() => setSelectedPf(pf)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border shrink-0 ${
                  selectedPf === pf 
                    ? 'bg-foreground text-background border-foreground shadow-md' 
                    : 'bg-card text-muted-foreground border-border hover:bg-secondary'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN: LIQUIDITY SOURCES / PORTFOLIO OPPORTUNITIES */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <ArrowDownRight className="w-5 h-5 text-positive" />
                <h2 className="text-lg font-bold text-foreground">Oportunidades en Cartera</h2>
              </div>

              <section className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 text-positive" />
                  Activos Sobrevendidos (RSI &lt;= 35)
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Activos en {selectedPf || 'tu cartera'} que se encuentran en zona baja y podrían ser promediados a la baja.</p>
                
                <div className="space-y-3">
                  {portfolioOversold.length === 0 && <p className="text-sm text-muted-foreground">No hay activos sobrevendidos en esta cartera.</p>}
                  {portfolioOversold.map(src => (
                    <div key={src.ticker} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{src.ticker}</span>
                          <span className="text-[10px] bg-positive/10 text-positive px-1.5 py-0.5 rounded">RSI: {src.rsi.toFixed(1)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Peso actual: {src.weight}%</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-positive">${src.price?.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: STRATEGIC DESTINATIONS */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <ArrowUpRight className="w-5 h-5 text-positive" />
                <h2 className="text-lg font-bold text-foreground">Destinos Estratégicos</h2>
              </div>

              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  Oportunidades de Compra (RSI &lt; 35)
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Top 10 activos con mayor nivel de sobreventa que NO tenés en ninguna cartera.</p>
                
                <div className="space-y-3">
                  {buyCandidates.length === 0 && <p className="text-sm text-muted-foreground">No hay activos sobrevendidos actualmente.</p>}
                  {buyCandidates.map(cand => (
                    <div key={cand.symbol} className="border border-border rounded-xl overflow-hidden">
                      <div className="p-3 bg-background flex items-center justify-between transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-foreground">{cand.symbol}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-positive/10 text-positive">
                            RSI: {cand.rsi?.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-foreground">${(cand.local || cand.cedear_usd || 0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                          <button
                            onClick={() => openTickerDrawer(cand.symbol)}
                            title={`Ver ficha 360° de ${cand.symbol}`}
                            className="text-positive font-bold hover:underline text-xs flex items-center gap-1"
                          >
                            Evaluar <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {scanMsg && (
                  <p
                    className={`mt-3 text-xs rounded-lg px-3 py-2 border ${
                      scanMsg.startsWith('BYMA aportó')
                        ? 'text-positive bg-positive/10 border-positive/30'
                        : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    {scanMsg}
                  </p>
                )}

                {!isDeepScanning ? (
                  <button 
                    onClick={handleDeepScan}
                    className="w-full mt-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Consultar el resto de cedears
                  </button>
                ) : (
                  <div className="w-full mt-4 py-2 flex justify-center items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="w-4 h-4 animate-pulse" />
                    Escaneando panel de BYMA...
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
