import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Command, LayoutGrid, LineChart, Briefcase, Activity, CalendarDays, FlaskConical, Target, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

const MODULES = [
  { area: 'portfolios', subTab: 'dashboard', name: 'Portafolios', icon: Briefcase, desc: 'Tenencias, objetivos y ETFs' },
  { area: 'renta_variable', subTab: 'screener', name: 'Renta Variable', icon: LayoutGrid, desc: 'Screener CEDEARs e Índices' },
  { area: 'markowitz', subTab: 'frontera', name: 'Lab', icon: FlaskConical, desc: 'Frontera eficiente y backtests' },
  { area: 'renta_fija', subTab: 'curvas', name: 'Renta Fija', icon: TrendingUp, desc: 'Curvas de rendimiento y bonos' },
];

export function LauncherHub() {
  const { setArea, toggleCommandPalette } = useAppStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [toggleCommandPalette]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full text-center mb-12"
      >
        <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-card border border-border shadow-2xl">
          <Command className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-foreground">
          MPFP
        </h1>
        <p className="text-muted-foreground text-lg">
          Selecciona un módulo o presiona <kbd className="px-2 py-1 mx-1 rounded-md bg-secondary text-foreground text-sm font-mono border border-border">Ctrl + K</kbd> para navegar.
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 max-w-3xl w-full gap-4"
      >
        {MODULES.map((mod, i) => (
          <motion.button
            key={mod.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            onClick={() => setArea(mod.area as any, mod.subTab)}
            className="group relative flex flex-col items-start p-6 text-left rounded-2xl border border-border bg-card/50 hover:bg-card hover:border-foreground/20 transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md"
          >
            <div className="p-3 rounded-xl mb-4 bg-secondary text-foreground group-hover:scale-110 transition-transform duration-300">
              <mod.icon className="w-6 h-6" />
            </div>
            <h3 className="text-foreground font-medium mb-1">{mod.name}</h3>
            <p className="text-xs text-muted-foreground">{mod.desc}</p>
            
            <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
