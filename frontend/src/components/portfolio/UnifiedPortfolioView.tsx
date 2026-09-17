import React, { useEffect, useState, useCallback } from 'react';
import { 
  Wallet, 
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

import { PortfolioTable } from './PortfolioTable';

export const UnifiedPortfolioView: React.FC = () => {

  const [selectedPf, setSelectedPf] = useState<string>(() => {
    try {
      return localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    } catch {
      return 'min_drawdown_15';
    }
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioMetadata, setPortfolioMetadata] = useState<any>(null);
  const [rebalanceData, setRebalanceData] = useState<any>(null);

  const fetchMetadata = async () => {
    try {
      const res = await fetch('/api/portfolios/list_json');
      if (res.ok) {
        const data = await res.json();
        setPortfolioMetadata(data);
        if (!selectedPf || !data.portfolios[selectedPf]) {
          const first = Object.keys(data.portfolios || {})[0];
          if (first) {
            setSelectedPf(first);
            localStorage.setItem('finapp_active_portfolio', first);
          }
        }
      }
    } catch (e) {
      console.error("Error metadata", e);
    }
  };

  const fetchAllData = useCallback(async (pfKey = selectedPf) => {
    if (!pfKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolios/rebalance_json/${encodeURIComponent(pfKey)}`);
      if (!res.ok) {
        throw new Error(`Error API: ${res.status}`);
      }
      const rbData = await res.json();
      setRebalanceData(rbData);
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

  // Derived dashboard metrics
  const totalPatrimony = rebalanceData?.summary?.total_patrimony_ars || 0;
  const totalEq = rebalanceData?.summary?.total_equity_ars || 0;
  const eqPct = totalPatrimony > 0 ? (totalEq / totalPatrimony) * 100 : 0;
  const totalFixed = rebalanceData?.fixed_income_summary?.total_invested_ars || 0;
  const fixedPct = totalPatrimony > 0 ? (totalFixed / totalPatrimony) * 100 : 0;
  const totalCash = rebalanceData?.summary?.cash_ars || 0;
  const cashPct = totalPatrimony > 0 ? (totalCash / totalPatrimony) * 100 : 0;

  const totalPnl = rebalanceData?.summary?.total_pnl_ars || 0;
  const totalCost = rebalanceData?.summary?.total_cost_invested || 0;
  const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const trackingError = rebalanceData?.summary?.avg_tracking_error || 0;
  
  const rsiSummary = rebalanceData?.summary?.rsi_summary;

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background text-foreground overflow-y-auto">
      {/* 1. HEADER & COCKPIT V4 */}
      <div className="flex-none p-4 pb-0 space-y-4">
        
        {/* Superior: Título y Selector Rápido */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 shadow-inner">
              <Wallet className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white">Centro de Cartera</h1>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30">
                  COCKPIT V4
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Gestión patrimonial consolidada: tenencias reales, objetivos teóricos y KPIs.</p>
            </div>
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
              onClick={() => fetchAllData()}
              disabled={loading}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
              title="Refrescar Datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tarjetas de Dashboard Consolidado */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          
          {/* Patrimonio Total */}
          <div className="col-span-2 md:col-span-1 p-3.5 rounded-xl bg-zinc-900 border border-white/5 flex flex-col gap-0.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <Wallet className="w-12 h-12" />
            </div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Patrimonio Total</span>
            <span className="text-lg font-black text-white font-mono tabular-nums">
              ${totalPatrimony.toLocaleString('es-AR', {maximumFractionDigits:0})}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Consolidado ARS</span>
          </div>

          {/* Renta Variable */}
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">En CEDEARs</span>
            <span className="text-base font-black text-blue-400 font-mono tabular-nums">
              ${totalEq.toLocaleString('es-AR', {maximumFractionDigits:0})}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">{eqPct.toFixed(1)}%</span>
          </div>

          {/* Renta Fija */}
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Renta Fija</span>
            <span className="text-base font-black text-amber-400 font-mono tabular-nums">
              ${totalFixed.toLocaleString('es-AR', {maximumFractionDigits:0})}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">{fixedPct.toFixed(1)}%</span>
          </div>

          {/* Caja */}
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Saldo en Caja</span>
            <span className="text-base font-black text-emerald-400 font-mono tabular-nums">
              ${totalCash.toLocaleString('es-AR', {maximumFractionDigits:0})}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Disponible ARS</span>
          </div>

          {/* PnL Histórico */}
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/5 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Rendimiento LAT</span>
            <span className={`text-base font-black font-mono tabular-nums ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalPnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
            </span>
            <span className={`text-[10px] font-mono ${totalPnl >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('es-AR', {maximumFractionDigits:0})}
            </span>
          </div>

        </div>

        {/* Termómetro RSI y Error de Tracking */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
          {rsiSummary && (
            <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400 uppercase font-bold text-[10px] tracking-wider">Termómetro RSI Cartera:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs border ${
                  rsiSummary.weighted <= 35 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : rsiSummary.weighted >= 65 
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                }`}>
                  Ponderado {rsiSummary.weighted.toFixed(1)} — {rsiSummary.status}
                </span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 flex flex-row items-center gap-4">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Tracking Error:</span>
            <span className="text-sm font-black text-purple-400 font-mono tabular-nums">
              {trackingError.toFixed(2)}%
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Desvío vs Modelo Teórico</span>
          </div>
        </div>

        {/* Tabla de Activos del Portfolio */}
        {rebalanceData && (
          <div className="pb-8">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-4">
              Tenencias Actuales
            </h3>
            <PortfolioTable 
              data={rebalanceData} 
              pfType={selectedPf} 
              onRefresh={() => fetchAllData(selectedPf)} 
            />
          </div>
        )}

      </div>
    </div>
  );
};
