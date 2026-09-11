import React from 'react';
import { 
  PieChart, 
  TrendingUp, 
  FlaskConical, 
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';

export type WorkspaceArea = 'portfolios' | 'market' | 'lab';

interface LauncherHubProps {
  onSelectArea: (area: WorkspaceArea, defaultSubTab: string) => void;
  rememberLastView: boolean;
  onToggleRemember: (val: boolean) => void;
  lastVisitedTab?: string | null;
}

export const LauncherHub: React.FC<LauncherHubProps> = ({
  onSelectArea,
  rememberLastView,
  onToggleRemember,
  lastVisitedTab
}) => {
  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] flex flex-col items-center justify-center p-6 relative overflow-hidden selection:bg-blue-500 selection:text-white">
      {/* Luz ambiental difusa Eigengrau */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[300px] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-md w-full flex flex-col items-center gap-6 relative z-10">
        {/* Cabecera & Branding estilo Antigravity IDE */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex items-center justify-center">
            <div className="w-12 h-12 rounded-[4px] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center shadow-md shadow-blue-600/20 border border-blue-400/30 text-white font-black text-base tracking-tight select-none">
              MPFP
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
            Máquina de Planes, Finanzas y Portfolios
          </h1>
        </div>

        {/* Bloque Triangular de Acciones - Estilo IDE (Bordes no redondeados, texto conciso, cero emojis) */}
        <div className="flex flex-col gap-2 w-full">
          {/* BOTÓN HERO CENTRAL (SUPERIOR) */}
          <button
            onClick={() => onSelectArea('portfolios', 'portfolios')}
            className="w-full h-11 px-4 rounded-[3px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2.5 cursor-pointer shadow-sm border border-blue-500/40"
          >
            <PieChart className="w-4 h-4 text-white shrink-0" />
            <span>Portfolios & Tenencias</span>
          </button>

          {/* FILA INFERIOR: 2 BOTONES SECUNDARIOS SIMÉTRICOS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            {/* Secundario Izquierdo: Monitor de Mercado */}
            <button
              onClick={() => onSelectArea('market', 'cedears')}
              className="w-full h-11 px-4 rounded-[3px] bg-[#202124] hover:bg-[#2a2c33] active:bg-[#1a1b1e] border border-white/10 hover:border-white/20 text-zinc-200 hover:text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Monitor de Mercado</span>
            </button>

            {/* Secundario Derecho: Laboratorio Cuantitativo */}
            <button
              onClick={() => onSelectArea('lab', 'markowitz')}
              className="w-full h-11 px-4 rounded-[3px] bg-[#202124] hover:bg-[#2a2c33] active:bg-[#1a1b1e] border border-white/10 hover:border-white/20 text-zinc-200 hover:text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <FlaskConical className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Laboratorio Cuantitativo</span>
            </button>
          </div>
        </div>

        {/* Acceso Rápido a Última Sesión */}
        {lastVisitedTab && lastVisitedTab !== 'hub' && (
          <div className="w-full flex items-center justify-between px-3.5 py-2 rounded-[3px] bg-white/[0.03] border border-white/10 text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              <span>Última vista: <strong className="text-zinc-200 uppercase font-mono">{lastVisitedTab}</strong></span>
            </span>
            <button
              onClick={() => {
                if (lastVisitedTab === 'portfolios' || lastVisitedTab === 'rotation') {
                  onSelectArea('portfolios', lastVisitedTab);
                } else if (lastVisitedTab === 'cedears' || lastVisitedTab === 'renta-fija' || lastVisitedTab === 'earnings') {
                  onSelectArea('market', lastVisitedTab);
                } else {
                  onSelectArea('lab', lastVisitedTab);
                }
              }}
              className="px-2.5 py-1 rounded-[3px] bg-white/5 hover:bg-white/10 text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              Continuar <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pie del Launcher: Configuración de Inicio y Estado */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10 text-xs text-zinc-400">
          <label className="flex items-center gap-2 cursor-pointer hover:text-zinc-200 transition-colors select-none">
            <input
              type="checkbox"
              checked={rememberLastView}
              onChange={(e) => onToggleRemember(e.target.checked)}
              className="w-3.5 h-3.5 rounded-[2px] bg-black/50 border border-white/20 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-600"
            />
            <span className="text-xs">Recordar última vista al iniciar</span>
          </label>

          <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">127.0.0.1</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              <span>Eigengrau</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
