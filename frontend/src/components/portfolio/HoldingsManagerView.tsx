import React, { useMemo, useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Plus, Upload, Trash2, Hourglass, AlertTriangle, Save, Download, Layers, Wallet, TrendingUp, TrendingDown, Landmark } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { CreatePortfolioModal } from './CreatePortfolioModal';
import { PortfolioTrashPanel } from './PortfolioTrashPanel';
import { useHoldingsManager } from '@/hooks/useHoldingsManager';
import { HoldingsManagerChart } from './HoldingsManagerChart';

export interface ImportTrashAsset { ticker: string; weight: number }

const isNumberish = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sumOf = (a: Record<string, number>): number => Object.values(a).reduce((x, y) => x + y, 0);

/** Cartera detectada en el JSON pegado. `name: null` = hay que pedirle el nombre. */
export interface DetectedPortfolio { name: string | null; assets: Record<string, number> }

export type ParsedImport =
  | { ok: false; reason: string }
  | { ok: true; portfolios: DetectedPortfolio[]; totalAssets: number; weightSum: number; allZero: boolean };

/**
 * Interpreta el JSON que el usuario pega, sin pegarle al servidor.
 *
 * Devuelve qué falta para poder importar: un mapa plano de activos o una envoltura
 * `{"assets": {...}}` describen UNA sola cartera cuyo nombre no viene en el JSON, así
 * que hay que pedirlo. El backend aplica exactamente las mismas reglas; esto solo
 * evita el viaje de ida y vuelta para preguntar lo mismo.
 */
export function parseImportJson(raw: string): ParsedImport {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'Pegá el JSON que querés importar.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: 'Eso no es un JSON válido. Si copiaste solo una parte, agregá las llaves { } que encloses todo.',
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'El JSON debe ser un objeto entre llaves { }, no una lista.' };
  }

  const obj = parsed as Record<string, unknown>;
  const entries = Object.entries(obj);
  const build = (pf: DetectedPortfolio[]): ParsedImport => ({
    ok: true,
    portfolios: pf,
    totalAssets: pf.reduce((a, p) => a + Object.keys(p.assets).length, 0),
    weightSum: sumOf(Object.assign({}, ...pf.map(p => p.assets))),
    allZero: pf.every(p => sumOf(p.assets) <= 0),
  });

  // Mapa plano: { "AAPL": 50, "MSFT": 50 } → una cartera, sin nombre.
  if (entries.length > 0 && entries.every(([, v]) => isNumberish(v))) {
    return build([{ name: null, assets: Object.fromEntries(entries) as Record<string, number> }]);
  }

  // Envoltura: { "assets": {...} } o { "mode": ..., "assets": {...} } → una cartera, sin nombre.
  const wrapper = obj.assets;
  if (
    typeof wrapper === 'object' && wrapper !== null && !Array.isArray(wrapper) &&
    Object.keys(wrapper).length > 0 && Object.values(wrapper).every(isNumberish)
  ) {
    return build([{ name: null, assets: wrapper as Record<string, number> }]);
  }

  // Caso normal: una o más carteras nombradas.
  const found: DetectedPortfolio[] = [];
  for (const [key, value] of entries) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const inner = value as Record<string, unknown>;
    const candidate = (typeof inner.assets === 'object' && inner.assets !== null && !Array.isArray(inner.assets))
      ? inner.assets as Record<string, unknown>
      : inner;
    const numeric = Object.fromEntries(
      Object.entries(candidate).filter(([, v]) => isNumberish(v))
    ) as Record<string, number>;
    if (Object.keys(numeric).length === 0) continue;
    found.push({ name: key, assets: numeric });
  }

  if (found.length === 0) {
    return {
      ok: false,
      reason: 'No encontré activos. Revisá que el JSON tenga esta forma: { "mi_cartera": { "AAPL": 50, "MSFT": 50 } }',
    };
  }

  return build(found);
}

export function HoldingsManagerView({ hideHeader = false, compact = false }: { hideHeader?: boolean, compact?: boolean } = {}) {
  const hm = useHoldingsManager();
  const {
    openTickerDrawer, selectedPf, setSelectedPf, loading, loadError, setLoadError, setRetryTick,
    mcmMultiplier, handleMultiplierChange, feedback, setFeedback, showDeleteAlert, setShowDeleteAlert,
    showImportModal, setShowImportModal, showCreateModal, setShowCreateModal, chartMode, setChartMode,
    holdings, composition, kpis, draftHoldings, handleFieldChange, handleRemoveAsset, handleSaveHoldings,
    handleExportJSON, pfNames, isSaving,
    fixedIncomeRows, handleDeleteFixedIncomeHolding, deletingFiTicker,
    fixedIncomeSpecs, availableFiTickers,
    draftFiSleeve, handleSleeveChange,
    fiTargetWeights, handleFiTargetFieldChange, handleAddFiTarget, handleRemoveFiTarget,
    handleSaveFixedIncomeTarget, isSavingFiTarget, fiTargetDirty
  } = hm;

  const [fiPendingDelete, setFiPendingDelete] = useState<string | null>(null);
  const [fiPendingRemove, setFiPendingRemove] = useState<string | null>(null);
  const [fiNewTicker, setFiNewTicker] = useState<string>('');
  const [showTrash, setShowTrash] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNeedsName, setImportNeedsName] = useState<boolean>(false);
  const [importName, setImportName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<ParsedImport | null>(null);

  /** Rellena el textarea con un ejemplo (los botones de formato admitido). */
  const fillImportExample = (value: string) => {
    const ta = document.getElementById('import-json-textarea') as HTMLTextAreaElement | null;
    if (ta) {
      ta.value = value;
      handleImportTextChange(value);
      ta.focus();
    }
  };

  /** Analiza el JSON pegado en vivo y muestra qué falta completar. */
  const handleImportTextChange = (value: string) => {
    if (!value.trim()) {
      setImportPreview(null);
      setImportError(null);
      setImportNeedsName(false);
      return;
    }
    const parsed = parseImportJson(value);
    setImportPreview(parsed);
    if (!parsed.ok) {
      setImportError(parsed.reason);
      setImportNeedsName(false);
    } else {
      setImportError(null);
      setImportNeedsName(parsed.portfolios.some(p => p.name === null));
    }
  };

  /**
   * Importa el JSON pegado.
   *
   * El backend responde 200 incluso cuando la importación falla, así que el éxito se
   * decide leyendo `success` del cuerpo, no el código HTTP. Antes de enviar se valida
   * en local con `parseImportJson`, que además detecta si falta el nombre.
   */
  const handleImportJson = async () => {
    const ta = document.getElementById('import-json-textarea') as HTMLTextAreaElement | null;
    if (!ta || !ta.value.trim()) {
      setImportError('Pegá el JSON que querés importar.');
      return;
    }

    const parsed = parseImportJson(ta.value);
    if (!parsed.ok) {
      setImportError(parsed.reason);
      return;
    }
    if (parsed.allZero) {
      setImportError('Todos los pesos están en cero. Asignale un peso mayor a 0 a al menos un activo.');
      return;
    }
    if (parsed.portfolios.some(p => p.name === null) && !importName.trim()) {
      setImportError('Poné un nombre para la cartera.');
      return;
    }

    setImportError(null);
    setImporting(true);
    try {
      const blob = new Blob([ta.value], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'import.json');
      if (importName.trim()) fd.append('name', importName.trim());

      const res = await fetch('/api/portfolios/import_json', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));

      if (data.needs_name) {
        setImportNeedsName(true);
        setImporting(false);
        return;
      }

      if (!res.ok || data.success === false) {
        setImportError(data.error || 'No se pudo importar el JSON.');
        setImporting(false);
        return;
      }

      const imported = data.imported_count ?? 0;
      const skipped: string[] = data.skipped || [];
      let msg = imported === 1
        ? 'Se importó 1 cartera.'
        : `Se importaron ${imported} carteras.`;
      if (skipped.length > 0) {
        msg += ` Omitidas: ${skipped.join(', ')}.`;
      }

      setShowImportModal(false);
      setImportNeedsName(false);
      setImportName('');
      setImportPreview(null);
      setFeedback({
        kind: skipped.length > 0 && imported === 0 ? 'error' : 'success',
        msg,
      });
      queryClient.invalidateQueries({ queryKey: ['portfolios-list'] });
      setRetryTick((t) => t + 1);
    } catch (e) {
      console.error(e);
      setImportError('Error de red al importar el portafolio.');
    } finally {
      setImporting(false);
    }
  };

  const fiTargetTickers = Object.keys(fiTargetWeights);
  const fiTargetRows = useMemo(
    () => fiTargetTickers.map((tk) => ({ ticker: tk, spec: fixedIncomeSpecs[tk] })),
    [fiTargetTickers.join('|'), fixedIncomeSpecs]
  );
  const fiWeightTotal = fiTargetRows.reduce((s, r) => s + (fiTargetWeights[r.ticker] || 0), 0);
  const fiAvailableOptions = availableFiTickers.filter(
    (s: any) => !fiTargetTickers.includes(s.ticker) && !fixedIncomeRows.some((f: any) => f.ticker === s.ticker)
  );

  const fmtPct = (n: number, digits = 1) => `${n.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  const fmtMoney = (n: number, currency = '') => {
    const formatted = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency ? `$${formatted} ${currency}` : `$${formatted}`;
  };

  const handleChartClick = (params: any) => {
    const meta = params?.data?.meta;
    if (meta?.kind === 'ticker' && meta.row) {
      const h = meta.row;
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

    if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando portafolios...</div>;
  }

  const inputClasses = "w-full min-w-[64px] max-w-[86px] text-right bg-secondary/50 border border-border/50 rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className={compact ? "flex flex-col space-y-6 h-full p-2" : "p-6 md:p-8 max-w-7xl mx-auto space-y-8"}>
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
              <button
                type="button"
                title="Papelera de carteras"
                aria-label="Abrir papelera de carteras"
                onClick={() => setShowTrash(true)}
                className="p-2 min-h-9 min-w-9 flex items-center justify-center bg-secondary hover:bg-border rounded-lg transition-colors border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Hourglass className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => { setImportError(null); setImportNeedsName(false); setImportName(''); setImportPreview(null); setShowImportModal(true); }}
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

          {/* RENTA FIJA: posiciones informadas (LECAPs / soberanos / ONCER) */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-secondary/30 flex justify-between items-center gap-3">
              <div className="flex items-center gap-2.5">
                <Landmark className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Títulos de Renta Fija</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Posiciones de renta fija informadas. Se gestionan de forma independiente de los pesos del portafolio.
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {fixedIncomeRows.length} {fixedIncomeRows.length === 1 ? 'título' : 'títulos'}
              </span>
            </div>

            {fixedIncomeRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Esta cartera no tiene posiciones de renta fija informadas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Ticker</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Nominales</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">PPC (Base 100)</th>
                      <th scope="col" className="px-4 py-3 font-medium text-right">Capital Invertido</th>
                      <th scope="col" className="px-4 py-3 font-medium text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fixedIncomeRows.map((fi: any) => (
                      <tr key={fi.ticker} className="hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap h-full min-h-[40px]">
                            <span className="font-bold text-foreground font-mono">{fi.ticker}</span>
                            {fi.vencida ? (
                              <span
                                title={`Vencida el ${fi.vencimiento}. El capital fue cobrado: quitá la posición.`}
                                className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono"
                              >
                                Vencida
                              </span>
                            ) : fi.porVencer ? (
                              <span
                                title={`Vence en ${fi.dias} días (${fi.vencimiento}).`}
                                className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono"
                              >
                                Vence {fi.dias}d
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                                Renta Fija
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right align-middle font-mono text-xs text-foreground">
                          <div className="flex items-center justify-end h-full min-h-[40px]">
                            {fi.nominals.toLocaleString('es-AR')}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right align-middle">
                          <div className="flex items-center justify-end h-full min-h-[40px]">
                            <span className="font-mono text-xs text-foreground">
                              {fi.ppc > 0 ? fmtMoney(fi.ppc) : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right align-middle font-mono text-xs font-bold text-foreground">
                          <div className="flex items-center justify-end h-full min-h-[40px]">
                            {fmtMoney(fi.invested, 'ARS')}
                          </div>
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <div className="flex items-center justify-center h-full min-h-[40px]">
                            <button
                              type="button"
                              disabled={deletingFiTicker === fi.ticker}
                              onClick={() => setFiPendingDelete(fi.ticker)}
                              title={`Quitar ${fi.ticker} de la cartera ${selectedPf}`}
                              aria-label={`Eliminar posición de renta fija ${fi.ticker}`}
                              className="p-2 min-h-9 min-w-9 items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative/10 rounded transition-colors inline-flex cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            )}

            {/* OBJETIVO DE RENTA FIJA: tamaño del sleeve + reparto interno */}
            <div className="border-t border-border p-4 bg-secondary/20">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Objetivo de renta fija</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Definí cuánto de la cartera querés en renta fija y cómo lo repartís. Con peso objetivo,
                    el título deja de ser invisible para el motor de rotación.
                  </p>
                </div>
                <div className="flex items-end gap-3 shrink-0">
                  <div>
                    <label htmlFor="fi-sleeve" className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
                      Renta fija en la cartera
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="fi-sleeve"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={draftFiSleeve}
                        onChange={(e) => handleSleeveChange(e.target.value)}
                        className={inputClasses + " max-w-[90px]"}
                      />
                      <span className="text-xs text-muted-foreground font-mono">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Renta variable: {(100 - draftFiSleeve).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveFixedIncomeTarget}
                    disabled={isSavingFiTarget}
                    className="min-h-9 px-3 rounded-lg text-xs font-bold bg-accent hover:bg-accent/80 text-accent-foreground transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {isSavingFiTarget ? 'Guardando...' : 'Guardar objetivo'}
                  </button>
                  {fiTargetDirty && (
                    <span className="self-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Sin guardar
                    </span>
                  )}
                </div>
              </div>

              {fiTargetDirty && (
                <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
                  Hay cambios en el objetivo de renta fija sin guardar. Usá "Guardar objetivo" acá o el
                  botón "Guardar Cambios" de arriba.
                </p>
              )}

              {fiTargetRows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-2">
                  Sin títulos de renta fija en el objetivo: esta cartera se trata como 100% renta variable.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    <span>Reparto dentro de la renta fija</span>
                    <span className={cn('font-mono', Math.abs(fiWeightTotal - 100) > 0.01 && 'text-amber-400')}>
                      Suma: {fmtPct(fiWeightTotal, 2)}
                      {Math.abs(fiWeightTotal - 100) > 0.01 ? ' → se normalizará a 100% al guardar' : ''}
                    </span>
                  </div>
                  {fiTargetRows.map((row: any) => (
                    <div key={row.ticker} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card border border-border">
                      <span className="font-mono text-xs font-bold text-foreground min-w-[64px]">{row.ticker}</span>
                      {row.spec?.vencida && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                          Vencida
                        </span>
                      )}
                      <span className="flex-1 min-w-0 truncate text-[10px] text-muted-foreground" title={row.spec?.nombre}>
                        {row.spec?.nombre || 'Sin datos de calendario'}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        aria-label={`Peso en renta fija de ${row.ticker}`}
                        value={fiTargetWeights[row.ticker] ?? 0}
                        onChange={(e) => handleFiTargetFieldChange(row.ticker, e.target.value)}
                        className={inputClasses + " max-w-[86px]"}
                      />
                      <span className="text-[10px] text-muted-foreground font-mono">% RF</span>
                      <button
                        type="button"
                        onClick={() => setFiPendingRemove(row.ticker)}
                        title={`Quitar ${row.ticker} del objetivo de renta fija`}
                        aria-label={`Quitar ${row.ticker} del objetivo de renta fija`}
                        className="p-1.5 min-h-8 min-w-8 inline-flex items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative/10 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {fiAvailableOptions.length > 0 && (
                <div className="flex items-end gap-2 mt-3">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="fi-new-ticker" className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
                      Agregar título al objetivo
                    </label>
                    <select
                      id="fi-new-ticker"
                      value={fiNewTicker}
                      onChange={(e) => setFiNewTicker(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 min-h-8 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">Elegí un LECAP o BONCAP...</option>
                      {fiAvailableOptions.map((s: any) => (
                        <option key={s.ticker} value={s.ticker}>
                          {s.ticker} — {s.nombre || 'sin nombre'}
                          {s.vencida ? ' (vencida)' : s.dias !== null && s.dias !== undefined ? ` (${s.dias}d)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!fiNewTicker}
                    onClick={() => { handleAddFiTarget(fiNewTicker); setFiNewTicker(''); }}
                    className="min-h-8 px-3 rounded-md text-xs font-bold bg-secondary hover:bg-border border border-border transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Agregar
                  </button>
                </div>
              )}
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
                {composition.total > 0 ? (
                  <HoldingsManagerChart composition={composition} chartMode={chartMode} mcmMultiplier={mcmMultiplier} onNodeClick={handleChartClick} />
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

      <PortfolioTrashPanel open={showTrash} onClose={() => setShowTrash(false)} />

      <CreatePortfolioModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          setFeedback({ kind: 'success', msg: 'Portafolio creado.' });
          queryClient.invalidateQueries({ queryKey: ['portfolios-list'] });
          setRetryTick((t) => t + 1);
        }}
      />

      {/* Confirmar quitar un título del objetivo de renta fija */}
      {fiPendingRemove && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Confirmar quitar del objetivo de renta fija" className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-negative/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-negative" />
              </div>
              <h3 className="text-lg font-bold text-foreground">¿Quitar {fiPendingRemove} del objetivo?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Se saca <strong>{fiPendingRemove}</strong> de la composición objetivo de <strong>{selectedPf}</strong>.
              Esto no toca tus nominales informados: solo deja de ser parte del armado.
            </p>
            {fiTargetTickers.length === 1 && (
              <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
                Era el único título de renta fija del objetivo: al guardar, la cartera queda 100% renta variable
                (la renta fija vuelve a ser invisible para el motor de rotación).
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setFiPendingRemove(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { handleRemoveFiTarget(fiPendingRemove); setFiPendingRemove(null); }}
                className="px-4 py-2 bg-negative text-white rounded-lg text-sm font-bold hover:bg-negative/80 transition-colors"
              >
                Quitar del objetivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminación de posición de renta fija */}
      {fiPendingDelete && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Confirmar eliminación de posición de renta fija" className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-negative/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-negative" />
              </div>
              <h3 className="text-lg font-bold text-foreground">¿Quitar {fiPendingDelete}?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Se eliminará la posición de renta fija <strong>{fiPendingDelete}</strong> de la cartera{' '}
              <strong>{selectedPf}</strong>. Esta acción no se puede deshacer desde esta pantalla.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setFiPendingDelete(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={deletingFiTicker === fiPendingDelete}
                onClick={async () => {
                  const ticker = fiPendingDelete;
                  await handleDeleteFixedIncomeHolding(ticker);
                  setFiPendingDelete(null);
                }}
                className="px-4 py-2 bg-negative text-white rounded-lg text-sm font-bold hover:bg-negative/80 transition-colors disabled:opacity-50"
              >
                {deletingFiTicker === fiPendingDelete ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                      queryClient.invalidateQueries({ queryKey: ['portfolios-list'] });
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
            <h3 className="text-lg font-bold text-foreground mb-1">Importar Portafolio via JSON</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Pega un mapa de activos o uno o varios portfolios. No hace falta indicar el modo: todo se guarda como pesos.
            </p>
            <textarea
              id="import-json-textarea"
              className="w-full h-32 bg-background border border-border rounded-lg p-4 text-sm font-mono text-foreground focus:outline-none focus:border-foreground mb-3"
              onChange={e => handleImportTextChange(e.target.value)}
              placeholder='Pega el JSON aquí'
            />

            {!importPreview?.ok && (
              <div className="mb-3">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">
                  Formatos admitidos
                </p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => fillImportExample('{"AAPL": 50, "MSFT": 30, "GGAL": 20}')}
                    className="text-left px-3 py-2 rounded-lg bg-secondary hover:bg-border border border-border font-mono text-[11px] text-foreground transition-colors"
                  >
                    &#123; "AAPL": 50, "MSFT": 30, "GGAL": 20 &#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => fillImportExample('{\n  "mi_cartera": { "AAPL": 50, "MSFT": 50 }\n}')}
                    className="text-left px-3 py-2 rounded-lg bg-secondary hover:bg-border border border-border font-mono text-[11px] text-foreground transition-colors"
                  >
                    &#123; "mi_cartera": &#123; "AAPL": 50, "MSFT": 50 &#125; &#125;
                  </button>
                </div>
              </div>
            )}

            {importPreview?.ok && (
              <div className="mb-3 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <p className="text-xs text-emerald-300 font-bold">
                  {importPreview.portfolios.length === 1 && importPreview.portfolios[0].name
                    ? `Cartera "${importPreview.portfolios[0].name}"`
                    : `${importPreview.portfolios.length} cartera${importPreview.portfolios.length === 1 ? '' : 's'}`}
                  {' · '}
                  {importPreview.totalAssets} activo{importPreview.totalAssets === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Suma de pesos: {importPreview.weightSum.toFixed(2)}%
                  {Math.abs(importPreview.weightSum - 100) > 0.01
                    ? ' → se va a ajustar a 100% al guardar'
                    : ''}
                </p>
              </div>
            )}

            {importNeedsName && (
              <div className="mb-3">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
                  Nombre de la cartera
                </label>
                <input
                  type="text"
                  autoFocus
                  value={importName}
                  onChange={e => setImportName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImportJson(); }}
                  className="w-full h-9 px-3 rounded-lg bg-background border border-border text-xs font-mono text-foreground outline-none focus:border-foreground"
                  placeholder="mi_cartera"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  El JSON es un solo mapa de activos, así que el nombre hay que indicarlo.
                </p>
              </div>
            )}

            {importError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs border border-rose-500/30 bg-rose-500/10 text-rose-400">
                {importError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-auto">
              <button
                onClick={() => { setShowImportModal(false); setImportError(null); setImportNeedsName(false); }}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportJson}
                disabled={importing}
                className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" /> {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
