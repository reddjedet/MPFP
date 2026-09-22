import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Scale, 
  RefreshCw, 
  Plus, 
  Sliders,
  Award,
  Check
} from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import { CedearBasketSelector } from './CedearBasketSelector';
import { PortfolioStatsTable } from './PortfolioStatsTable';
import { MarkowitzWeightsChart } from './MarkowitzWeightsChart';
import { MarkowitzCharts } from './MarkowitzCharts';
import { CandidatePortfolioCard, CandidatePortfolioData } from './CandidatePortfolioCard';
import { SelectedPortfolioModal, SelectedPointData } from './SelectedPortfolioModal';

const currentYear = new Date().getFullYear();
const PERIOD_OPTIONS = [
  { value: '1y', label: `1 Año (${currentYear} / YTD)` },
  { value: '2y', label: `2 Años (${currentYear - 1}–${currentYear})` },
  { value: '3y', label: `3 Años (${currentYear - 2}–${currentYear})` },
  { value: '5y', label: `5 Años (${currentYear - 4}–${currentYear})` },
  { value: '10y', label: `10 Años (${currentYear - 9}–${currentYear})` },
];

const REBALANCE_OPTIONS = [
  { value: 'annual', label: 'Rebalanceo Anual (Estándar PV)' },
  { value: 'daily', label: 'Rebalanceo Diario Constante' },
  { value: 'none', label: 'Buy & Hold (Sin Rebalanceo)' },
];

interface WeightRow {
  ticker: string;
  sharpe_weight: number;
  min_vol_weight: number;
  sharpe_weight_fmt: string;
  min_vol_weight_fmt: string;
}

interface AvailablePortfolio {
  id: string;
  name: string;
  asset_count?: number;
}

interface MarkowitzData {
  selected_pf: string;
  available_portfolios?: AvailablePortfolio[];
  tickers: string[];
  period: string;
  rebalance_regime?: string;
  rf_rate: number;
  max_sharpe: {
    return: number;
    volatility: number;
    sharpe: number;
    weights: Record<string, number>;
  };
  min_volatility: {
    return: number;
    volatility: number;
    sharpe: number;
    weights: Record<string, number>;
  };
  current_portfolio?: {
    return: number;
    volatility: number;
    sharpe: number;
    weights: Record<string, number>;
  } | null;
  optimal_candidates?: {
    max_sharpe: CandidatePortfolioData;
    min_volatility: CandidatePortfolioData;
    current_portfolio?: CandidatePortfolioData;
  };
  frontier_data?: {
    mc_points: any[];
    efficient_frontier: any[];
    cal_line: [number, number][];
    max_sharpe_point: any;
    min_vol_point: any;
    current_portfolio_point?: any;
    assets_points?: {
      ticker: string;
      vol: number;
      ret: number;
      sharpe: number;
    }[];
  };
  weights_table: WeightRow[];
  corr_matrix: Record<string, Record<string, number>>;
  time_series: {
    dates: string[];
    assets_cumulative: Record<string, number[]>;
    portfolios_cumulative: {
      sharpe_optimo: number[];
      min_volatilidad: number[];
      cartera_actual?: number[] | null;
      spy?: number[] | null;
    };
  };
  global_stats?: any;
  annual_returns_table?: any[];
}

export const MarkowitzLab: React.FC = () => {
  const [data, setData] = useState<MarkowitzData | null>(null);
  const [portfoliosList, setPortfoliosList] = useState<AvailablePortfolio[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form parameters
  const [selectedPf, setSelectedPf] = useState<string>('bal');
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [originalTickers, setOriginalTickers] = useState<string[]>([]);
  const [portfolioAssetsMap, setPortfolioAssetsMap] = useState<Record<string, string[]>>({});
  const [period, setPeriod] = useState<string>('5y');
  const [rebalanceRegime, setRebalanceRegime] = useState<string>('annual');
  const [rfRate, setRfRate] = useState<number>(4.0);

  // Modal y selección de cartera interactiva
  const [selectedPointForModal, setSelectedPointForModal] = useState<SelectedPointData | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Load portfolio list on initial render
  useEffect(() => {
    const loadPfs = async () => {
      try {
        const res = await fetch('/api/portfolios/list_json');
        if (res.ok) {
          const json = await res.json();
          let list: AvailablePortfolio[] = [];
          const assetsMap: Record<string, string[]> = {};
          if (Array.isArray(json)) {
            list = json;
          } else if (json && typeof json.portfolios === 'object') {
            list = Object.keys(json.portfolios).map(k => {
              const assets = Object.keys(json.portfolios[k]?.assets || {});
              assetsMap[k] = assets;
              return {
                id: k,
                name: k.replace(/_/g, ' ').toUpperCase(),
                asset_count: assets.length
              };
            });
          }
          if (list.length > 0) {
            setPortfoliosList(list);
            setPortfolioAssetsMap(assetsMap);
            const initialAssets = assetsMap['bal'] || (list[0] ? assetsMap[list[0].id] : []);
            if (initialAssets && initialAssets.length > 0) {
              setOriginalTickers(initialAssets);
              setBasketTickers(initialAssets);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadPfs();
  }, []);

  const fetchData = async (
    overridePf?: string, 
    overrideTickers?: string[], 
    overridePeriod?: string, 
    overrideRegime?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const pfToUse = overridePf !== undefined ? overridePf : selectedPf;
      const tickersToUse = overrideTickers !== undefined ? overrideTickers : basketTickers;
      const periodToUse = overridePeriod !== undefined ? overridePeriod : period;
      const regimeToUse = overrideRegime !== undefined ? overrideRegime : rebalanceRegime;

      // Determinar si los tickers de la canasta difieren de la cartera base original
      const orig = portfolioAssetsMap[pfToUse] || originalTickers;
      const isModified = tickersToUse.length !== orig.length ||
        ![...tickersToUse].sort().every((val, idx) => val === [...orig].sort()[idx]);

      const params = new URLSearchParams({
        selected_pf: isModified ? 'custom' : pfToUse,
        custom_tickers: isModified ? tickersToUse.join(',') : '',
        period: periodToUse,
        rf_rate: rfRate.toString(),
        rebalance_regime: regimeToUse
      });
      const res = await fetch(`/api/markowitz/markowitz_json?${params.toString()}`);
      if (!res.ok) throw new Error('Error al calcular el modelo de Markowitz');
      const json: MarkowitzData = await res.json();
      setData(json);
      if (json.available_portfolios && json.available_portfolios.length > 0) {
        setPortfoliosList(json.available_portfolios);
      }
      // Sincronizar canasta con los tickers calculados si la canasta estaba vacía
      if (tickersToUse.length === 0 && json.tickers && json.tickers.length > 0) {
        setBasketTickers(json.tickers);
        setOriginalTickers(json.tickers);
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectPortfolio = (pfId: string) => {
    setSelectedPf(pfId);
    const newAssets = portfolioAssetsMap[pfId] || [];
    setOriginalTickers(newAssets);
    setBasketTickers(newAssets);
    fetchData(pfId, newAssets);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    fetchData(undefined, undefined, newPeriod, undefined);
  };

  const handleRebalanceChange = (newRegime: string) => {
    setRebalanceRegime(newRegime);
    fetchData(undefined, undefined, undefined, newRegime);
  };

  const handleResetToOriginal = () => {
    const orig = portfolioAssetsMap[selectedPf] || originalTickers;
    setBasketTickers(orig);
    fetchData(selectedPf, orig);
  };

  const handlePointSelectFromChart = (pointData: SelectedPointData) => {
    setSelectedPointForModal(pointData);
    setModalOpen(true);
  };

  const handleCandidateSaveClick = (candidate: CandidatePortfolioData) => {
    setSelectedPointForModal({
      name: candidate.name,
      return: candidate.stats?.cagr ?? 0,
      volatility: candidate.stats?.volatility ?? 0,
      sharpe: candidate.stats?.sharpe,
      weights: candidate.weights,
    });
    setModalOpen(true);
  };

  const handleExportCandidateJson = (candidate: CandidatePortfolioData) => {
    const exportData = {
      name: candidate.name,
      created_at: new Date().toISOString(),
      metrics: candidate.stats,
      rsi: candidate.rsi,
      alpha: candidate.alpha,
      mode: 'weights',
      assets: candidate.weights,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCandidateCsv = (candidate: CandidatePortfolioData) => {
    const csvRows = ['Ticker,Weight_Percent,Weight_Decimal'];
    candidate.composition.forEach(item => {
      csvRows.push(`${item.ticker},${item.weight.toFixed(2)},${(item.weight / 100).toFixed(4)}`);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSavedSuccessfully = async (portfolioName: string) => {
    setSaveToast(`Cartera "${portfolioName}" integrada permanentemente al sistema.`);
    setTimeout(() => setSaveToast(null), 4000);
    try {
      const res = await fetch('/api/portfolios/list_json');
      if (res.ok) {
        const json = await res.json();
        let list: AvailablePortfolio[] = [];
        const assetsMap: Record<string, string[]> = {};
        if (Array.isArray(json)) {
          list = json;
        } else if (json && typeof json.portfolios === 'object') {
          list = Object.keys(json.portfolios).map(k => {
            const assets = Object.keys(json.portfolios[k]?.assets || {});
            assetsMap[k] = assets;
            return {
              id: k,
              name: k.replace(/_/g, ' ').toUpperCase(),
              asset_count: assets.length
            };
          });
        }
        if (list.length > 0) {
          setPortfoliosList(list);
          setPortfolioAssetsMap(assetsMap);
        }
      }
    } catch {
      // Fallback silencioso
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 relative">
      {/* Toast Notificación flotante de persistencia */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-emerald-600 text-foreground font-bold text-xs shadow-2xl flex items-center gap-2 border border-emerald-400/40 animate-bounce">
          <Check className="w-4 h-4 text-foreground" />
          <span>{saveToast}</span>
        </div>
      )}

      <div className="bg-card border border-border p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3 bg-emerald-50 dark:bg-secondary/50 rounded-2xl border border-emerald-200 dark:border-border shadow-inner">
            <Scale className="w-6 h-6 text-emerald-600 dark:text-positive" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-foreground tracking-tight flex items-center gap-3">
              MARKOWITZ LAB
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-positive text-[10px] font-bold uppercase tracking-widest border border-emerald-200 dark:border-emerald-500/20">
                QUANT
              </span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-muted-foreground font-medium">Teoría Moderna de Carteras & Frontera Eficiente</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-6 rounded-2xl relative z-20 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Cartera Base</label>
            <Dropdown
              value={selectedPf}
              options={
                portfoliosList.map(p => ({
                  value: p.id,
                  label: p.name,
                }))
              }
              onChange={handleSelectPortfolio}
              title="Seleccionar Cartera"
              accentColor="emerald"
              buttonClassName="w-full h-11"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Período (Desde 1 de Enero)</label>
            <Dropdown
              value={period}
              options={PERIOD_OPTIONS}
              onChange={handlePeriodChange}
              title="Seleccionar Período"
              accentColor="emerald"
              buttonClassName="w-full h-11"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Régimen de Rebalanceo</label>
            <Dropdown
              value={rebalanceRegime}
              options={REBALANCE_OPTIONS}
              onChange={handleRebalanceChange}
              title="Régimen de Rebalanceo"
              accentColor="emerald"
              buttonClassName="w-full h-11"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tasa Libre Riesgo (Rf %)</label>
            <div className="relative flex items-center">
              <input
                type="number"
                step="0.5"
                min="0"
                max="25"
                value={rfRate}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setRfRate(isNaN(val) ? 0 : val);
                }}
                className="w-full h-11 px-3.5 bg-background border border-border rounded-xl text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="4.0"
              />
              <span className="absolute right-3 text-xs font-bold text-muted-foreground">%</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={() => fetchData()}
              disabled={loading || basketTickers.length < 2}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-foreground font-bold px-4 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer"
              title={basketTickers.length < 2 ? 'Se requieren al menos 2 CEDEARs para optimizar' : 'Calcular Frontera Eficiente'}
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
              <span>{loading ? 'Calculando...' : 'Optimizar Canasta'}</span>
            </button>
          </div>
        </div>

        {/* Canasta interactiva de CEDEARs */}
        <CedearBasketSelector
          selectedTickers={basketTickers}
          onTickersChange={setBasketTickers}
          originalTickers={portfolioAssetsMap[selectedPf] || originalTickers}
          portfolioName={portfoliosList.find(p => p.id === selectedPf)?.name || selectedPf.toUpperCase()}
          onResetToOriginal={handleResetToOriginal}
        />
      </div>

      {error && (
        <div className="bg-card border border-border p-6 rounded-2xl border-red-500/30 text-negative text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Sección de Carteras Candidatas Óptimas estilo Portfolio Visualizer */}
          {data.optimal_candidates && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <div>
                  <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                    <span className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
                      <Award className="w-4 h-4" />
                    </span>
                    Carteras Candidatas Óptimas (Portfolio Visualizer Style)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Propuestas generadas por el optimizador cuadrático con métricas cuantitativas completas e integración persistente.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground bg-secondary/50 border border-border px-3 py-1 rounded-lg flex items-center gap-2 w-fit">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Persistencia garantizada en disco</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.optimal_candidates.max_sharpe && (
                  <CandidatePortfolioCard
                    type="max_sharpe"
                    candidate={data.optimal_candidates.max_sharpe}
                    onSaveClick={handleCandidateSaveClick}
                    onExportJson={handleExportCandidateJson}
                    onExportCsv={handleExportCandidateCsv}
                  />
                )}
                {data.optimal_candidates.min_volatility && (
                  <CandidatePortfolioCard
                    type="min_volatility"
                    candidate={data.optimal_candidates.min_volatility}
                    onSaveClick={handleCandidateSaveClick}
                    onExportJson={handleExportCandidateJson}
                    onExportCsv={handleExportCandidateCsv}
                  />
                )}
              </div>
            </div>
          )}

          <MarkowitzCharts 
            data={data} 
            onSelectPoint={handlePointSelectFromChart}
          />
          
          <PortfolioStatsTable data={data} />
          
          <div className="bg-card border border-border p-6 rounded-2xl flex flex-col gap-4 border border-slate-200/80 dark:border-border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-foreground flex items-center gap-2.5">
                <span className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-xl text-blue-600 dark:text-foreground border border-blue-100 dark:border-blue-500/20">
                  <Sliders className="w-5 h-5" />
                </span>
                Distribución de Pesos Óptimos
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-muted-foreground">
                Ponderaciones normalizadas según optimizador cuadrático SLSQP
              </span>
            </div>
            <MarkowitzWeightsChart data={data} />
          </div>
        </>
      )}

      {/* Modal interactivo de inspección, guardado permanente y exportación de carteras */}
      <SelectedPortfolioModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pointData={selectedPointForModal}
        onSavedSuccessfully={handleSavedSuccessfully}
      />
    </div>
  );
};
