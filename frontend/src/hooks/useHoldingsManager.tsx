import React, { useState, useEffect, useMemo, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useAppStore } from '@/store/useAppStore';
import { SECTOR_COLOR_MAP } from '@/components/portfolio/PortfolioCharts';
import { Layers, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
interface RealHolding {
  nominals: number;
  ppc: number;
}

export interface HoldingRow {
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

export interface Kpi {
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

/** Normaliza el bloque fixed_income_holdings de la API a {ticker: {nominals, ppc}} */
const mapFixedIncome = (raw: unknown): Record<string, RealHolding> => {
  const out: Record<string, RealHolding> = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw as Record<string, any>).forEach(([tk, v]) => {
    if (!v || typeof v !== 'object') return;
    out[tk] = { nominals: Number((v as any).nominals) || 0, ppc: Number((v as any).ppc) || 0 };
  });
  return out;
};

export function useHoldingsManager() {
  const openTickerDrawer = useAppStore((s) => s.openTickerDrawer);
  const [portfolios, setPortfolios] = useState<Record<string, any>>(() => {
    const cached = queryClient.getQueryData<any>(['portfolios-list']);
    return cached?.portfolios || {};
  });
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [realHoldings, setRealHoldings] = useState<Record<string, RealHolding>>({});
  const [fixedIncomeHoldings, setFixedIncomeHoldings] = useState<Record<string, RealHolding>>({});
  const [deletingFiTicker, setDeletingFiTicker] = useState<string | null>(null);
  // Objetivo de renta fija: tamaño del sleeve (%) y reparto interno por ticker
  const [draftFiSleeve, setDraftFiSleeve] = useState<number>(0);
  const [fiTargetWeights, setFiTargetWeights] = useState<Record<string, number>>({});
  const [isSavingFiTarget, setIsSavingFiTarget] = useState(false);
  const [fiTargetDirty, setFiTargetDirty] = useState(false);
  // Calendario de vencimientos (nombre, vencimiento, vencido)
  const [fixedIncomeSpecs, setFixedIncomeSpecs] = useState<Record<string, any>>({});
  const [cashArs, setCashArs] = useState<number>(0);
  const selectedPf = useAppStore((s) => s.selectedPf);
  const setSelectedPf = useAppStore((s) => s.setSelectedPf);
  const [loading, setLoading] = useState(() => {
    return !queryClient.getQueryData(['portfolios-list']);
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
        const [pfData, qData] = await Promise.all([
          queryClient.fetchQuery({ queryKey: ['portfolios-list'], queryFn: async () => {
              const res = await fetch('/api/portfolios/list_json');
              if (!res.ok) throw new Error('Error al cargar lista de portfolios');
              return res.json();
             }, staleTime: 120 * 1000 }),
          queryClient.fetchQuery({ queryKey: ['cedears-quotes-default'], queryFn: async () => {
              const res = await fetch('/api/cedears/quotes_json');
              if (!res.ok) throw new Error('Error al cargar cotizaciones');
              return res.json();
             }, staleTime: 60 * 1000 })
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
        const data = await queryClient.fetchQuery({
          queryKey: [`rotation-holdings:${selectedPf}`],
          queryFn: async () => {
            const res = await fetch(`/api/rotation/holdings?portfolio=${encodeURIComponent(selectedPf)}`);
            if (!res.ok) throw new Error('Error al cargar tenencias reales');
            return res.json();
          },
          staleTime: 60 * 1000
        });
        if (!isMounted || !data) return;
        const map: Record<string, RealHolding> = {};
        Object.entries(data.holdings || {}).forEach(([tk, v]: [string, any]) => {
          map[tk] = { nominals: Number(v?.nominals) || 0, ppc: Number(v?.ppc) || 0 };
        });
        setRealHoldings(map);
        setFixedIncomeHoldings(mapFixedIncome(data.fixed_income_holdings));
        setCashArs(Number(data.cash_ars) || 0);
      } catch (e) {
        console.error('Error fetching tenencias reales', e);
        if (isMounted) {
          setRealHoldings({});
          setFixedIncomeHoldings({});
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
        const data = await queryClient.fetchQuery({
          queryKey: [`portfolio-mcm:${selectedPf}`],
          queryFn: async () => {
            const res = await fetch(`/api/portfolios/rebalance_json/${encodeURIComponent(selectedPf)}`);
            if (!res.ok) throw new Error('Error al calcular la cartera base MCM');
            return res.json();
          },
          staleTime: 120 * 1000
        });
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
      sub: `${holdings.filter((h) => h.baseNominals > 0).length + Object.values(fixedIncomeHoldings).filter((v) => v.nominals > 0).length} posiciones informadas`,
      icon: <Wallet className="w-3 h-3" />
    });

    return result;
  }, [holdings, mcmMultiplier, cashArs, fixedIncomeHoldings]);

  const [draftHoldings, setDraftHoldings] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const isEditingRef = useRef(false);

  useEffect(() => {
    // Skip server sync while user is actively editing to preserve their changes
    if (isEditingRef.current) return;
    const newDraft: Record<string, any> = {};
    holdings.forEach((h: any) => {
      newDraft[h.ticker] = { ...h };
    });
    setDraftHoldings(newDraft);
  }, [holdings]);

  const handleFieldChange = (ticker: string, field: string, value: string) => {
    isEditingRef.current = true;
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

  // ---- Posiciones de renta fija (LECAPs / soberanos / ONCER) ----
  // Cargar el objetivo de renta fija ya persistido en la cartera (asset_allocation +
  // fixed_income_assets), salvo que el usuario esté editando en este momento.
  useEffect(() => {
    if (!selectedPf) return;
    const pf = (portfolios as Record<string, any>)[selectedPf];
    if (!pf) return;
    if (isEditingRef.current) return;
    const alloc = pf.asset_allocation || {};
    setDraftFiSleeve(Number(alloc.fixed_income_weight) || 0);
    const next: Record<string, number> = {};
    Object.entries(pf.fixed_income_assets || {}).forEach(([tk, v]: [string, any]) => {
      next[tk] = Number(v?.target_weight_rf) || 0;
    });
    setFiTargetWeights(next);
    setFiTargetDirty(false);
  }, [selectedPf, portfolios]);

  const fixedIncomeRows = useMemo(() => {
    return Object.entries(fixedIncomeHoldings)
      .map(([ticker, v]) => {
        const spec = fixedIncomeSpecs[ticker];
        return {
          ticker,
          nominals: v.nominals,
          ppc: v.ppc,
          // El PPC de renta fija se persiste en base 100 (convención BYMA/MAE).
          invested: round2((v.nominals * v.ppc) / 100),
          nombre: spec?.nombre ?? null,
          vencimiento: spec?.vencimiento ?? null,
          dias: typeof spec?.dias === 'number' ? spec.dias : null,
          vencida: Boolean(spec?.vencida),
          porVencer: Boolean(spec?.por_vencer)
        };
      })
      .sort((a, b) => b.invested - a.invested);
  }, [fixedIncomeHoldings, fixedIncomeSpecs]);

  /**
   * Calendario de vencimientos (LECAP_BONCAP_SPECS). Fuente estática del backend: a diferencia
   * de la curva de BYMA, sigue incluyendo los títulos ya vencidos, que es justo el caso que
   * necesitamos marcar para que el usuario limpie su tenencia.
   */
  useEffect(() => {
    let isMounted = true;
    const fetchSpecs = async () => {
      try {
        const data = await queryClient.fetchQuery({
          queryKey: ['fixed-income-specs'],
          queryFn: async () => {
            const res = await fetch('/api/fixed_income/specs_json');
            if (!res.ok) throw new Error('Error al cargar el calendario de vencimientos');
            return res.json();
          },
          staleTime: 60 * 60 * 1000
        });
        if (!isMounted) return;
        setFixedIncomeSpecs((data?.specs && typeof data.specs === 'object') ? data.specs : {});
      } catch (e) {
        console.error('Error fetching specs de renta fija', e);
        if (isMounted) setFixedIncomeSpecs({});
      }
    };
    fetchSpecs();
    return () => { isMounted = false; };
  }, [retryTick]);

  // Catálogo de títulos de renta fija para el selector "Agregar título"
  const availableFiTickers = useMemo(() => {
    const held = Object.keys(fixedIncomeHoldings);
    const target = Object.keys(fiTargetWeights);
    return Object.values(fixedIncomeSpecs)
      .filter((s: any) => s?.ticker)
      .sort((a: any, b: any) => {
        // Primero los que todavía no están en cartera ni en el objetivo
        const used = (t: string) => (held.includes(t) || target.includes(t) ? 1 : 0);
        const byUsed = used(a.ticker) - used(b.ticker);
        if (byUsed !== 0) return byUsed;
        return String(a.ticker).localeCompare(String(b.ticker));
      });
  }, [fixedIncomeSpecs, fixedIncomeHoldings, fiTargetWeights]);

  const handleAddFiTarget = (ticker: string) => {
    if (!ticker) return;
    setFiTargetWeights((prev) => (prev[ticker] !== undefined ? prev : { ...prev, [ticker]: 0 }));
    // Alt+Fijado: la tenencia arranca en cero, el usuario define el peso en RF
    setDraftFiSleeve((prev) => (prev > 0 ? prev : 20));
    isEditingRef.current = true;
    setFiTargetDirty(true);
  };

  const handleRemoveFiTarget = (ticker: string) => {
    isEditingRef.current = true;
    setFiTargetDirty(true);
    setFiTargetWeights((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
  };

  const handleFiTargetFieldChange = (ticker: string, value: string) => {
    isEditingRef.current = true;
    setFiTargetDirty(true);
    const n = Number(value);
    setFiTargetWeights((prev) => ({ ...prev, [ticker]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  };

  const handleSleeveChange = (value: string) => {
    isEditingRef.current = true;
    setFiTargetDirty(true);
    const n = Number(value);
    setDraftFiSleeve(Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
  };

  /** Persiste el objetivo de renta fija. Lanza si el backend rechaza. Sin feedback propio. */
  const persistFixedIncomeTarget = async () => {
    if (!selectedPf) return;
    const res = await fetch(
      `/api/portfolios/fixed_income_target_json/${encodeURIComponent(selectedPf)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixed_income_weight: draftFiSleeve,
          fixed_income_assets: Object.entries(fiTargetWeights).map(([tk, w]) => ({
            ticker: tk,
            target_weight_rf: w
          }))
        })
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo guardar el objetivo de renta fija.');
    }
    const body = await res.json().catch(() => null);
    // Reflejar en la UI lo que el servidor efectivamente normalizó
    if (body?.asset_allocation) setDraftFiSleeve(Number(body.asset_allocation.fixed_income_weight) || 0);
    if (body?.fixed_income_assets && typeof body.fixed_income_assets === 'object') {
      const next: Record<string, number> = {};
      Object.entries(body.fixed_income_assets as Record<string, any>).forEach(([tk, v]: [string, any]) => {
        next[tk] = Number(v?.target_weight_rf) || 0;
      });
      setFiTargetWeights(next);
    }
    queryClient.invalidateQueries({ queryKey: ['portfolios-list'] });
    setFiTargetDirty(false);
  };

  const handleSaveFixedIncomeTarget = async () => {
    setIsSavingFiTarget(true);
    setFeedback(null);
    try {
      await persistFixedIncomeTarget();
      isEditingRef.current = false;
      setFeedback({ kind: 'success', msg: 'Objetivo de renta fija guardado.' });
      window.dispatchEvent(new Event('refresh_portfolios'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el objetivo de renta fija.';
      console.error(err);
      setFeedback({ kind: 'error', msg });
    } finally {
      setIsSavingFiTarget(false);
    }
  };

  const handleDeleteFixedIncomeHolding = async (ticker: string) => {
    if (!selectedPf) return;
    setDeletingFiTicker(ticker);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/rotation/fixed_income/${encodeURIComponent(ticker)}?portfolio=${encodeURIComponent(selectedPf)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo eliminar la posición de renta fija.');
      }
      const body = await res.json().catch(() => null);
      const serverFi = body?.data?.fixed_income_holdings;
      if (serverFi && typeof serverFi === 'object') {
        setFixedIncomeHoldings(mapFixedIncome(serverFi));
      } else {
        setFixedIncomeHoldings((prev) => {
          const next = { ...prev };
          delete next[ticker];
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: [`rotation-holdings:${selectedPf}`] });
      queryClient.invalidateQueries({ queryKey: [`portfolio-rebalance:${selectedPf}`] });
      window.dispatchEvent(new Event('refresh_portfolios'));
      setFeedback({ kind: 'success', msg: `Posición de renta fija ${ticker} eliminada de ${selectedPf}.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar la posición de renta fija.';
      console.error(err);
      setFeedback({ kind: 'error', msg });
    } finally {
      setDeletingFiTicker(null);
    }
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

      // 4. Objetivo de renta fija, si el usuario lo modificó en esta pantalla.
      // Así toda la vista (pesos, tenencias, fair values y objetivo RF) se guarda desde un solo botón.
      let savedFiTarget = false;
      if (fiTargetDirty) {
        await persistFixedIncomeTarget();
        savedFiTarget = true;
      }

      // Refresco sin recargar la página: invalidar caches + re-fetch
      queryClient.invalidateQueries({ queryKey: ['portfolios-list'] });
      queryClient.invalidateQueries({ queryKey: ['cedears-quotes-default'] });
      queryClient.invalidateQueries({ queryKey: [`portfolio-rebalance:${selectedPf}`] });
      queryClient.invalidateQueries({ queryKey: [`rotation-holdings:${selectedPf}`] });
      queryClient.invalidateQueries({ queryKey: [`portfolio-mcm:${selectedPf}`] });
      isEditingRef.current = false;
      setDraftHoldings({});
      setFeedback({
        kind: 'success',
        msg: savedFiTarget
          ? 'Cambios guardados, incluido el objetivo de renta fija. Los nominales objetivo se recalcularon con los precios actuales.'
          : 'Cambios guardados. Los nominales objetivo se recalcularon con los precios actuales.'
      });
      window.dispatchEvent(new Event('refresh_portfolios'));
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

  return {
    openTickerDrawer,
    portfolios, setPortfolios,
    quotes, setQuotes,
    realHoldings, setRealHoldings,
    fixedIncomeHoldings, setFixedIncomeHoldings,
    fixedIncomeRows, handleDeleteFixedIncomeHolding, deletingFiTicker,
    fixedIncomeSpecs, availableFiTickers,
    draftFiSleeve, handleSleeveChange,
    fiTargetWeights, handleFiTargetFieldChange, handleAddFiTarget, handleRemoveFiTarget,
    handleSaveFixedIncomeTarget, isSavingFiTarget, fiTargetDirty,
    cashArs, setCashArs,
    selectedPf, setSelectedPf,
    loading, setLoading,
    loadError, setLoadError,
    retryTick, setRetryTick,
    mcmBaseNominals, setMcmBaseNominals,
    mcmMultiplier, handleMultiplierChange,
    feedback, setFeedback,
    showDeleteAlert, setShowDeleteAlert,
    showImportModal, setShowImportModal,
    showCreateModal, setShowCreateModal,
    chartMode, setChartMode,
    holdings, composition, kpis,
    draftHoldings, setDraftHoldings,
    isSaving, setIsSaving,
    isEditingRef,
    handleFieldChange, handleRemoveAsset, handleSaveHoldings, handleExportJSON,
    pfNames
  };
}
