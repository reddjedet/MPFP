import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export function BuyerModeView() {
  const { toggleBuyerMode } = useAppStore();
  const [portfolios, setPortfolios] = useState<Record<string, any>>({});
  const [activePortfolio, setActivePortfolio] = useState<string>('');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
          if (pfData.selected_pf) {
            setActivePortfolio(pfData.selected_pf);
          } else if (Object.keys(pfData.portfolios || {}).length > 0) {
            setActivePortfolio(Object.keys(pfData.portfolios)[0]);
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

  const pfNames = Object.keys(portfolios);
  
  // Calculate excess liquidity sources based on current portfolio's RSI > 60 or simply high weights
  const liquidSources = (() => {
    if (!activePortfolio || !portfolios[activePortfolio]) return [];
    const assets = portfolios[activePortfolio].assets || {};
    const sources = [];
    for (const [tk, weight] of Object.entries(assets)) {
      const q = quotes.find(q => q.symbol === tk);
      if (q && q.rsi >= 60) {
        sources.push({ ticker: tk, rsi: q.rsi, weight: Number(weight), price: q.local || q.cedear_usd });
      }
    }
    return sources.sort((a, b) => b.rsi - a.rsi);
  })();

  // Calculate underperforming assets (RSI <= 40)
  const buyCandidates = quotes
    .filter(q => q.rsi !== null && q.rsi <= 40)
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
          <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar">
            <span className="text-xs font-bold text-muted-foreground uppercase mr-2 shrink-0">Evaluando:</span>
            {loading && <span className="text-sm text-muted-foreground">Cargando...</span>}
            {!loading && pfNames.length === 0 && <span className="text-sm text-muted-foreground">Sin carteras</span>}
            {pfNames.map(pf => (
              <button
                key={pf}
                onClick={() => setActivePortfolio(pf)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${
                  activePortfolio === pf 
                    ? 'bg-foreground text-background border-foreground shadow-md' 
                    : 'bg-card text-muted-foreground border-border hover:bg-secondary'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN: LIQUIDITY SOURCES */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <ArrowDownRight className="w-5 h-5 text-negative" />
                <h2 className="text-lg font-bold text-foreground">Fuentes de Liquidez</h2>
              </div>

              <section className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 text-negative" />
                  Activos Sobrecomprados (RSI &gt; 60)
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Activos en {activePortfolio || 'tu cartera'} que se encuentran en zona alta y podrían ser reducidos para tomar ganancias.</p>
                
                <div className="space-y-3">
                  {liquidSources.length === 0 && <p className="text-sm text-muted-foreground">No hay activos sobrecomprados en esta cartera.</p>}
                  {liquidSources.map(src => (
                    <div key={src.ticker} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{src.ticker}</span>
                          <span className="text-[10px] bg-negative/10 text-negative px-1.5 py-0.5 rounded">RSI: {src.rsi.toFixed(1)}</span>
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
                  Oportunidades de Compra (RSI &lt;= 40)
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Top 10 activos con mayor nivel de sobreventa en todo el catálogo.</p>
                
                <div className="space-y-3">
                  {buyCandidates.length === 0 && <p className="text-sm text-muted-foreground">No hay activos sobrevendidos actualmente.</p>}
                  {buyCandidates.map(cand => (
                    <div key={cand.symbol} className="border border-border rounded-xl overflow-hidden">
                      <div className="p-3 bg-background flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-foreground">{cand.symbol}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-positive/10 text-positive">
                            RSI: {cand.rsi?.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-foreground">${(cand.local || cand.cedear_usd || 0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                          <button className="text-positive font-bold hover:underline text-xs flex items-center gap-1">
                            Evaluar <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
