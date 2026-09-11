import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Check, 
  AlertTriangle, 
  FileCode, 
  FileSpreadsheet, 
  Percent, 
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';

export interface SelectedPointData {
  name?: string;
  return: number;
  volatility: number;
  sharpe?: number;
  weights: Record<string, number>;
}

interface SelectedPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  pointData: SelectedPointData | null;
  onSavedSuccessfully: (portfolioName: string) => void;
}

export const SelectedPortfolioModal: React.FC<SelectedPortfolioModalProps> = ({
  isOpen,
  onClose,
  pointData,
  onSavedSuccessfully,
}) => {
  const [portfolioName, setPortfolioName] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && pointData) {
      setSavedSuccess(false);
      setError(null);
      
      // Sugerir un nombre intuitivo por defecto según métricas
      let defaultName = 'portfolio_custom';
      if (pointData.name) {
        defaultName = pointData.name
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 24);
      } else if (pointData.sharpe !== undefined) {
        defaultName = `optimo_s${pointData.sharpe.toFixed(2).replace('.', '')}`;
      } else {
        defaultName = `cartera_v${pointData.volatility.toFixed(0)}`;
      }
      setPortfolioName(defaultName);
    }
  }, [isOpen, pointData]);

  // Manejo de escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !pointData) return null;

  // Normalizar array de activos para visualización
  const composition = Object.entries(pointData.weights || {})
    .map(([ticker, rawWeight]) => {
      // Si el peso viene en base 0-1, pasar a porcentaje 0-100
      const weightPct = rawWeight <= 1.0 ? rawWeight * 100.0 : rawWeight;
      return {
        ticker: ticker.toUpperCase(),
        weight: weightPct,
      };
    })
    .filter(item => item.weight >= 0.01)
    .sort((a, b) => b.weight - a.weight);

  const totalWeight = composition.reduce((acc, curr) => acc + curr.weight, 0);

  const handleSaveToSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = portfolioName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_');

    if (!cleanName) {
      setError('Ingrese un nombre de cartera válido (letras minúsculas, números y guiones bajos).');
      return;
    }

    if (cleanName === 'bal' || cleanName === 'bmb') {
      setError('No puedes sobreescribir los portfolios predeterminados (BAL y BMB).');
      return;
    }

    setSaving(true);
    setError(null);

    // Preparar objeto de pesos normalizados
    const normalizedAssets: Record<string, number> = {};
    composition.forEach(item => {
      normalizedAssets[item.ticker] = roundFloat(item.weight, 2);
    });

    try {
      const res = await fetch('/api/portfolios/create_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          mode: 'weights',
          assets: normalizedAssets,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || 'Error al guardar la cartera en el sistema');
      }

      setSavedSuccess(true);
      onSavedSuccessfully(cleanName);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = () => {
    const exportData = {
      name: portfolioName,
      created_at: new Date().toISOString(),
      metrics: {
        return_annual_pct: pointData.return,
        volatility_annual_pct: pointData.volatility,
        sharpe_ratio: pointData.sharpe,
      },
      mode: 'weights',
      assets: composition.reduce((acc, curr) => {
        acc[curr.ticker] = roundFloat(curr.weight, 2);
        return acc;
      }, {} as Record<string, number>),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${portfolioName || 'cartera_markowitz'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCsv = () => {
    const csvRows = ['Ticker,Weight_Percent,Weight_Decimal'];
    composition.forEach(item => {
      csvRows.push(`${item.ticker},${item.weight.toFixed(2)},${(item.weight / 100).toFixed(4)}`);
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${portfolioName || 'cartera_markowitz'}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-fadeIn">
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[#181920] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-white leading-tight">
                {pointData.name || 'Cartera Seleccionada de la Frontera'}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Estructura cuantitativa e integración permanente al sistema
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Métricas Resumen del Punto */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Volatilidad Anual</span>
              <span className="text-base font-mono font-black text-zinc-200 mt-0.5">
                {pointData.volatility.toFixed(2)}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Retorno Anual</span>
              <span className={`text-base font-mono font-black mt-0.5 ${pointData.return >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {pointData.return >= 0 ? '+' : ''}{pointData.return.toFixed(2)}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Ratio de Sharpe</span>
              <span className="text-base font-mono font-black text-amber-400 mt-0.5">
                {pointData.sharpe !== undefined ? pointData.sharpe.toFixed(3) : '—'}
              </span>
            </div>
          </div>

          {/* Desglose de Composición y Ponderaciones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-zinc-500" />
                Composición de Activos ({composition.length})
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                Total: <b className="text-white">{totalWeight.toFixed(1)}%</b>
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-white/5 rounded-xl p-2 bg-black/20 custom-scrollbar">
              {composition.map((item) => (
                <div 
                  key={item.ticker}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-xs"
                >
                  <span className="font-bold text-white font-mono">{item.ticker}</span>
                  <div className="flex items-center gap-2 flex-1 max-w-[220px] ml-3">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(100, item.weight)}%` }}
                      />
                    </div>
                    <span className="font-mono text-zinc-300 text-[11px] w-14 text-right">
                      {item.weight.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Formulario de Guardado Permanente en Portfolios */}
          <form onSubmit={handleSaveToSystem} className="p-4 rounded-xl bg-white/[0.02] border border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <Save className="w-4 h-4 text-emerald-400" />
                Guardar Permanentemente en Portfolios
              </label>
              <span className="text-[10px] font-mono text-zinc-500">Persiste en disco</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Al guardar esta cartera, quedará registrada de forma permanente en el sistema (archivo <code className="text-emerald-300">data/portfolios.json</code>), sobreviviendo a recargas y actualizaciones, y estará disponible inmediatamente en las vistas de <b>Rebalanceo</b> y <b>Rotación de Tenencias</b>.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="nombre_cartera (ej: sharpe_optimo_2026)"
                maxLength={30}
                className="flex-1 h-10 px-3 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={saving || savedSuccess}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>¡Guardado con Éxito!</span>
                  </>
                ) : saving ? (
                  <span>Guardando...</span>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Guardar en Sistema</span>
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs mt-1">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>

        {/* Footer: Exportaciones JSON / CSV y Cerrar */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="h-8 px-3 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg transition-colors border border-white/10 flex items-center gap-1 text-xs font-medium cursor-pointer"
              title="Descargar archivo JSON"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Exportar JSON</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="h-8 px-3 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg transition-colors border border-white/10 flex items-center gap-1 text-xs font-medium cursor-pointer"
              title="Descargar archivo CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="h-8 px-4 bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors text-xs font-bold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

function roundFloat(val: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}
