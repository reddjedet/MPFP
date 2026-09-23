import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, X, RotateCcw, Trash2, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { useCachedFetch } from '@/lib/queryCache';

interface CedearBasketSelectorProps {
  selectedTickers: string[];
  onTickersChange: (tickers: string[]) => void;
  originalTickers: string[];
  portfolioName?: string;
  onResetToOriginal: () => void;
}

export const CedearBasketSelector: React.FC<CedearBasketSelectorProps> = ({
  selectedTickers,
  onTickersChange,
  originalTickers,
  portfolioName = 'Cartera Base',
  onResetToOriginal,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cargar catálogo oficial de CEDEARs (compartido y cacheado con CommandPalette y CedearsView)
  const { data: catalogData } = useCachedFetch<{ tickers?: string[] }>(
    'cedears-catalog',
    '/api/cedears/tickers',
    { ttl: 3600 }
  );
  const allCedears = catalogData?.tickers ?? [];

  // Manejo de clic fuera del dropdown de autocompletado
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar sugerencias de CEDEARs no seleccionados aún
  const filteredSuggestions = useMemo(() => {
    const query = searchTerm.trim().toUpperCase();
    if (!query) return [];
    return allCedears
      .filter(
        tk => tk.includes(query) && !selectedTickers.includes(tk)
      )
      .slice(0, 8); // Máximo 8 sugerencias rápidas
  }, [allCedears, searchTerm, selectedTickers]);

  const handleAddTicker = (tickerToAdd: string) => {
    const clean = tickerToAdd.trim().toUpperCase();
    if (!clean) return;

    if (selectedTickers.includes(clean)) {
      setSearchTerm('');
      setIsOpen(false);
      return;
    }

    // Verificar si es un CEDEAR conocido (o permitir si el usuario lo ingresa explícitamente)
    onTickersChange([...selectedTickers, clean]);
    setSearchTerm('');
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    onTickersChange(selectedTickers.filter(t => t !== tickerToRemove));
  };

  const handleClearAll = () => {
    onTickersChange([]);
  };

  // Navegación por teclado en autocompletado
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        setSelectedIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
        handleAddTicker(filteredSuggestions[selectedIndex]);
      } else if (filteredSuggestions.length === 1) {
        handleAddTicker(filteredSuggestions[0]);
      } else if (searchTerm.trim()) {
        handleAddTicker(searchTerm);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Comparar si la canasta actual es idéntica a la cartera original
  const isModified = useMemo(() => {
    if (selectedTickers.length !== originalTickers.length) return true;
    const sortedA = [...selectedTickers].sort();
    const sortedB = [...originalTickers].sort();
    return !sortedA.every((val, idx) => val === sortedB[idx]);
  }, [selectedTickers, originalTickers]);

  return (
    <div className="flex flex-col gap-3 bg-slate-900/40 dark:bg-black/30 rounded-2xl p-4 border border-slate-200/60 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
            Canasta de CEDEARs in situ
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20">
            {selectedTickers.length} {selectedTickers.length === 1 ? 'activo' : 'activos'}
          </span>

          {isModified && originalTickers.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Modificada
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isModified && originalTickers.length > 0 && (
            <button
              type="button"
              onClick={onResetToOriginal}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
              title={`Restaurar canasta original de ${portfolioName}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restaurar ({originalTickers.length})
            </button>
          )}

          {selectedTickers.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Vaciar todos los CEDEARs para empezar de cero"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vaciar
            </button>
          )}
        </div>
      </div>

      {/* Chips de CEDEARs seleccionados */}
      <div className="flex flex-wrap items-center gap-2 min-h-[42px] p-2 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200 dark:border-white/5">
        {selectedTickers.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-zinc-500 italic px-2">
            No hay CEDEARs en la canasta. Agrega activos abajo o restaura la cartera base.
          </span>
        ) : (
          selectedTickers.map(ticker => (
            <span
              key={ticker}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white rounded-lg border border-slate-200 dark:border-white/10 text-xs font-black font-mono shadow-xs hover:border-blue-500/40 transition-colors group"
            >
              {ticker}
              <button
                type="button"
                onClick={() => handleRemoveTicker(ticker)}
                className="text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition-colors"
                title={`Eliminar ${ticker}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Input de búsqueda y autocompletado de CEDEARs */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            className="w-full h-10 pl-10 pr-24 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 uppercase"
            placeholder="Buscar y agregar CEDEAR (ej: MELI, NVDA, AAPL, SPY)..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              setSelectedIndex(-1);
            }}
            onFocus={() => {
              if (searchTerm.trim()) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {searchTerm.trim() && (
            <button
              type="button"
              onClick={() => handleAddTicker(searchTerm)}
              className="absolute right-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </button>
          )}
        </div>

        {/* Dropdown flotante de sugerencias */}
        {isOpen && filteredSuggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#181920] border border-slate-200 dark:border-white/15 rounded-xl shadow-2xl overflow-hidden py-1 max-h-56 overflow-y-auto"
          >
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-white/5">
              CEDEARs sugeridos ({filteredSuggestions.length})
            </div>
            {filteredSuggestions.map((tk, idx) => (
              <button
                key={tk}
                type="button"
                className={`w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between transition-colors ${
                  idx === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
                onClick={() => handleAddTicker(tk)}
              >
                <span className="font-bold">{tk}</span>
                <span className={`text-[10px] ${idx === selectedIndex ? 'text-blue-100' : 'text-slate-400 dark:text-zinc-500'}`}>
                  + Añadir a la canasta
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Alerta de validación de tamaño de canasta */}
      {selectedTickers.length < 2 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Se requieren al menos 2 CEDEARs para calcular la Frontera Eficiente y los pesos óptimos.</span>
        </div>
      )}
    </div>
  );
};
