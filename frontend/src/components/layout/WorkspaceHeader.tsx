import React, { useState, useRef, useEffect } from 'react';
import { 
  Home, Wallet, TrendingUp, FlaskConical, ArrowLeftRight, Landmark, Calendar, Calculator, BarChart3, Globe, Compass, Search, LayoutGrid, Activity, Target, ChevronDown, ShoppingCart, Store, Zap
} from 'lucide-react';
import { WorkspaceArea, useAppStore } from '@/store/useAppStore';

interface WorkspaceHeaderProps {
  currentArea: WorkspaceArea;
  currentSubTab: string;
  onSelectArea: (area: WorkspaceArea, defaultSubTab: string) => void;
  onSelectSubTab: (subTab: string) => void;
  onGoHome: () => void;
  onOpenCommandPalette: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  currentArea, currentSubTab, onSelectArea, onSelectSubTab, onGoHome, onOpenCommandPalette
}) => {
  const { toggleBuyerMode, toggleSellerMode } = useAppStore();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const macroAreas = [
    { id: 'portfolios', name: 'Portafolios', defaultSubTab: 'dashboard', icon: Wallet },
    { id: 'renta_variable', name: 'Renta Variable', defaultSubTab: 'screener', icon: LayoutGrid },
    { id: 'markowitz', name: 'Lab', defaultSubTab: 'frontera', icon: FlaskConical },
    { id: 'renta_fija', name: 'Renta Fija', defaultSubTab: 'curvas', icon: Landmark }
  ];

  const areaConfigs = {
    portfolios: {
      name: 'Gestión de Portafolios',
      tabs: [
        { id: 'dashboard', label: 'Dashboard Consolidado', icon: Wallet },
        { id: 'tenencias', label: 'Informar Tenencias', icon: ArrowLeftRight },
        { id: 'rotation', label: 'Rotación Táctica', icon: ArrowLeftRight }
      ]
    },
    renta_variable: {
      name: 'Renta Variable',
      tabs: [
        { id: 'screener', label: 'Screener CEDEARs', icon: TrendingUp },
        { id: 'seguimiento_etfs', label: 'Seguimiento Semanal ETFs vs SPY', icon: Activity },
        { id: 'calendario_reportes', label: 'Calendario de Reportes', icon: Calendar },
        { id: 'indices', label: 'Índices & Ciclos', icon: Globe }
      ]
    },
    renta_fija: {
      name: 'Renta Fija',
      tabs: [
        { id: 'curvas', label: 'Curvas de Rendimiento', icon: Landmark }
      ]
    },
    markowitz: {
      name: 'Lab',
      tabs: [
        { id: 'frontera', label: 'Frontera Eficiente', icon: FlaskConical },
        { id: 'valuacion', label: 'Valuación', icon: Calculator },
        { id: 'performance', label: 'Backtest Performance', icon: BarChart3 }
      ]
    }
  };

  const currentConfig = areaConfigs[currentArea as keyof typeof areaConfigs];

  return (
    <header className="sticky top-0 z-40 flex flex-col select-none shadow-lg w-full">
      {/* TIER 1 */}
      <div className="h-12 bg-background border-b border-border px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onGoHome}
            title="Volver a Inicio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border transition-all cursor-pointer font-semibold text-xs"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Inicio</span>
          </button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1">
            <div className="px-2 py-1 rounded bg-foreground text-background flex items-center justify-center font-black text-xs shadow-md tracking-tighter">
              MPFP
            </div>
            
            <div className="relative" ref={actionsRef}>
              <button 
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                title="Acciones Rápidas"
              >
                <Zap className="w-4 h-4" />
              </button>
              
              {isActionsOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-1.5 flex flex-col">
                    <button 
                      onClick={() => { toggleBuyerMode(); setIsActionsOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors w-full text-left"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Me siento comprador
                    </button>
                    <button 
                      onClick={() => { toggleSellerMode(); setIsActionsOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left mt-0.5"
                    >
                      <Store className="w-4 h-4" />
                      Me siento vendedor
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {macroAreas.map(area => {
            const Icon = area.icon;
            const isActive = currentArea === area.id;
            return (
              <button
                key={area.id}
                onClick={() => onSelectArea(area.id as any, area.defaultSubTab)}
                className={`flex items-center gap-2 px-4 h-10 rounded-t-md text-sm transition-all cursor-pointer font-medium border-b-2 ${
                  isActive 
                    ? 'bg-secondary text-foreground border-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{area.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 px-3 h-8 rounded-md bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors cursor-pointer text-xs group"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buscar...</span>
            <kbd className="hidden sm:inline-flex text-[9px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">Ctrl K</kbd>
          </button>
        </div>
      </div>

      {/* TIER 2 */}
      {currentConfig && (
        <div className="h-10 bg-secondary/30 border-b border-border px-4 md:px-6 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-2 overflow-x-auto py-1 max-w-full hide-scrollbar">
            {currentConfig.tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = currentSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectSubTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all cursor-pointer whitespace-nowrap font-medium border ${
                    isActive 
                      ? 'bg-card text-foreground border-border shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
};
