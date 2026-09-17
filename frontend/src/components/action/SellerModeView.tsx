import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const OVERPERFORMING_SECTORS = [
  { etf: 'XLK (Tecnología)', perf: 5.4, spyGap: 3.9, cedears: [
    { ticker: 'NVDA', name: 'Nvidia Corp.', rsi: 78 },
    { ticker: 'AAPL', name: 'Apple Inc.', rsi: 68 },
    { ticker: 'MSFT', name: 'Microsoft Corp.', rsi: 71 }
  ]},
  { etf: 'XLF (Finanzas)', perf: 3.2, spyGap: 1.7, cedears: [
    { ticker: 'JPM', name: 'JPMorgan Chase', rsi: 66 },
    { ticker: 'V', name: 'Visa Inc.', rsi: 62 }
  ]}
];

export function SellerModeView() {
  const { toggleSellerMode } = useAppStore();
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

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
            <h1 className="text-xl font-bold text-foreground">Toma de Ganancias Táctica</h1>
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
        <div className="max-w-4xl w-full flex flex-col gap-6">
          
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Zap className="w-5 h-5 text-negative" />
            <h2 className="text-lg font-bold text-foreground">Exploración Táctica (Modo Vendedor)</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Tactical Opportunities */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">
                Activos Sobrecomprados
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Activos que superaron el umbral de sobrecompra técnico (RSI &gt;= 65).</p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 font-medium">Activo</th>
                      <th className="px-3 py-2 font-medium text-right">RSI</th>
                      <th className="px-3 py-2 font-medium text-right">Premium DCF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    <tr className="hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2">
                        <p className="font-bold text-foreground">NVDA</p>
                        <p className="text-[10px] text-muted-foreground">Semiconductores</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-negative">78</td>
                      <td className="px-3 py-2 text-right font-mono text-negative">+45%</td>
                    </tr>
                    <tr className="hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2">
                        <p className="font-bold text-foreground">MSFT</p>
                        <p className="text-[10px] text-muted-foreground">Software</p>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-negative">71</td>
                      <td className="px-3 py-2 text-right font-mono text-negative">+12%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Overperforming Sectors (ETFs) */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">
                Sectores Sobreextendidos
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                ETFs con fuerte desempeño semanal frente al SPY. Oportunidad de rotación.
              </p>
              
              <div className="space-y-3">
                {OVERPERFORMING_SECTORS.map(sector => (
                  <div key={sector.etf} className="border border-border rounded-lg bg-background overflow-hidden">
                    <div className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-bold text-foreground">{sector.etf}</p>
                        <p className="text-xs text-muted-foreground mt-1">Brecha vs SPY: <span className="text-positive font-mono">+{sector.spyGap}%</span></p>
                      </div>
                      <button 
                        onClick={() => setExpandedSector(expandedSector === sector.etf ? null : sector.etf)}
                        className={`text-xs px-3 py-1.5 rounded transition-colors font-medium border ${
                          expandedSector === sector.etf 
                            ? 'bg-foreground text-background border-foreground' 
                            : 'bg-secondary hover:bg-border text-foreground border-transparent'
                        }`}
                      >
                        {expandedSector === sector.etf ? 'Cerrar Vista' : 'Ver CEDEARs'}
                      </button>
                    </div>
                    
                    {/* Expanded CEDEARs list */}
                    <AnimatePresence>
                      {expandedSector === sector.etf && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-border bg-secondary/20"
                        >
                          <div className="p-3">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold mb-2 tracking-wider">
                              Componentes del sector {sector.etf}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {sector.cedears.map(c => (
                                <div key={c.ticker} className="flex justify-between items-center bg-card p-2 rounded border border-border hover:border-foreground/30 cursor-pointer transition-colors">
                                  <div>
                                    <p className="text-xs font-bold text-foreground">{c.ticker}</p>
                                    <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{c.name}</p>
                                  </div>
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                    c.rsi >= 65 ? 'bg-negative/20 text-negative border border-negative/30' : 'bg-secondary text-muted-foreground border border-border'
                                  }`}>
                                    RSI: {c.rsi}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      </div>
    </motion.div>
  );
}
