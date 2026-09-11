import React from 'react';
import { 
  Home, 
  PieChart, 
  TrendingUp, 
  FlaskConical, 
  ArrowLeftRight,
  Landmark,
  Calendar,
  Calculator,
  BarChart3
} from 'lucide-react';
import { WorkspaceArea } from './LauncherHub';

interface WorkspaceTabItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface AreaConfig {
  name: string;
  color: string;
  badgeClass: string;
  activeClass: string;
  tabs: WorkspaceTabItem[];
}

interface MacroAreaConfig {
  id: WorkspaceArea;
  name: string;
  defaultSubTab: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  iconColor: string;
}

interface WorkspaceHeaderProps {
  currentArea: WorkspaceArea;
  currentSubTab: string;
  onSelectArea: (area: WorkspaceArea, defaultSubTab: string) => void;
  onSelectSubTab: (subTab: string) => void;
  onGoHome: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  currentArea,
  currentSubTab,
  onSelectArea,
  onSelectSubTab,
  onGoHome
}) => {
  // Configuración de Macro-Áreas de Nivel 1
  const macroAreas: MacroAreaConfig[] = [
    {
      id: 'portfolios',
      name: 'Portfolios & Tenencias',
      defaultSubTab: 'portfolios',
      icon: PieChart,
      activeClass: 'bg-blue-600/15 text-blue-300 border-b-2 border-blue-500 font-bold',
      iconColor: 'text-blue-400'
    },
    {
      id: 'market',
      name: 'Monitor de Mercado',
      defaultSubTab: 'cedears',
      icon: TrendingUp,
      activeClass: 'bg-emerald-600/15 text-emerald-300 border-b-2 border-emerald-500 font-bold',
      iconColor: 'text-emerald-400'
    },
    {
      id: 'lab',
      name: 'Laboratorio Cuantitativo',
      defaultSubTab: 'markowitz',
      icon: FlaskConical,
      activeClass: 'bg-purple-600/15 text-purple-300 border-b-2 border-purple-500 font-bold',
      iconColor: 'text-purple-400'
    }
  ];

  // Configuración de Sub-Pestañas de Nivel 2 por Área
  const areaConfigs: Record<WorkspaceArea, AreaConfig> = {
    portfolios: {
      name: 'Portfolios',
      color: 'blue',
      badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      activeClass: 'bg-blue-600/20 text-blue-200 font-bold border border-blue-500/40 shadow-sm',
      tabs: [
        { id: 'portfolios', label: 'Cartera & Rebalanceo', icon: PieChart },
        { id: 'rotation', label: 'Rotación & Cartera Real', icon: ArrowLeftRight, badge: 'V4' }
      ]
    },
    market: {
      name: 'Mercado',
      color: 'emerald',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      activeClass: 'bg-emerald-600/20 text-emerald-200 font-bold border border-emerald-500/40 shadow-sm',
      tabs: [
        { id: 'cedears', label: 'CEDEARs & RSI', icon: TrendingUp },
        { id: 'renta-fija', label: 'Renta Fija BYMA/MAE', icon: Landmark },
        { id: 'earnings', label: 'Calendario Earnings', icon: Calendar }
      ]
    },
    lab: {
      name: 'Laboratorio',
      color: 'purple',
      badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      activeClass: 'bg-purple-600/20 text-purple-200 font-bold border border-purple-500/40 shadow-sm',
      tabs: [
        { id: 'markowitz', label: 'Frontera Markowitz', icon: FlaskConical },
        { id: 'valuation', label: 'Valuación Fundamental', icon: Calculator },
        { id: 'performance', label: 'Performance Multi-Activo', icon: BarChart3 }
      ]
    }
  };

  const currentConfig = areaConfigs[currentArea];

  return (
    <header className="sticky top-0 z-50 flex flex-col select-none shadow-lg">
      {/* TIER 1: FILA SUPERIOR - MACRO-DOMINIOS (Nivel 1, h-10) */}
      <div className="h-10 bg-[#0c0d12]/95 backdrop-blur-xl border-b border-white/10 px-4 md:px-6 flex items-center justify-between gap-4">
        {/* Brand & Botón Canónico de Inicio */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onGoHome}
            title="Volver a la pantalla de inicio (Launcher Hub)"
            className="flex items-center gap-1.5 px-2 py-1 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer group active:scale-95 text-xs font-semibold"
          >
            <Home className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">Inicio</span>
          </button>

          <div className="h-4 w-px bg-white/10" />

          <div className="px-1.5 py-0.5 rounded-[3px] bg-gradient-to-b from-blue-500 to-blue-700 flex items-center justify-center font-black text-[10px] text-white shadow-md shadow-blue-500/20 tracking-tighter select-none">
            MPFP
          </div>
        </div>

        {/* Selector de Macro-Áreas de Nivel 1 */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {macroAreas.map(area => {
            const Icon = area.icon;
            const isActive = currentArea === area.id;
            return (
              <button
                key={area.id}
                onClick={() => onSelectArea(area.id, area.defaultSubTab)}
                className={`flex items-center gap-2 px-3 h-8 rounded-t-[3px] text-xs transition-all cursor-pointer font-medium ${
                  isActive 
                    ? area.activeClass
                    : 'text-zinc-400 hover:text-white hover:bg-white/5 border-b-2 border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? area.iconColor : 'text-zinc-500'}`} />
                <span>{area.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Telemetría y Estado Eigengrau */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-zinc-400 font-bold hidden md:inline">127.0.0.1</span>
          </span>
          <span className="hidden lg:inline">•</span>
          <span className="text-zinc-400 font-semibold hidden lg:inline">Eigengrau</span>
        </div>
      </div>

      {/* TIER 2: FILA INFERIOR - SUB-HERRAMIENTAS CONTEXTUALES (Nivel 2, h-9) */}
      <div className="h-9 bg-[#13141b]/95 backdrop-blur-xl border-b border-white/5 px-4 md:px-6 flex items-center justify-between gap-4">
        {/* Herramientas específicas del área activa */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
          {currentConfig.tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-xs transition-all cursor-pointer whitespace-nowrap ${
                  isActive 
                    ? currentConfig.activeClass
                    : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent font-medium'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-500'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded-[2px] bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Indicador de Contexto del Macro-Área */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono shrink-0">
          <span className="text-zinc-500 text-[10px]">Dominio:</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-[2px] border ${currentConfig.badgeClass}`}>
            {currentConfig.name}
          </span>
        </div>
      </div>
    </header>
  );
};
