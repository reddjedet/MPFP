import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, RefreshCw, DollarSign, Wallet } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';

interface HoldingItem {
  nominals: number;
  ppc: number | null;
}

interface HoldingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentPortfolio?: string;
  availablePortfolios?: { id: string; name: string }[];
  onPortfolioChange?: (portfolioId: string) => void;
}

export const HoldingsDrawer: React.FC<HoldingsDrawerProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  currentPortfolio = 'bal',
  availablePortfolios = [],
  onPortfolioChange
}) => {
  const [activePf, setActivePf] = useState<string>(currentPortfolio);
  const [holdings, setHoldings] = useState<Record<string, HoldingItem>>({});
  const [cashArs, setCashArs] = useState<number>(0);
  const [cashArsInput, setCashArsInput] = useState<string>('0');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [newTicker, setNewTicker] = useState<string>('');
  const [newNominals, setNewNominals] = useState<string>('');
  const [newPpc, setNewPpc] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActivePf(currentPortfolio);
      fetchHoldings(currentPortfolio);
    }
  }, [isOpen, currentPortfolio]);

  const fetchHoldings = async (pfKey: string = activePf) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rotation/holdings?portfolio=${encodeURIComponent(pfKey)}`);
      if (!res.ok) throw new Error('Error al cargar tenencia real');
      const json = await res.json();
      setHoldings(json.holdings || {});
      const c = json.cash_ars || 0;
      setCashArs(c);
      setCashArsInput(String(c));
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handlePortfolioSwitch = (newPf: string) => {
    setActivePf(newPf);
    if (onPortfolioChange) {
      onPortfolioChange(newPf);
    }
    fetchHoldings(newPf);
  };

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    const tk = newTicker.trim().toUpperCase();
    if (!tk) return;
    const noms = parseInt(newNominals) || 0;
    const ppcVal = parseFloat(newPpc) || null;

    setHoldings(prev => ({
      ...prev,
      [tk]: {
        nominals: noms,
        ppc: ppcVal
      }
    }));
    setNewTicker('');
    setNewNominals('');
    setNewPpc('');
  };

  const handleUpdateItem = (ticker: string, field: 'nominals' | 'ppc', value: string) => {
    setHoldings(prev => {
      const current = prev[ticker] || { nominals: 0, ppc: null };
      if (field === 'nominals') {
        return {
          ...prev,
          [ticker]: { ...current, nominals: Math.max(0, parseInt(value) || 0) }
        };
      } else {
        const valNum = parseFloat(value);
        return {
          ...prev,
          [ticker]: { ...current, ppc: isNaN(valNum) || valNum <= 0 ? null : valNum }
        };
      }
    });
  };

  const handleDeleteTicker = (ticker: string) => {
    setHoldings(prev => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/rotation/holdings/bulk_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: activePf,
          holdings: holdings,
          cash_ars: cashArs
        })
      });
      if (!res.ok) throw new Error('Error al guardar tenencia');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-xl bg-white dark:bg-[#0f1015] border-l border-slate-200 dark:border-white/10 h-full flex flex-col shadow-2xl relative z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header con Selector de Cartera/Broker */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-500/30">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-wide">
                  Gestor de Tenencia Real
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30 uppercase">
                  Multi-Cuenta
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Ingresá tus nominales y precios promedio de compra (PPC) por broker
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Dropdown
              value={activePf}
              options={
                availablePortfolios && availablePortfolios.length > 0
                  ? availablePortfolios.map(p => ({ value: p.id, label: p.name }))
                  : [
                      { value: 'bal', label: 'BAL' },
                      { value: 'bmb', label: 'BMB' },
                      { value: 'min_drawdown_15', label: 'MIN DRAWDOWN 15' },
                    ]
              }
              onChange={handlePortfolioSwitch}
              title="Cartera Activa"
              minWidth="160px"
            />
            <button 
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Cash ARS Section */}
          <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-4 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Caja Disponible ($ ARS) — {activePf.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <input 
              type="text"
              inputMode="decimal"
              value={cashArsInput}
              onChange={e => {
                const text = e.target.value;
                if (text === '' || /^\d*\.?\d*$/.test(text)) {
                  setCashArsInput(text);
                  const parsed = parseFloat(text);
                  if (!isNaN(parsed) && !text.endsWith('.')) {
                    setCashArs(parsed);
                  } else if (text === '') {
                    setCashArs(0);
                  }
                }
              }}
              onBlur={() => {
                setCashArsInput(String(cashArs));
              }}
              placeholder="0.00"
              className="w-36 h-9 px-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white text-right outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Add New Asset Form */}
          <form onSubmit={handleAddTicker} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-4 rounded-2xl flex flex-col gap-3">
            <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              Agregar Activo a Cartera: <span className="text-blue-600 dark:text-blue-400 font-black">{activePf.replace('_', ' ').toUpperCase()}</span>
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <input 
                  type="text"
                  placeholder="Ticker (ej: LLY)"
                  value={newTicker}
                  onChange={e => setNewTicker(e.target.value)}
                  className="w-full h-9 px-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white uppercase outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <input 
                  type="number"
                  min="0"
                  placeholder="Nominales"
                  value={newNominals}
                  onChange={e => setNewNominals(e.target.value)}
                  className="w-full h-9 px-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <input 
                  type="number"
                  step="any"
                  min="0"
                  placeholder="PPC ($ ARS)"
                  value={newPpc}
                  onChange={e => setNewPpc(e.target.value)}
                  className="w-full h-9 px-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!newTicker.trim()}
              className="w-full h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-500/30 hover:dark:bg-blue-600/30 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              <span>Incorporar a {activePf.replace('_', ' ').toUpperCase()}</span>
            </button>
          </form>

          {/* Holdings List Table */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                Activos en {activePf.replace('_', ' ').toUpperCase()} ({Object.keys(holdings).length})
              </span>
            </div>

            {loading ? (
              <div className="h-40 flex items-center justify-center text-slate-500 dark:text-zinc-500 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando tenencia de {activePf.toUpperCase()}...
              </div>
            ) : Object.keys(holdings).length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-zinc-500 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-2xl">
                No tenés activos cargados en la tenencia real de <strong className="text-slate-700 dark:text-zinc-300">{activePf.replace('_', ' ').toUpperCase()}</strong>. Agregá tu primer activo arriba.
              </div>
            ) : (
              <div className="bg-white dark:bg-white/[0.02] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Ticker</th>
                      <th className="p-3">Nominales</th>
                      <th className="p-3">PPC ($ ARS)</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                    {Object.entries(holdings).map(([tk, item]) => (
                      <tr key={tk} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 font-extrabold text-slate-900 dark:text-white">{tk}</td>
                        <td className="p-2">
                          <input 
                            type="number"
                            min="0"
                            value={item.nominals}
                            onChange={e => handleUpdateItem(tk, 'nominals', e.target.value)}
                            className="w-24 h-8 px-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number"
                            step="any"
                            min="0"
                            value={item.ppc || ''}
                            onChange={e => handleUpdateItem(tk, 'ppc', e.target.value)}
                            placeholder="—"
                            className="w-28 h-8 px-2 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteTicker(tk)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
                            title="Eliminar activo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-3 bg-slate-50 dark:bg-[#0c0d12]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Guardar {activePf.replace('_', ' ').toUpperCase()}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
