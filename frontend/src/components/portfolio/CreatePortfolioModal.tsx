import React, { useState } from 'react';
import { X, Plus, Trash2, Check, AlertCircle, Sparkles, Sliders } from 'lucide-react';

interface AssetRow {
  ticker: string;
  value: number;
}

interface CreatePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newPfKey: string) => void;
}

export const CreatePortfolioModal: React.FC<CreatePortfolioModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'weights' | 'nominals'>('weights');
  const [inputFormat, setInputFormat] = useState<'rows' | 'text'>('rows');
  const [rows, setRows] = useState<AssetRow[]>([
    { ticker: 'AAPL', value: 30 },
    { ticker: 'MSFT', value: 30 },
    { ticker: 'GOOGL', value: 40 },
  ]);
  const [rawText, setRawText] = useState('AAPL: 30, MSFT: 30, GOOGL: 40');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalWeight = rows.reduce((acc, r) => acc + (Number(r.value) || 0), 0);

  const handleAddRow = () => {
    setRows([...rows, { ticker: '', value: mode === 'weights' ? 10 : 1 }]);
  };

  const handleRemoveRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
  };

  const handleRowChange = (idx: number, field: 'ticker' | 'value', val: string) => {
    const updated = [...rows];
    if (field === 'ticker') {
      updated[idx].ticker = val.toUpperCase().trim();
    } else {
      updated[idx].value = parseFloat(val) || 0;
    }
    setRows(updated);
  };

  const handleNormalize = () => {
    if (totalWeight <= 0) return;
    const normalized = rows.map(r => ({
      ...r,
      value: parseFloat(((r.value / totalWeight) * 100).toFixed(2)),
    }));
    setRows(normalized);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      setError('Ingrese un nombre válido (letras minúsculas, números y guiones bajos).');
      return;
    }

    let payloadAssets: Record<string, number> = {};

    if (inputFormat === 'rows') {
      for (const r of rows) {
        if (!r.ticker) continue;
        if (r.value <= 0) {
          setError(`El valor para ${r.ticker} debe ser mayor a 0.`);
          return;
        }
        payloadAssets[r.ticker] = r.value;
      }
    } else {
      const parts = rawText.split(',').map(p => p.trim());
      for (const part of parts) {
        const [tk, valStr] = part.split(':').map(s => s?.trim());
        if (!tk || !valStr) {
          setError('Formato de texto inválido. Use: TICKER: VALOR, TICKER: VALOR');
          return;
        }
        const v = parseFloat(valStr);
        if (isNaN(v) || v <= 0) {
          setError(`Valor numérico inválido para ${tk}`);
          return;
        }
        payloadAssets[tk.toUpperCase()] = v;
      }
    }

    if (Object.keys(payloadAssets).length === 0) {
      setError('La cartera debe contener al menos un activo.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portfolios/create_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          mode,
          assets: payloadAssets,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Error al crear la cartera');
      }

      onCreated(cleanName);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#181920] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Crear Nueva Cartera</h3>
              <p className="text-[11px] text-zinc-400">Ponderaciones (%) o nominales de activos</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Nombre y Modo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Nombre de Cartera</label>
              <input
                type="text"
                placeholder="ej: tech_growth"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase())}
                required
                className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Modo de Asignación</label>
              <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10 h-9">
                <button
                  type="button"
                  onClick={() => setMode('weights')}
                  className={`flex-1 text-[11px] font-bold rounded-md transition-all ${
                    mode === 'weights' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Pesos (%)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('nominals')}
                  className={`flex-1 text-[11px] font-bold rounded-md transition-all ${
                    mode === 'nominals' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Nominales
                </button>
              </div>
            </div>
          </div>

          {/* Formato de entrada */}
          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
            <span className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Carga de Activos</span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setInputFormat('rows')}
                className={`text-[11px] font-bold ${inputFormat === 'rows' ? 'text-blue-400 underline' : 'text-zinc-500'}`}
              >
                Tabla
              </button>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                onClick={() => setInputFormat('text')}
                className={`text-[11px] font-bold ${inputFormat === 'text' ? 'text-blue-400 underline' : 'text-zinc-500'}`}
              >
                Texto Rápido
              </button>
            </div>
          </div>

          {inputFormat === 'rows' ? (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="TICKER"
                    value={row.ticker}
                    onChange={e => handleRowChange(idx, 'ticker', e.target.value)}
                    className="w-28 h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono font-bold"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder={mode === 'weights' ? '%' : 'Cant'}
                    value={row.value}
                    onChange={e => handleRowChange(idx, 'value', e.target.value)}
                    className="flex-1 h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono"
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Activo
                </button>

                {mode === 'weights' && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className={Math.abs(totalWeight - 100) < 0.1 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      Total: {totalWeight.toFixed(1)}%
                    </span>
                    {Math.abs(totalWeight - 100) >= 0.1 && (
                      <button
                        type="button"
                        onClick={handleNormalize}
                        className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 font-bold flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> 100%
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                rows={3}
                placeholder="AAPL: 25, MSFT: 25, GOOGL: 50"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono resize-none focus:outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-zinc-500">Formato: TICKER: VALOR separados por comas.</span>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : <><Check className="w-4 h-4" /> Crear Cartera</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
