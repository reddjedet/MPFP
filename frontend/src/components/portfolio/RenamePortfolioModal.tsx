import React, { useState, useEffect } from 'react';
import { X, Check, Edit2, AlertCircle } from 'lucide-react';

interface RenamePortfolioModalProps {
  isOpen: boolean;
  currentName: string;
  onClose: () => void;
  onRenamed: (newName: string) => void;
}

export const RenamePortfolioModal: React.FC<RenamePortfolioModalProps> = ({
  isOpen,
  currentName,
  onClose,
  onRenamed,
}) => {
  const [newName, setNewName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
      setError(null);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const clean = newName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!clean) {
      setError('El nombre solo puede contener minúsculas, números y guiones bajos.');
      return;
    }
    if (clean === currentName) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portfolios/rename_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: currentName, new_name: clean }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al renombrar cartera.');
      }

      onRenamed(clean);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[#181920] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
              <Edit2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Renombrar Cartera</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Nuevo Nombre</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value.toLowerCase())}
              required
              autoFocus
              className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-white bg-white/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Guardando...' : <><Check className="w-3.5 h-3.5" /> Guardar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
