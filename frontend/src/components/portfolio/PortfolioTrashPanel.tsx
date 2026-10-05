import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw, X, AlertTriangle, PackageOpen } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export interface TrashEntry {
  id: string;
  name: string;
  mode: string;
  asset_count: number;
  deleted_at: string;
  data?: { mode?: string; assets?: Record<string, number> };
  holdings?: Record<string, { nominals?: number; ppc?: number }>;
  fixed_income_holdings?: Record<string, { nominals?: number; ppc?: number }>;
  cash_ars?: number;
}

/**
 * Panel de papelera de carteras.
 *
 * La papelera recuerda objetivos, tenencias, bonos y efectivo de hasta 7 carteras
 * eliminadas. Dos acciones por entrada:
 *  - Restaurar como...  → devuelve la cartera con un nombre nuevo conservando todo.
 *  - Eliminar para siempre → borra la entrada definitivamente, con confirmación.
 */
export const PortfolioTrashPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const setSelectedPf = useAppStore(s => s.setSelectedPf);
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [count, setCount] = useState(0);
  const [maxCapacity, setMaxCapacity] = useState(7);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [restoring, setRestoring] = useState<TrashEntry | null>(null);
  const [newName, setNewName] = useState('');
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portfolios/trash_json');
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'No se pudo leer la papelera');
      setEntries(data.trash || []);
      setCount(data.count ?? (data.trash || []).length);
      setMaxCapacity(data.max_capacity ?? 7);
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Error al leer la papelera' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { setMessage(null); load(); }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const startRestore = (entry: TrashEntry) => {
    setRestoring(entry);
    setNewName(`${entry.id}_2`);
    setMessage(null);
  };

  const doRestore = async () => {
    if (!restoring) return;
    const target = newName.trim();
    if (!target) return;
    setBusy(restoring.id);
    try {
      const res = await fetch(`/api/portfolios/restore_as_json/${encodeURIComponent(restoring.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: target }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'No se pudo restaurar');

      setMessage({
        kind: 'ok',
        text: `Se restauró "${data.restored}" con sus tenencias y bonos. La entrada original sigue en la papelera.`,
      });
      setSelectedPf(data.restored);
      setRestoring(null);
      setNewName('');
      load();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Error al restaurar' });
    } finally {
      setBusy(null);
    }
  };

  const doPurge = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/portfolios/trash_json/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'No se pudo eliminar');
      setMessage({ kind: 'ok', text: `Se eliminó "${id}" definitivamente.` });
      setConfirmPurge(null);
      load();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Error al eliminar' });
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  const tickers = (e: TrashEntry) => Object.keys(e.data?.assets || {});

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-base font-bold text-foreground">Papelera de carteras</h2>
            <span className="text-xs font-mono text-muted-foreground">{count} de {maxCapacity}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {message && (
          <div className={`mx-5 mt-4 px-3 py-2 rounded-lg text-xs border shrink-0 ${
            message.kind === 'ok'
              ? 'text-positive bg-positive/10 border-positive/30'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
          }`}>
            {message.text}
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {loading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando papelera...</p>
          )}

          {!loading && entries.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <PackageOpen className="w-8 h-8 opacity-50" />
              <p className="text-sm">La papelera está vacía.</p>
              <p className="text-xs">Las carteras que borres quedan acá hasta 7, con sus tenencias y bonos.</p>
            </div>
          )}

          {entries.map(entry => (
            <div key={entry.id} className="border border-border rounded-xl p-4 bg-background">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">{entry.id}</span>
                    <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">
                      {entry.asset_count} activos
                    </span>
                    {entry.holdings && Object.keys(entry.holdings).length > 0 && (
                      <span className="text-[10px] bg-positive/10 text-positive px-1.5 py-0.5 rounded">
                        {Object.keys(entry.holdings).length} tenencias
                      </span>
                    )}
                    {entry.fixed_income_holdings && Object.keys(entry.fixed_income_holdings).length > 0 && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                        {Object.keys(entry.fixed_income_holdings).length} bonos
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Borrada el {entry.deleted_at ? new Date(entry.deleted_at).toLocaleString('es-AR') : '—'}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground mt-1 truncate">
                    {tickers(entry).join(' · ') || '—'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startRestore(entry)}
                    disabled={busy === entry.id}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar como...
                  </button>
                  <button
                    onClick={() => setConfirmPurge(entry.id)}
                    disabled={busy === entry.id}
                    title="Eliminar definitivamente"
                    aria-label={`Eliminar ${entry.id} definitivamente`}
                    className="p-2 h-8 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 border border-border transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {restoring?.id === entry.id && (
                <div className="mt-3 pt-3 border-t border-border flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
                      Nombre de la nueva cartera
                    </label>
                    <input
                      type="text"
                      value={newName}
                      autoFocus
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') doRestore(); }}
                      className="w-full h-9 px-3 rounded-lg bg-secondary border border-border text-xs font-mono text-foreground outline-none focus:border-emerald-500"
                      placeholder="mi_cartera_2"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Se copian los objetivos, las tenencias, los bonos y el efectivo con este nombre nuevo.
                      La entrada original queda en la papelera.
                    </p>
                  </div>
                  <button
                    onClick={doRestore}
                    disabled={busy === entry.id || !newName.trim()}
                    className="px-4 h-9 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                  >
                    {busy === entry.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                  <button
                    onClick={() => { setRestoring(null); setNewName(''); }}
                    className="px-4 h-9 rounded-lg text-xs font-bold bg-secondary hover:bg-border text-foreground border border-border transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {confirmPurge === entry.id && (
                <div className="mt-3 pt-3 border-t border-rose-500/30 flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-xs text-foreground flex-1 min-w-[12rem]">
                    ¿Eliminar <strong>{entry.id}</strong> definitivamente? Se pierden sus tenencias y bonos.
                  </span>
                  <button
                    onClick={() => doPurge(entry.id)}
                    disabled={busy === entry.id}
                    className="px-3 h-8 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
                  >
                    {busy === entry.id ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button
                    onClick={() => setConfirmPurge(null)}
                    className="px-3 h-8 rounded-lg text-xs font-bold bg-secondary hover:bg-border text-foreground border border-border transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};