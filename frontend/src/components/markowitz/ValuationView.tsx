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

const technicalFieldLabels: Record<string, string> = {
  price: 'Current Market Price',
  fcf_per_share: 'Normalized Free Cash Flow per Share (FCF/share)',
  roic: 'Return on Invested Capital (ROIC)',
  wacc: 'Weighted Average Cost of Capital (WACC)',
  net_debt_ebitda: 'Net Debt/EBITDA',
  shares_cagr: 'Shares Outstanding CAGR',
  sbc_ocf: 'Stock-Based Compensation as % of Operating Cash Flow (SBC/OCF)',
  industrial_net_debt_ebitda: 'Industrial Net Debt/EBITDA',
  operating_earnings_per_share: 'Operating Earnings per Share',
  excess_cash_per_share: 'Excess Cash per Share',
  float_cost: 'Insurance Float Cost',
  eps: 'Normalized / Projected Earnings per Share (EPS)',
  tbv_per_share: 'Tangible Book Value per Share (TBV/share)',
  rotce: 'Return on Tangible Common Equity (RoTCE)',
  cet1_ratio: 'CET1 Capital Ratio',
  nco_ratio: 'NCO Ratio',
  net_debt_ebitda_usd: 'USD Net Debt/EBITDA',
  dollarized_revenue_pct: 'USD-Linked Revenue %',
  lifting_cost: 'Lifting Cost',
  breakeven_price: 'Breakeven Price',
  automotive_gross_margin: 'Automotive Gross Margin',
};

const technicalFieldHelp: Record<string, string> = {
  price: 'Current market quotation used to compare against valuation outputs; not calculated by the model.',
  fcf_per_share: '(Operating Cash Flow − Maintenance CapEx − SBC) ÷ shares.',
  roic: 'Net Operating Profit After Tax divided by invested capital.',
  wacc: '(Equity ÷ Total Capital) × cost of equity + (Debt ÷ Total Capital) × after-tax debt cost.',
  net_debt: '(Total Debt − Cash).',
  net_debt_ebitda: '(Total Debt − Cash) ÷ EBITDA.',
  shares_cagr: '(Ending Shares ÷ Beginning Shares)^(1/years) − 1.',
  sbc_ocf: 'Stock-Based Compensation divided by Operating Cash Flow × 100.',
  industrial_net_debt_ebitda: 'Industrial net debt divided by EBITDA.',
  operating_earnings_per_share: 'Operating earnings divided by shares; supplied by the profile.',
  excess_cash_per_share: 'Excess cash divided by shares; supplied by the profile.',
  float_cost: 'Cost of funding the insurance float; supplied by the profile.',
  eps: 'Normalized or projected earnings per share.',
  tbv_per_share: 'Tangible book value divided by shares.',
  rotce: 'Net income divided by average tangible equity.',
  cet1_ratio: 'CET1 capital divided by risk-weighted assets.',
  nco_ratio: 'Net charge-offs divided by average loans; for NU this field is Cost to Serve per Customer.',
  net_debt_ebitda_usd: 'USD-linked net debt divided by EBITDA.',
  dollarized_revenue_pct: 'USD-linked revenue divided by total revenue × 100.',
  lifting_cost: 'Extraction operating cost per barrel of oil equivalent.',
  breakeven_price: 'Profile-provided breakeven price threshold; not derived here.',
  automotive_gross_margin: 'Revenue minus COGS, divided by revenue × 100.',
};

const technicalLabel = (key: string, label: string) => {
  const original = label.toLowerCase();
  if (key === 'nco_ratio' && /cost to serve|costo de servicio|servicio\s*\/\s*cliente/i.test(label)) return 'Cost to Serve per Customer';
  if (key === 'rotce' && original.includes('roe')) return 'Return on Equity (ROE)';
  if (key === 'cet1_ratio' && original.includes('solvency')) return 'Solvency Capital Ratio';
  if (key === 'dollarized_revenue_pct') {
    if (original.includes('ppa')) return 'Fixed-Price PPA Revenue';
    if (original.includes('export')) return 'USD-Denominated Exports';
    if (original.includes('usd')) return 'USD-Linked Revenue';
  }
  return technicalFieldLabels[key] || label;
};
const technicalHelp = (field: ValuationField) => {
  if (field.key === 'nco_ratio' && /cost to serve|costo de servicio|servicio\s*\/\s*cliente/i.test(field.label)) return 'Cost to Serve per Customer; supplied by the profile.';
  if (field.key === 'rotce' && /roe/i.test(field.label)) return 'Net income divided by average equity.';
  if (field.key === 'cet1_ratio' && /solvency/i.test(field.label)) return 'Solvency Capital Ratio; supplied by the profile.';
  if (/ppa|export revenue/i.test(field.label)) return 'PPA/export revenue metric; supplied by the profile.';
  return technicalFieldHelp[field.key] || 'Profile-supplied technical metric; definition provided by the selected profile.';
};
const metricHelp = (name: string | undefined, modelType?: string) => {
  const text = (name || '').toLowerCase();
  if (text.includes('roic de ciclo') || text === 'roic vs wacc') return 'ROIC − WACC.';
  if (text.includes('valor contable tangible') || text.includes('p/tbv')) return 'Tangible book value per share; P/TBV compares market price with tangible book value.';
  if (text.includes('rentabilidad tangible')) return 'Profile-supplied tangible profitability metric (RoTCE/ROE).';
  if (text.includes('ratio de capital cet1')) return 'CET1 capital divided by risk-weighted assets; supplied by the profile.';
  if (text.includes('beneficio operativo real')) return 'Profile-supplied normalized operating earnings per share.';
  if (text.includes('exceso de caja')) return 'Excess cash per share; supplied by the profile.';
  if (text.includes('costo del float')) return 'Insurance float cost; supplied by the profile.';
  if (text.includes('fcf de ciclo medio')) return 'Mid-cycle Free Cash Flow; supplied by the profile.';
  if (text.includes('deuda industrial neta')) return 'Industrial net debt; supplied by the profile.';
  if (text.includes('fcf por adr')) return 'Free Cash Flow per ADR/share; supplied by the profile.';
  if (text.includes('lifting cost')) return 'Extraction operating cost per barrel of oil equivalent; supplied by the profile.';
  if (text.includes('deuda en usd')) return 'USD-linked net debt divided by EBITDA; supplied by the profile.';
  if (text.includes('estado fundamental')) return 'Profile-defined fundamental status and model criteria.';
  if (text.includes('fcf operativo real')) return 'Profile-supplied normalized operating Free Cash Flow.';
  if (text.includes('alerta principal')) return 'Primary alert based on the model/profile threshold criteria.';
  if (text.includes('precio límite de compra')) return 'Fair Value × (1 − Margin of Safety).';
  if (text.includes('fcf') && text.includes('share')) return 'Free Cash Flow divided by diluted shares outstanding.';
  if (text.includes('roic')) return 'Net Operating Profit After Tax divided by invested capital.';
  if (text.includes('wacc')) return 'Weighted average of the cost of equity and after-tax cost of debt.';
  if (text.includes('net debt') && text.includes('ebitda')) return 'Net Debt divided by EBITDA.';
  if (text.includes('shares') && text.includes('cagr')) return 'Compound annual growth rate of diluted shares outstanding.';
  if (text.includes('sbc') || text.includes('stock-based compensation')) return 'Stock-Based Compensation divided by Operating Cash Flow × 100.';
  if (text.includes('eps')) return 'Normalized or projected earnings per share.';
  if (text.includes('tbv')) return 'Tangible book value divided by shares.';
  if (text.includes('rotce')) return 'Net income divided by average tangible equity.';
  if (text.includes('cet1')) return 'CET1 capital divided by risk-weighted assets.';
  if (text.includes('nco')) return 'Net charge-offs divided by average loans.';
  if (text.includes('fair value')) {
    const formulas: Record<string, string> = {
      banking: 'EPS × base multiple.', financial_holding: 'Operating Earnings/share × base multiple + Excess Cash/share.',
      industrial_dual_debt: 'Mid-Cycle FCF/share × base multiple.', energy_upstream: 'FCF/ADR × base multiple.',
      standard_fcf: 'FCF/share × base multiple.', discarded: 'No Fair Value is calculated.'
    };
    return formulas[modelType || ''] || 'Calculated by the selected valuation model.';
  }
  if (text.includes('buy-below')) return 'Fair Value multiplied by (1 − Required Margin of Safety).';
  return undefined;
};
const metricLabel = (name: string | undefined) => {
  const text = (name || '').toLowerCase();
  if (text.includes('fair value') || text.includes('valor justo')) return 'Fair Value';
  if (text.includes('buy-below') || text.includes('compra por debajo')) return 'Buy-Below Price';
  if (text.includes('required margin') || text.includes('margen requerido')) return 'Required Margin of Safety';
  const exact: Record<string, string> = {
    'valor contable tangible': 'Tangible Book Value (TBV)', 'rentabilidad tangible': 'Return on Tangible Common Equity (RoTCE)',
    'ratio de capital cet1': 'CET1 Capital Ratio', 'beneficio operativo real': 'Normalized Operating Earnings',
    'exceso de caja / acción': 'Excess Cash per Share', 'costo del float': 'Float Cost', 'fcf de ciclo medio': 'Mid-Cycle FCF',
    'deuda industrial neta': 'Industrial Net Debt', 'roic industrial': 'Industrial ROIC', 'fcf por adr / acción': 'FCF per ADR / Share',
    'lifting cost / ventaja': 'Lifting Cost / Advantage', 'deuda en usd / ebitda': 'USD Net Debt/EBITDA',
    'estado fundamental': 'Fundamental Status', 'fcf operativo real': 'Normalized Operating FCF', 'alerta principal': 'Primary Alert',
    'precio límite de compra': 'Buy-Below Price'
  };
  if (exact[text]) return exact[text];
  if (text.includes('fcf') && text.includes('share')) return 'Normalized FCF per Share';
  if (text.includes('roic')) return 'Return on Invested Capital (ROIC)';
  if (text.includes('wacc')) return 'WACC';
  if (text.includes('net debt') && text.includes('ebitda')) return 'Net Debt/EBITDA';
  if (text.includes('shares') && text.includes('cagr')) return 'Shares Outstanding CAGR';
  if (text.includes('sbc') || text.includes('stock-based compensation')) return 'Stock-Based Compensation as % of Operating Cash Flow (SBC/OCF)';
  if (text.includes('eps')) return 'EPS';
  if (text.includes('tbv')) return 'TBV per Share';
  if (text.includes('rotce')) return 'RoTCE';
  if (text.includes('cet1')) return 'CET1 Ratio';
  if (text.includes('nco')) return 'NCO Ratio';
  return name;
};
const flagLabel = (name: string) => {
  const text = name.toLowerCase();
  const exact: Record<string, string> = {
    'solvencia de capital (cet1 ratio)': 'Capital Solvency (CET1 Ratio)', 'rentabilidad tangible (rotce / roe)': 'Tangible Profitability (RoTCE / ROE)',
    'costo por cliente activo': 'Cost per Active Customer', 'calidad crediticia (net charge-offs)': 'Credit Quality (Net Charge-Offs)',
    'evolución accionaria': 'Share Count Evolution', 'costo del float asegurador': 'Insurance Float Cost', 'recompras oportunistas': 'Opportunistic Buybacks',
    'deuda industrial limpia': 'Clean Industrial Debt', 'roic de ciclo vs wacc': 'Cycle ROIC vs WACC', 'eficiencia de extracción (lifting cost)': 'Extraction Efficiency (Lifting Cost)',
    'deuda neta en dólares': 'USD Net Debt', 'blindaje de ingresos en usd': 'USD Revenue Hedge', 'diagnóstico de vía negativa': 'Negative Path Diagnosis',
    'dilución accionaria destructiva': 'Destructive Share Dilution', 'sueldos excesivos en acciones': 'Excessive Stock-Based Compensation',
    'pérdida de poder de precios': 'Loss of Pricing Power', 'solvencia & deuda neta': 'Solvency & Net Debt', 'sueldos en acciones (sbc)': 'Stock-Based Compensation (SBC)',
    'roic vs wacc': 'ROIC vs WACC'
  };
  if (exact[text]) return exact[text];
  if (text.includes('roic') && text.includes('wacc')) return 'ROIC–WACC Spread';
  if (text.includes('nco')) return 'NCO Ratio';
  if (text.includes('sbc')) return 'SBC/OCF';
  if (text.includes('debt') && text.includes('ebitda')) return 'Net Debt/EBITDA';
  if (text.includes('margin')) return 'Gross Margin';
  if (text.includes('fair value')) return 'Fair Value';
  return name;
};
const flagHelp = (name: string) => {
  const text = name.toLowerCase();
  if (text.includes('recompras oportunistas')) return 'Shares Outstanding CAGR ≤ 0.';
  if (text.includes('pérdida de poder de precios')) return 'Gross Margin = (Revenue − COGS) ÷ Revenue × 100; flag when <18%.';
  if (text.includes('sueldos excesivos')) return 'SBC ÷ OCF × 100; flag when >15%.';
  if (text.includes('vía negativa')) return 'Profile discard reason forces RED.';
  if (text.includes('deuda industrial limpia')) return 'Industrial net debt/EBITDA compared with the model-defined threshold.';
  if (text.includes('deuda neta en dólares')) return 'USD-linked net debt/EBITDA compared with the model-defined threshold.';
  if (text.includes('solvencia') && text.includes('deuda neta')) return 'CET1/solvency and net debt criteria compared with profile thresholds.';
  if (text.includes('sueldos excesivos')) return 'SBC/OCF compared with the model-defined threshold.';
  if (text.includes('vía negativa')) return 'Negative-path diagnostic based on the profile-defined risk criteria.';
  if (text.includes('cet1')) return 'CET1 capital ÷ risk-weighted assets, compared with the profile threshold.';
  if (text.includes('rotce') || text.includes('roe')) return 'Supplied profitability metric compared with the profile threshold.';
  if (text.includes('charge-off')) return 'Net charge-offs ÷ average loans, compared with the profile threshold.';
  if (text.includes('cliente')) return 'Supplied Cost to Serve per Customer, compared with the profile threshold.';
  if (text.includes('float')) return 'Supplied insurance float cost, compared with the profile threshold.';
  if (text.includes('recompras')) return 'Based on the profile-defined opportunistic buyback criterion.';
  if (text.includes('lifting')) return 'Supplied extraction operating cost per boe, compared with the profile threshold.';
  if (text.includes('ingresos') || text.includes('usd')) return 'USD-linked revenue ÷ total revenue × 100, compared with the profile threshold.';
  if (text.includes('dilución') || text.includes('accionaria')) return 'Shares Outstanding CAGR, compared with the profile-defined threshold.';
  if (text.includes('poder de precios')) return 'Based on the profile-defined pricing-power criterion.';
  if (text.includes('roic') && text.includes('wacc')) return 'ROIC − WACC; positive spread indicates returns above the cost of capital.';
  if (text.includes('nco')) return 'Compared with the profile-defined NCO threshold.';
  if (text.includes('sbc')) return 'Compared with the profile-defined SBC/OCF threshold.';
  if (text.includes('debt') && text.includes('ebitda')) return 'Compared with the profile-defined Net Debt/EBITDA threshold.';
  return undefined;
};
const technicalSubtitle = (subtitle: string | undefined) => {
  if (!subtitle) return subtitle;
  const text = subtitle.toLowerCase();
  const exact: Record<string, string> = {
    'p/tbv actual': 'Current P/TBV', 'look-through earnings': 'Look-Through Earnings', 'máxima solvencia': 'Maximum Solvency',
    'treasury bills líquidas': 'Liquid Treasury Bills', 'financiamiento asegurador': 'Insurance Financing',
    'fcf normalizado': 'Normalized FCF', 'múltiplo adr': 'ADR Multiple', 'net leverage': 'Net Leverage'
  };
  if (exact[text]) return exact[text];
  return subtitle
    .replace(/fcf normalizado/gi, 'Normalized FCF')
    .replace(/flujo normalizado/gi, 'Normalized FCF')
    .replace(/múltiplo adr/gi, 'ADR Multiple')
    .replace(/costo de extracción/gi, 'Extraction Cost')
    .replace(/ingresos en dólares/gi, 'USD Revenue')
    .replace(/excluye financiera de clientes/gi, 'Excludes customer financing')
    .replace(/flujo de caja libre/gi, 'Free Cash Flow')
    .replace(/sin margen de seguridad/gi, 'No Margin of Safety')
    .replace(/margen de seguridad/gi, 'Margin of Safety')
    .replace(/por acción/gi, 'per share')
    .replace(/margen/gi, 'margin')
    .replace(/descuento/gi, 'discount');
};

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
      className="w-full h-10 px-3 bg-secondary border border-border rounded-xl text-xs font-mono font-bold text-foreground outline-none focus:border-blue-500 transition-colors"
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
  const [tickerFilter, setTickerFilter] = useState<string>('');

  const filteredSectors = useMemo(() => {
    const q = tickerFilter.trim().toLowerCase();
    if (!q) return sectors;
    return sectors.map(sec => ({
      ...sec,
      companies: sec.companies.filter(c =>
        c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      )
    })).filter(sec => sec.companies.length > 0);
  }, [sectors, tickerFilter]);

  // Load initial sectors & default profile
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch('/api/valuation/data_json');
        if (res.ok) {
          const json = await res.json();
          setSectors(json.sectors || []);
          const savedTicker = localStorage.getItem('finapp_valuation_ticker');
          if (savedTicker) {
            localStorage.removeItem('finapp_valuation_ticker');
            handleSelectTicker(savedTicker);
          } else {
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
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();

    const handleRemoteVal = (e: any) => {
      const tk = e.detail;
      if (tk) {
        handleSelectTicker(tk);
      }
    };
    window.addEventListener('finapp_open_valuation', handleRemoteVal);
    return () => window.removeEventListener('finapp_open_valuation', handleRemoteVal);
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
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-foreground flex items-center gap-3">
            Valuación Fundamental & Vía Negativa
            <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-positive dark:border-emerald-500/30">
              6 Modelos Adaptativos
            </span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-muted-foreground mt-1">
            Auditoría de foso competitivo, cálculo de Fair Value intrínseco y detección de banderas de riesgo.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-border h-80 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Cargando base de datos de modelos y perfiles sectoriales...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Sector & Company Picker (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div className="bg-card border border-border p-4 rounded-2xl flex flex-col gap-3 border border-slate-200 dark:border-border shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-blue-500 dark:text-foreground" />
                  Universo de Activos por Sector
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-muted-foreground">
                  {sectors.reduce((acc, s) => acc + s.companies.length, 0)} activos
                </span>
              </div>

              {/* Buscador rápido de tickers */}
              <div className="relative">
                <input
                  type="text"
                  value={tickerFilter}
                  onChange={e => setTickerFilter(e.target.value)}
                  placeholder="Filtrar por ticker o nombre..."
                  className="w-full h-8 px-3 text-xs bg-slate-50 dark:bg-secondary border border-slate-200 dark:border-border rounded-lg text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-muted-foreground outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-4 max-h-[720px] overflow-y-auto pr-1">
                {filteredSectors.map(sec => (
                  <div key={sec.id} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-extrabold text-slate-500 dark:text-muted-foreground uppercase tracking-wider px-1">
                      {sec.name} ({sec.companies.length})
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
                                ? 'bg-blue-600 text-foreground shadow-md scale-[1.02]'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-secondary/50 dark:hover:bg-secondary/50 dark:text-muted-foreground dark:border-border'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs tracking-wide">{comp.ticker}</span>
                              {comp.is_discarded && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-red-500/20 dark:text-negative font-bold">
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
                <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-2 border border-slate-200 dark:border-border shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-slate-900 dark:text-foreground">{profile.name}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                        {profile.model_type.toUpperCase().replace('_', ' ')}
                      </span>
                    </div>

                    <span className="text-xs text-slate-600 dark:text-muted-foreground font-mono">
                       <span title="Required Margin of Safety: discount applied to Fair Value to set the Buy-Below Price.">Required Margin of Safety:</span> <strong>{Math.round((profile.required_margin_of_safety || 0.25) * 100)}%</strong>
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-muted-foreground leading-relaxed mt-1">
                    {profile.business_summary}
                  </p>

                  <div className="p-3 bg-slate-50 dark:bg-secondary rounded-xl border border-slate-200 dark:border-border text-[11px] text-slate-600 dark:text-muted-foreground mt-1">
                    <strong className="text-slate-800 dark:text-muted-foreground">Auditoría 10-K / 10-Q: </strong> {profile.guidance}
                  </div>
                </div>

                {/* Adaptive Inputs Form */}
                <form onSubmit={handleEvaluate} className="bg-card border border-border p-6 rounded-2xl flex flex-col gap-4 border border-slate-200 dark:border-border shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-900 dark:text-foreground uppercase tracking-wider flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500 dark:text-foreground" />
                      Parámetros Fundamentales del Activo
                    </h2>
                    <span className="text-[10px] text-slate-500 dark:text-muted-foreground">Guardado automático en persistencia local</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {profile.fields.map(field => (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-muted-foreground flex items-center justify-between">
                           <span title={technicalHelp(field)}>{technicalLabel(field.key, field.label)}</span>
                          {field.key === 'price' && profile.live_market_price && (
                            <button
                              type="button"
                              onClick={() => handleMetricChange('price', profile.live_market_price!)}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-foreground hover:bg-blue-500/20 border border-blue-500/20 flex items-center gap-1 transition-all cursor-pointer"
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
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-border">
                    <button
                      type="submit"
                      disabled={evaluating}
                      className="h-10 px-6 bg-blue-600 hover:bg-blue-500 text-foreground rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
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
                    <div className="bg-card border border-border p-6 rounded-2xl flex flex-col gap-4 border border-slate-200 dark:border-border bg-white dark:bg-secondary shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {result.verdict === 'GREEN FLAG' ? '🏆' : (result.verdict === 'YELLOW FLAG' ? '⚠️' : '🚫')}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900 dark:text-foreground uppercase tracking-wide">
                                {result.verdict_title}
                              </h3>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${
                                result.verdict === 'GREEN FLAG'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-positive dark:border-emerald-500/30'
                                  : (result.verdict === 'YELLOW FLAG'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-red-500/20 dark:text-negative dark:border-red-500/30')
                              }`}>
                                {result.verdict}
                              </span>
                            </div>
                            <span className="text-xs text-slate-600 dark:text-muted-foreground">
                              Ponderación sugerida en cartera: <strong className="text-slate-900 dark:text-foreground">{result.target_weight}</strong>
                            </span>
                          </div>
                        </div>

                        {result.fair_value > 0 && (
                          <button
                            onClick={handleSyncToFairValue}
                            disabled={syncingGf}
                            className={`h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                              syncSuccess 
                                ? 'bg-emerald-600 text-foreground shadow-lg shadow-emerald-500/25' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-secondary/50 dark:hover:bg-white/20 dark:text-foreground dark:border-border'
                            }`}
                          >
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            {syncSuccess ? 'Fair Value Sincronizado' : 'Sincronizar con Portfolios'}
                          </button>
                        )}
                      </div>

                      {/* Key Value Cards */}
                      {result.key_metrics_display && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-border">
                          <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col justify-between border border-slate-200/60 dark:border-border">
                            <span title={metricHelp(result.key_metrics_display.metric_1_name, result.model_type)} className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase">{metricLabel(result.key_metrics_display.metric_1_name)}</span>
                            <span className="text-lg font-black text-slate-900 dark:text-foreground tabular-nums mt-0.5">{result.key_metrics_display.metric_1_val}</span>
                            <span className="text-[10px] text-slate-500 dark:text-muted-foreground font-mono">{technicalSubtitle(result.key_metrics_display.metric_1_sub)}</span>
                          </div>

                          <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col justify-between border border-slate-200/60 dark:border-border">
                            <span title={metricHelp(result.key_metrics_display.metric_2_name, result.model_type)} className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase">{metricLabel(result.key_metrics_display.metric_2_name)}</span>
                            <span className="text-lg font-black text-slate-900 dark:text-foreground tabular-nums mt-0.5">{result.key_metrics_display.metric_2_val}</span>
                            <span className="text-[10px] text-slate-500 dark:text-muted-foreground font-mono">{technicalSubtitle(result.key_metrics_display.metric_2_sub)}</span>
                          </div>

                          <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col justify-between border border-slate-200/60 dark:border-border">
                            <span title={metricHelp(result.key_metrics_display.metric_3_name, result.model_type)} className="text-[10px] text-slate-500 dark:text-muted-foreground font-bold uppercase">{metricLabel(result.key_metrics_display.metric_3_name)}</span>
                            <span className="text-lg font-black text-slate-900 dark:text-foreground tabular-nums mt-0.5">{result.key_metrics_display.metric_3_val}</span>
                            <span className="text-[10px] text-slate-500 dark:text-muted-foreground font-mono">{technicalSubtitle(result.key_metrics_display.metric_3_sub)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Flags Breakdown (Semáforo de Riesgo) */}
                    <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-3 border border-slate-200 dark:border-border shadow-sm">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-foreground uppercase tracking-wider flex items-center gap-2">
                        <Scale className="w-3.5 h-3.5 text-blue-500 dark:text-foreground" />
                        Desglose de Banderas de Riesgo & Vía Negativa
                      </h4>

                      <div className="flex flex-col gap-2">
                        {result.flags.map((flag, idx) => {
                          const isG = flag.flag === 'GREEN';
                          const isY = flag.flag === 'YELLOW';

                          let badgeBg = isG 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-positive/10 dark:text-positive dark:border-emerald-500/30' 
                            : (isY 
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30' 
                              : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-negative/10 dark:text-negative dark:border-red-500/30');

                          return (
                            <div key={idx} className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200/60 dark:border-border">
                              <div className="flex items-center gap-2.5">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${badgeBg}`}>
                                  {flag.flag}
                                </span>
                                 <span title={flagHelp(flag.name)} className="text-xs font-bold text-slate-800 dark:text-foreground">{flagLabel(flag.name)}</span>
                              </div>
                              <span className="text-xs text-slate-600 dark:text-muted-foreground font-medium sm:text-right flex-1 sm:max-w-md">
                                {flag.desc}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Plan */}
                    <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-3 border border-slate-200 dark:border-border shadow-sm">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-foreground uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-positive" />
                        Plan de Acción & Directrices de Ejecución
                      </h4>

                      <ul className="flex flex-col gap-2">
                        {result.action_plan.map((step, idx) => (
                          <li key={idx} className="text-xs text-slate-700 dark:text-muted-foreground flex items-start gap-2.5">
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
