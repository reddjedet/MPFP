import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const MOCK_PORTFOLIOS = ['Cartera 1', 'Cartera 2', 'Cartera 3'];

const UNDERPERFORMING_SECTORS = [
  { etf: 'XLV (Salud)', perf: -2.4, spyGap: -3.9, cedears: [
    { ticker: 'PFE', name: 'Pfizer Inc.', rsi: 32 },
    { ticker: 'JNJ', name: 'Johnson & Johnson', rsi: 38 },
    { ticker: 'UNH', name: 'UnitedHealth Group', rsi: 45 }
  ]},
  { etf: 'XLE (Energía)', perf: -1.2, spyGap: -2.7, cedears: [
    { ticker: 'XOM', name: 'Exxon Mobil', rsi: 29 },
    { ticker: 'CVX', name: 'Chevron', rsi: 35 }
  ]}
];

export function BuyerModeView() {
  const { toggleBuyerMode } = useAppStore();
  const [activePortfolio, setActivePortfolio] = useState(MOCK_PORTFOLIOS[1]);
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
          <div className="p-2 bg-positive/10 rounded-lg">
            <Zap className="w-6 h-6 text-positive" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Planificador Estratégico</h1>
            <p className="text-xs text-muted-foreground">Diagnóstico de liquidez y rebalanceo por Mínimo Común Múltiplo.</p>
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
            {MOCK_PORTFOLIOS.map(pf => (
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

            {/* Excess Equities */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-negative" />
                Excedentes en Renta Variable
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Activos que superan la ponderación objetivo en {activePortfolio}. Sugeridos para reducción.</p>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">MSFT</span>
                      <span className="text-[10px] bg-negative/10 text-negative px-1.5 py-0.5 rounded">Exceso: 23 Nominales</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Peso actual: 25% (Objetivo: 15%)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-positive">+$ 415,000</p>
                    <p className="text-[10px] text-muted-foreground">ARS Potenciales</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Fixed Income Cash Reserves */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                Reservas en Renta Fija
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Posiciones maduras o en paridad alta listas para ser liquidadas si se requiere capital.</p>

              <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                <div>
                  <p className="font-bold text-foreground">AL30 (Soberano)</p>
                  <p className="text-xs text-muted-foreground mt-1">Paridad: 60% • 1,500 nominales disponibles</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-positive">+$ 87,000</p>
                  <p className="text-[10px] text-muted-foreground">ARS Potenciales</p>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: BUY TARGETS */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <ArrowUpRight className="w-5 h-5 text-positive" />
              <h2 className="text-lg font-bold text-foreground">Destinos Estratégicos</h2>
            </div>

            {/* Portfolio Completion (MCM) */}
            <section className="bg-card border border-border rounded-2xl p-5 border-dashed border-foreground/30 h-full">
              <h3 className="text-sm font-bold text-foreground mb-4">
                Completar Estructura (MCM)
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Nominales faltantes para alcanzar el múltiplo objetivo de la cartera {activePortfolio}.</p>
              
              <div className="space-y-3">
                {[
                  { ticker: 'AAPL', missing: 12, cost: 210000, momentum: 'Bueno', weight: '22% -> 30%' },
                  { ticker: 'SPY', missing: 4, cost: 170000, momentum: 'Neutral', weight: '38% -> 40%' }
                ].map(item => (
                  <div key={item.ticker} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{item.ticker}</span>
                        <span className="text-[10px] bg-secondary text-foreground px-1.5 py-0.5 rounded">Faltan {item.missing} nom.</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Gap: {item.weight} • Momentum: <span className="text-positive">{item.momentum}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-negative">-$ {(item.cost).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Costo ARS</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* TACTICAL EXPLORATION (BOTTOM ROW - FULL WIDTH GRID) */}
        <div className="flex items-center gap-2 border-b border-border pb-2 mt-4">
          <Zap className="w-5 h-5 text-positive" />
          <h2 className="text-lg font-bold text-foreground">Exploración Táctica Libre</h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Tactical Opportunities */}
          <section className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">
              Oportunidades por Descuento
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Activos atractivos por momentum y subvaluación (RSI &lt;= 35, Descuento DCF).</p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 font-medium">Activo</th>
                    <th className="px-3 py-2 font-medium text-right">RSI</th>
                    <th className="px-3 py-2 font-medium text-right">Descuento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr className="hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2">
                      <p className="font-bold text-foreground">BABA</p>
                      <p className="text-[10px] text-muted-foreground">E-commerce</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-positive">18</td>
                    <td className="px-3 py-2 text-right font-mono text-positive">-24%</td>
                  </tr>
                  <tr className="hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2">
                      <p className="font-bold text-foreground">PFE</p>
                      <p className="text-[10px] text-muted-foreground">Salud defensivo</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-positive">32</td>
                    <td className="px-3 py-2 text-right font-mono text-positive">-15%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Underperforming Sectors (ETFs) */}
          <section className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">
              Sectores Rezagados (Ofertas Macro)
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              ETFs con mal desempeño semanal frente al SPY. Identifica sectores subvaluados.
            </p>
            
            <div className="space-y-3">
              {UNDERPERFORMING_SECTORS.map(sector => (
                <div key={sector.etf} className="border border-border rounded-lg bg-background overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-bold text-foreground">{sector.etf}</p>
                      <p className="text-xs text-muted-foreground mt-1">Brecha vs SPY: <span className="text-negative font-mono">{sector.spyGap}%</span></p>
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
                                  c.rsi <= 35 ? 'bg-positive/20 text-positive border border-positive/30' : 'bg-secondary text-muted-foreground border border-border'
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
