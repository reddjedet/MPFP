import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export function SellerModeView() {
  const { toggleSellerMode } = useAppStore();
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
  
  // Calculate taking profit targets from current portfolio (RSI > 65)
  const takeProfitCandidates = (() => {
    if (!activePortfolio || !portfolios[activePortfolio]) return [];
    const assets = portfolios[activePortfolio].assets || {};
    const cands = [];
    for (const [tk, weight] of Object.entries(assets)) {
      const q = quotes.find(q => q.symbol === tk);
      if (q && q.rsi >= 65) {
        cands.push({ ticker: tk, rsi: q.rsi, weight: Number(weight), price: q.local || q.cedear_usd, gf_value: q.gf_value });
      }
    }
    return cands.sort((a, b) => b.rsi - a.rsi);
  })();

  // Calculate market overbought assets (RSI >= 65) globally
  const marketOverbought = quotes
    .filter(q => q.rsi !== null && q.rsi >= 65)
    .sort((a, b) => b.rsi - a.rsi)
    .slice(0, 10); // top 10 most overbought

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
          <div className="p-2 bg-negative/10 rounded-lg">
            <Zap className="w-6 h-6 text-negative" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Toma de Ganancias Táctica (Vendedor)</h1>
            <p className="text-xs text-muted-foreground">Diagnóstico de activos sobrecomprados para rotación de capital.</p>
          </div>
        </div>
        <button 
          onClick={toggleSellerMode}
          className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-border text-foreground rounded-lg transition-colors font-medium text-sm"
        >
          <X className="w-4 h-4" />
          Cerrar Vista
        </button>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 flex justify-center">
        <div className="max-w-7xl w-full flex flex-col gap-6">
          
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Zap className="w-5 h-5 text-negative" />
            <h2 className="text-lg font-bold text-foreground">Exploración Táctica (Modo Vendedor)</h2>
          </div>

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
            
            {/* Tactical Opportunities in Portfolio */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">
                Toma de Ganancias en {activePortfolio || 'Cartera'}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Activos de la cartera seleccionada que superaron el umbral de sobrecompra técnico (RSI &gt;= 65).</p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 font-medium">Activo</th>
                      <th className="px-3 py-2 font-medium text-right">RSI</th>
                      <th className="px-3 py-2 font-medium text-right">Fair Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {takeProfitCandidates.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No hay activos sobrecomprados en esta cartera.</td>
                      </tr>
                    )}
                    {takeProfitCandidates.map(cand => {
                      const premium = cand.gf_value ? ((cand.price - cand.gf_value) / cand.gf_value) * 100 : 0;
                      return (
                        <tr key={cand.ticker} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-2">
                            <p className="font-bold text-foreground">{cand.ticker}</p>
                            <p className="text-[10px] text-muted-foreground">Peso: {cand.weight}%</p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-negative">{cand.rsi.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {cand.gf_value ? (
                              <span className={premium > 0 ? 'text-negative' : 'text-positive'}>
                                {premium > 0 ? '+' : ''}{premium.toFixed(1)}%
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Overperforming Market Assets */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">
                Alertas Globales de Mercado
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Los 10 CEDEARs con mayor nivel de sobrecompra en todo el catálogo.</p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 font-medium">Activo</th>
                      <th className="px-3 py-2 font-medium text-right">Precio</th>
                      <th className="px-3 py-2 font-medium text-right">RSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {marketOverbought.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No hay activos sobrecomprados en el mercado.</td>
                      </tr>
                    )}
                    {marketOverbought.map(cand => (
                      <tr key={cand.symbol} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-3 py-2 font-bold text-foreground">{cand.symbol}</td>
                        <td className="px-3 py-2 text-right font-mono">${(cand.local || cand.cedear_usd || 0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-negative">{cand.rsi?.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            
          </div>
        </div>
      </div>
    </motion.div>
  );
}
