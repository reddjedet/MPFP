import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { Ticker360Provider } from './context/Ticker360Context';
import { Ticker360Drawer } from './components/common/Ticker360Drawer';
import { CommandPalette } from './components/ui/CommandPalette';
import { LauncherHub, WorkspaceArea } from './components/LauncherHub';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { PortfolioView } from './components/PortfolioView';
import { UnifiedPortfolioView } from './components/portfolio/UnifiedPortfolioView';
import { MarkowitzLab } from './components/MarkowitzLab';
import { CedearsView } from './components/CedearsView';
import { MarketIndicesView } from './components/MarketIndicesView';
import { EarningsView } from './components/EarningsView';
import { ValuationView } from './components/ValuationView';
import { PerformanceView } from './components/PerformanceView';
import { FixedIncomeView } from './components/FixedIncomeView';
import { RotationView } from './components/RotationView';
import { EtfRotationView } from './components/EtfRotationView';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel p-8 rounded-2xl border-red-500/40 bg-red-500/5 max-w-xl mx-auto my-12 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h2 className="text-lg font-bold text-red-400 uppercase tracking-wider mb-2">
            Error en la interfaz
          </h2>
          <p className="text-xs text-zinc-300 font-mono mb-4 bg-black/40 p-3 rounded-xl text-left overflow-x-auto">
            {this.state.error?.message || 'Error desconocido al renderizar el componente'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-[3px] text-xs font-bold text-white transition-all shadow-lg shadow-blue-500/25 cursor-pointer"
          >
            Recargar Página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainLayout() {
  const [rememberLastView, setRememberLastView] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('finapp_remember_view');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [currentArea, setCurrentArea] = useState<WorkspaceArea | 'hub'>(() => {
    try {
      const savedRemember = localStorage.getItem('finapp_remember_view');
      const shouldRemember = savedRemember === null ? true : savedRemember === 'true';
      if (shouldRemember) {
        const savedArea = localStorage.getItem('finapp_last_area') as WorkspaceArea | null;
        if (savedArea && ['portfolios', 'market', 'lab'].includes(savedArea)) {
          return savedArea;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return 'hub';
  });

  const [subTab, setSubTab] = useState<string>(() => {
    try {
      const savedRemember = localStorage.getItem('finapp_remember_view');
      const shouldRemember = savedRemember === null ? true : savedRemember === 'true';
      if (shouldRemember) {
        const savedSubTab = localStorage.getItem('finapp_last_subtab');
        if (savedSubTab) return savedSubTab;
      }
    } catch (e) {
      console.error(e);
    }
    return 'portfolios';
  });

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Atajo global Ctrl+K / Cmd+K para CommandPalette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleSelectArea = (area: WorkspaceArea, defaultSubTab: string) => {
    setCurrentArea(area);
    setSubTab(defaultSubTab);
    try {
      localStorage.setItem('finapp_last_area', area);
      localStorage.setItem('finapp_last_subtab', defaultSubTab);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectSubTab = (newSubTab: string) => {
    setSubTab(newSubTab);
    try {
      localStorage.setItem('finapp_last_subtab', newSubTab);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGoHome = () => {
    setCurrentArea('hub');
    try {
      if (!rememberLastView) {
        localStorage.removeItem('finapp_last_area');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleRemember = (val: boolean) => {
    setRememberLastView(val);
    try {
      localStorage.setItem('finapp_remember_view', String(val));
      if (!val) {
        localStorage.removeItem('finapp_last_area');
      } else if (currentArea !== 'hub') {
        localStorage.setItem('finapp_last_area', currentArea);
        localStorage.setItem('finapp_last_subtab', subTab);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (currentArea === 'hub') {
    return (
      <>
        <LauncherHub
          onSelectArea={handleSelectArea}
          rememberLastView={rememberLastView}
          onToggleRemember={handleToggleRemember}
          lastVisitedTab={subTab}
        />
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={handleSelectArea}
          onGoHome={handleGoHome}
        />
        <Ticker360Drawer onNavigateToTab={handleSelectArea} />
      </>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-200">
      <WorkspaceHeader
        currentArea={currentArea}
        currentSubTab={subTab}
        onSelectArea={handleSelectArea}
        onSelectSubTab={handleSelectSubTab}
        onGoHome={handleGoHome}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
        <ErrorBoundary key={subTab}>
          {subTab === 'portfolios' && <UnifiedPortfolioView initialSubTab="model" onNavigateToTab={handleSelectArea} />}
          {subTab === 'rotation' && <UnifiedPortfolioView initialSubTab="operation" onNavigateToTab={handleSelectArea} />}
          {subTab === 'cedears' && <CedearsView onNavigateToTab={handleSelectArea} />}
          {subTab === 'etfs' && <EtfRotationView />}
          {subTab === 'indices' && <MarketIndicesView />}
          {subTab === 'renta-fija' && <FixedIncomeView />}
          {subTab === 'earnings' && <EarningsView />}
          {subTab === 'markowitz' && <MarkowitzLab />}
          {subTab === 'valuation' && <ValuationView />}
          {subTab === 'performance' && <PerformanceView />}
        </ErrorBoundary>
      </main>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleSelectArea}
        onGoHome={handleGoHome}
      />
      <Ticker360Drawer onNavigateToTab={handleSelectArea} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Ticker360Provider>
        <MainLayout />
      </Ticker360Provider>
    </ThemeProvider>
  );
}
