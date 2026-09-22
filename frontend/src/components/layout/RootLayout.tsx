import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { LauncherHub } from '../hub/LauncherHub';
import { WorkspaceHeader } from './WorkspaceHeader';
import { CommandPalette } from '../ui/CommandPalette';
import { Ticker360Drawer } from '../ui/Ticker360Drawer';
import { TickerTape } from '../ui/TickerTape';

import { UnifiedPortfolioView } from '../portfolio/UnifiedPortfolioView';
import { HoldingsManagerView } from '../portfolio/HoldingsManagerView';
import { AnimatePresence } from 'framer-motion';

// Code-split heavy views to prevent loading 1.15MB ECharts and specialized logic upfront
const CedearsView = React.lazy(() => import('../market/CedearsView').then(m => ({ default: m.CedearsView })));
const EtfRotationView = React.lazy(() => import('../market/EtfRotationView').then(m => ({ default: m.EtfRotationView })));
const EarningsCalendarView = React.lazy(() => import('../market/EarningsCalendarView').then(m => ({ default: m.EarningsView })));
const FixedIncomeView = React.lazy(() => import('../market/FixedIncomeView').then(m => ({ default: m.FixedIncomeView })));
const MarketIndicesView = React.lazy(() => import('../market/MarketIndicesView').then(m => ({ default: m.MarketIndicesView })));
const MarkowitzLab = React.lazy(() => import('../markowitz/MarkowitzLab').then(m => ({ default: m.MarkowitzLab })));
const ValuationView = React.lazy(() => import('../markowitz/ValuationView').then(m => ({ default: m.ValuationView })));
const PerformanceView = React.lazy(() => import('../markowitz/PerformanceView').then(m => ({ default: m.PerformanceView })));
const BuyerModeView = React.lazy(() => import('../action/BuyerModeView').then(m => ({ default: m.BuyerModeView })));
const SellerModeView = React.lazy(() => import('../action/SellerModeView').then(m => ({ default: m.SellerModeView })));

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }
  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card border border-border p-8 rounded-2xl max-w-xl mx-auto my-12 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-negative uppercase tracking-wider mb-2">Error en la interfaz</h2>
          <p className="text-xs text-muted-foreground font-mono mb-4 bg-secondary p-3 rounded-xl text-left overflow-x-auto">
            {this.state.error?.message || 'Error desconocido al renderizar'}
          </p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-foreground text-background rounded-lg text-xs font-bold transition-all shadow-lg cursor-pointer hover:opacity-90">
            Recargar Página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RootLayout() {
  const { currentArea, currentSubTab, setArea, setSubTab, toggleCommandPalette, isBuyerModeOpen, isSellerModeOpen, toggleBuyerMode, toggleSellerMode } = useAppStore();

  const renderContent = () => {
    if (currentArea === 'hub') return <LauncherHub />;
    
    switch (currentSubTab) {
      case 'dashboard':
      case 'portfolios':
        return <UnifiedPortfolioView />;
      case 'tenencias':
        return <HoldingsManagerView />;
      case 'screener':
      case 'cedears':
        return <CedearsView />;
      case 'seguimiento_etfs':
      case 'etfs':
        return <EtfRotationView />;
      case 'curvas':
      case 'renta-fija':
        return <FixedIncomeView />;
      case 'calendario_reportes':
      case 'earnings':
        return <EarningsCalendarView />;
      case 'frontera':
      case 'markowitz':
        return <MarkowitzLab />;
      case 'valuacion':
      case 'valuation':
        return <ValuationView />;
      case 'performance':
        return <PerformanceView />;
      case 'indices':
        return <MarketIndicesView />;
      default:
        return <div className="p-8 text-muted-foreground">Vista {currentSubTab} en construcción...</div>;
    }
  };

  return (
    <div className="dark h-screen bg-background text-foreground font-sans flex flex-col">
      {currentArea !== 'hub' && (
        <WorkspaceHeader 
          currentArea={currentArea}
          currentSubTab={currentSubTab}
          onSelectArea={setArea}
          onSelectSubTab={setSubTab}
          onGoHome={() => setArea('hub')}
          onOpenCommandPalette={toggleCommandPalette}
        />
      )}

      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <ErrorBoundary key={currentSubTab}>
          <React.Suspense fallback={
            <div className="flex items-center justify-center p-12 text-center text-muted-foreground animate-pulse font-mono text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2 animate-ping" />
              Cargando módulo...
            </div>
          }>
            {renderContent()}
          </React.Suspense>
        </ErrorBoundary>
      </main>

      <TickerTape />

      <CommandPalette />
      <Ticker360Drawer />

      <React.Suspense fallback={null}>
        <AnimatePresence>
          {isBuyerModeOpen && <BuyerModeView />}
          {isSellerModeOpen && <SellerModeView />}
        </AnimatePresence>
      </React.Suspense>
    </div>
  );
}
