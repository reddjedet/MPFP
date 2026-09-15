import React, { useState, useEffect, useCallback } from 'react';
import { X, Trash2, RotateCcw, AlertCircle, Archive, Clock, Layers } from 'lucide-react';

export interface TrashedPortfolio {
  id: string;
  name: string;
  data: {
    mode?: string;
    assets?: Record<string, number>;
  };
  deleted_at: string;
  asset_count: number;
  mode: string;
}

interface PortfolioTrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (restoredPfName: string) => void;
  onTrashChanged?: () => void;
}

export const PortfolioTrashModal: React.FC<PortfolioTrashModalProps> = ({
  isOpen,
  onClose,
  onRestore,
  onTrashChanged,
}) => {
  const [trashItems, setTrashItems] = useState<TrashedPortfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolios/trash_json');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al obtener la papelera.');
      }
      setTrashItems(data.trash || []);
      if (onTrashChanged) onTrashChanged();
    } catch (err: any) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, [onTrashChanged]);

  useEffect(() => {
    if (isOpen) {
      fetchTrash();
    }
  }, [isOpen, fetchTrash]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRestore = async (pfName: string) => {
    setActionId(pfName);
    setError(null);
    try {
      const res = await fetch(`/api/portfolios/restore_json/${encodeURIComponent(pfName)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al restaurar cartera.');
      }
      await fetchTrash();
      onRestore(pfName);
    } catch (err: any) {
      setError(err.message || 'Error al restaurar.');
    } finally {
      setActionId(null);
    }
  };

  const handlePurge = async (pfName: string) => {
    setActionId(pfName);
    setError(null);
    try {
      const res = await fetch(`/api/portfolios/trash_json/${encodeURIComponent(pfName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al eliminar definitivamente.');
      }
      await fetchTrash();
    } catch (err: any) {
      setError(err.message || 'Error al purgar cartera.');
    } finally {
      setActionId(null);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#181920] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Papelera de Portfolios</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 font-bold">
                  {trashItems.length} / 7
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Capacidad máx. 7 carteras. Al ingresar una 8va, la más antigua se elimina automáticamente (FIFO).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body / List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 min-h-[160px]">
          {loading && trashItems.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-zinc-500 text-xs">
              Cargando papelera...
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
              <Archive className="w-10 h-10 mb-3 opacity-30 stroke-[1.5]" />
              <p className="text-sm font-semibold text-zinc-400">La papelera está vacía</p>
              <p className="text-xs text-zinc-500 max-w-xs mt-1">
                Las carteras que elimines de tu catálogo se moverán aquí directamente, permitiéndote recuperarlas cuando quieras.
              </p>
            </div>
          ) : (
            trashItems.map((item) => {
              const isBusy = actionId === item.name;
              return (
                <div
                  key={item.id || item.name}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 transition-all gap-3"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black text-white truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/5">
                        {item.mode === 'nominals' ? 'Nominales' : 'Ponderada'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-zinc-500" />
                        {item.asset_count} {item.asset_count === 1 ? 'activo' : 'activos'}
                      </span>
                      <span className="flex items-center gap-1 text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.deleted_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(item.name)}
                      disabled={isBusy}
                      title="Restaurar al catálogo activo"
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurar</span>
                    </button>

                    <button
                      onClick={() => handlePurge(item.name)}
                      disabled={isBusy}
                      title="Eliminar definitivamente"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors border border-transparent hover:border-red-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 bg-white/[0.01] flex justify-between items-center text-xs text-zinc-500">
          <span>{trashItems.length} elemento{trashItems.length === 1 ? '' : 's'} en papelera</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-bold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
