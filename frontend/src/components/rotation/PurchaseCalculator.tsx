import React, { useState, useMemo } from 'react';
import { Calculator, X, RotateCcw, ArrowRight, Coins, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Dropdown, DropdownOption } from '../ui/Dropdown';

export interface CalculatorItem {
  ticker: string;
  price: number;
  ratio?: number;
}

interface PurchaseCalculatorProps {
  items: CalculatorItem[];
  cashArs?: number;
  selectedTicker?: string;
  onSelectTicker?: (ticker: string) => void;
  onClose?: () => void;
}

export const PurchaseCalculator: React.FC<PurchaseCalculatorProps> = ({
  items,
  cashArs = 0,
  selectedTicker,
  onSelectTicker,
  onClose,
}) => {
  // Estado puramente efímero (sin persistencia en DB ni localStorage)
  const [internalTicker, setInternalTicker] = useState<string>(() => {
    if (selectedTicker && items.some(i => i.ticker === selectedTicker)) {
      return selectedTicker;
    }
    return items[0]?.ticker || '';
  });

  const [amountInput, setAmountInput] = useState<string>('');

  const activeTicker = selectedTicker || internalTicker;

  const handleTickerChange = (newTicker: string) => {
    setInternalTicker(newTicker);
    if (onSelectTicker) {
      onSelectTicker(newTicker);
    }
  };

  const selectedItem = useMemo(() => {
    return items.find(i => i.ticker === activeTicker) || items[0];
  }, [items, activeTicker]);

  const price = selectedItem?.price || 0;

  // Opciones formateadas para el Dropdown canónico
  const dropdownOptions: DropdownOption<string>[] = useMemo(() => {
    return items.map(item => ({
      value: item.ticker,
      label: `${item.ticker} — $ ${item.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      badge: item.ratio ? `Ratio ${item.ratio}:1` : undefined,
    }));
  }, [items]);

  // Parseo seguro del monto numérico
  const parsedAmount = useMemo(() => {
    if (!amountInput.trim()) return 0;
    const clean = amountInput.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) || num < 0 ? 0 : num;
  }, [amountInput]);

  // Cálculos matemáticos de compra
  const calculation = useMemo(() => {
    if (parsedAmount <= 0 || price <= 0) {
      return null;
    }
    const nominals = Math.floor(parsedAmount / price);
    const totalCost = nominals * price;
    const leftover = parsedAmount - totalCost;
    const shortage = price > parsedAmount ? price - parsedAmount : 0;

    return {
      nominals,
      totalCost,
      leftover,
      shortage,
    };
  }, [parsedAmount, price]);

  const handleUseCash = () => {
    if (cashArs > 0) {
      setAmountInput(Math.floor(cashArs).toString());
    }
  };

  const handleReset = () => {
    setAmountInput('');
  };

  return (
    <div className="bg-white dark:bg-[#181920] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-lg relative flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* HEADER DE LA CALCULADORA */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Calculadora Rápida de Compra
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400">
              Herramienta utilitaria efímera: calcula nominales enteros y dinero sobrante por capital en ARS
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            title="Cerrar calculadora"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* FILA DE CONTROLES INPUT */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* Selector de Ticker */}
        <div className="md:col-span-6 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider">
            Activo a Comprar (Cartera Seleccionada)
          </label>
          <Dropdown
            value={activeTicker}
            options={dropdownOptions}
            onChange={handleTickerChange}
            accentColor="emerald"
            minWidth="100%"
            placeholder="Seleccionar activo..."
          />
        </div>

        {/* Input de Dinero / Capital */}
        <div className="md:col-span-6 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-wider">
              Dinero a Gastar (ARS)
            </label>
            <div className="flex items-center gap-2">
              {cashArs > 0 && (
                <button
                  type="button"
                  onClick={handleUseCash}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-mono font-semibold"
                  title="Copiar saldo disponible en caja"
                >
                  Usar caja (${Math.floor(cashArs).toLocaleString('es-AR')})
                </button>
              )}
              {amountInput && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 flex items-center gap-0.5"
                  title="Limpiar campo"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="relative flex items-center">
            <span className="absolute left-3 text-slate-400 dark:text-zinc-500 font-mono font-bold text-xs pointer-events-none">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="ej: 7780"
              className="w-full h-10 pl-7 pr-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* RESULTADOS DEL CÁLCULO */}
      {calculation ? (
        <div className="flex flex-col gap-3 pt-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Nominales comprables */}
            <div className={`p-3.5 rounded-xl border flex flex-col gap-1 ${
              calculation.nominals > 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-300'
            }`}>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-80">
                <span>Nominales Enteros</span>
                <Coins className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-black font-mono">
                {calculation.nominals} <span className="text-xs font-bold">VN</span>
              </div>
              <div className="text-[10px] opacity-75 font-mono">
                {calculation.nominals > 0 ? 'Compra realizable en mercado' : 'Capital insuficiente'}
              </div>
            </div>

            {/* Inversión total */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Inversión Efectiva
              </span>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
                ${calculation.totalCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
                {calculation.nominals} × ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Dinero Sobrante */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Dinero Sobrante
              </span>
              <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                ${calculation.leftover.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
                Saldo remanente que no alcanza para 1 VN
              </div>
            </div>

            {/* Precio Unitario */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Precio Unitario
              </span>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
                ${price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
                {selectedItem?.ticker} (Cotización local)
              </div>
            </div>
          </div>

          {/* Mensaje de ayuda / insuficiencia si no alcanza para 1 VN */}
          {calculation.nominals === 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Con <strong>${parsedAmount.toLocaleString('es-AR')}</strong> no alcanza para comprar 1 nominal entero de <strong>{selectedItem?.ticker}</strong> (${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}). Te faltan <strong>${calculation.shortage.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong> para alcanzar la primera unidad.
              </span>
            </div>
          )}

          {/* Resumen ejecutivo en una línea */}
          {calculation.nominals > 0 && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-700 dark:text-zinc-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>
                  Podés comprar <strong>{calculation.nominals} nominal{calculation.nominals > 1 ? 'es' : ''}</strong> de <strong>{selectedItem?.ticker}</strong> por un total de <strong>${calculation.totalCost.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>. Te sobran <strong>${calculation.leftover.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>.
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-center text-xs text-slate-400 dark:text-zinc-500 flex items-center justify-center gap-2">
          <ArrowRight className="w-4 h-4 opacity-50" />
          <span>Ingresá el monto en pesos que tenés pensado gastar para ver cuántos nominales podés comprar y cuánto sobra.</span>
        </div>
      )}
    </div>
  );
};
