import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getCachedData, setCachedData, cachedFetch, invalidateCache, invalidateCacheByPrefix } from '@/lib/queryCache';
import { 
  RefreshCw,
  ArrowLeftRight
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

import { PortfolioTable } from './PortfolioTable';
import { PortfolioFixedIncomeTable } from './PortfolioFixedIncomeTable';
import { FixedIncomePortfolioCard } from './FixedIncomePortfolioCard';
import { PortfolioSummaryCards } from './PortfolioSummaryCards';

export const UnifiedPortfolioView: React.FC<{ hideHeader?: boolean, compact?: boolean }> = ({ hideHeader, compact }) => {

  const selectedPf = useAppStore((s) => s.selectedPf);
  const setSelectedPf = useAppStore((s) => s.setSelectedPf);
  const anchorInputRef = useRef<HTMLSelectElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [portfolioMetadata, setPortfolioMetadata] = useState<any>(() => {
    return getCachedData('portfolios-list');
  });
  const [rebalanceData, setRebalanceData] = useState<any>(() => {
    const active = localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    return getCachedData(`portfolio-rebalance:${active}`);
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const active = localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    return !getCachedData(`portfolio-rebalance:${active}`);
  });
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = async () => {
    try {
      const { data } = await cachedFetch<any>(
        'portfolios-list',
        async () => {
          const res = await fetch('/api/portfolios/list_json');
          if (!res.ok) throw new Error('Error metadata');
          return res.json();
        },
        120 * 1000
      );
      setPortfolioMetadata(data);
      if (!selectedPf || !data.portfolios?.[selectedPf]) {
        const first = Object.keys(data.portfolios || {})[0];
        if (first) {
          setSelectedPf(first);
          localStorage.setItem('finapp_active_portfolio', first);
        }
      }
    } catch (e) {
      console.error("Error metadata", e);
    }
  };

  const fetchAllData = useCallback(async (pfKey = selectedPf, anchor?: string, qty?: number) => {
    if (!pfKey) return;
    const cacheKey = `portfolio-rebalance:${pfKey}${anchor ? `:${anchor}` : ''}${qty !== undefined ? `:${qty}` : ''}`;
    const hasCached = !!getCachedData(cacheKey);
    if (!hasCached) {
      setLoading(true);
    }
    setError(null);
    try {
      let url = `/api/portfolios/rebalance_json/${encodeURIComponent(pfKey)}`;
      const params = new URLSearchParams();
      if (anchor) params.append('anchor', anchor);
      if (qty !== undefined) params.append('qty', qty.toString());
      const qString = params.toString();
      if (qString) url += `?${qString}`;

      const { data: rbData } = await cachedFetch<any>(
        cacheKey,
        async () => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Error API: ${res.status}`);
          return res.json();
        },
        90 * 1000
      );
      setRebalanceData(rbData);
      setCachedData(cacheKey, rbData, 90);
    } catch (err: any) {
      setError(err.message || 'Error cargando dashboard.');
    } finally {
      setLoading(false);
    }
  }, [selectedPf]);

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    if (portfolioMetadata && selectedPf) {
      fetchAllData(selectedPf);
    }
  }, [selectedPf, portfolioMetadata, fetchAllData]);

  
  useEffect(() => {
    const handleRefresh = () => fetchAllData();
    window.addEventListener('refresh_portfolios', handleRefresh);
    return () => window.removeEventListener('refresh_portfolios', handleRefresh);
  }, [fetchAllData]);

  // Derived dashboard metrics (memoized to avoid recalc on every render)
  const {
    totalEq, totalFixed, totalCash, totalPatrimony,
    eqPct, fixedPct, cashPct,
    totalEqCost, totalEqPnl, totalFixedCost, totalFixedPnl,
    totalCost, totalPnl, pnlPct, trackingError,
    urgentTrades, rsiSummary
  } = useMemo(() => {
    const _totalEq = rebalanceData?.summary?.total_real_value ?? 0;
    const _totalFixed = rebalanceData?.fixed_income_summary?.total_market_value || 0;
    const _totalCash = rebalanceData?.summary?.cash_ars ?? 0;
    const _totalPatrimony = _totalEq + _totalFixed + _totalCash;
    const _eqPct = _totalPatrimony > 0 ? (_totalEq / _totalPatrimony) * 100 : 0;
    const _fixedPct = _totalPatrimony > 0 ? (_totalFixed / _totalPatrimony) * 100 : 0;
    const _cashPct = _totalPatrimony > 0 ? (_totalCash / _totalPatrimony) * 100 : 0;

    // Calcular Costo Invertido y PnL de Renta Variable
    let _totalEqCost = 0;
    let _totalEqPnl = 0;
    let _sumTrackingError = 0;
    let _errorCount = 0;

    if (rebalanceData?.result) {
      rebalanceData.result.forEach((item: any) => {
        const qty = item.actual_qty || item.qty || 0;
        const price = item.price || 0;
        const currentValue = qty * price;
        
        // Error de tracking (Renta variable)
        if (typeof item.error === 'number') {
          _sumTrackingError += Math.abs(item.error);
          _errorCount++;
        }

        if (item.ppc && item.ppc > 0) {
          const invested = qty * item.ppc;
          _totalEqCost += invested;
          _totalEqPnl += (currentValue - invested);
        } else {
          _totalEqCost += currentValue; // Si no hay PPC, se asume neutro
        }
      });
    }

    const _totalFixedCost = rebalanceData?.fixed_income_summary?.total_invested || 0;
    const _totalFixedPnl = rebalanceData?.fixed_income_summary?.total_pnl_ars || 0;

    const _totalCost = _totalEqCost + _totalFixedCost;
    const _totalPnl = _totalEqPnl + _totalFixedPnl;
    const _pnlPct = _totalCost > 0 ? (_totalPnl / _totalCost) * 100 : 0;
    const _trackingError = _errorCount > 0 ? (_sumTrackingError / _errorCount) : 0;
    
    const _urgentTrades = rebalanceData?.rotation_trades?.filter((t: any) => t.priority === 'Alta' || t.priority === 'Media') || [];
    
    const _rsiSummary = rebalanceData?.summary?.portfolio_rsi || rebalanceData?.summary?.rsi_summary;

    return {
      totalEq: _totalEq, totalFixed: _totalFixed, totalCash: _totalCash, totalPatrimony: _totalPatrimony,
      eqPct: _eqPct, fixedPct: _fixedPct, cashPct: _cashPct,
      totalEqCost: _totalEqCost, totalEqPnl: _totalEqPnl, totalFixedCost: _totalFixedCost, totalFixedPnl: _totalFixedPnl,
      totalCost: _totalCost, totalPnl: _totalPnl, pnlPct: _pnlPct, trackingError: _trackingError,
      urgentTrades: _urgentTrades, rsiSummary: _rsiSummary
    };
  }, [rebalanceData]);

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background text-foreground overflow-y-auto">
      {/* 1. HEADER & COCKPIT V4 */}
      <div className="flex-none p-4 pb-0 space-y-4">
        
        {/* Superior: Título y Selector Rápido */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pb-4 border-b border-white/10">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-white">Centro de Cartera</h1>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30">
                COCKPIT V5
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Gestión patrimonial consolidada: tenencias reales, objetivos teóricos y rendimiento histórico.</p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {portfolioMetadata?.portfolios ? (
              <select
                value={selectedPf}
                onChange={(e) => {
                  setSelectedPf(e.target.value);
                  localStorage.setItem('finapp_active_portfolio', e.target.value);
                }}
                className="bg-zinc-900 border border-zinc-700 text-white text-xs font-bold rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full sm:w-auto p-2"
              >
                {Object.entries(portfolioMetadata.portfolios).map(([k, v]: any) => (
                  <option key={k} value={k}>{v.name || k}</option>
                ))}
              </select>
            ) : (
              <div className="h-8 w-32 bg-zinc-800 rounded animate-pulse"></div>
            )}
            
            <button 
              onClick={() => {
                invalidateCacheByPrefix('portfolio');
                invalidateCacheByPrefix('cedear');
                setRefreshCounter(c => c + 1);
                fetchMetadata();
                fetchAllData();
              }}
              disabled={loading}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
              title="Refrescar Datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tarjetas de Dashboard Consolidado (Nuevas Cards) */}
        <div className="mb-6">
           <PortfolioSummaryCards 
              key={`${selectedPf}-${refreshCounter}`}
              pfKey={selectedPf} 
              title={portfolioMetadata?.portfolios?.[selectedPf]?.name || selectedPf} 
              totalValue={totalPatrimony} 
           />
        </div>
        
        {/* Sugerencias de Rotación Táctica */}
        {urgentTrades.length > 0 ? (
          <div className="pb-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100 mb-4 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-purple-400" /> Alertas de Rotación Táctica
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {urgentTrades.map((trade: any) => (
                <div key={trade.id} className="p-3 bg-zinc-900 border border-white/5 rounded-xl flex flex-col gap-2 relative overflow-hidden group">
                  {/* Etiqueta Prioridad */}
                  <div className={`absolute top-0 right-0 px-2 py-0.5 text-[8px] font-bold uppercase ${
                    trade.priority === 'Alta' ? 'bg-rose-500/20 text-rose-300' : 
                    trade.priority === 'Media' ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    Prioridad {trade.priority}
                  </div>
                  
                  {trade.sell && (
                    <div className="flex flex-col gap-1 mt-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-rose-400 flex items-center gap-1">VENDER {trade.sell.nominals} <span className="text-white">{trade.sell.ticker}</span></span>
                        <span className="font-mono text-zinc-400 tabular-nums">${trade.sell.total_cash.toLocaleString('es-AR')}</span>
                      </div>
                      <span className="text-xs text-zinc-400 mt-1" title={trade.sell.reason}>{trade.sell.reason}</span>
                    </div>
                  )}
                  
                  {trade.sell && trade.buy && <div className="h-px w-full bg-white/5 my-0.5"></div>}
                  
                  {trade.buy && (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-emerald-400 flex items-center gap-1">COMPRAR {trade.buy.nominals} <span className="text-white">{trade.buy.ticker}</span></span>
                        <span className="font-mono text-zinc-400 tabular-nums">${trade.buy.total_cash.toLocaleString('es-AR')}</span>
                      </div>
                      <span className="text-xs text-zinc-400 mt-1" title={trade.buy.reason}>{trade.buy.reason}</span>
                    </div>
                  )}
                  
                  <div className="mt-1 pt-2 border-t border-white/5 flex justify-between items-center">
                    <span className="text-[9px] font-bold uppercase text-zinc-500">Saldo Neto:</span>
                    <span className={`font-mono text-xs font-bold ${trade.net_cash_ars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {trade.net_cash_ars >= 0 ? '+' : '-'}${Math.abs(trade.net_cash_ars).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (rebalanceData?.rotation_trades && rebalanceData.rotation_trades.length > 0) ? (
          <div className="pb-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 opacity-50" /> Rotación Táctica
            </h3>
            <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-center">
              <span className="text-emerald-400/80 text-sm font-bold uppercase tracking-wider">Cartera optimizada. No hay acciones urgentes requeridas.</span>
            </div>
          </div>
        ) : null}

        {/* Tabla de Activos del Portfolio */}
        {rebalanceData && (
          <div className="pb-8 space-y-4">
            
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Renta variable
              </h3>

              {/* Módulo de Calibración de Compras (Horizontal) */}
              <div className="flex items-center gap-3 bg-zinc-900 border border-white/5 rounded-lg px-4 py-2 w-full lg:w-auto overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Calibrador MCM:</span>
                </div>
                
                <div className="flex items-center gap-2 min-w-max">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">Ancla</span>
                  <select 
                    ref={anchorInputRef}
                    id="anchorInput"
                    key={`anchor-${selectedPf}-${rebalanceData?.mcm_info?.most_expensive_ticker}`}
                    defaultValue={rebalanceData?.mcm_info?.most_expensive_ticker || ''}
                    className="w-24 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono uppercase focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    {rebalanceData?.result?.map((item: any) => (
                      <option key={item.ticker} value={item.ticker}>
                        {item.ticker}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 min-w-max">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">Cant.</span>
                  <input 
                    type="number" 
                    min="1"
                    ref={qtyInputRef}
                    id="qtyInput"
                    key={`qty-${selectedPf}-${rebalanceData?.mcm_info?.most_expensive_qty}`}
                    defaultValue={rebalanceData?.mcm_info?.most_expensive_qty || 1}
                    className="w-16 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                <button 
                  onClick={() => {
                    const a = anchorInputRef.current?.value || '';
                    const q = parseInt(qtyInputRef.current?.value || '1') || 1;
                    fetchAllData(selectedPf, a, q);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors min-w-max"
                >
                  RECALCULAR
                </button>
              </div>
            </div>

            <div className="w-full">
              <PortfolioTable 
                data={rebalanceData} 
                pfType={selectedPf} 
                onRefresh={() => fetchAllData(selectedPf)} 
              />
            </div>

            {rebalanceData?.fixed_income_summary?.has_fixed_income && (
              <div className="w-full mt-6">
                 <div className="mb-4">
                   <h3 className="text-xl font-bold text-foreground tracking-tight">Renta fija</h3>
                 </div>
                 <div className="mb-4">
                    <FixedIncomePortfolioCard 
                       items={rebalanceData.fixed_income_summary.items} 
                       pfType={selectedPf} 
                       onRefresh={() => fetchAllData(selectedPf)} 
                    />
                 </div>
                 <PortfolioFixedIncomeTable 
                    summary={rebalanceData.fixed_income_summary} 
                    pfType={selectedPf} 
                    onRefresh={() => fetchAllData(selectedPf)} 
                 />
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
