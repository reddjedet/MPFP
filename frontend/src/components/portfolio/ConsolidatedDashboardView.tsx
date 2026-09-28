import React from 'react';
import { UnifiedPortfolioView } from './UnifiedPortfolioView';
import { HoldingsManagerView } from './HoldingsManagerView';
import { useAppStore } from '@/store/useAppStore';
import { Dropdown } from '../ui/Dropdown';
import { Wallet, RefreshCw, ArrowLeftRight, Layers } from 'lucide-react';
import { getCachedData, invalidateCache } from '@/lib/queryCache';

export function ConsolidatedDashboardView() {
  const selectedPf = useAppStore((s) => s.selectedPf);
  const setSelectedPf = useAppStore((s) => s.setSelectedPf);

  const pfMetadata = getCachedData<any>('portfolios-list');
  const pfNames = Object.keys(pfMetadata?.portfolios || {});

  const handleRefresh = () => {
    invalidateCache(`portfolio-rebalance:${selectedPf}`);
    invalidateCache('portfolios-list');
    // We dispatch a custom event that both child components can listen to if they need, 
    // or just relying on invalidateCache will trigger their SWR-like logic if we pass a key update.
    // Easiest is just force a reload, but let's just invalidate for now.
    window.dispatchEvent(new Event('refresh_portfolios'));
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Global Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 py-3 border-b border-border bg-card/30">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" />
            <h1 className="text-sm font-bold tracking-tight text-foreground uppercase">
              Dashboard Consolidado
            </h1>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            Modelo de Rotación & Tenencias Reales
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {pfNames.length > 0 ? (
            <Dropdown
              value={selectedPf}
              options={pfNames}
              onChange={(v) => {
                setSelectedPf(v);
                localStorage.setItem('finapp_active_portfolio', v);
              }}
              title="Portafolio"
              minWidth="12rem"
            />
          ) : (
            <div className="h-8 w-32 bg-secondary rounded animate-pulse"></div>
          )}
          
          <button 
            onClick={handleRefresh}
            className="p-2 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border"
            title="Refrescar Datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 xl:grid-cols-2">
        {/* Left: Model & KPIs */}
        <div className="overflow-y-auto border-r border-border custom-scrollbar p-2">
          <UnifiedPortfolioView hideHeader={true} compact={true} />
        </div>
        
        {/* Right: Tenencias */}
        <div className="overflow-y-auto custom-scrollbar p-2 bg-card/10">
          <HoldingsManagerView hideHeader={true} compact={true} />
        </div>
      </div>
    </div>
  );
}
