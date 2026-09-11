import React, { useEffect, useState, useMemo } from 'react';
import { 
  Calculator, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Building2, 
  Sparkles, 
  HelpCircle, 
  Save, 
  ChevronRight, 
  Layers, 
  RefreshCw, 
  DollarSign, 
  TrendingUp, 
  Scale, 
  SlidersHorizontal,
  BookmarkCheck
} from 'lucide-react';

interface CompanyItem {
  ticker: string;
  name: string;
  is_discarded: boolean;
}

interface SectorItem {
  id: string;
  name: string;
  companies: CompanyItem[];
}

interface ValuationField {
  key: string;
  label: string;
  help: string;
  default: number;
  step: number;
}

interface ValuationProfile {
  name: string;
  sector_id: string;
  model_type: string;
  business_summary: string;
  base_fcf_multiple?: number;
  required_margin_of_safety?: number;
  guidance: string;
  live_market_price?: number | null;
  fields: ValuationField[];
}

interface ValuationFlag {
  name: string;
  flag: 'GREEN' | 'YELLOW' | 'RED';
  desc: string;
}

interface ValuationResult {
  ticker: string;
  name: string;
  sector_id: string;
  model_type: string;
  business_summary: string;
  guidance: string;
  is_discarded_by_nature: boolean;
  price: number;
  fair_value: number;
  buy_below_price: number;
  discount_percent: number;
  base_multiple: number;
  required_mos_pct: number;
  spread: string;
  key_metrics_display?: {
    metric_1_name?: string;
    metric_1_val?: string;
    metric_1_sub?: string;
    metric_2_name?: string;
    metric_2_val?: string;
    metric_2_sub?: string;
    metric_3_name?: string;
    metric_3_val?: string;
    metric_3_sub?: string;
  };
  flags: ValuationFlag[];
  summary_counts: {
    green: number;
    yellow: number;
    red: number;
  };
  verdict: string;
  verdict_title: string;
  verdict_badge: string;
  action_plan: string[];
  target_weight: string;
}

interface MetricInputFieldProps {
  field: ValuationField;
  value: number | undefined;
  onChange: (val: number) => void;
}

const MetricInputField: React.FC<MetricInputFieldProps> = ({ field, value, onChange }) => {
  const [localVal, setLocalVal] = useState<string>(() =>
    value !== undefined && !isNaN(value) ? String(value) : String(field.default)
  );

  useEffect(() => {
    const formatted = value !== undefined && !isNaN(value) ? String(value) : String(field.default);
    const curNum = parseFloat(localVal);
    const newNum = parseFloat(formatted);
    if (isNaN(curNum) || curNum !== newNum) {
      setLocalVal(formatted);
    }
  }, [value, field.default]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localVal}
      onChange={e => {
        const text = e.target.value;
        if (text === '' || text === '-' || /^-?\d*\.?\d*$/.test(text)) {
          setLocalVal(text);
          const parsed = parseFloat(text);
          if (!isNaN(parsed) && text !== '-' && !text.endsWith('.')) {
            onChange(parsed);
          }
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(localVal);
        if (isNaN(parsed)) {
          setLocalVal(String(field.default));
          onChange(field.default);
        } else {
          setLocalVal(String(parsed));
          onChange(parsed);
        }
      }}
      className="w-full h-10 px-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
    />
  );
};

export const ValuationView: React.FC = () => {
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('NVDA');
  const [profile, setProfile] = useState<ValuationProfile | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [syncingGf, setSyncingGf] = useState<boolean>(false);
  const [syncSuccess, setSyncSuccess] = useState<boolean>(false);

  // Load initial sectors & default profile
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch('/api/valuation/data_json');
        if (res.ok) {
          const json = await res.json();
          setSectors(json.sectors || []);
          if (json.selected_profile) {
            setProfile(json.selected_profile);
            const initialM: Record<string, number> = {};
            json.selected_profile.fields.forEach((f: ValuationField) => {
              initialM[f.key] = f.default;
            });
            setMetrics(initialM);
          }
          if (json.initial_eval) {
            setResult(json.initial_eval);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();
  }, []);

  // When selectedTicker changes, fetch its profile & trigger evaluation
  const handleSelectTicker = async (ticker: string) => {
    setSelectedTicker(ticker);
    setSyncSuccess(false);
    setEvaluating(true);
    try {
      const res = await fetch(`/api/valuation/profile_json/${ticker}`);
      if (res.ok) {
        const prof: ValuationProfile = await res.json();
        setProfile(prof);
        const newM: Record<string, number> = {};
        prof.fields.forEach(f => {
          newM[f.key] = f.default;
        });
        setMetrics(newM);

        // Auto evaluate with new defaults
        const evalRes = await fetch('/api/valuation/evaluate_json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, metrics: newM })
        });
        if (evalRes.ok) {
          const evalJson = await evalRes.json();
          setResult(evalJson);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  const handleMetricChange = (key: string, value: number) => {
    setMetrics(prev => ({ ...prev, [key]: value }));
  };

  const handleEvaluate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setEvaluating(true);
    setSyncSuccess(false);
    try {
      const res = await fetch('/api/valuation/evaluate_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selectedTicker, metrics })
      });
      if (res.ok) {
        const evalJson = await res.json();
        setResult(evalJson);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  const handleSyncToFairValue = async () => {
    if (!result || result.fair_value <= 0) return;
    setSyncingGf(true);
    try {
      const res = await fetch('/api/valuation/sync_gf_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selectedTicker, fair_value: result.fair_value })
      });
      if (res.ok) {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingGf(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            Valuación Fundamental & Vía Negativa
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">
              6 Modelos Adaptativos
            </span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
            Auditoría de foso competitivo, cálculo de Fair Value intrínseco y detección de banderas de riesgo.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Cargando base de datos de modelos y perfiles sectoriales...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Sector & Company Picker (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3 border border-slate-200 dark:border-white/10 shadow-sm">
              <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                Universo de Activos por Sector
              </span>

              <div className="flex flex-col gap-4 max-h-[750px] overflow-y-auto pr-1">
                {sectors.map(sec => (
                  <div key={sec.id} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-extrabold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">
                      {sec.name}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {sec.companies.map(comp => {
                        const isSel = selectedTicker === comp.ticker;
                        return (
                          <button
                            key={comp.ticker}
                            onClick={() => handleSelectTicker(comp.ticker)}
                            className={`p-2.5 rounded-xl text-left transition-all flex flex-col justify-between ${
                              isSel
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-zinc-300 dark:border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs tracking-wide">{comp.ticker}</span>
                              {comp.is_discarded && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-red-500/20 dark:text-red-400 font-bold">
                                  DESCARTE
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] opacity-75 truncate mt-0.5">{comp.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Form & Diagnostic Verdict (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {profile && (
              <>
                {/* Company Banner & Guidance */}
                <div className="glass-panel p-5 rounded-2xl flex flex-col gap-2 border border-slate-200 dark:border-white/10 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-slate-900 dark:text-white">{profile.name}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                        {profile.model_type.toUpperCase().replace('_', ' ')}
                      </span>
                    </div>

                    <span className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                      Margen Requerido: <strong>{Math.round((profile.required_margin_of_safety || 0.25) * 100)}%</strong>
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed mt-1">
                    {profile.business_summary}
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-black/40 rounded-xl border border-slate-200 dark:border-white/5 text-[11px] text-slate-600 dark:text-zinc-400 mt-1">
                    <strong className="text-slate-800 dark:text-zinc-300">Auditoría 10-K / 10-Q: </strong> {profile.guidance}
                  </div>
                </div>

                {/* Adaptive Inputs Form */}
                <form onSubmit={handleEvaluate} className="glass-panel p-6 rounded-2xl flex flex-col gap-4 border border-slate-200 dark:border-white/10 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                      Parámetros Fundamentales del Activo
                    </h2>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500">Guardado automático en persistencia local</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {profile.fields.map(field => (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                          <span>{field.label}</span>
                          {field.key === 'price' && profile.live_market_price && (
                            <button
                              type="button"
                              onClick={() => handleMetricChange('price', profile.live_market_price!)}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 flex items-center gap-1 transition-all cursor-pointer"
                              title="Restablecer a la cotización en vivo del mercado"
                            >
                              <span>⚡ Spot: ${profile.live_market_price.toFixed(2)} USD</span>
                            </button>
                          )}
                        </label>
                        <div className="relative">
                          <MetricInputField
                            field={field}
                            value={metrics[field.key]}
                            onChange={val => handleMetricChange(field.key, val)}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500 leading-tight">{field.help}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
                    <button
                      type="submit"
                      disabled={evaluating}
                      className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
                    >
                      <Calculator className={`w-4 h-4 ${evaluating ? 'animate-spin' : ''}`} />
                      Recalcular Valuación
                    </button>
                  </div>
                </form>

                {/* Valuation Verdict & Diagnosis Results */}
                {result && (
                  <div className="flex flex-col gap-4">
                    {/* Verdict Card */}
                    <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 border border-slate-200 dark:border-white/10 bg-white dark:bg-[#181920] shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {result.verdict === 'GREEN FLAG' ? '🏆' : (result.verdict === 'YELLOW FLAG' ? '⚠️' : '🚫')}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wide">
                                {result.verdict_title}
                              </h3>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${
                                result.verdict === 'GREEN FLAG'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
                                  : (result.verdict === 'YELLOW FLAG'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30')
                              }`}>
                                {result.verdict}
                              </span>
                            </div>
                            <span className="text-xs text-slate-600 dark:text-zinc-300">
                              Ponderación sugerida en cartera: <strong className="text-slate-900 dark:text-white">{result.target_weight}</strong>
                            </span>
                          </div>
                        </div>

                        {result.fair_value > 0 && (
                          <button
                            onClick={handleSyncToFairValue}
                            disabled={syncingGf}
                            className={`h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                              syncSuccess 
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white dark:border-white/10'
                            }`}
                          >
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            {syncSuccess ? 'Fair Value Sincronizado' : 'Sincronizar con Portfolios'}
                          </button>
                        )}
                      </div>

                      {/* Key Value Cards */}
                      {result.key_metrics_display && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
                          <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col justify-between border border-slate-200/60 dark:border-white/5">
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase">{result.key_metrics_display.metric_1_name}</span>
                            <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{result.key_metrics_display.metric_1_val}</span>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">{result.key_metrics_display.metric_1_sub}</span>
                          </div>

                          <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col justify-between border border-slate-200/60 dark:border-white/5">
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase">{result.key_metrics_display.metric_2_name}</span>
                            <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{result.key_metrics_display.metric_2_val}</span>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">{result.key_metrics_display.metric_2_sub}</span>
                          </div>

                          <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col justify-between border border-slate-200/60 dark:border-white/5">
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase">{result.key_metrics_display.metric_3_name}</span>
                            <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{result.key_metrics_display.metric_3_val}</span>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">{result.key_metrics_display.metric_3_sub}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Flags Breakdown (Semáforo de Riesgo) */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3 border border-slate-200 dark:border-white/10 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Scale className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        Desglose de Banderas de Riesgo & Vía Negativa
                      </h4>

                      <div className="flex flex-col gap-2">
                        {result.flags.map((flag, idx) => {
                          const isG = flag.flag === 'GREEN';
                          const isY = flag.flag === 'YELLOW';

                          let badgeBg = isG 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30' 
                            : (isY 
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30' 
                              : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30');

                          return (
                            <div key={idx} className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200/60 dark:border-white/5">
                              <div className="flex items-center gap-2.5">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${badgeBg}`}>
                                  {flag.flag}
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{flag.name}</span>
                              </div>
                              <span className="text-xs text-slate-600 dark:text-zinc-400 font-medium sm:text-right flex-1 sm:max-w-md">
                                {flag.desc}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Plan */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3 border border-slate-200 dark:border-white/10 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Plan de Acción & Directrices de Ejecución
                      </h4>

                      <ul className="flex flex-col gap-2">
                        {result.action_plan.map((step, idx) => (
                          <li key={idx} className="text-xs text-slate-700 dark:text-zinc-300 flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
