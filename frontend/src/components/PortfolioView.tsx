import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Scale, 
  Coins, 
  RefreshCw, 
  Sliders,
  ExternalLink,
  ShieldCheck,
  Layers,
  PieChart,
  Plus,
  Trash2,
  Edit2,
  Archive
} from 'lucide-react';
import { Dropdown } from './ui/Dropdown';
import { PortfolioTable } from './portfolio/PortfolioTable';
import { PortfolioCharts } from './portfolio/PortfolioCharts';
import { PortfolioFixedIncomeTable, FixedIncomeSummary } from './portfolio/PortfolioFixedIncomeTable';
import { CreatePortfolioModal } from './portfolio/CreatePortfolioModal';
import { RenamePortfolioModal } from './portfolio/RenamePortfolioModal';
import { PortfolioTrashModal } from './portfolio/PortfolioTrashModal';

interface PortfolioAssetRow {
  ticker: string;
  qty: number;
  price: number;
  value: number;
  weight?: number;
  real_weight?: number;
  error?: number;
  target_pct?: number;
  real_pct?: number;
  diff_pct?: number;
  rsi?: number | null;
  adr_price?: number | null;
  ratio?: number | string;
  earnings_badge?: {
    text?: string;
    badge_text?: string;
    class?: string;
    badge_class?: string;
    is_urgent?: boolean;
  } | null;
  gf_signal?: {
    badge_text: string;
    badge_class?: string;
    tooltip?: string;
    signal?: string;
  } | null;
  gf_value?: number | null;
  ppc?: number | null;
  ppc_return?: {
    return_pct: number;
    badge_text: string;
    badge_class?: string;
    is_take_profit?: boolean;
    take_profit_level?: string;
  } | null;
  pfcf?: number | null;
  pfcf_signal?: {
    badge_text: string;
    badge_class?: string;
    action_text?: string;
    state_key?: string;
    color?: string;
    tooltip?: string;
  } | null;
  sector_id?: string;
  sector_name?: string;
}

export interface SectorAssetItem {
  ticker: string;
  target_weight: number;
  value: number;
  qty: number;
  price: number;
  relative_weight_in_sector?: number;
}

export interface SectorBreakdownItem {
  sector_id: string;
  sector_name: string;
  total_target_weight: number;
  total_value: number;
  weight_pct: number;
  assets: SectorAssetItem[];
}

interface PortfolioDataResponse {
  pf_type: string;
  mode: 'weights' | 'nominals';
  anchor: string;
  qty: number;
  weights: Record<string, number>;
  asset_allocation?: {
    equity_weight: number;
    fixed_income_weight: number;
  } | null;
  fixed_income_summary?: FixedIncomeSummary | null;
  result: PortfolioAssetRow[];
  sector_breakdown?: SectorBreakdownItem[];
  mcm_info?: {
    bottleneck_ticker: string;
    bottleneck_qty: number;
    base_capital: number;
    total_nominals: number;
    base_nominals: Record<string, number>;
  } | null;
  take_profit_alerts: PortfolioAssetRow[];
  alpha_metrics: Record<string, {
    portfolio: number;
    spy: number;
    alpha: number;
    formatted: string;
    class: string;
  }>;
  summary: {
    total_portfolio_value: number;
    total_portfolio_qty: number;
    total_consolidated_value?: number;
    base_anchor_qty: number;
    portfolio_rsi?: {
      weighted: number;
      simple: number;
      status: string;
      class: string;
    } | null;
  };
}

export const PortfolioView: React.FC = () => {
  const [portfoliosList, setPortfoliosList] = useState<string[]>(['min_drawdown_15', 'bmb']);
  const [selectedPf, setSelectedPf] = useState<string>(() => {
    try {
      return localStorage.getItem('finapp_active_portfolio') || 'min_drawdown_15';
    } catch {
      return 'min_drawdown_15';
    }
  });
  const [portfolioSubTab, setPortfolioSubTab] = useState<'consolidated' | 'cedears' | 'fixed_income'>('consolidated');
  const [data, setData] = useState<PortfolioDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState<boolean>(false);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState<boolean>(false);
  const [trashCount, setTrashCount] = useState<number>(0);

  // Rebalancing controls
  const [anchor, setAnchor] = useState<string>('');
  const [qty, setQty] = useState<number>(1);

  // TanStack Sorting

  const fetchTrashCount = async () => {
    try {
      const res = await fetch('/api/portfolios/trash_json');
      if (res.ok) {
        const json = await res.json();
        setTrashCount(json.count || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch initial portfolios list
  const fetchPortfoliosList = async (): Promise<string[]> => {
    try {
      const res = await fetch('/api/portfolios/list_json');
      if (res.ok) {
        const json = await res.json();
        const pkeys = Object.keys(json.portfolios || {});
        if (pkeys.length > 0) {
          setPortfoliosList(pkeys);
          return pkeys;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  const fetchRebalanceData = async (pf = selectedPf, anchorVal = '', qtyVal = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (anchorVal && anchorVal.trim()) {
        params.append('anchor', anchorVal.trim());
        if (qtyVal && qtyVal > 1) {
          params.append('qty', qtyVal.toString());
        }
      }

      const queryString = params.toString();
      const endpoint = queryString 
        ? `/api/portfolios/rebalance_json/${pf}?${queryString}`
        : `/api/portfolios/rebalance_json/${pf}`;

      const res = await fetch(endpoint);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Error al calcular rebalanceo.');
      }
      const json = await res.json();
      setData(json);
      setAnchor(json.anchor || '');
      setQty(json.qty || 1);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      fetchTrashCount();
      const pkeys = await fetchPortfoliosList();
      if (!isMounted) return;
      if (pkeys && pkeys.length > 0) {
        const initialPf = pkeys.includes(selectedPf) ? selectedPf : pkeys[0];
        if (initialPf !== selectedPf) {
          setSelectedPf(initialPf);
        }
        fetchRebalanceData(initialPf);
      } else {
        fetchRebalanceData(selectedPf);
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Escuchar cambios remotos de cartera activa (ej: desde Rotación & Cartera Real)
  useEffect(() => {
    const handleRemoteChange = (e: any) => {
      const newPf = e.detail;
      if (newPf && newPf !== selectedPf) {
        setSelectedPf(newPf);
        setAnchor('');
        setQty(1);
        fetchRebalanceData(newPf, '', 1);
      }
    };
    window.addEventListener('finapp-portfolio-change', handleRemoteChange);
    return () => window.removeEventListener('finapp-portfolio-change', handleRemoteChange);
  }, [selectedPf]);

  const handleSelectPortfolio = (pfKey: string) => {
    if (pfKey === selectedPf && data) return;
    setSelectedPf(pfKey);
    try {
      localStorage.setItem('finapp_active_portfolio', pfKey);
      window.dispatchEvent(new CustomEvent('finapp-portfolio-change', { detail: pfKey }));
    } catch {}
    setAnchor('');
    setQty(1);
    fetchRebalanceData(pfKey, '', 1);
  };

  const handleDeletePortfolio = async () => {
    if (selectedPf === 'bmb' || selectedPf === 'bal') {
      alert('No se pueden eliminar las carteras predeterminadas (BMB y BAL).');
      return;
    }

    try {
      const res = await fetch(`/api/portfolios/delete_json/${selectedPf}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const updatedList = await fetchPortfoliosList();
        const nextPf = updatedList[0] || 'bmb';
        setSelectedPf(nextPf);
        fetchRebalanceData(nextPf);
        fetchTrashCount();
      } else {
        alert(data.error || 'Error al mover cartera a papelera.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión al eliminar.');
    }
  };

  const handleAnchorChange = (newAnchor: string) => {
    setAnchor(newAnchor);
    fetchRebalanceData(selectedPf, newAnchor, qty);
  };

  const handleQtyChange = (newQty: number) => {
    if (newQty < 1) return;
    setQty(newQty);
    fetchRebalanceData(selectedPf, anchor, newQty);
  };


  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* CABECERA Y CONTROLES */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-40">
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        </div>
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
            <Sliders className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              REBALANCEO K-MEANS
              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20">
                PRO
              </span>
            </h2>
            <p className="text-sm text-zinc-400 font-medium">Asignación Matemática de Capital Nominal</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Dropdown
            value={selectedPf}
            options={portfoliosList}
            onChange={handleSelectPortfolio}
            title="Seleccionar Cartera"
            align="right"
            minWidth="210px"
          />

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="h-10 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            title="Crear nueva cartera personalizada"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva</span>
          </button>

          {selectedPf !== 'bmb' && selectedPf !== 'bal' && (
            <>
              <button
                onClick={() => setIsRenameModalOpen(true)}
                className="h-10 px-3 rounded-xl bg-white/5 hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400 border border-white/10 hover:border-blue-500/30 font-bold text-xs flex items-center transition-all cursor-pointer"
                title={`Renombrar cartera ${selectedPf.toUpperCase()}`}
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleDeletePortfolio}
                className="h-10 px-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 font-bold text-xs flex items-center transition-all cursor-pointer"
                title={`Enviar cartera ${selectedPf.toUpperCase()} a la papelera`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setIsTrashModalOpen(true)}
            className="h-10 px-3 rounded-xl bg-white/5 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-400 border border-white/10 hover:border-amber-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer relative"
            title="Papelera de reciclaje de carteras"
          >
            <Archive className="w-4 h-4" />
            {trashCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-mono font-bold leading-none">
                {trashCount}
              </span>
            )}
          </button>
        </div>
      </div>


      {/* SUB-TABS SWITCHER */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setPortfolioSubTab('consolidated')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            portfolioSubTab === 'consolidated'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 border border-blue-500/50'
              : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Consolidado & Asignación</span>
        </button>

        <button
          onClick={() => setPortfolioSubTab('cedears')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            portfolioSubTab === 'cedears'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 border border-blue-500/50'
              : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Renta Variable (CEDEARs)</span>
          {data?.result && (
            <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
              {data.result.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setPortfolioSubTab('fixed_income')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            portfolioSubTab === 'fixed_income'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 border border-blue-500/50'
              : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Renta Fija (LECAPs & Bonos)</span>
          {data?.fixed_income_summary?.items && (
            <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
              {data.fixed_income_summary.items.length}
            </span>
          )}
          {data?.fixed_income_summary?.has_imminent_maturity && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" title="Vencimiento inminente" />
          )}
        </button>
      </div>

      {loading ? (
        <div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center gap-4 min-h-[400px]">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Calculando rebalanceo e indicadores técnicos...</span>
        </div>
      ) : error ? (
        <div className="glass-panel p-6 rounded-2xl border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      ) : data ? (
        <>
          {portfolioSubTab === 'consolidated' && (
            <div className="flex flex-col gap-6">
              {/* ASSET ALLOCATION PANEL */}
              {data.asset_allocation && (
                <div className="bg-[#181920] border border-white/10 p-5 rounded-2xl flex flex-col gap-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2.5">
                      <Scale className="w-4 h-4 text-blue-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Estructura Macro de Asignación de Activos (Asset Allocation)
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-zinc-400">
                      Total Consolidado: <strong className="text-white font-bold">${(data.summary.total_consolidated_value || data.summary.total_portfolio_value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Renta Variable Card */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                          <span>Renta Variable (CEDEARs)</span>
                        </div>
                        <div className="text-lg font-mono font-bold text-white mt-1">
                          ${data.summary.total_portfolio_value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {((data.summary.total_portfolio_value / (data.summary.total_consolidated_value || data.summary.total_portfolio_value)) * 100).toFixed(1)}% Real
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Meta: {data.asset_allocation.equity_weight.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Renta Fija Card */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Renta Fija (LECAPs & Bonos)</span>
                        </div>
                        <div className="text-lg font-mono font-bold text-emerald-400 mt-1">
                          ${(data.fixed_income_summary?.total_market_value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {data.fixed_income_summary?.total_market_value 
                            ? ((data.fixed_income_summary.total_market_value / (data.summary.total_consolidated_value || 1)) * 100).toFixed(1) 
                            : '0.0'}% Real
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Meta: {data.asset_allocation.fixed_income_weight.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Barra visual de asignación */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="w-full h-3 rounded-full bg-black/40 overflow-hidden flex border border-white/5">
                      <div 
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${data.asset_allocation.equity_weight}%` }}
                        title={`Renta Variable: ${data.asset_allocation.equity_weight}%`}
                      />
                      <div 
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${data.asset_allocation.fixed_income_weight}%` }}
                        title={`Renta Fija: ${data.asset_allocation.fixed_income_weight}%`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                        CEDEARs Meta: {data.asset_allocation.equity_weight}%
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        Renta Fija Meta: {data.asset_allocation.fixed_income_weight}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ALERTA DE VENCIMIENTO INMINENTE */}
              {data.fixed_income_summary?.has_imminent_maturity && (
                <div className="bg-[#181920] p-4 rounded-2xl border border-amber-500/30 flex items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span>Vencimiento Inminente de Renta Fija</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {data.fixed_income_summary.nearest_maturity_days} días restantes
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-0.5">
                        El título <strong className="text-white font-mono">{data.fixed_income_summary.nearest_maturity_ticker}</strong> vence próximamente. Se acreditarán aproximadamente <strong className="text-emerald-400 font-mono">${data.fixed_income_summary.total_projected_maturity_payoff.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS</strong> a finish.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPortfolioSubTab('fixed_income')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/30 transition-colors cursor-pointer shrink-0"
                  >
                    Ver Renta Fija
                  </button>
                </div>
              )}

              {/* GRÁFICOS Y MÉTRICAS DE ALPHA / RSI */}
              <PortfolioCharts data={data} />
            </div>
          )}

          {portfolioSubTab === 'cedears' && (
            <div className="flex flex-col gap-6">
              {/* Rebalancing Multiplier Bar */}
              <div className="bg-white/[0.02] border border-white/10 p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm relative z-20">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Activo Ancla:</label>
                    <Dropdown
                      value={anchor}
                      options={
                        data?.result?.map(item => ({
                          value: item.ticker,
                          label: `${item.ticker} ${data?.mcm_info?.bottleneck_ticker === item.ticker ? '(Cuello Botella 1x)' : ''}`,
                        })) || []
                      }
                      onChange={handleAnchorChange}
                      title="Seleccionar Activo Ancla"
                      size="sm"
                      minWidth="140px"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Cantidad Ancla:</label>
                    <div className="flex items-center bg-black/40 border border-white/10 rounded-xl overflow-hidden h-9">
                      <button
                        onClick={() => handleQtyChange(qty - 1)}
                        disabled={qty <= 1}
                        className="px-3 h-full hover:bg-white/10 text-zinc-300 font-bold disabled:opacity-30 cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={qty}
                        onChange={e => handleQtyChange(parseInt(e.target.value) || 1)}
                        className="w-14 text-center bg-transparent text-xs font-mono font-bold text-white outline-none tabular-nums"
                      />
                      <button
                        onClick={() => handleQtyChange(qty + 1)}
                        className="px-3 h-full hover:bg-white/10 text-zinc-300 font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {data?.mcm_info && (
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Cartera Base 1x: <strong>${(data.mcm_info.base_capital || 0).toLocaleString('es-AR')}</strong> ({data.mcm_info.total_nominals || 0} nominales)
                    </span>
                  )}
                </div>
              </div>

              {/* Take Profit Alerts Banner */}
              {data?.take_profit_alerts && data.take_profit_alerts.length > 0 && (
                <div className="bg-[#181920] p-4 rounded-2xl border border-amber-500/30 flex items-center gap-3 shadow-sm">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    TAKE PROFIT
                  </span>
                  <div className="text-xs text-zinc-300 flex-1">
                    <strong className="text-white uppercase font-bold tracking-wider">Alertas activas: </strong>
                    {data.take_profit_alerts.map(a => `${a.ticker} (${a.ppc_return?.badge_text || ''})`).join(' • ')}
                  </div>
                </div>
              )}

              {/* TABLA PRINCIPAL DE CEDEARS */}
              <PortfolioTable data={data} onRefresh={() => fetchRebalanceData(selectedPf, anchor, qty)} pfType={selectedPf} />
            </div>
          )}

          {portfolioSubTab === 'fixed_income' && (
            <div className="flex flex-col gap-6">
              {data.fixed_income_summary ? (
                <PortfolioFixedIncomeTable 
                  summary={data.fixed_income_summary} 
                  pfType={selectedPf} 
                  onRefresh={() => fetchRebalanceData(selectedPf, anchor, qty)} 
                />
              ) : (
                <div className="glass-panel p-8 rounded-2xl text-center border border-white/10 text-zinc-400 text-sm">
                  Esta cartera no tiene activos de renta fija configurados.
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={async (newPfKey) => {
          await fetchPortfoliosList();
          setSelectedPf(newPfKey);
          fetchRebalanceData(newPfKey);
        }}
      />

      <RenamePortfolioModal
        isOpen={isRenameModalOpen}
        currentName={selectedPf}
        onClose={() => setIsRenameModalOpen(false)}
        onRenamed={async (newName) => {
          await fetchPortfoliosList();
          setSelectedPf(newName);
          fetchRebalanceData(newName);
        }}
      />

      <PortfolioTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
        onRestore={async (restoredPfKey) => {
          await fetchPortfoliosList();
          setSelectedPf(restoredPfKey);
          fetchRebalanceData(restoredPfKey);
          fetchTrashCount();
        }}
        onTrashChanged={fetchTrashCount}
      />
    </div>
  );
};
