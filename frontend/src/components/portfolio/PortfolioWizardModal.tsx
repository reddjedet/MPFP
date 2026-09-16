import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Sliders, 
  Layers, 
  Flame, 
  Check, 
  AlertCircle, 
  Plus, 
  Trash2, 
  TrendingUp, 
  Landmark, 
  PieChart, 
  ShieldCheck, 
  Search 
} from 'lucide-react';

interface AssetWeight {
  ticker: string;
  weight: number;
  rsi?: number;
  type?: 'equity' | 'fixed_income';
}

interface PortfolioWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newPfKey: string) => void;
}

// Plantillas predefinidas de alto rendimiento
const STRATEGIC_TEMPLATES: {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  assets: { ticker: string; weight: number }[];
}[] = [
  {
    id: 'bdi_moderada',
    name: 'BDI Macro Balanceada',
    description: 'Diversificación global con índices norteamericanos, emergentes y metales preciosos.',
    category: 'Estratégica',
    icon: ShieldCheck,
    assets: [
      { ticker: 'SPY', weight: 30 },
      { ticker: 'QQQ', weight: 20 },
      { ticker: 'DIA', weight: 15 },
      { ticker: 'GLD', weight: 15 },
      { ticker: 'IWM', weight: 10 },
      { ticker: 'EWZ', weight: 10 },
    ],
  },
  {
    id: 'tech_growth',
    name: 'Tecnología & High-Growth',
    description: 'Enfoque en semiconductores, software y gigantes de inteligencia artificial.',
    category: 'Crecimiento',
    icon: Flame,
    assets: [
      { ticker: 'NVDA', weight: 25 },
      { ticker: 'MSFT', weight: 20 },
      { ticker: 'AAPL', weight: 20 },
      { ticker: 'GOOGL', weight: 20 },
      { ticker: 'AMZN', weight: 15 },
    ],
  },
  {
    id: 'defensiva_dividendos',
    name: 'Defensiva & Dividendos',
    description: 'Empresas con flujos de caja predecibles, bajo beta y sólida rentabilidad por dividendo.',
    category: 'Conservadora',
    icon: Landmark,
    assets: [
      { ticker: 'KO', weight: 25 },
      { ticker: 'JNJ', weight: 25 },
      { ticker: 'PG', weight: 20 },
      { ticker: 'PEP', weight: 15 },
      { ticker: 'MCD', weight: 15 },
    ],
  },
  {
    id: 'mixta_cedear_lecap',
    name: 'Mixta Acciones + Renta Fija',
    description: 'Combinación balanceada de ETFs líderes con Letras del Tesoro (LECAPs).',
    category: 'Híbrida',
    icon: Layers,
    assets: [
      { ticker: 'SPY', weight: 35 },
      { ticker: 'QQQ', weight: 25 },
      { ticker: 'S30S6', weight: 25 },
      { ticker: 'S16O6', weight: 15 },
    ],
  },
];

// Opciones de Markowitz
const MARKOWITZ_TEMPLATES = [
  {
    id: 'markowitz_sharpe',
    name: 'Máximo Sharpe (SLSQP)',
    description: 'Optimización de cartera que maximiza el retorno esperado por unidad de volatilidad.',
    assets: [
      { ticker: 'MSFT', weight: 28 },
      { ticker: 'AAPL', weight: 26 },
      { ticker: 'SPY', weight: 24 },
      { ticker: 'GOOGL', weight: 22 },
    ],
  },
  {
    id: 'markowitz_minvar',
    name: 'Mínima Varianza',
    description: 'Ponderación matemática para reducir al mínimo el desvío estándar de la cartera.',
    assets: [
      { ticker: 'KO', weight: 35 },
      { ticker: 'JNJ', weight: 30 },
      { ticker: 'PG', weight: 20 },
      { ticker: 'SPY', weight: 15 },
    ],
  },
];

// Oportunidades en Sobreventa (RSI < 35 / Deep Value)
const OVERSOLD_TEMPLATES = [
  {
    id: 'oversold_value',
    name: 'Canasta Deep Value / Sobreventa',
    description: 'Activos de primer nivel transaccionando en zonas técnicas deprimidas (RSI < 35).',
    assets: [
      { ticker: 'BABA', weight: 25 },
      { ticker: 'VALE', weight: 25 },
      { ticker: 'PBR', weight: 20 },
      { ticker: 'NKE', weight: 15 },
      { ticker: 'INTC', weight: 15 },
    ],
  },
];

// Función utilitaria para detectar si un ticker es renta fija o equity
const isFixedIncomeTicker = (ticker: string): boolean => {
  const t = ticker.toUpperCase().trim();
  return /^(S\d{2}[A-Z]\d|AL\d{2}|GD\d{2}|TX\d{2}|T\d{2}[A-Z]\d|BP\d{2}|AE\d{2})/i.test(t) ||
         t.includes('LECAP') || t.includes('BONCER');
};

export const PortfolioWizardModal: React.FC<PortfolioWizardModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedApproach, setSelectedApproach] = useState<string>('template');
  const [assets, setAssets] = useState<AssetWeight[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>('');
  const [portfolioMode, setPortfolioMode] = useState<'weights' | 'nominals'>('weights');
  
  // Búsqueda para agregar activo
  const [newTickerInput, setNewTickerInput] = useState<string>('');
  const [marketRsiMap, setMarketRsiMap] = useState<Record<string, number>>({});
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-cargar datos de RSI de CEDEARs si están disponibles
  useEffect(() => {
    if (isOpen) {
      fetch('/api/cedears/market_data_json')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && Array.isArray(data.items)) {
            const map: Record<string, number> = {};
            data.items.forEach((item: any) => {
              if (item.ticker && typeof item.rsi === 'number') {
                map[item.ticker.toUpperCase()] = Math.round(item.rsi);
              }
            });
            setMarketRsiMap(map);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Reset modal al abrir
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedApproach('bdi_moderada');
      setAssets(STRATEGIC_TEMPLATES[0].assets.map(a => ({
        ...a,
        type: isFixedIncomeTicker(a.ticker) ? 'fixed_income' : 'equity',
        rsi: marketRsiMap[a.ticker] || 50,
      })));
      setPortfolioName('');
      setPortfolioMode('weights');
      setError(null);
    }
  }, [isOpen]);

  // Selección de plantilla en el Paso 1
  const handleSelectTemplate = (templateId: string, templateAssets: { ticker: string; weight: number }[]) => {
    setSelectedApproach(templateId);
    setAssets(templateAssets.map(a => ({
      ticker: a.ticker,
      weight: a.weight,
      type: isFixedIncomeTicker(a.ticker) ? 'fixed_income' : 'equity',
      rsi: marketRsiMap[a.ticker] || (isFixedIncomeTicker(a.ticker) ? 50 : 48),
    })));
  };

  // Ajuste de peso de un activo
  const handleWeightChange = (index: number, newWeight: number) => {
    const updated = [...assets];
    updated[index].weight = Math.max(0, Math.min(100, Math.round(newWeight)));
    setAssets(updated);
  };

  // Eliminar activo
  const handleRemoveAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  // Agregar nuevo activo
  const handleAddAsset = () => {
    const t = newTickerInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!t) return;
    if (assets.some(a => a.ticker === t)) {
      setError(`El activo ${t} ya está en la lista.`);
      return;
    }
    setError(null);
    const isRf = isFixedIncomeTicker(t);
    setAssets([...assets, {
      ticker: t,
      weight: 10,
      type: isRf ? 'fixed_income' : 'equity',
      rsi: marketRsiMap[t] || (isRf ? 50 : 50),
    }]);
    setNewTickerInput('');
  };

  // Normalizar pesos al 100%
  const handleNormalize = () => {
    const total = assets.reduce((sum, a) => sum + a.weight, 0);
    if (total <= 0) return;
    
    let allocated = 0;
    const normalized = assets.map((a, idx) => {
      if (idx === assets.length - 1) {
        // Asignar el remanente exacto al último para garantizar suma = 100
        return { ...a, weight: Math.max(1, 100 - allocated) };
      }
      const w = Math.round((a.weight / total) * 100);
      allocated += w;
      return { ...a, weight: Math.max(1, w) };
    });
    setAssets(normalized);
  };

  // Cálculos reactivos de métricas
  const totalWeight = useMemo(() => {
    return assets.reduce((sum, a) => sum + a.weight, 0);
  }, [assets]);

  const projectedWeightedRsi = useMemo(() => {
    const equityAssets = assets.filter(a => a.type !== 'fixed_income');
    const totalEqWeight = equityAssets.reduce((sum, a) => sum + a.weight, 0);
    if (totalEqWeight <= 0) return 50;
    const weightedSum = equityAssets.reduce((sum, a) => {
      const rsiVal = a.rsi ?? marketRsiMap[a.ticker] ?? 50;
      return sum + (a.weight * rsiVal);
    }, 0);
    return Math.round(weightedSum / totalEqWeight);
  }, [assets, marketRsiMap]);

  const allocationSplit = useMemo(() => {
    const total = totalWeight || 1;
    const equitySum = assets.filter(a => a.type !== 'fixed_income').reduce((sum, a) => sum + a.weight, 0);
    const rfSum = assets.filter(a => a.type === 'fixed_income').reduce((sum, a) => sum + a.weight, 0);
    return {
      equityPct: Math.round((equitySum / total) * 100),
      rfPct: Math.round((rfSum / total) * 100),
    };
  }, [assets, totalWeight]);

  // Envío final
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = portfolioName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      setError('Por favor ingrese un nombre válido (letras minúsculas, números y guiones bajos).');
      return;
    }

    if (assets.length === 0) {
      setError('La cartera debe contener al menos un activo.');
      return;
    }

    const payloadAssets: Record<string, number> = {};
    assets.forEach(a => {
      if (a.weight > 0) {
        payloadAssets[a.ticker] = a.weight;
      }
    });

    setLoading(true);
    try {
      const res = await fetch('/api/portfolios/create_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          mode: portfolioMode,
          assets: payloadAssets,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Error al crear la cartera.');
      }

      onCreated(cleanName);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el backend.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 selection:bg-blue-500 selection:text-white">
      <div className="w-full max-w-2xl bg-[#181920] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Cabecera del Wizard */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#14151c]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Asistente de Portfolios
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                  Paso {step} de 3
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {step === 1 && 'Seleccione la estrategia inicial o plantilla base'}
                {step === 2 && 'Calibre visualmente las ponderaciones y balance'}
                {step === 3 && 'Asigne el nombre y confirme la persistencia atómica'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador visual de Pasos */}
        <div className="grid grid-cols-3 border-b border-white/5 bg-[#121318] text-xs font-mono">
          <div className={`py-2 px-4 text-center border-r border-white/5 flex items-center justify-center gap-2 ${step === 1 ? 'text-blue-400 font-bold bg-blue-500/10 border-b-2 border-b-blue-500' : 'text-zinc-500'}`}>
            <span>1. Enfoque</span>
          </div>
          <div className={`py-2 px-4 text-center border-r border-white/5 flex items-center justify-center gap-2 ${step === 2 ? 'text-blue-400 font-bold bg-blue-500/10 border-b-2 border-b-blue-500' : 'text-zinc-500'}`}>
            <span>2. Calibración</span>
          </div>
          <div className={`py-2 px-4 text-center flex items-center justify-center gap-2 ${step === 3 ? 'text-blue-400 font-bold bg-blue-500/10 border-b-2 border-b-blue-500' : 'text-zinc-500'}`}>
            <span>3. Guardado</span>
          </div>
        </div>

        {/* Mensaje de Error si ocurre */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Contenido Dinámico por Paso */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* ===================== PASO 1: ENFOQUE ===================== */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  Plantillas Estratégicas Institucionales
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {STRATEGIC_TEMPLATES.map((tmpl) => {
                    const Icon = tmpl.icon;
                    const isSelected = selectedApproach === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        onClick={() => handleSelectTemplate(tmpl.id, tmpl.assets)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected
                            ? 'bg-blue-600/15 border-blue-500/60 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/30'
                            : 'bg-[#14151c] border-white/5 hover:border-white/15 hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-[4px] ${isSelected ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-zinc-400'}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">{tmpl.name}</h4>
                              <span className="text-[10px] text-zinc-500 uppercase">{tmpl.category}</span>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {tmpl.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tmpl.assets.map(a => (
                            <span key={a.ticker} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/5 text-zinc-300">
                              {a.ticker} <span className="text-blue-400">{a.weight}%</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bloque Cuantitativo Markowitz & Deep Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2.5 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    Modelos Markowitz SLSQP
                  </h3>
                  <div className="space-y-2">
                    {MARKOWITZ_TEMPLATES.map((tmpl) => {
                      const isSelected = selectedApproach === tmpl.id;
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => handleSelectTemplate(tmpl.id, tmpl.assets)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/15 border-purple-500/60 ring-1 ring-purple-500/30'
                              : 'bg-[#14151c] border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{tmpl.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-purple-400" />}
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{tmpl.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2.5 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-emerald-400" />
                    Oportunidades en Sobreventa
                  </h3>
                  <div className="space-y-2">
                    {OVERSOLD_TEMPLATES.map((tmpl) => {
                      const isSelected = selectedApproach === tmpl.id;
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => handleSelectTemplate(tmpl.id, tmpl.assets)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600/15 border-emerald-500/60 ring-1 ring-emerald-500/30'
                              : 'bg-[#14151c] border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{tmpl.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{tmpl.description}</p>
                        </div>
                      );
                    })}

                    <div
                      onClick={() => {
                        setSelectedApproach('custom_empty');
                        setAssets([]);
                      }}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        selectedApproach === 'custom_empty'
                          ? 'bg-white/10 border-white/30 text-white font-bold'
                          : 'bg-[#14151c] border-white/5 hover:border-white/15 text-zinc-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Armar desde Cero (Vacía)</span>
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================== PASO 2: CALIBRACIÓN VISUAL ===================== */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Cockpit de Telemetría de la Calibración */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#14151c] border border-white/10">
                {/* Suma Total */}
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Suma Total</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-lg font-mono font-black ${
                      totalWeight === 100 
                        ? 'text-emerald-400' 
                        : totalWeight < 100 
                          ? 'text-amber-400' 
                          : 'text-red-400'
                    }`}>
                      {totalWeight}%
                    </span>
                    {totalWeight !== 100 && (
                      <button
                        type="button"
                        onClick={handleNormalize}
                        className="px-2 py-0.5 rounded-[3px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Ajustar a 100%
                      </button>
                    )}
                  </div>
                </div>

                {/* Termómetro de RSI Ponderado Proyectado */}
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">RSI Ponderado Proyectado</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg font-mono font-black text-white">{projectedWeightedRsi}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      projectedWeightedRsi < 35 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : projectedWeightedRsi > 65 
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {projectedWeightedRsi < 35 ? 'Sobreventa' : projectedWeightedRsi > 65 ? 'Sobrecompra' : 'Neutro'}
                    </span>
                  </div>
                </div>

                {/* Balance RV vs RF */}
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Distribución de Activos</span>
                  <div className="flex items-center gap-2 mt-1 text-xs font-mono font-bold">
                    <span className="text-blue-400">RV: {allocationSplit.equityPct}%</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-amber-400">RF: {allocationSplit.rfPct}%</span>
                  </div>
                </div>
              </div>

              {/* Lista de Activos con Sliders */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                  <span className="font-bold uppercase tracking-wider text-[10px]">Activo / Ponderación</span>
                  <span className="font-mono text-[11px]">{assets.length} activos en cartera</span>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {assets.map((asset, idx) => (
                    <div
                      key={asset.ticker}
                      className="p-3 rounded-lg bg-[#14151c] border border-white/5 flex items-center gap-3 hover:border-white/10 transition-colors"
                    >
                      {/* Ticker & Badge */}
                      <div className="w-24 shrink-0 flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white font-mono">{asset.ticker}</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                          asset.type === 'fixed_income' 
                            ? 'bg-amber-500/20 text-amber-300' 
                            : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {asset.type === 'fixed_income' ? 'RF' : 'RV'}
                        </span>
                      </div>

                      {/* Slider */}
                      <div className="flex-1 flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={asset.weight}
                          onChange={(e) => handleWeightChange(idx, Number(e.target.value))}
                          className="w-full accent-blue-500 h-1.5 bg-black/40 rounded-lg cursor-pointer"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={asset.weight}
                            onChange={(e) => handleWeightChange(idx, Number(e.target.value))}
                            className="w-14 px-1.5 py-1 text-right rounded bg-black/40 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-xs text-zinc-500 font-mono">%</span>
                        </div>
                      </div>

                      {/* Botón Eliminar */}
                      <button
                        type="button"
                        onClick={() => handleRemoveAsset(idx)}
                        className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                        title="Eliminar activo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {assets.length === 0 && (
                    <div className="p-8 text-center border border-dashed border-white/10 rounded-xl text-zinc-500 text-xs">
                      No hay activos agregados. Agregue un ticker abajo para comenzar.
                    </div>
                  )}
                </div>

                {/* Input para agregar activo */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Escriba un ticker (ej: AAPL, SPY, S30S6, AL30)..."
                      value={newTickerInput}
                      onChange={(e) => setNewTickerInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAsset();
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-[3px] bg-black/40 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono uppercase"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAsset}
                    className="px-3 py-2 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================== PASO 3: CONFIRMACIÓN & PERSISTENCIA ===================== */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Nombre de la cartera */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Identificador de la Cartera <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ej: tech_growth, bdi_moderada, mi_cartera_2026"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[3px] bg-black/40 border border-white/15 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 font-mono text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Solo letras minúsculas, números y guiones bajos (máx. 30 caracteres).
                </p>
              </div>

              {/* Selector de modo */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Modo de Cartera
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPortfolioMode('weights')}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      portfolioMode === 'weights'
                        ? 'bg-blue-600/15 border-blue-500/60 text-white font-bold'
                        : 'bg-[#14151c] border-white/5 text-zinc-400 hover:border-white/15'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">Ponderaciones (%)</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Asignación porcentual sobre el valor total</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPortfolioMode('nominals')}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      portfolioMode === 'nominals'
                        ? 'bg-blue-600/15 border-blue-500/60 text-white font-bold'
                        : 'bg-[#14151c] border-white/5 text-zinc-400 hover:border-white/15'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">Nominales Fijos (Unidades)</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Cantidad fija de títulos o acciones</div>
                  </button>
                </div>
              </div>

              {/* Resumen Final */}
              <div className="p-4 rounded-xl bg-[#14151c] border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Resumen de Composición</span>
                  <span className="text-xs font-mono text-blue-400">{assets.length} activos • Suma: {totalWeight}%</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {assets.map((a) => (
                    <span key={a.ticker} className="text-xs font-mono px-2 py-1 rounded bg-black/40 border border-white/10 text-white">
                      {a.ticker}: <strong className="text-blue-400">{a.weight}%</strong>
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 text-xs font-mono text-zinc-400">
                  <span>RSI Proyectado: <strong className="text-zinc-200">{projectedWeightedRsi}</strong></span>
                  <span>Balance: <strong className="text-zinc-200">{allocationSplit.equityPct}% RV / {allocationSplit.rfPct}% RF</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer con Navegación de Pasos */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-[#14151c]">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as 1 | 2)}
              className="px-3.5 py-2 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (assets.length === 0) {
                  setError('Debe incluir al menos un activo para continuar.');
                  return;
                }
                setError(null);
                setStep((step + 1) as 2 | 3);
              }}
              className="px-4 py-2 rounded-[3px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm border border-blue-500/40"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !portfolioName.trim()}
              className="px-5 py-2 rounded-[3px] bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm border border-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Crear y Abrir Cartera</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
