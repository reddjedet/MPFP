import React from 'react';
import { queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Plus, Upload, Trash2, AlertTriangle, Save, Download, Layers, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { CreatePortfolioModal } from './CreatePortfolioModal';
import { useHoldingsManager } from '@/hooks/useHoldingsManager';
import { HoldingsManagerChart } from './HoldingsManagerChart';

export function HoldingsManagerView({ hideHeader = false, compact = false }: { hideHeader?: boolean, compact?: boolean } = {}) {
  const hm = useHoldingsManager();
  const {
    openTickerDrawer, selectedPf, setSelectedPf, loading, loadError, setLoadError, setRetryTick,
    mcmMultiplier, handleMultiplierChange, feedback, setFeedback, showDeleteAlert, setShowDeleteAlert,
    showImportModal, setShowImportModal, showCreateModal, setShowCreateModal, chartMode, setChartMode,
    holdings, composition, kpis, draftHoldings, handleFieldChange, handleRemoveAsset, handleSaveHoldings,
    handleExportJSON, pfNames, isSaving
  } = hm;

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
                      queryClient.invalidateQueries({ queryKey: ['portfolios-list'] });
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
