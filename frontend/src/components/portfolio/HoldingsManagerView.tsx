import React, { useState, useEffect, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { cachedFetch, getCachedData, invalidateCache } from '@/lib/queryCache';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useChartTheme } from '@/hooks/useChartTheme';
import { Plus, Upload, Trash2, AlertTriangle, Save, Download, Layers, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { CreatePortfolioModal } from './CreatePortfolioModal';
import { SECTOR_COLOR_MAP } from './PortfolioCharts';

// Tree-shaking riguroso + resolución segura CommonJS/ESM (patrón canónico del proyecto)
echarts.use([TreemapChart, TooltipComponent, SVGRenderer]);
const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

interface RealHolding {
  nominals: number;
  ppc: number;
}

interface HoldingRow {
  ticker: string;
  relWeight: number;
  baseNominals: number;
  ppc: number;
  fv: number;
  // Datos enriquecidos
  sector: string;
  sectorId: string;
  price: number;
  currency: string;
  marketValue: number;
  cost: number;
  pnl: number;
  pnlPct: number | null;
  rsi: number | null;
  // Objetivo derivado (cartera base MCM × multiplicador)
  targetNominals: number;
  faltante: number;
  avancePct: number | null;
}

type ChartMode = 'modelo' | 'real';

interface Kpi {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative';
  icon?: React.ReactNode;
}

/** Paleta por macro-sector: contrato compartido con PortfolioCharts (SECTOR_COLOR_MAP) */
const sectorPalette = (sectorId: string) => SECTOR_COLOR_MAP[sectorId] || SECTOR_COLOR_MAP.other;

/** Escapa datos externos antes de interpolarlos en el HTML de los tooltips */
const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtMoney = (n: number, currency = '') => {
  const formatted = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `$${formatted} ${currency}` : `$${formatted}`;
};
const fmtPct = (n: number, digits = 1) =>
  `${n.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function HoldingsManagerView() {
  const openTickerDrawer = useAppStore((s) => s.openTickerDrawer);
  const chartTheme = useChartTheme();
  const [portfolios, setPortfolios] = useState<Record<string, any>>(() => {
    const cached = getCachedData<any>('portfolios-list');
    return cached?.portfolios || {};
  });
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [realHoldings, setRealHoldings] = useState<Record<string, RealHolding>>({});
  const [cashArs, setCashArs] = useState<number>(0);
  const [selectedPf, setSelectedPf] = useState<string>(() => {
    const cached = getCachedData<any>('portfolios-list');
    return cached?.selected_pf || Object.keys(cached?.portfolios || {})[0] || '';
  });
  const [loading, setLoading] = useState(() => {
    return !getCachedData('portfolios-list');
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [mcmBaseNominals, setMcmBaseNominals] = useState<Record<string, number>>({});
  const [mcmMultiplier, setMcmMultiplier] = useState<number>(1);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('modelo');

  // Fetch portfolios + quotes (deduplicado con cache)
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [{ data: pfData }, { data: qData }] = await Promise.all([
          cachedFetch<any>(
            'portfolios-list',
            async () => {
              const res = await fetch('/api/portfolios/list_json');
              if (!res.ok) throw new Error('Error al cargar lista de portfolios');
              return res.json();
            },
            120 * 1000
          ),
          cachedFetch<any>(
            'cedears-quotes-default',
            async () => {
              const res = await fetch('/api/cedears/quotes_json');
              if (!res.ok) throw new Error('Error al cargar cotizaciones');
              return res.json();
            },
            60 * 1000
          )
        ]);
        if (!isMounted) return;

        setPortfolios(pfData.portfolios || {});
        if (pfData.selected_pf && !selectedPf) {
          setSelectedPf(pfData.selected_pf);
        } else if (Object.keys(pfData.portfolios || {}).length > 0 && !selectedPf) {
          setSelectedPf(Object.keys(pfData.portfolios)[0]);
        }

        const qMap: Record<string, any> = {};
        (qData.quotes || []).forEach((q: any) => {
          qMap[q.symbol] = q;
        });
        setQuotes(qMap);
      } catch (e) {
        console.error("Error fetching portfolios", e);
        if (isMounted) setLoadError('No se pudieron cargar los portafolios y cotizaciones.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [retryTick]);

  // Fetch tenencias reales (nominales/PPC/efectivo) del portafolio activo
  useEffect(() => {
    if (!selectedPf) return;
    let isMounted = true;
    const fetchHoldings = async () => {
      try {
        const { data } = await cachedFetch<any>(
          `rotation-holdings:${selectedPf}`,
          async () => {
            const res = await fetch(`/api/rotation/holdings?portfolio=${encodeURIComponent(selectedPf)}`);
            if (!res.ok) throw new Error('Error al cargar tenencias reales');
            return res.json();
          },
          60 * 1000
        );
        if (!isMounted || !data) return;
        const map: Record<string, RealHolding> = {};
        Object.entries(data.holdings || {}).forEach(([tk, v]: [string, any]) => {
          map[tk] = { nominals: Number(v?.nominals) || 0, ppc: Number(v?.ppc) || 0 };
        });
        setRealHoldings(map);
        setCashArs(Number(data.cash_ars) || 0);
      } catch (e) {
        console.error('Error fetching tenencias reales', e);
        if (isMounted) {
          setRealHoldings({});
          setCashArs(0);
          setLoadError('No se pudieron cargar las tenencias reales.');
        }
      }
    };
    fetchHoldings();
    return () => { isMounted = false; };
  }, [selectedPf, retryTick]);

  // Cartera base mínima (MCM ×1): de acá se derivan los nominales objetivo
  useEffect(() => {
    if (!selectedPf) return;
    let isMounted = true;
    const fetchMcm = async () => {
      try {
        const { data } = await cachedFetch<any>(
          `portfolio-mcm:${selectedPf}`,
          async () => {
            const res = await fetch(`/api/portfolios/rebalance_json/${encodeURIComponent(selectedPf)}`);
            if (!res.ok) throw new Error('Error al calcular la cartera base MCM');
            return res.json();
          },
          120 * 1000
        );
        if (!isMounted || !data) return;
        setMcmBaseNominals(data.mcm_info?.base_nominals || {});
      } catch (e) {
        console.error('Error fetching cartera base MCM', e);
        if (isMounted) setMcmBaseNominals({});
      }
    };
    fetchMcm();
    return () => { isMounted = false; };
  }, [selectedPf, retryTick]);

  // Multiplicador MCM por cartera (preferencia local del usuario: ×1, ×2, ×3...)
  useEffect(() => {
    if (!selectedPf) return;
    const raw = localStorage.getItem(`finapp_mcm_multiplier:${selectedPf}`);
    const parsed = raw ? Number(raw) : 1;
    setMcmMultiplier(Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1);
  }, [selectedPf]);

  const handleMultiplierChange = (value: number) => {
    const n = Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
    setMcmMultiplier(n);
    if (selectedPf) localStorage.setItem(`finapp_mcm_multiplier:${selectedPf}`, String(n));
  };

  // ---- Filas unificadas: modelo (pesos) + tenencias reales (nominales/PPC) ----
  const holdings: HoldingRow[] = useMemo(() => {
    if (!selectedPf || !portfolios[selectedPf]) return [];
    const pfAssets: Record<string, number> = portfolios[selectedPf].assets || {};
    const tickers = new Set<string>([...Object.keys(pfAssets), ...Object.keys(realHoldings)]);

    const rows: HoldingRow[] = [];
    tickers.forEach((ticker) => {
      const q = quotes[ticker] || {};
      const real = realHoldings[ticker] || { nominals: 0, ppc: 0 };
      const hasLocal = q.local !== null && q.local !== undefined;
      const price = Number(hasLocal ? q.local : q.cedear_usd) || 0;
      const marketValue = real.nominals * price;
      const cost = real.nominals * real.ppc;
      const pnl = marketValue - cost;

      const targetNominals = Math.round((mcmBaseNominals[ticker] || 0) * mcmMultiplier);

      rows.push({
        ticker,
        relWeight: Number(pfAssets[ticker] ?? 0),
        baseNominals: real.nominals,
        ppc: real.ppc,
        fv: q.gf_value ?? 0,
        sector: q.sector_name || (q.is_etf ? 'ETFs' : 'Otros Activos'),
        sectorId: q.sector_id || (q.is_etf ? 'etfs' : 'other'),
        price,
        currency: price > 0 ? (hasLocal ? 'ARS' : 'USD') : '',
        marketValue,
        cost,
        pnl,
        pnlPct: cost > 0 ? (pnl / cost) * 100 : null,
        rsi: q.rsi ?? null,
        targetNominals,
        faltante: Math.max(0, targetNominals - real.nominals),
        avancePct: targetNominals > 0 ? Math.min(100, (real.nominals / targetNominals) * 100) : null
      });
    });

    return rows.sort((a, b) => b.marketValue - a.marketValue || b.relWeight - a.relWeight);
  }, [selectedPf, portfolios, quotes, realHoldings, mcmBaseNominals, mcmMultiplier]);

  // ---- Composición jerárquica sector → ticker (según el modo activo) ----
  const composition = useMemo(() => {
    const valueOf = (h: HoldingRow) => (chartMode === 'real' ? h.marketValue : h.relWeight);
    const active = holdings.filter((h) => valueOf(h) > 0);
    const total = active.reduce((s, h) => s + valueOf(h), 0);

    const groups = new Map<string, { name: string; total: number; items: HoldingRow[] }>();
    active.forEach((h) => {
      const key = h.sectorId || 'other';
      const g = groups.get(key) || { name: h.sector, total: 0, items: [] };
      g.total += valueOf(h);
      g.items.push(h);
      groups.set(key, g);
    });

    const sectors = [...groups.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([sectorId, g]) => {
        const palette = sectorPalette(sectorId);
        return {
          sectorId,
          name: g.name,
          color: palette.base,
          total: g.total,
          pct: total > 0 ? (g.total / total) * 100 : 0,
          items: [...g.items]
            .sort((a, b) => valueOf(b) - valueOf(a))
            .map((h, idx) => ({
              row: h,
              value: valueOf(h),
              pct: total > 0 ? (valueOf(h) / total) * 100 : 0,
              sectorPct: g.total > 0 ? (valueOf(h) / g.total) * 100 : 0,
              shade: palette.shades[idx % palette.shades.length]
            }))
        };
      });

    const currencies = new Set(active.map((h) => h.currency).filter(Boolean));
    return {
      active,
      total,
      sectors,
      currency: currencies.size === 1 ? [...currencies][0] : '',
      mixedCurrency: currencies.size > 1
    };
  }, [holdings, chartMode]);

  // ---- KPIs del panel de análisis ----
  const kpis: Kpi[] = useMemo(() => {
    // Foco de la vista: avance hacia la cartera objetivo (pesos → nominales MCM × N)
    const objetivoRows = holdings.filter((h) => h.targetNominals > 0);
    const objetivoValue = objetivoRows.reduce((s, h) => s + h.targetNominals * h.price, 0);
    const cumplidoValue = objetivoRows.reduce((s, h) => s + Math.min(h.baseNominals, h.targetNominals) * h.price, 0);
    const avanceGlobal = objetivoValue > 0 ? Math.min(100, (cumplidoValue / objetivoValue) * 100) : null;
    const faltanteNominales = objetivoRows.reduce((s, h) => s + h.faltante, 0);
    const faltanteValue = objetivoRows.reduce((s, h) => s + h.faltante * h.price, 0);
    const faltanteCur = objetivoRows.find((h) => h.currency)?.currency || 'ARS';

    // P&L por moneda (nunca se suman monedas distintas en un único total)
    const byCur = new Map<string, { market: number; cost: number }>();
    holdings
      .filter((h) => h.marketValue > 0 || h.cost > 0)
      .forEach((h) => {
        const key = h.currency || 'ARS';
        const e = byCur.get(key) || { market: 0, cost: 0 };
        e.market += h.marketValue;
        e.cost += h.cost;
        byCur.set(key, e);
      });

    const result: Kpi[] = [
      {
        label: 'Avance del objetivo',
        value: avanceGlobal !== null ? fmtPct(avanceGlobal) : '—',
        sub: `Cartera base MCM ×${mcmMultiplier}`,
        icon: <Layers className="w-3 h-3" />
      },
      {
        label: 'Faltante',
        value: faltanteNominales > 0 ? fmtMoney(faltanteValue, faltanteCur) : 'Objetivo cumplido',
        sub: faltanteNominales > 0 ? `${faltanteNominales.toLocaleString('es-AR')} nominales por comprar` : 'Sin nominales pendientes',
        icon: <TrendingDown className="w-3 h-3" />
      }
    ];

    if (byCur.size === 0) {
      result.push({ label: 'P&L total', value: '—', sub: 'Sin posiciones informadas' });
    } else {
      [...byCur.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([cur, e]) => {
          const pnl = e.market - e.cost;
          result.push({
            label: byCur.size > 1 ? `P&L ${cur}` : 'P&L total',
            value: `${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, cur)}`,
            sub: e.cost > 0 ? `${pnl >= 0 ? '+' : ''}${fmtPct((pnl / e.cost) * 100)}` : 'Sin costo base',
            tone: pnl >= 0 ? 'positive' : 'negative',
            icon: pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />
          });
        });
    }

    result.push({
      label: 'Efectivo',
      value: fmtMoney(cashArs, 'ARS'),
      sub: `${holdings.filter((h) => h.baseNominals > 0).length} posiciones informadas`,
      icon: <Wallet className="w-3 h-3" />
    });

    return result;
  }, [holdings, mcmMultiplier, cashArs]);

  // ---- Tooltip enriquecido del sunburst ----
  const buildTooltip = (meta: any): string => {
    if (!meta) return '';
    const row: (name: string, value: string) => string = (n, v) =>
      `<div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.75">${n}</span><span>${v}</span></div>`;

    if (meta.kind === 'sector') {
      return [
        `<div style="font-weight:700;margin-bottom:4px">${escapeHtml(meta.name)}</div>`,
        row('Valor', fmtMoney(meta.value, composition.mixedCurrency ? '' : composition.currency)),
        row('Peso', fmtPct(meta.pct)),
        row('Activos', String(meta.count))
      ].join('');
    }

    const h: HoldingRow = meta.row;
    const head = `<div style="font-weight:700;margin-bottom:4px">${escapeHtml(h.ticker)} <span style="font-weight:400;opacity:.7">· ${escapeHtml(h.sector)}</span></div>`;
    const common = [row('Precio', h.price > 0 ? fmtMoney(h.price, h.currency) : '—')];
    if (h.targetNominals > 0) {
      common.push(row('Nom. objetivo', `${h.targetNominals.toLocaleString('es-AR')} (MCM ×${mcmMultiplier})`));
      common.push(row('Faltante', h.faltante > 0 ? `${h.faltante.toLocaleString('es-AR')} nom.` : 'Objetivo cumplido'));
    }

    if (chartMode === 'real') {
      return [
        head,
        ...common,
        row('Nominales', h.baseNominals.toLocaleString('es-AR')),
        row('PPC', h.ppc > 0 ? fmtMoney(h.ppc, h.currency) : '—'),
        row('Costo', fmtMoney(h.cost, h.currency)),
        row('Valor', fmtMoney(h.marketValue, h.currency)),
        row('P&L', `${h.pnl >= 0 ? '+' : ''}${fmtMoney(h.pnl, h.currency)}${h.pnlPct !== null ? ` (${h.pnl >= 0 ? '+' : ''}${fmtPct(h.pnlPct)})` : ''}`),
        row('Peso cartera', fmtPct(meta.pct)),
        row('Peso sector', fmtPct(meta.sectorPct))
      ].join('');
    }

    return [
      head,
      row('Peso objetivo', fmtPct(h.relWeight, 2)),
      row('Peso en sector', fmtPct(meta.sectorPct)),
      ...common,
      ...(h.rsi !== null ? [row('RSI', h.rsi.toFixed(1))] : []),
      ...(h.fv ? [row('Fair Value', fmtMoney(h.fv, 'USD'))] : [])
    ].join('');
  };

  // ---- Opción ECharts: sunburst sector → ticker ----
  const chartOption = useMemo(() => {
    if (composition.total <= 0) return null;

    const data = composition.sectors.map((s) => ({
      name: s.name,
      value: round2(s.total),
      itemStyle: { color: s.color },
      meta: { kind: 'sector', name: s.name, value: s.total, pct: s.pct, count: s.items.length },
      children: s.items.map((it) => ({
        name: it.row.ticker,
        value: round2(it.value),
        itemStyle: { color: it.shade },
        meta: { kind: 'ticker', row: it.row, value: it.value, pct: it.pct, sectorPct: it.sectorPct }
      }))
    }));

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        borderRadius: 8,
        formatter: (params: any) => buildTooltip(params.data?.meta)
      },
      series: [
        {
          type: 'treemap',
          data,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: '{b}',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowBlur: 3
          },
          itemStyle: {
            borderColor: chartTheme.cardBorder,
            borderWidth: 2,
            gapWidth: 1
          },
          levels: [
            {
              itemStyle: { borderWidth: 0, gapWidth: 2 }
            },
            {
              itemStyle: { borderWidth: 2, gapWidth: 1, borderColor: chartTheme.cardBorder },
              upperLabel: {
                show: true,
                height: 24,
                color: chartTheme.textPrimary,
                fontWeight: 'bold',
                fontSize: 11,
                backgroundColor: 'transparent'
              }
            },
            {
              itemStyle: { borderWidth: 1, gapWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
            }
          ]
        }
      ]
    };
  }, [composition, chartTheme]);

  const handleChartClick = (params: any) => {
    const meta = params?.data?.meta;
    if (meta?.kind === 'ticker' && meta.row) {
      const h: HoldingRow = meta.row;
      openTickerDrawer(h.ticker, {
        symbol: h.ticker,
        price: h.price,
        local: h.price,
        rsi: h.rsi,
        ppc: h.ppc || null,
        gf_value: h.fv || null
      });
    }
  };

  // Compute table draft state
  const [draftHoldings, setDraftHoldings] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const newDraft: Record<string, any> = {};
    holdings.forEach((h: any) => {
      newDraft[h.ticker] = { ...h };
    });
    setDraftHoldings(newDraft);
  }, [holdings]);

  const handleFieldChange = (ticker: string, field: string, value: string) => {
    setDraftHoldings(prev => ({
      ...prev,
      [ticker]: {
        ...prev[ticker],
        [field]: Number(value)
      }
    }));
  };

  const handleRemoveAsset = (tickerToRemove: string) => {
    setDraftHoldings(prev => {
      const updated = { ...prev };
      delete updated[tickerToRemove];
      return updated;
    });
  };

  const handleSaveHoldings = async () => {
    if (!selectedPf) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const remainingHoldings = Object.values(draftHoldings);
      const weightsStr = remainingHoldings
        .filter(h => h.relWeight > 0)
        .map(h => `${h.ticker}:${h.relWeight}`)
        .join(', ');

      // 1. Pesos objetivo: endpoint de actualización (create_json solo crea y devuelve 409)
      const weightsRes = await fetch(`/api/portfolios/weights_json/${encodeURIComponent(selectedPf)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights_str: weightsStr, mode: 'weights' })
      });
      if (!weightsRes.ok) {
        const body = await weightsRes.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudieron guardar los pesos objetivo.');
      }

      // 2. Tenencias reales (nominales + PPC). Omitir ppc cuando no se informó.
      const realHoldingsPayload: Record<string, any> = {};
      remainingHoldings.forEach(h => {
        if (h.baseNominals > 0 || h.ppc > 0) {
          realHoldingsPayload[h.ticker] = { nominals: h.baseNominals, ...(h.ppc > 0 ? { ppc: h.ppc } : {}) };
        }
      });
      const holdingsRes = await fetch('/api/rotation/holdings/bulk_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: selectedPf, holdings: realHoldingsPayload })
      });
      if (!holdingsRes.ok) {
        const body = await holdingsRes.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudieron guardar las tenencias reales.');
      }

      // 3. Fair Values (lote único, sin N+1)
      const bulkItems = remainingHoldings
        .filter(h => h.fv !== undefined && h.fv !== null)
        .map(h => ({ ticker: h.ticker, gf_value: h.fv }));

      if (bulkItems.length > 0) {
        const fvRes = await fetch('/api/portfolios/bulk_quick_update_json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: bulkItems })
        });
        if (!fvRes.ok) {
          const body = await fvRes.json().catch(() => ({}));
          throw new Error(body.error || 'No se pudieron guardar los Fair Values.');
        }
      }

      // Refresco sin recargar la página: invalidar caches + re-fetch
      invalidateCache('portfolios-list');
      invalidateCache('cedears-quotes-default');
      invalidateCache(`portfolio-rebalance:${selectedPf}`);
      invalidateCache(`rotation-holdings:${selectedPf}`);
      invalidateCache(`portfolio-mcm:${selectedPf}`);
      setDraftHoldings({});
      setFeedback({ kind: 'success', msg: 'Cambios guardados. Los nominales objetivo se recalcularon con los precios actuales.' });
      setRetryTick((t) => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar cambios.';
      console.error(err);
      setFeedback({ kind: 'error', msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJSON = () => {
    if (!selectedPf || !portfolios[selectedPf]) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(portfolios[selectedPf], null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${selectedPf}.json`);
    dlAnchorElem.click();
  };

  const pfNames = Object.keys(portfolios);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando portafolios...</div>;
  }

  const inputClasses = "w-full min-w-[64px] max-w-[86px] text-right bg-secondary/50 border border-border/50 rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-negative/10 border border-negative/30 text-negative px-4 py-3 rounded-2xl text-sm">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => { setLoadError(null); setRetryTick((t) => t + 1); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-negative text-white hover:bg-negative/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Reintentar
          </button>
        </div>
      )}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-sm border',
            feedback.kind === 'success'
              ? 'bg-positive/10 border-positive/30 text-positive'
              : 'bg-negative/10 border-negative/30 text-negative'
          )}
        >
          <span>{feedback.msg}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Descartar mensaje"
            className="px-2 py-1 rounded-md text-xs font-bold hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>
      )}
      {/* HEADER: Portfolios Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card border border-border p-5 rounded-2xl">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
              Cartera Objetivo
            </label>
            <div className="flex items-center gap-1 bg-secondary p-1 rounded-lg border border-border" role="group" aria-label="Multiplicador de la cartera base MCM">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleMultiplierChange(n)}
                  aria-pressed={mcmMultiplier === n}
                  className={cn(
                    'px-2.5 py-1 min-h-8 rounded-md text-[11px] font-bold font-mono transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    mcmMultiplier === n ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  ×{n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                aria-label="Multiplicador personalizado de la cartera base"
                value={mcmMultiplier}
                onChange={(e) => handleMultiplierChange(Number(e.target.value))}
                className="w-14 bg-background border border-border rounded-md px-2 py-1 min-h-8 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Nominales objetivo = cartera base MCM ×{mcmMultiplier}
            </p>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
              Portafolio Activo
            </label>
            <div className="flex items-center gap-2">
              <Dropdown
                value={selectedPf}
                options={pfNames.length > 0 ? pfNames : ['Sin carteras']}
                onChange={(v) => setSelectedPf(v)}
                title="Portafolio"
                minWidth="12rem"
                disabled={pfNames.length === 0}
              />
              <button 
                type="button"
                title="Crear Portafolio"
                aria-label="Crear Portafolio"
                onClick={() => setShowCreateModal(true)}
                className="p-2 min-h-9 min-w-9 flex items-center justify-center bg-secondary hover:bg-border rounded-lg transition-colors border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 min-h-9 bg-secondary hover:bg-border rounded-lg text-sm font-medium transition-colors border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Upload className="w-4 h-4" /> Importar
          </button>
          <button 
            type="button"
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2 min-h-9 bg-secondary hover:bg-border rounded-lg text-sm font-medium transition-colors border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button 
            type="button"
            onClick={handleSaveHoldings}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 min-h-9 bg-accent hover:bg-accent/80 text-accent-foreground rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Save className="w-4 h-4" /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <div className="w-px h-8 bg-border mx-1"></div>
          <button 
            type="button"
            onClick={() => setShowDeleteAlert(true)}
            className="flex items-center gap-2 px-4 py-2 min-h-9 bg-negative/10 hover:bg-negative/20 text-negative rounded-lg text-sm font-medium transition-colors border border-negative/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* LEFT COLUMN: Data Table */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-secondary/30 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-foreground">Activos del Portafolio</h3>
                <p className="text-xs text-muted-foreground mt-1">Configura pesos relativos, nominales y valores de compra.</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Ticker</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Peso Obj (%)</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Nom. Objetivo</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Tenencia</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">PPC</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Avance</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Fair Value</th>
                    <th scope="col" className="px-4 py-3 font-medium text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {holdings.filter((asset: any) => draftHoldings[asset.ticker] !== undefined).map((asset: any) => (
                    <tr key={asset.ticker} className="hover:bg-secondary/30 transition-colors group border-b border-border/50 last:border-0">
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center h-full min-h-[40px]">
                          <button
                            type="button"
                            onClick={() => openTickerDrawer(asset.ticker, { symbol: asset.ticker, price: asset.price, local: asset.price, rsi: asset.rsi })}
                            title={`Abrir ficha de ${asset.ticker}`}
                            className="font-bold text-foreground hover:text-accent hover:underline underline-offset-4 transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {asset.ticker}
                          </button>
                          <span className="ml-2 text-[10px] text-muted-foreground truncate max-w-[110px]" title={asset.sector}>
                            {asset.sector}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" aria-label={`Peso relativo de ${asset.ticker}`} value={draftHoldings[asset.ticker]?.relWeight ?? asset.relWeight} onChange={e => handleFieldChange(asset.ticker, "relWeight", e.target.value)} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col items-end justify-center h-full min-h-[40px]">
                          <span className="text-xs font-mono text-foreground">
                            {asset.targetNominals > 0 ? asset.targetNominals.toLocaleString('es-AR') : '—'}
                          </span>
                          {asset.targetNominals > 0 && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {fmtMoney(asset.targetNominals * asset.price, asset.currency)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" aria-label={`Nominales de ${asset.ticker}`} value={draftHoldings[asset.ticker]?.baseNominals ?? asset.baseNominals} onChange={e => handleFieldChange(asset.ticker, "baseNominals", e.target.value)} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" aria-label={`PPC de ${asset.ticker}`} value={draftHoldings[asset.ticker]?.ppc ?? asset.ppc} onChange={e => handleFieldChange(asset.ticker, "ppc", e.target.value)} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col items-end justify-center h-full min-h-[40px]">
                          {asset.targetNominals > 0 ? (
                            <>
                              <div className="w-full max-w-[110px] h-1.5 bg-secondary rounded-full overflow-hidden" role="img" aria-label={`Avance de ${asset.ticker}: ${Math.round(asset.avancePct ?? 0)}%`}>
                                <div
                                  className={cn('h-full rounded-full', (asset.avancePct ?? 0) >= 100 ? 'bg-positive' : (asset.avancePct ?? 0) > 0 ? 'bg-accent' : 'bg-negative/60')}
                                  style={{ width: `${asset.avancePct ?? 0}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {fmtPct(asset.avancePct ?? 0, 0)}{asset.faltante > 0 ? ` · faltan ${asset.faltante}` : ' · completo'}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-mono text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" aria-label={`Fair Value de ${asset.ticker}`} value={draftHoldings[asset.ticker]?.fv ?? asset.fv} onChange={e => handleFieldChange(asset.ticker, "fv", e.target.value)} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-center h-full min-h-[40px]">
                          <button 
                            type="button"
                            onClick={() => handleRemoveAsset(asset.ticker)}
                            title={`Eliminar ${asset.ticker} del portafolio`}
                            className="p-2 min-h-9 min-w-9 items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative/10 rounded transition-colors inline-flex cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                             <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Visual Analytics */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Composición del Portafolio</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Treemap agrupado por sectores. Tamaño = {chartMode === 'real' ? 'valor de mercado' : 'peso objetivo'}.
                </p>
              </div>
              <div role="group" aria-label="Modo de composición" className="flex items-center gap-1 bg-secondary p-1 rounded-lg border border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setChartMode('modelo')}
                  aria-pressed={chartMode === 'modelo'}
                  className={cn(
                    'px-3 py-1.5 min-h-8 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    chartMode === 'modelo' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >Pesos Objetivo</button>
                <button
                  type="button"
                  onClick={() => setChartMode('real')}
                  aria-pressed={chartMode === 'real'}
                  className={cn(
                    'px-3 py-1.5 min-h-8 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    chartMode === 'real' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >Tenencia Real</button>
              </div>
            </div>

            <div className="mt-4 flex flex-col lg:flex-row gap-6">
            {/* Chart */}
            <div className="flex-1 min-w-0">
              <div className="h-[420px] lg:h-[520px] relative">
                {chartOption ? (
                  <ReactECharts
                    echarts={echarts}
                    option={chartOption}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'svg' }}
                    notMerge
                    onEvents={{ click: handleChartClick }}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2 px-4">
                    <Layers className="w-6 h-6 opacity-50" />
                    <p className="text-xs">
                      {chartMode === 'real'
                        ? 'Todavía no informaste tenencias. Cargá los nominales que poseés para ver el avance y el valor de mercado.'
                        : 'Este portafolio no tiene activos con peso objetivo.'}
                    </p>
                  </div>
                )}
              </div>

              {composition.active.length > 0 && (
                <div className="mt-4 border-t border-border pt-3" aria-label="Detalle de activos de la composición">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
                    Todos los activos · {chartMode === 'real' ? 'valor de mercado' : 'peso objetivo'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {composition.sectors
                      .flatMap((sector) => sector.items)
                      .sort((a, b) => b.pct - a.pct)
                      .map((item) => (
                      <button
                        key={item.row.ticker}
                        type="button"
                        onClick={() => handleChartClick({ data: { meta: { kind: 'ticker', row: item.row } } })}
                        title={`Abrir ficha de ${item.row.ticker}`}
                        className="min-w-0 flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <span className="min-w-0 truncate font-bold text-xs text-foreground">{item.row.ticker}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{item.row.sector}</span>
                        <span className="shrink-0 font-mono text-xs text-foreground">{fmtPct(item.pct, 1)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Panel lateral: KPIs + leyenda */}
            <div className="w-full lg:w-[300px] shrink-0 flex flex-col gap-4">
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                {kpis.map((k) => (
                  <div key={k.label} className="bg-secondary/40 border border-border/60 rounded-lg px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
                      {k.icon}
                      {k.label}
                    </div>
                    <div className={cn(
                      'text-sm font-bold font-mono truncate',
                      k.tone === 'positive' ? 'text-positive' : k.tone === 'negative' ? 'text-negative' : 'text-foreground'
                    )}>
                      {k.value}
                    </div>
                    {k.sub && <div className="text-[10px] text-muted-foreground truncate">{k.sub}</div>}
                  </div>
                ))}
              </div>

              {composition.sectors.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
                    {composition.sectors.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }}></span>
                        <span className="text-foreground font-medium truncate" title={s.name}>{s.name}</span>
                        <span className="font-mono ml-auto">{fmtPct(s.pct)}</span>
                        <span className="opacity-60">({s.items.length})</span>
                      </div>
                    ))}
                  </div>
                  {composition.mixedCurrency && (
                    <p className="text-[10px] text-muted-foreground mt-2 opacity-80">
                      * Valores en monedas mixtas (ARS/USD); los KPIs se muestran separados por moneda.
                    </p>
                  )}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

      </div>

      <CreatePortfolioModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          setFeedback({ kind: 'success', msg: 'Portafolio creado.' });
          invalidateCache('portfolios-list');
          setRetryTick((t) => t + 1);
        }}
      />

      {/* Delete Alert Modal */}
      {showDeleteAlert && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Confirmar eliminación de portafolio" className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-negative/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-negative" />
              </div>
              <h3 className="text-lg font-bold text-foreground">¿Mover a papelera?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Estás a punto de enviar el portafolio <strong>{selectedPf}</strong> a la papelera (capacidad: 7 últimos).
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowDeleteAlert(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/portfolios/delete_json/${encodeURIComponent(selectedPf)}`, { method: 'DELETE' });
                    if (res.ok) {
                      setShowDeleteAlert(false);
                      setSelectedPf('');
                      setFeedback({ kind: 'success', msg: `Portafolio ${selectedPf} enviado a la papelera.` });
                      invalidateCache('portfolios-list');
                      setRetryTick((t) => t + 1);
                    } else {
                      setFeedback({ kind: 'error', msg: 'El backend rechazó el borrado del portafolio.' });
                    }
                  } catch (err) {
                    console.error(err);
                    setFeedback({ kind: 'error', msg: 'Error de red al borrar el portafolio.' });
                  }
                }}
                className="px-4 py-2 bg-negative text-white rounded-lg text-sm font-bold hover:bg-negative/80 transition-colors"
              >
                Sí, enviar a Papelera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Importar portafolio via JSON" className="bg-card border border-border rounded-2xl p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-lg font-bold text-foreground mb-2">Importar Portafolio via JSON</h3>
            <textarea 
              id="import-json-textarea"
              className="w-full h-32 bg-background border border-border rounded-lg p-4 text-sm font-mono text-foreground focus:outline-none focus:border-foreground mb-6"
              placeholder="Pega el JSON aquí..."
            />
            <div className="flex items-center justify-end gap-3 mt-auto">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const ta = document.getElementById('import-json-textarea') as HTMLTextAreaElement;
                  if (!ta || !ta.value) return;
                  try {
                    const blob = new Blob([ta.value], { type: 'application/json' });
                    const fd = new FormData();
                    fd.append('file', blob, 'import.json');
                    const res = await fetch('/api/portfolios/import_json', {
                      method: 'POST',
                      body: fd
                    });
                    if (res.ok) {
                      setShowImportModal(false);
                      setFeedback({ kind: 'success', msg: 'Portafolio importado.' });
                      invalidateCache('portfolios-list');
                      setRetryTick((t) => t + 1);
                    } else {
                      setFeedback({ kind: 'error', msg: 'El backend rechazó la importación del JSON.' });
                    }
                  } catch (e) {
                    console.error(e);
                    setFeedback({ kind: 'error', msg: 'Error de red al importar el portafolio.' });
                  }
                }}
                className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
