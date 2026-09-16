import React, { useEffect, useState, useMemo } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  AlertCircle, 
  Zap, 
  DollarSign, 
  Target, 
  ExternalLink, 
  Calculator, 
  Check, 
  RefreshCw,
  Wallet,
  ShieldCheck,
  Edit3
} from 'lucide-react';
import { useTicker360 } from '../../context/Ticker360Context';

interface Ticker360DrawerProps {
  onNavigateToTab?: (area: 'portfolios' | 'market' | 'lab', subTab: string) => void;
}

export const Ticker360Drawer: React.FC<Ticker360DrawerProps> = ({ onNavigateToTab }) => {
  const { isOpen, ticker, initialData, closeTicker360 } = useTicker360();

  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<any>(null);
  const [activePortfolio, setActivePortfolio] = useState<string>(() => {
    try {
      return localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    } catch {
      return 'min_drawdown_15';
    }
  });

  // Calculadora rápida embebida
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calcAmount, setCalcAmount] = useState<string>('');

  // Edición rápida de métricas
  const [showEdit, setShowEdit] = useState<boolean>(false);
  const [editPpc, setEditPpc] = useState<string>('');
  const [editGf, setEditGf] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editSaved, setEditSaved] = useState<boolean>(false);

  // Escuchar tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeTicker360();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeTicker360]);

  // Cargar datos cuando se abre o cambia el ticker
  useEffect(() => {
    if (!isOpen || !ticker) return;

    // Resetear estados secundarios
    setShowCalculator(false);
    setShowEdit(false);
    setEditSaved(false);
    setCalcAmount('');

    // Pre-cargar datos iniciales de la fila (0 ms lag)
    if (initialData) {
      setData({
        symbol: ticker,
        company_name: initialData.company_name || ticker,
        sector_name: initialData.sector_name,
        is_etf: initialData.is_etf,
        adr: initialData.adr ?? initialData.adr_price,
        local: initialData.local ?? initialData.price,
        ratio: initialData.ratio,
        rsi: initialData.rsi,
        earnings_badge: initialData.earnings_badge,
        gf_value: initialData.gf_value,
        gf_signal: initialData.gf_signal,
        discount_pct: initialData.discount_pct,
        ppc: initialData.ppc,
        ppc_return: initialData.ppc_return,
        pfcf: initialData.pfcf,
        pfcf_signal: initialData.pfcf_signal,
        nominals: initialData.nominals ?? initialData.real_nominals ?? initialData.qty ?? 0,
        position_value_ars: initialData.position_value_ars ?? initialData.value ?? 0,
        ...initialData
      });
      setEditPpc(initialData.ppc !== undefined && initialData.ppc !== null ? String(initialData.ppc) : '');
      setEditGf(initialData.gf_value !== undefined && initialData.gf_value !== null ? String(initialData.gf_value) : '');
    } else {
      setData(null);
    }

    // Fetch fresco de 360 grados
    const fetch360 = async () => {
      setLoading(true);
      try {
        const savedPf = localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
        setActivePortfolio(savedPf);
        const res = await fetch(`/api/cedears/quote_json/${encodeURIComponent(ticker)}?portfolio=${encodeURIComponent(savedPf)}`);
        if (res.ok) {
          const fresh = await res.json();
          setData((prev: any) => ({ ...prev, ...fresh }));
          setEditPpc(fresh.ppc !== undefined && fresh.ppc !== null ? String(fresh.ppc) : '');
          setEditGf(fresh.gf_value !== undefined && fresh.gf_value !== null ? String(fresh.gf_value) : '');
        }
      } catch (e) {
        console.error("Error al cargar Ficha 360:", e);
      } finally {
        setLoading(false);
      }
    };

    fetch360();
  }, [isOpen, ticker, initialData]);

  // Cálculos reactivos de compra rápida
  const quickCalc = useMemo(() => {
    const locPrice = data?.local || data?.price || 0;
    const budget = parseFloat(calcAmount) || 0;
    if (locPrice <= 0 || budget <= 0) {
      return { nominals: 0, totalCost: 0, leftover: budget };
    }
    const nominals = Math.floor(budget / locPrice);
    const totalCost = nominals * locPrice;
    const leftover = budget - totalCost;
    return { nominals, totalCost, leftover };
  }, [calcAmount, data]);

  // Guardar métricas editadas (PPC / Fair Value)
  const handleSaveMetrics = async () => {
    if (!ticker) return;
    setSavingEdit(true);
    try {
      const payload: Record<string, any> = { ticker };
      if (editPpc !== '') payload.ppc = parseFloat(editPpc);
      if (editGf !== '') payload.gf_value = parseFloat(editGf);

      const res = await fetch('/api/portfolios/quick_update_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setEditSaved(true);
        setData((prev: any) => ({
          ...prev,
          ppc: editPpc !== '' ? parseFloat(editPpc) : prev?.ppc,
          gf_value: editGf !== '' ? parseFloat(editGf) : prev?.gf_value
        }));
        setTimeout(() => setEditSaved(false), 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingEdit(false);
    }
  };

  // Navegar a la pestaña de valuación fundamental
  const handleGoToValuation = () => {
    if (!ticker) return;
    try {
      localStorage.setItem('finapp_valuation_ticker', ticker);
      window.dispatchEvent(new CustomEvent('finapp_open_valuation', { detail: ticker }));
    } catch (e) {
      console.error(e);
    }
    closeTicker360();
    if (onNavigateToTab) {
      onNavigateToTab('lab', 'valuation');
    }
  };

  if (!isOpen) return null;

  const currentPrice = data?.local || data?.price || null;
  const currentAdr = data?.adr || data?.adr_price || null;
  const rsiVal = typeof data?.rsi === 'number' ? data.rsi : null;
  const isOverbought = rsiVal !== null && rsiVal >= 70;
  const isOversold = rsiVal !== null && rsiVal <= 30;

  const earningsDetail = data?.earnings_detail;
  const earningsBadge = data?.earnings_badge;

  const gfVal = data?.gf_value || null;
  const discountPct = data?.discount_pct;

  const nominalsInPf = data?.nominals ?? data?.real_nominals ?? 0;
  const posValArs = data?.position_value_ars ?? (nominalsInPf * (currentPrice || 0));
  const ppcVal = data?.ppc || null;
  const ppcReturn = data?.ppc_return;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={closeTicker360} />

      {/* Drawer Lateral */}
      <aside 
        className="relative z-10 w-full sm:w-[440px] bg-[#16161d] border-l border-white/10 h-full flex flex-col shadow-2xl text-zinc-200 overflow-hidden animate-in slide-in-from-right duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* CABECERA */}
        <header className="p-5 border-b border-white/10 bg-[#121319] flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-black text-white tracking-wide font-mono">
                {ticker}
              </span>
              {data?.is_etf && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  ETF
                </span>
              )}
              {data?.ratio && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-zinc-400 font-mono border border-white/10">
                  Ratio {String(data.ratio).includes(':') ? data.ratio : `${data.ratio}:1`}
                </span>
              )}
            </div>
            <h3 className="text-xs font-medium text-zinc-400 truncate max-w-[280px]">
              {data?.company_name || data?.name || 'CEDEAR Negociable en BYMA'}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loading && <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />}
            <button
              onClick={closeTicker360}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          
          {/* COTIZACIONES */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#1a1b23] border border-white/5 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                Precio Local (ARS)
              </span>
              <div className="text-base font-black text-white font-mono tabular-nums">
                {currentPrice !== null 
                  ? `$ ${currentPrice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                  : '—'}
              </div>
              <span className="text-[10px] text-zinc-500">1 CEDEAR (BYMA)</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#1a1b23] border border-white/5 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                Acción ADR (USD)
              </span>
              <div className="text-base font-black text-emerald-400 font-mono tabular-nums">
                {currentAdr !== null 
                  ? `U$ ${currentAdr.toFixed(2)}` 
                  : '—'}
              </div>
              <span className="text-[10px] text-zinc-500">Subyacente EE.UU.</span>
            </div>
          </div>

          {/* TERMÓMETRO TÉCNICO: RSI WILDER 14 */}
          <div className="p-4 rounded-xl bg-[#1a1b23] border border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Termómetro Técnico (RSI 14)
                </span>
              </div>
              {rsiVal !== null ? (
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border tabular-nums ${
                  isOversold 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : isOverbought 
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                }`}>
                  RSI {rsiVal.toFixed(1)} — {isOversold ? 'Sobreventa' : isOverbought ? 'Sobrecompra' : 'Neutral'}
                </span>
              ) : (
                <span className="text-xs text-zinc-500 font-mono">Sin datos</span>
              )}
            </div>

            {/* Barra Visual Graduada */}
            {rsiVal !== null && (
              <div className="space-y-1.5 pt-1">
                <div className="relative h-3 w-full bg-zinc-800 rounded-full overflow-hidden flex border border-white/5">
                  <div className="w-[30%] bg-emerald-500/30 border-r border-black/30" title="Zona Sobreventa (0 - 30)" />
                  <div className="w-[40%] bg-sky-500/25 border-r border-black/30" title="Zona Neutral (30 - 70)" />
                  <div className="w-[30%] bg-rose-500/35" title="Zona Sobrecompra (70 - 100)" />
                  
                  {/* Aguja / Marcador del RSI */}
                  <div 
                    className="absolute top-0 bottom-0 w-2.5 -ml-1.25 bg-white rounded-full shadow-lg shadow-black/80 border border-black/50 transition-all duration-500"
                    style={{ left: `${Math.min(Math.max(rsiVal, 0), 100)}%` }}
                    title={`RSI actual: ${rsiVal.toFixed(1)}`}
                  />
                </div>

                <div className="flex justify-between text-[9px] font-mono text-zinc-500 px-0.5">
                  <span className="text-emerald-400/80">0 (Oportunidad)</span>
                  <span className="text-zinc-400">30</span>
                  <span className="text-zinc-400">70</span>
                  <span className="text-rose-400/80">100 (Extremo)</span>
                </div>
              </div>
            )}
          </div>

          {/* EVENTOS INMINENTES (BALANCES) */}
          <div className="p-4 rounded-xl bg-[#1a1b23] border border-white/5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-400" />
                Calendario de Reportes
              </span>
              {earningsDetail?.is_urgent && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 animate-pulse flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Evento Inminente
                </span>
              )}
            </div>

            {earningsDetail ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Próximo Reporte:</span>
                  <span className="font-bold text-white font-mono">
                    {earningsDetail.confirmed_date !== '—' 
                      ? `${earningsDetail.confirmed_date} (Confirmada)`
                      : `Mes de ${earningsDetail.target_month_name || '—'}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tiempo restante:</span>
                  <span className={`font-bold font-mono ${
                    earningsDetail.delta_days !== null && earningsDetail.delta_days < 14
                      ? 'text-orange-400' 
                      : 'text-zinc-300'
                  }`}>
                    {earningsDetail.delta_days !== null 
                      ? (earningsDetail.delta_days === 0 ? '🚨 ¡Reporta hoy!' : `${earningsDetail.delta_days} días restantes`)
                      : earningsDetail.status_text || '—'}
                  </span>
                </div>
                {earningsDetail.typical_window && earningsDetail.typical_window !== '—' && (
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Ventana típica:</span>
                    <span>{earningsDetail.typical_window}</span>
                  </div>
                )}
              </div>
            ) : earningsBadge ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Estado:</span>
                <span className="font-bold text-orange-400">{earningsBadge.badge_text || 'Pronto reporte'}</span>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Sin balance confirmado en las próximas semanas.</p>
            )}
          </div>

          {/* VALUACIÓN FUNDAMENTAL (GURUFOCUS & P/FCF) */}
          <div className="p-4 rounded-xl bg-[#1a1b23] border border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Valuación Fundamental
              </span>
              {data?.gf_signal && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  {data.gf_signal.badge_text}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Fair Value (GF)</span>
                <span className="text-sm font-black font-mono text-white">
                  {gfVal !== null ? `U$ ${gfVal.toFixed(2)}` : 'No asignado'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Margen Seguridad</span>
                <span className={`text-sm font-black font-mono ${
                  discountPct !== null && discountPct !== undefined
                    ? (discountPct >= 20 ? 'text-emerald-400' : discountPct < 0 ? 'text-rose-400' : 'text-zinc-300')
                    : 'text-zinc-500'
                }`}>
                  {discountPct !== null && discountPct !== undefined 
                    ? `${discountPct > 0 ? '+' : ''}${discountPct.toFixed(1)}%` 
                    : '—'}
                </span>
              </div>
            </div>

            {/* P/FCF Normalizado */}
            {data?.pfcf_signal && (
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
                <span className="text-zinc-400">Múltiplo P/FCF Normalizado:</span>
                <div className="flex items-center gap-1.5">
                  {data.pfcf && <span className="font-mono font-bold text-white">{data.pfcf}x</span>}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    data.pfcf_signal.state_key === 'optimo' || data.pfcf_signal.state_key === 'compra_optima'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : data.pfcf_signal.state_key === 'no_comprar' || data.pfcf_signal.state_key === 'sobrevaluado'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}>
                    {data.pfcf_signal.badge_text}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* POSICIÓN EN MI CARTERA */}
          <div className="p-4 rounded-xl bg-[#1a1b23] border border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                Mi Cartera ({activePortfolio.toUpperCase()})
              </span>
              {ppcReturn?.is_take_profit && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse">
                  🎯 TAKE PROFIT {ppcReturn.return_pct > 0 ? `+${ppcReturn.return_pct.toFixed(0)}%` : ''}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Tenencia Real</span>
                <span className="text-sm font-black font-mono text-white">
                  {nominalsInPf} <span className="text-xs font-normal text-zinc-400">VN</span>
                </span>
                {posValArs > 0 && (
                  <span className="text-[10px] text-zinc-400 font-mono block">
                    $ {posValArs.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">PPC & PnL</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-black font-mono text-white">
                    {ppcVal !== null ? `$ ${ppcVal.toLocaleString('es-AR')}` : 'Sin PPC'}
                  </span>
                </div>
                {ppcReturn && (
                  <span className={`text-[10px] font-mono font-bold block ${
                    ppcReturn.return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {ppcReturn.return_pct >= 0 ? '+' : ''}{ppcReturn.return_pct.toFixed(1)}% ({ppcReturn.badge_text})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CALCULADORA RÁPIDA EMBEBIDA (EXPANDIBLE) */}
          {showCalculator && (
            <div className="p-4 rounded-xl bg-[#14151b] border border-emerald-500/30 flex flex-col gap-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />
                  Calculadora Rápida de Compra
                </span>
                <button 
                  onClick={() => setShowCalculator(false)}
                  className="text-zinc-500 hover:text-white text-xs"
                >
                  Ocultar
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Monto a Invertir en ARS
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">$</span>
                  <input
                    type="number"
                    step="1000"
                    placeholder="Ej: 250000"
                    value={calcAmount}
                    onChange={e => setCalcAmount(e.target.value)}
                    className="w-full h-9 pl-7 pr-3 bg-black/50 border border-white/10 rounded-lg text-xs font-mono font-bold text-white outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Pre-sets rápidos */}
                <div className="flex gap-1.5">
                  {[100000, 300000, 500000, 1000000].map(val => (
                    <button
                      key={val}
                      onClick={() => setCalcAmount(String(val))}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-zinc-400 hover:text-white transition-colors"
                    >
                      ${val >= 1000000 ? `${val / 1000000}M` : `${val / 1000}k`}
                    </button>
                  ))}
                </div>

                {/* Resultados del cálculo */}
                {quickCalc.nominals > 0 && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-300">Puedes comprar:</span>
                      <span className="font-black text-emerald-400 font-mono text-sm">
                        {quickCalc.nominals} nominales
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                      <span>Costo total:</span>
                      <span>$ {quickCalc.totalCost.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                      <span>Vuelto en caja:</span>
                      <span>$ {quickCalc.leftover.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EDICIÓN RÁPIDA DE MÉTRICAS (EXPANDIBLE) */}
          {showEdit && (
            <div className="p-4 rounded-xl bg-[#14151b] border border-blue-500/30 flex flex-col gap-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar PPC & Fair Value
                </span>
                <button 
                  onClick={() => setShowEdit(false)}
                  className="text-zinc-500 hover:text-white text-xs"
                >
                  Cerrar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">PPC (A$)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ej: 14200"
                    value={editPpc}
                    onChange={e => setEditPpc(e.target.value)}
                    className="w-full h-8 px-2 bg-black/50 border border-white/10 rounded text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Fair Value (U$)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Ej: 220"
                    value={editGf}
                    onChange={e => setEditGf(e.target.value)}
                    className="w-full h-8 px-2 bg-black/50 border border-white/10 rounded text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {editSaved && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-bold">
                    <Check className="w-3.5 h-3.5" /> Guardado
                  </span>
                )}
                <button
                  onClick={handleSaveMetrics}
                  disabled={savingEdit}
                  className="px-3 py-1.5 rounded-[3px] bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingEdit ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Guardar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* BOTONES DE ACCIÓN INMEDIATA */}
        <footer className="p-4 border-t border-white/10 bg-[#121319] flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowCalculator(prev => !prev)}
              className="h-10 px-3 rounded-[3px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>{showCalculator ? 'Cerrar Calc' : 'Calcular Compra'}</span>
            </button>

            <button
              onClick={() => setShowEdit(prev => !prev)}
              className="h-10 px-3 rounded-[3px] bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Editar Métricas</span>
            </button>
          </div>

          <button
            onClick={handleGoToValuation}
            className="w-full h-10 px-4 rounded-[3px] bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Abrir en Valuación Fundamental</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80 ml-auto" />
          </button>
        </footer>
      </aside>
    </div>
  );
};
