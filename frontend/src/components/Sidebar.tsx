import React from 'react';
import { 
  PieChart, 
  BarChart3, 
  Calendar, 
  Calculator, 
  TrendingUp, 
  Landmark, 
  FlaskConical,
  ArrowLeftRight
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'rotation', label: 'Rotación & Cartera Real', icon: ArrowLeftRight, badge: 'V4' },
    { id: 'portfolios', label: 'Portfolios', icon: PieChart },
    { id: 'markowitz', label: 'Laboratorio Markowitz', icon: FlaskConical },
    { id: 'cedears', label: 'CEDEARs', icon: TrendingUp },
    { id: 'earnings', label: 'Reportes (Earnings)', icon: Calendar },
    { id: 'valuation', label: 'Valuación Fundamental', icon: Calculator },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
    { id: 'renta-fija', label: 'Renta Fija', icon: Landmark },
  ];

  return (
    <aside className="w-64 min-h-screen bg-[var(--bg-sidebar)] backdrop-blur-2xl border-r border-[var(--border-glass)] p-6 flex flex-col justify-between shrink-0">
      <div className="flex flex-col gap-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-8 rounded-[3px] bg-blue-600 flex items-center justify-center font-black text-xs text-white shadow-lg shadow-blue-500/25 tracking-tighter">
            MPFP
          </div>
          <div>
            <div className="font-extrabold text-sm text-white tracking-tight">Máquina PFP</div>
            <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider truncate max-w-[130px]" title="Máquina de Planes, Finanzas y Portfolios">Planes & Portfolios</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-[3px] text-xs font-semibold transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-blue-600/15 text-blue-400 font-bold border border-blue-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Section: Institutional Dark Terminal Status */}
      <div className="flex flex-col gap-3">
        {/* Institutional Status Badge */}
        <div className="w-full h-10 px-3.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between text-xs font-bold text-zinc-300 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-bold tracking-wide">Terminal Cuantitativo</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-zinc-400 uppercase font-mono">
            DARK
          </span>
        </div>

        {/* Footer Info */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-zinc-500 flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span>Backend:</span>
            <span className="font-mono text-emerald-400 font-bold">FastAPI 127.0.0.1</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Engine:</span>
            <span className="font-mono text-blue-400">NumPy & ECharts</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
