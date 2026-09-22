import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  X, 
  TrendingUp, 
  PieChart, 
  FlaskConical, 
  Calendar, 
  Calculator, 
  Landmark, 
  Globe, 
  BarChart3, 
  ArrowLeftRight, 
  Home, 
  ChevronRight,
  ExternalLink,
  Command,
  Compass,
  FileText
} from 'lucide-react';
import { WorkspaceArea } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'cedear' | 'fixed_income' | 'navigation';
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeClass?: string;
  action: () => void;
  keywords?: string[];
}

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen: isOpen, toggleCommandPalette, setArea, goHome: onGoHome, openTickerDrawer: openTicker360 } = useAppStore();
  const onClose = () => toggleCommandPalette();
  const onNavigate = (area: WorkspaceArea, subTab: string) => setArea(area, subTab);


const COMMON_BONDS = [
  { ticker: 'S30S6', name: 'LECAP Vencimiento 30 Sep 2026', type: 'LECAP' },
  { ticker: 'S31O6', name: 'LECAP Vencimiento 31 Oct 2026', type: 'LECAP' },
  { ticker: 'S28N6', name: 'LECAP Vencimiento 28 Nov 2026', type: 'LECAP' },
  { ticker: 'T31Y7', name: 'BONCAP Vencimiento 31 May 2027', type: 'BONCAP' },
  { ticker: 'AL30', name: 'Bono Soberano USD 2030 Ley Local', type: 'Soberano USD' },
  { ticker: 'GD30', name: 'Bono Soberano USD 2030 Ley NY', type: 'Soberano USD' },
  { ticker: 'AL35', name: 'Bono Soberano USD 2035 Ley Local', type: 'Soberano USD' },
  { ticker: 'GD35', name: 'Bono Soberano USD 2035 Ley NY', type: 'Soberano USD' },
  { ticker: 'TX26', name: 'Bono CER 2026 T2X6', type: 'BONCER' },
  { ticker: 'TX28', name: 'Bono CER 2028', type: 'BONCER' },
];
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [catalog, setCatalog] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cargar catálogo de CEDEARs al montar
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch('/api/cedears/tickers');
        if (res.ok) {
          const data = await res.json();
          if (data.catalog) {
            setCatalog(data.catalog);
          }
        }
      } catch (e) {
        console.error("Error al cargar catálogo para buscador:", e);
      }
    };
    fetchCatalog();
  }, []);

  // Manejador del atajo de teclado global Ctrl+K / Cmd+K y Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // El padre se encarga de abrirlo o podemos usar custom event si fuera necesario
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Enfocar input automáticamente al abrir
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Construcción de comandos de navegación
  const navigationCommands: CommandItem[] = useMemo(() => [
    {
      id: 'nav-portfolios',
      title: 'Cartera & Rebalanceo',
      subtitle: 'Control de pesos objetivos, anclaje y termómetro RSI ponderado',
      category: 'navigation',
      icon: PieChart,
      badge: 'Portfolios',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      action: () => { onNavigate('portfolios', 'dashboard'); onClose(); },
      keywords: ['cartera', 'rebalanceo', 'pesos', 'posiciones', 'acciones']
    },
    {
      id: 'nav-rotation',
      title: 'Rotación & Cartera Real',
      subtitle: 'Tenencia real por broker, caja ARS y órdenes tácticas',
      category: 'navigation',
      icon: ArrowLeftRight,
      badge: 'Portfolios',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      action: () => { onNavigate('portfolios', 'tenencias'); onClose(); },
      keywords: ['rotacion', 'compra', 'venta', 'tenencia', 'broker', 'bal', 'bmb', 'calculadora']
    },
    {
      id: 'nav-cedears',
      title: 'CEDEARs & Watchlist RSI',
      subtitle: 'Monitor de cotizaciones en tiempo real, ratios y termómetro',
      category: 'navigation',
      icon: TrendingUp,
      badge: 'Mercado',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      action: () => { onNavigate('renta_variable', 'screener'); onClose(); },
      keywords: ['cedears', 'cotizaciones', 'precios', 'adr', 'byma', 'rsi']
    },
    {
      id: 'nav-etfs',
      title: 'Rotación ETFs vs SPY',
      subtitle: 'Fuerza relativa (Alpha), cuadrantes RRG y régimen Risk-On/Risk-Off',
      category: 'navigation',
      icon: Compass,
      badge: 'Mercado',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      action: () => { onNavigate('renta_variable', 'seguimiento_etfs'); onClose(); },
      keywords: ['etf', 'etfs', 'rotacion', 'spy', 'sectores', 'cuadrantes', 'alpha', 'rrg']
    },
    {
      id: 'nav-renta-fija',
      title: 'Renta Fija BYMA/MAE',
      subtitle: 'Curvas de rendimiento, TIR, Modified Duration y spreads',
      category: 'navigation',
      icon: Landmark,
      badge: 'Mercado',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      action: () => { onNavigate('renta_fija', 'curvas'); onClose(); },
      keywords: ['renta fija', 'bonos', 'lecaps', 'boncer', 'curva', 'tir', 'duration']
    },
    {
      id: 'nav-earnings',
      title: 'Calendario de Reportes (Earnings)',
      subtitle: 'Cronograma jerárquico de balances, fechas certeras y mapa de calor',
      category: 'navigation',
      icon: Calendar,
      badge: 'Mercado',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      action: () => { onNavigate('renta_variable', 'calendario_reportes'); onClose(); },
      keywords: ['balances', 'earnings', 'reportes', 'fechas', 'trimestres']
    },
    {
      id: 'nav-indices',
      title: 'Índices & Ciclos Electorales',
      subtitle: 'Histórico Base 100 de Merval, ETF ARGT, EWZ, S&P 500 y mandatos',
      category: 'navigation',
      icon: Globe,
      badge: 'Mercado',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      action: () => { onNavigate('renta_variable', 'indices'); onClose(); },
      keywords: ['indices', 'merval', 'argt', 'sp500', 'ciclos', 'elecciones']
    },
    {
      id: 'nav-markowitz',
      title: 'Frontera Eficiente Markowitz',
      subtitle: 'Optimización SLSQP, Máximo Sharpe, Mínima Varianza y Monte Carlo',
      category: 'navigation',
      icon: FlaskConical,
      badge: 'Laboratorio',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      action: () => { onNavigate('markowitz', 'frontera'); onClose(); },
      keywords: ['markowitz', 'frontera', 'optimizacion', 'sharpe', 'riesgo', 'varianza']
    },
    {
      id: 'nav-valuation',
      title: 'Valuación Fundamental Adaptativa',
      subtitle: 'Modelos por sector: DCF/FCF, Bancos, Holdings, Industrial, Energía',
      category: 'navigation',
      icon: Calculator,
      badge: 'Laboratorio',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      action: () => { onNavigate('markowitz', 'valuacion'); onClose(); },
      keywords: ['valuacion', 'fundamental', 'dcf', 'fcf', 'fair value', 'multiplos']
    },
    {
      id: 'nav-performance',
      title: 'Performance Multi-Activo',
      subtitle: 'Rendimientos acumulados 3M, 6M, 1A, YTD y medias móviles',
      category: 'navigation',
      icon: BarChart3,
      badge: 'Laboratorio',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      action: () => { onNavigate('markowitz', 'performance'); onClose(); },
      keywords: ['performance', 'retornos', 'rendimiento', 'sma50', 'sma200']
    },
    {
      id: 'nav-home',
      title: 'Inicio / Launcher Hub',
      subtitle: 'Pantalla principal de navegación y selección de áreas',
      category: 'navigation',
      icon: Home,
      badge: 'General',
      badgeClass: 'bg-zinc-800 text-muted-foreground border-zinc-700',
      action: () => { onGoHome(); onClose(); },
      keywords: ['inicio', 'home', 'launcher', 'menu']
    }
  ], [onNavigate, onGoHome, onClose]);

  // Lista filtrada reactiva
  const filteredItems: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1. Si no hay consulta, mostrar navegación rápida y CEDEARs populares
    if (!q) {
      const topCedears: CommandItem[] = [
        { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', sector: 'Fondo Indexado EE.UU.', ratio: '20:1' },
        { ticker: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', sector: 'Fondo Indexado Tech', ratio: '20:1' },
        { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Tecnología', ratio: '10:1' },
        { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductores', ratio: '24:1' },
        { ticker: 'MELI', name: 'MercadoLibre Inc.', sector: 'Comercio Electrónico', ratio: '120:1' },
        { ticker: 'LLY', name: 'Eli Lilly and Company', sector: 'Farmacéutica', ratio: '8:1' },
        { ticker: 'VIST', name: 'Vista Energy S.A.B. de C.V.', sector: 'Energía / Petróleo', ratio: '3:1' },
      ].map(c => ({
        id: `cedear-${c.ticker}`,
        title: c.ticker,
        subtitle: `${c.name} • ${c.sector}`,
        category: 'cedear' as const,
        icon: TrendingUp,
        badge: `Ratio ${c.ratio}`,
        badgeClass: 'bg-positive/10 text-emerald-300 border-emerald-500/30',
        action: () => {
          openTicker360(c.ticker);
          onClose();
        }
      }));

      return [...navigationCommands.slice(0, 5), ...topCedears];
    }

    const results: CommandItem[] = [];

    // A. Filtrar Comandos de Navegación
    navigationCommands.forEach(cmd => {
      const matchTitle = cmd.title.toLowerCase().includes(q);
      const matchSub = cmd.subtitle?.toLowerCase().includes(q);
      const matchKey = cmd.keywords?.some(k => k.includes(q));
      if (matchTitle || matchSub || matchKey) {
        results.push(cmd);
      }
    });

    // B. Filtrar Catálogo de CEDEARs
    if (catalog.length > 0) {
      const cedearMatches: CommandItem[] = [];
      for (const item of catalog) {
        const tk = (item.ticker || '').toLowerCase();
        const nm = (item.name || '').toLowerCase();
        const sec = (item.sector_id || '').toLowerCase();
        const sub = (item.subsector || '').toLowerCase();

        // Ponderación: coincidencia exacta o prefijo de ticker va primero
        if (tk === q || tk.startsWith(q) || nm.includes(q) || sec.includes(q) || sub.includes(q)) {
          cedearMatches.push({
            id: `cedear-${item.ticker}`,
            title: item.ticker,
            subtitle: `${item.name || 'CEDEAR'} • ${item.subsector || item.sector_id || 'Acción'}`,
            category: 'cedear',
            icon: TrendingUp,
            badge: item.is_etf ? 'ETF' : (item.ratio ? `Ratio ${item.ratio}:1` : undefined),
            badgeClass: item.is_etf 
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
              : 'bg-zinc-800 text-muted-foreground border-zinc-700',
            action: () => {
              openTicker360(item.ticker, item);
              onClose();
            }
          });
        }
        if (cedearMatches.length >= 15) break;
      }
      results.push(...cedearMatches);
    }

    // C. Filtrar Renta Fija
    COMMON_BONDS.forEach(b => {
      const tk = b.ticker.toLowerCase();
      const nm = b.name.toLowerCase();
      const tp = b.type.toLowerCase();
      if (tk.includes(q) || nm.includes(q) || tp.includes(q)) {
        results.push({
          id: `bond-${b.ticker}`,
          title: b.ticker,
          subtitle: `${b.name} (${b.type})`,
          category: 'fixed_income',
          icon: Landmark,
          badge: b.type,
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          action: () => {
            onNavigate('renta_fija', 'curvas');
            onClose();
          }
        });
      }
    });

    return results;
  }, [query, catalog, navigationCommands, openTicker360, onNavigate, onClose]);

  // Manejo de flechas Arriba/Abajo y Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        item.action();
      }
    }
  };

  // Scroll automático para mantener el item seleccionado a la vista
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-150">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Dialog Flotante Eigengrau */}
      <div 
        className="relative z-10 w-full max-w-2xl bg-[#16161d] border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-[#121319]">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por ticker (AAPL), empresa, bono (S30S6) o comando..."
            className="w-full bg-transparent text-sm text-foreground placeholder-zinc-500 outline-none font-medium"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground select-none">
            ESC
          </kbd>
        </div>

        {/* Lista de Resultados */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-[460px]"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No se encontraron activos ni comandos para &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-blue-600/20 text-foreground border-l-2 border-blue-500 shadow-sm' 
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-md shrink-0 ${
                      item.category === 'cedear'
                        ? 'bg-emerald-500/10 text-positive'
                        : item.category === 'fixed_income'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-blue-500/10 text-foreground'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm tracking-wide font-mono truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${item.badgeClass || 'bg-zinc-800 text-muted-foreground border-zinc-700'}`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                        <span>Seleccionar</span>
                        <kbd className="px-1 py-0.5 rounded bg-secondary border border-border text-[9px]">↵</kbd>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Informativo */}
        <div className="px-4 py-2 border-t border-border bg-[#121319] flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-secondary border border-border text-[10px]">↑</kbd>
              <kbd className="px-1 rounded bg-secondary border border-border text-[10px]">↓</kbd>
              <span className="text-[10px] text-muted-foreground">Navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-secondary border border-border text-[10px]">↵</kbd>
              <span className="text-[10px] text-muted-foreground">Abrir</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Command className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Spotlight Global MPFP</span>
          </div>
        </div>
      </div>
    </div>
  );
};
