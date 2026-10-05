import React, { useEffect, useMemo, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ArrowLeftRight, BarChart3, RefreshCw } from 'lucide-react';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

type Period = '1y' | '3y' | '5y';

interface PortfolioOption {
  id: string;
  name: string;
  assetCount: number;
}

interface AnnualReturn {
  year: number;
  return_pct: number;
  partial: boolean;
}

interface ComparisonStats {
  initial_balance: number;
  final_balance: number;
  total_return_pct: number;
  cagr_pct: number | null;
  annualized_volatility_pct: number | null;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown_pct: number;
  calmar: number | null;
  alpha_annual_vs_spy_pct: number | null;
  alpha_3m_vs_spy_pct: number | null;
  alpha_6m_vs_spy_pct: number | null;
  alpha_ytd_vs_spy_pct: number | null;
  alpha_1y_vs_spy_pct: number | null;
  rsi_14: number | null;
  return_1y_pct: number | null;
  return_3y_pct: number | null;
  return_5y_pct: number | null;
  best_year: AnnualReturn | null;
  worst_year: AnnualReturn | null;
  annual_returns: AnnualReturn[];
}

interface AssetComposition {
  ticker: string;
  sector_id: string;
  sector_name: string;
  target_weight_pct: number;
  end_weight_pct: number;
}

interface SectorComposition {
  sector_id: string;
  sector_name: string;
  target_weight_pct: number;
  end_weight_pct: number;
}

interface ComparedPortfolio {
  id: string;
  name: string;
  stats: ComparisonStats;
  asset_composition: AssetComposition[];
  sector_composition: SectorComposition[];
}

interface ComparisonPoint {
  date: string;
  balance_a: number;
  balance_b: number;
  spy_balance: number;
  drawdown_a_pct: number;
  drawdown_b_pct: number;
  spy_drawdown_pct: number;
}

interface ComparisonResult {
  success: boolean;
  period: Period;
  requested_period_years: number;
  available_years: number;
  start_date: string;
  end_date: string;
  initial_investment: number;
  risk_free_rate_pct: number;
  portfolios: ComparedPortfolio[];
  time_series: ComparisonPoint[];
}

interface CompositionRow {
  key: string;
  label: string;
  targetA: number | null;
  endA: number | null;
  targetB: number | null;
  endB: number | null;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '1y', label: '1 año' },
  { value: '3y', label: '3 años' },
  { value: '5y', label: '5 años' },
];

const fmtPct = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const fmtRatio = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toFixed(2);
const fmtMoney = (value: number | null | undefined) => value === null || value === undefined ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const fmtDate = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

function errorMessage(body: any, fallback: string): string {
  if (typeof body?.error === 'string') return body.error;
  if (typeof body?.detail === 'string') return body.detail;
  return fallback;
}

export const PortfolioComparisonView: React.FC = () => {
  const [availablePortfolios, setAvailablePortfolios] = useState<PortfolioOption[]>([]);
  const [portfolioA, setPortfolioA] = useState('');
  const [portfolioB, setPortfolioB] = useState('');
  const [period, setPeriod] = useState<Period>('5y');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [compositionMode, setCompositionMode] = useState<'assets' | 'sectors'>('assets');
  const [loadingList, setLoadingList] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadPortfolios = async () => {
      setLoadingList(true);
      try {
        const response = await fetch('/api/portfolios/list_json');
        const body = await response.json();
        if (!response.ok) throw new Error(errorMessage(body, 'No se pudo cargar la lista de portfolios.'));
        const stored = body?.portfolios;
        const options: PortfolioOption[] = Array.isArray(stored)
          ? stored.map((item: any) => ({ id: String(item.id), name: String(item.name ?? item.id), assetCount: Number(item.asset_count ?? 0) }))
          : Object.entries(stored ?? {}).map(([id, data]: [string, any]) => ({
              id,
              name: id.replace(/_/g, ' ').toUpperCase(),
              assetCount: Object.keys(data?.assets ?? {}).length,
            }));
        const eligible = options.filter((item) => item.assetCount > 0);
        if (!active) return;
        setAvailablePortfolios(eligible);
        if (eligible.length >= 2) {
          setPortfolioA(eligible[0].id);
          setPortfolioB(eligible[1].id);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la lista de portfolios.');
      } finally {
        if (active) setLoadingList(false);
      }
    };
    void loadPortfolios();
    return () => { active = false; };
  }, []);

  const runComparison = async () => {
    if (!portfolioA || !portfolioB || portfolioA === portfolioB) return;
    setComparing(true);
    setError(null);
    try {
      const response = await fetch('/api/portfolios/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_a: portfolioA, portfolio_b: portfolioB, period }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, 'No se pudieron comparar los portfolios.'));
      setResult(body as ComparisonResult);
    } catch (comparisonError) {
      setResult(null);
      setError(comparisonError instanceof Error ? comparisonError.message : 'No se pudieron comparar los portfolios.');
    } finally {
      setComparing(false);
    }
  };

  const portfolioAData = result?.portfolios[0];
  const portfolioBData = result?.portfolios[1];
  const labels = useMemo(() => ({
    a: portfolioAData?.name ?? 'Portfolio A',
    b: portfolioBData?.name ?? 'Portfolio B',
  }), [portfolioAData?.name, portfolioBData?.name]);

  const balanceOption = useMemo(() => ({
    animation: false,
    color: ['#60a5fa', '#fbbf24', '#a1a1aa'],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number) => fmtMoney(value),
      backgroundColor: '#111827',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
    },
    legend: { top: 4, textStyle: { color: '#a1a1aa' }, data: [labels.a, labels.b, 'SPY'] },
    grid: { left: 68, right: 24, top: 42, bottom: 32 },
    xAxis: { type: 'category', boundaryGap: false, data: result?.time_series.map((point) => point.date) ?? [], axisLabel: { color: '#9ca3af', hideOverlap: true }, axisLine: { lineStyle: { color: '#374151' } } },
    yAxis: { type: 'value', axisLabel: { color: '#9ca3af', formatter: (value: number) => `$${Math.round(value / 1000)}k` }, splitLine: { lineStyle: { color: '#1f2937' } } },
    series: [
      { name: labels.a, type: 'line', showSymbol: false, lineStyle: { width: 2.5 }, data: result?.time_series.map((point) => point.balance_a) ?? [] },
      { name: labels.b, type: 'line', showSymbol: false, lineStyle: { width: 2.5 }, data: result?.time_series.map((point) => point.balance_b) ?? [] },
      { name: 'SPY', type: 'line', showSymbol: false, lineStyle: { width: 1.5, type: 'dashed' }, data: result?.time_series.map((point) => point.spy_balance) ?? [] },
    ],
  }), [labels, result]);

  const drawdownOption = useMemo(() => ({
    animation: false,
    color: ['#60a5fa', '#fbbf24', '#a1a1aa'],
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value.toFixed(2)}%`, backgroundColor: '#111827', borderColor: '#374151', textStyle: { color: '#e5e7eb' } },
    legend: { top: 4, textStyle: { color: '#a1a1aa' }, data: [labels.a, labels.b, 'SPY'] },
    grid: { left: 68, right: 24, top: 42, bottom: 32 },
    xAxis: { type: 'category', boundaryGap: false, data: result?.time_series.map((point) => point.date) ?? [], axisLabel: { color: '#9ca3af', hideOverlap: true }, axisLine: { lineStyle: { color: '#374151' } } },
    yAxis: { type: 'value', axisLabel: { color: '#9ca3af', formatter: (value: number) => `${value}%` }, splitLine: { lineStyle: { color: '#1f2937' } } },
    series: [
      { name: labels.a, type: 'line', showSymbol: false, areaStyle: { opacity: 0.08 }, data: result?.time_series.map((point) => point.drawdown_a_pct) ?? [] },
      { name: labels.b, type: 'line', showSymbol: false, areaStyle: { opacity: 0.08 }, data: result?.time_series.map((point) => point.drawdown_b_pct) ?? [] },
      { name: 'SPY', type: 'line', showSymbol: false, lineStyle: { type: 'dashed' }, data: result?.time_series.map((point) => point.spy_drawdown_pct) ?? [] },
    ],
  }), [labels, result]);

  const composition = useMemo<CompositionRow[]>(() => {
    if (!portfolioAData || !portfolioBData) return [];
    const rows = new Map<string, CompositionRow>();
    const add = (items: SectorComposition[], side: 'a' | 'b') => {
      for (const item of items) {
        const row = rows.get(item.sector_id) ?? {
          key: item.sector_id,
          label: item.sector_name,
          targetA: null,
          endA: null,
          targetB: null,
          endB: null,
        };
        if (side === 'a') {
          row.targetA = item.target_weight_pct;
          row.endA = item.end_weight_pct;
        } else {
          row.targetB = item.target_weight_pct;
          row.endB = item.end_weight_pct;
        }
        rows.set(item.sector_id, row);
      }
    };
    add(portfolioAData.sector_composition, 'a');
    add(portfolioBData.sector_composition, 'b');
    return [...rows.values()].sort((a, b) => Math.max(b.endA ?? 0, b.endB ?? 0) - Math.max(a.endA ?? 0, a.endB ?? 0));
  }, [portfolioAData, portfolioBData]);

  const compositionOption = useMemo(() => {
    const topRows = composition.slice(0, 12);
    return {
      animation: false,
      color: ['#60a5fa', '#fbbf24'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => `${value.toFixed(2)}%`, backgroundColor: '#111827', borderColor: '#374151', textStyle: { color: '#e5e7eb' } },
      legend: { top: 2, textStyle: { color: '#a1a1aa' }, data: [labels.a, labels.b] },
      grid: { left: 150, right: 20, top: 38, bottom: 20 },
      xAxis: { type: 'value', max: 100, axisLabel: { color: '#9ca3af', formatter: (value: number) => `${value}%` }, splitLine: { lineStyle: { color: '#1f2937' } } },
      yAxis: { type: 'category', data: topRows.map((row) => row.label).reverse(), axisLabel: { color: '#d1d5db', width: 130, overflow: 'truncate' }, axisLine: { lineStyle: { color: '#374151' } } },
      series: [
        { name: labels.a, type: 'bar', barMaxWidth: 14, data: topRows.map((row) => row.endA ?? 0).reverse() },
        { name: labels.b, type: 'bar', barMaxWidth: 14, data: topRows.map((row) => row.endB ?? 0).reverse() },
      ],
    };
  }, [composition, labels]);

  const metricRows = useMemo(() => {
    if (!portfolioAData || !portfolioBData) return [];
    const a = portfolioAData.stats;
    const b = portfolioBData.stats;
    const annualSummary = (value: AnnualReturn | null) => value ? `${fmtPct(value.return_pct)} (${value.year}${value.partial ? '*' : ''})` : '—';
    return [
      { label: 'Saldo inicial', a: fmtMoney(a.initial_balance), b: fmtMoney(b.initial_balance) },
      { label: 'Saldo final', a: fmtMoney(a.final_balance), b: fmtMoney(b.final_balance) },
      { label: 'Rendimiento acumulado · período', a: fmtPct(a.total_return_pct), b: fmtPct(b.total_return_pct) },
      { label: 'CAGR · período', a: fmtPct(a.cagr_pct), b: fmtPct(b.cagr_pct) },
      { label: 'Volatilidad anualizada', a: fmtPct(a.annualized_volatility_pct), b: fmtPct(b.annualized_volatility_pct) },
      { label: 'Sharpe', a: fmtRatio(a.sharpe), b: fmtRatio(b.sharpe) },
      { label: 'Sortino', a: fmtRatio(a.sortino), b: fmtRatio(b.sortino) },
      { label: 'Máximo drawdown', a: fmtPct(a.max_drawdown_pct), b: fmtPct(b.max_drawdown_pct) },
      { label: 'Calmar', a: fmtRatio(a.calmar), b: fmtRatio(b.calmar) },
      { label: 'Exceso anualizado vs SPY · período', a: fmtPct(a.alpha_annual_vs_spy_pct), b: fmtPct(b.alpha_annual_vs_spy_pct) },
      { label: 'Exceso vs SPY · 3 meses', a: fmtPct(a.alpha_3m_vs_spy_pct), b: fmtPct(b.alpha_3m_vs_spy_pct) },
      { label: 'Exceso vs SPY · 6 meses', a: fmtPct(a.alpha_6m_vs_spy_pct), b: fmtPct(b.alpha_6m_vs_spy_pct) },
      { label: 'Exceso vs SPY · YTD', a: fmtPct(a.alpha_ytd_vs_spy_pct), b: fmtPct(b.alpha_ytd_vs_spy_pct) },
      { label: 'Exceso vs SPY · 1 año', a: fmtPct(a.alpha_1y_vs_spy_pct), b: fmtPct(b.alpha_1y_vs_spy_pct) },
      { label: 'RSI 14 · cartera', a: fmtRatio(a.rsi_14), b: fmtRatio(b.rsi_14) },
      { label: 'Rendimiento acumulado · 1 año', a: fmtPct(a.return_1y_pct), b: fmtPct(b.return_1y_pct) },
      { label: 'Rendimiento acumulado · 3 años', a: fmtPct(a.return_3y_pct), b: fmtPct(b.return_3y_pct) },
      { label: 'Rendimiento acumulado · 5 años', a: fmtPct(a.return_5y_pct), b: fmtPct(b.return_5y_pct) },
      { label: 'Mejor año', a: annualSummary(a.best_year), b: annualSummary(b.best_year) },
      { label: 'Peor año', a: annualSummary(a.worst_year), b: annualSummary(b.worst_year) },
    ];
  }, [portfolioAData, portfolioBData]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <section className="rounded-2xl border border-border bg-card/70 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
              <ArrowLeftRight className="h-4 w-4" /> Comparación de portfolios cargados
            </div>
            <h1 className="text-2xl font-black text-foreground md:text-3xl">Dos portfolios, mismas condiciones</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Simulación de USD 10.000 con pesos objetivo iniciales y precios históricos ajustados. Cada ventana empieza con esos pesos y se mantiene sin rebalanceo; SPY aparece como referencia.
            </p>
          </div>
          <span className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">Tasa de referencia: 4% anual</span>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end">
          <label className="block text-xs font-semibold text-muted-foreground">
            Portfolio A
            <select value={portfolioA} onChange={(event) => { setPortfolioA(event.target.value); setError(null); setResult(null); }} disabled={loadingList} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-400">
              <option value="">Elegí un portfolio</option>
              {availablePortfolios.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.assetCount} activos</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Portfolio B
            <select value={portfolioB} onChange={(event) => { setPortfolioB(event.target.value); setError(null); setResult(null); }} disabled={loadingList} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-400">
              <option value="">Elegí otro portfolio</option>
              {availablePortfolios.map((item) => <option key={item.id} value={item.id} disabled={item.id === portfolioA}>{item.name} · {item.assetCount} activos</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Período común
            <select value={period} onChange={(event) => { setPeriod(event.target.value as Period); setError(null); setResult(null); }} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-foreground/40">
              {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button onClick={() => void runComparison()} disabled={loadingList || comparing || availablePortfolios.length < 2 || !portfolioA || !portfolioB || portfolioA === portfolioB} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-bold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {comparing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            {comparing ? 'Calculando…' : 'Comparar'}
          </button>
        </div>
        {availablePortfolios.length < 2 && !loadingList && !error && <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">Se necesitan al menos dos portfolios cargados con activos.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 text-sm text-rose-300">{error}</p>}
        {comparing && (
          <div role="status" aria-live="polite" className="mt-4 flex items-start gap-3 rounded-lg border border-blue-400/20 bg-blue-400/5 p-4 text-sm text-blue-100">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            <div>
              <p className="font-semibold">Cargando precios históricos comunes y preparando los gráficos…</p>
              <p className="mt-1 text-xs text-blue-100/70">La primera consulta puede tardar unos segundos; los precios quedan guardados temporalmente para acelerar las siguientes.</p>
            </div>
          </div>
        )}
      </section>

      {!result && !comparing && !error && availablePortfolios.length >= 2 && (
        <section className="rounded-xl border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground">
          Elegí los dos portfolios, seleccioná el período y presioná <strong className="text-foreground">Comparar</strong> para cargar los gráficos y las métricas.
        </section>
      )}

      {result && portfolioAData && portfolioBData && (
        <>
          {result.available_years + 0.05 < result.requested_period_years && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
              El historial común alcanza {result.available_years.toFixed(1)} años, menos que el período elegido. Las dos carteras se comparan desde {fmtDate(result.start_date)} y los plazos sin historial suficiente aparecen como “—”.
            </div>
          )}

          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">Evolución de USD 10.000</h2>
                <p className="mt-1 text-xs text-muted-foreground">{fmtDate(result.start_date)} — {fmtDate(result.end_date)} · precios ajustados · sin rebalanceo</p>
              </div>
              <span className="text-xs text-muted-foreground">Las líneas comienzan en el mismo saldo y fecha.</span>
            </div>
            <ReactECharts echarts={echarts} option={balanceOption} notMerge style={{ height: 340, width: '100%' }} />
          </section>

          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-6">
            <h2 className="text-lg font-bold text-foreground">Caídas desde máximos</h2>
            <p className="mt-1 text-xs text-muted-foreground">Drawdown diario del período seleccionado, incluyendo SPY.</p>
            <ReactECharts echarts={echarts} option={drawdownOption} notMerge style={{ height: 300, width: '100%' }} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card/70">
            <div className="border-b border-border p-4 md:p-6">
              <h2 className="text-lg font-bold text-foreground">Comparación de métricas</h2>
              <p className="mt-1 text-xs text-muted-foreground">Las métricas generales corresponden al período elegido. El exceso vs SPY es una diferencia de rendimiento en puntos porcentuales, no un alpha ajustado por riesgo.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Métrica</th>
                    <th className="px-4 py-3 text-right font-semibold text-blue-300">{portfolioAData.name}</th>
                    <th className="px-4 py-3 text-right font-semibold text-amber-300">{portfolioBData.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {metricRows.map((row) => <tr key={row.label} className="border-t border-border/70 hover:bg-secondary/20">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{row.label}</th>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">{row.a}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">{row.b}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <p className="px-4 pb-4 text-[11px] text-muted-foreground">* Año parcial. Sharpe y Sortino usan 4% anual como tasa mínima de referencia. RSI calculado sobre el valor diario de cada cartera (14 períodos).</p>
          </section>

          <section className="rounded-2xl border border-border bg-card/70 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">Composición y efecto de mantenerla</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {compositionMode === 'assets'
                    ? 'Cada cartera muestra su propio peso inicial, su peso final y la deriva relativa; no se rebalancea.'
                    : 'Comparación sectorial del peso objetivo y del peso final tras mantener cada cartera.'}
                </p>
              </div>
              <div className="flex rounded-lg border border-border bg-background p-1">
                <button onClick={() => setCompositionMode('assets')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${compositionMode === 'assets' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Activos</button>
                <button onClick={() => setCompositionMode('sectors')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${compositionMode === 'sectors' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Sectores</button>
              </div>
            </div>
            {compositionMode === 'assets' ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {result.portfolios.map((portfolio, portfolioIndex) => {
                  const accentText = portfolioIndex === 0 ? 'text-blue-300' : 'text-amber-300';
                  const assets = [...portfolio.asset_composition].sort((a, b) =>
                    Math.abs(b.end_weight_pct - b.target_weight_pct) - Math.abs(a.end_weight_pct - a.target_weight_pct)
                  );
                  return (
                    <div key={portfolio.id} className="overflow-hidden rounded-xl border border-border bg-background/30">
                      <div className="border-b border-border px-4 py-3">
                        <h3 className={`text-sm font-bold ${accentText}`}>{portfolio.name}</h3>
                        <p className="mt-1 text-[11px] text-muted-foreground">Activos de esta cartera, ordenados por mayor cambio en puntos de peso.</p>
                      </div>
                      <div className="max-h-[460px] overflow-y-auto">
                        <table className="w-full table-fixed text-xs">
                          <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="w-[24%] px-3 py-2.5 text-left">Activo</th>
                              <th className="w-[43%] px-2 py-2.5 text-right">Objetivo → final</th>
                              <th className="w-[33%] px-3 py-2.5 text-right">Deriva</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assets.map((asset) => {
                              const changePp = Math.round((asset.end_weight_pct - asset.target_weight_pct) * 100) / 100;
                              const relativeChange = asset.target_weight_pct > 0
                                ? (changePp / asset.target_weight_pct) * 100
                                : 0;
                              const neutral = Math.abs(changePp) < 0.005;
                              const changeColor = neutral ? 'text-muted-foreground' : changePp > 0 ? 'text-emerald-300' : 'text-rose-300';
                              return (
                                <tr key={asset.ticker} className="border-t border-border/70">
                                  <th className="px-3 py-2.5 text-left align-top font-semibold text-foreground">
                                    {asset.ticker}
                                    <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">{asset.sector_name}</span>
                                  </th>
                                  <td className="px-2 py-2.5 text-right align-top font-mono tabular-nums text-foreground">
                                    {asset.target_weight_pct.toFixed(2)}% <span className="text-muted-foreground">→</span> {asset.end_weight_pct.toFixed(2)}%
                                  </td>
                                  <td className={`px-3 py-2.5 text-right align-top font-mono tabular-nums ${changeColor}`}>
                                    <span className="block font-semibold">{neutral ? '0.0%' : `${relativeChange > 0 ? '+' : ''}${relativeChange.toFixed(1)}%`}</span>
                                    <span className="block text-[10px]">{neutral ? '0.00 p.p.' : `${changePp > 0 ? '+' : ''}${changePp.toFixed(2)} p.p.`}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground xl:col-span-2">
                  Deriva relativa = (peso final ÷ peso objetivo − 1) × 100. Por ejemplo, 10% → 7,5% equivale a −25% (−2,5 p.p.); no implica que se haya vendido el activo.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full table-fixed text-xs">
                    <thead className="bg-secondary/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-[34%] px-3 py-2.5 text-left">Sector</th>
                        <th className="w-[33%] px-2 py-2.5 text-right text-blue-300">{portfolioAData.name}<span className="block font-normal">objetivo → final</span></th>
                        <th className="w-[33%] px-2 py-2.5 text-right text-amber-300">{portfolioBData.name}<span className="block font-normal">objetivo → final</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {composition.map((row) => <tr key={row.key} className="border-t border-border/70">
                        <th className="px-3 py-2.5 text-left font-medium text-foreground">{row.label}</th>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-blue-100">{row.targetA === null ? '—' : `${row.targetA.toFixed(1)}% → ${row.endA?.toFixed(1)}%`}</td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-amber-100">{row.targetB === null ? '—' : `${row.targetB.toFixed(1)}% → ${row.endB?.toFixed(1)}%`}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
                <div className="min-h-[300px] rounded-xl border border-border bg-background/40 p-2">
                  <p className="px-2 pt-1 text-xs font-semibold text-muted-foreground">Peso sectorial final · comparación entre portfolios</p>
                  <ReactECharts echarts={echarts} option={compositionOption} notMerge style={{ height: 290, width: '100%' }} />
                </div>
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-muted-foreground">Período común hasta {fmtDate(result.end_date)} · rendimiento histórico hipotético; no incluye impuestos, comisiones ni aportes/retiros.</p>
        </>
      )}
    </div>
  );
};
