import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Upload, Trash2, AlertTriangle, Save, Anchor, Download, Minus } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { CreatePortfolioModal } from './CreatePortfolioModal';

const SECTOR_MAP: Record<string, string> = {
  'GOOGL': 'Comm Services', 'META': 'Comm Services', 'NFLX': 'Comm Services', 'DIS': 'Comm Services',
  'MSFT': 'Technology', 'AAPL': 'Technology', 'NVDA': 'Technology', 'ASML': 'Technology', 'TSM': 'Technology', 'AMD': 'Technology',
  'CAT': 'Industrials', 'UNP': 'Industrials', 'BA': 'Industrials', 'GE': 'Industrials', 'LMT': 'Industrials',
  'VIST': 'Energy', 'CCJ': 'Energy', 'XOM': 'Energy', 'CVX': 'Energy', 'PBR': 'Energy',
  'CEG': 'Utilities', 'NEE': 'Utilities', 'DUK': 'Utilities',
  'COST': 'Consumer Def', 'WMT': 'Consumer Def', 'KO': 'Consumer Def', 'PEP': 'Consumer Def',
  'JPM': 'Financials', 'V': 'Financials', 'MA': 'Financials', 'BAC': 'Financials',
  'FCX': 'Materials', 'BHP': 'Materials', 'RIO': 'Materials', 'VALE': 'Materials',
  'AMZN': 'Consumer Cyc', 'TSLA': 'Consumer Cyc', 'HD': 'Consumer Cyc', 'MCD': 'Consumer Cyc',
  'LLY': 'Healthcare', 'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'MRK': 'Healthcare',
  'SPY': 'ETF', 'QQQ': 'ETF', 'DIA': 'ETF', 'IWM': 'ETF'
};

export function HoldingsManagerView() {
  const [portfolios, setPortfolios] = useState<Record<string, any>>({});
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [selectedPf, setSelectedPf] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch real data
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [pfRes, qRes] = await Promise.all([
          fetch('/api/portfolios/list_json'),
          fetch('/api/cedears/quotes_json')
        ]);
        if (!isMounted) return;
        if (pfRes.ok && qRes.ok) {
          const pfData = await pfRes.json();
          const qData = await qRes.json();
          
          setPortfolios(pfData.portfolios || {});
          if (pfData.selected_pf && !selectedPf) {
            setSelectedPf(pfData.selected_pf);
          } else if (Object.keys(pfData.portfolios || {}).length > 0 && !selectedPf) {
            setSelectedPf(Object.keys(pfData.portfolios)[0]);
          }

          const qMap: Record<string, any> = {};
          (qData.quotes || []).forEach((q: any) => {
            qMap[q.symbol] = q;
          });
          setQuotes(qMap);
        }
      } catch (e) {
        console.error("Error fetching portfolios", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, []);

  // Compute derived data based on selected portfolio
  const chartOption = useMemo(() => {
    if (!selectedPf || !portfolios[selectedPf]) {
      return {};
    }

    const pfAssets = portfolios[selectedPf].assets || {};
    const pfNominals = portfolios[selectedPf].nominals || {};
    
    let totalValue = 0;
    const rawHoldings: any[] = [];
    
    for (const [ticker, weight] of Object.entries(pfAssets)) {
      const q = quotes[ticker] || {};
      const price = q.local || q.cedear_usd || 0;
      const nominals = pfNominals[ticker] || 0;
      
      const val = nominals > 0 ? (nominals * price) : (Number(weight) * 1000);
      totalValue += val;
      
      let sector = q.sector || SECTOR_MAP[ticker];
      if (!sector) {
        sector = q.is_etf ? 'ETF' : 'Acciones';
      }

      rawHoldings.push({
        ticker,
        value: val,
        sector
      });
    }

    const sectorGroups: Record<string, any> = {};
    rawHoldings.forEach(h => {
      if (!sectorGroups[h.sector]) sectorGroups[h.sector] = { total: 0, tickers: [] };
      sectorGroups[h.sector].total += h.value;
      sectorGroups[h.sector].tickers.push(h);
    });

    const sortedSectors = Object.entries(sectorGroups).sort((a, b) => b[1].total - a[1].total);
    
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#06b6d4', '#f43f5e', '#84cc16', '#14b8a6'];
    
    const sectorData: any[] = [];
    const tickerData: any[] = [];
    
    let cIdx = 0;
    sortedSectors.forEach(([name, data]) => {
      const color = COLORS[cIdx % COLORS.length];
      cIdx++;
      
      sectorData.push({
        name,
        value: data.total,
        itemStyle: { color }
      });
      
      data.tickers.sort((a: any, b: any) => b.value - a.value).forEach((t: any) => {
        tickerData.push({
          name: t.ticker,
          value: t.value,
          itemStyle: { color }
        });
      });
    });

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const pct = ((params.value / totalValue) * 100).toFixed(2);
          return `${params.name}<br/>$${params.value.toLocaleString('es-AR', {maximumFractionDigits: 0})} (${pct}%)`;
        },
        backgroundColor: '#18181b',
        borderColor: '#27272a',
        textStyle: { color: '#fafafa' },
        borderRadius: 8
      },
      series: [
        {
          name: 'Sector',
          type: 'pie',
          radius: [0, '45%'],
          label: {
            position: 'inner',
            formatter: (params: any) => {
              const pct = Math.round((params.value / totalValue) * 100);
              return pct > 3 ? `${pct}%` : '';
            },
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold'
          },
          labelLine: { show: false },
          itemStyle: {
            borderColor: '#09090b',
            borderWidth: 2
          },
          data: sectorData
        },
        {
          name: 'Ticker',
          type: 'pie',
          radius: ['55%', '75%'],
          label: {
            formatter: (params: any) => {
              const pct = ((params.value / totalValue) * 100).toFixed(1);
              return `${params.name} (${pct}%)`;
            },
            color: '#a1a1aa',
            fontSize: 11
          },
          itemStyle: {
            borderColor: '#09090b',
            borderWidth: 2
          },
          data: tickerData
        }
      ]
    };
  }, [selectedPf, portfolios, quotes]);

  // Compute table data separately
  const { holdings } = useMemo(() => {
    if (!selectedPf || !portfolios[selectedPf]) return { holdings: [] };
    const pfAssets = portfolios[selectedPf].assets || {};
    const pfNominals = portfolios[selectedPf].nominals || {};
    const pfFv = portfolios[selectedPf].fv || {};
    const pfPpc = portfolios[selectedPf].ppc || {};

    const rawHoldings = [];
    for (const [ticker, weight] of Object.entries(pfAssets)) {
      const q = quotes[ticker] || {};
      const price = q.local || q.cedear_usd || 0;
      const nominals = pfNominals[ticker] || 0;
      const val = nominals > 0 ? (nominals * price) : (Number(weight) * 1000);
      rawHoldings.push({
        ticker,
        relWeight: Number(weight),
        baseNominals: nominals,
        ppc: pfPpc[ticker] || 0,
        fv: pfFv[ticker] || q.gf_value || 0,
        value: val
      });
    }
    return { holdings: rawHoldings.sort((a, b) => b.value - a.value) };
  }, [selectedPf, portfolios, quotes]);

  const handleExportJSON = () => {
    if (!selectedPf || !portfolios[selectedPf]) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(portfolios[selectedPf], null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${selectedPf}.json`);
    dlAnchorElem.click();
  };

  const pfNames = Object.keys(portfolios);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando portafolios...</div>;
  }

  const inputClasses = "w-full min-w-[70px] max-w-[90px] text-right bg-secondary/50 border border-border/50 rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER: Portfolios Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card border border-border p-5 rounded-2xl">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
              Portafolio Activo
            </label>
            <div className="flex items-center gap-2">
              <select 
                value={selectedPf}
                onChange={(e) => setSelectedPf(e.target.value)}
                className="bg-secondary border border-border text-foreground text-sm rounded-lg focus:ring-foreground focus:border-foreground block w-48 p-2"
              >
                {pfNames.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                {pfNames.length === 0 && <option value="">Sin carteras</option>}
              </select>
              <button 
                title="Crear Portafolio"
                onClick={() => setShowCreateModal(true)}
                className="p-2 bg-secondary hover:bg-border rounded-lg transition-colors border border-border"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-border rounded-lg text-sm font-medium transition-colors border border-border"
          >
            <Upload className="w-4 h-4" /> Importar
          </button>
          <button 
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-border rounded-lg text-sm font-medium transition-colors border border-border"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
          <div className="w-px h-8 bg-border mx-1"></div>
          <button 
            onClick={() => setShowDeleteAlert(true)}
            className="flex items-center gap-2 px-4 py-2 bg-negative/10 hover:bg-negative/20 text-negative rounded-lg text-sm font-medium transition-colors border border-negative/20"
          >
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Data Table */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-secondary/30 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-foreground">Activos del Portafolio</h3>
                <p className="text-xs text-muted-foreground mt-1">Configura pesos relativos, nominales y valores de compra.</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium text-right">Peso Rel (%)</th>
                    <th className="px-4 py-3 font-medium text-right">Nominales</th>
                    <th className="px-4 py-3 font-medium text-right">PPC</th>
                    <th className="px-4 py-3 font-medium text-right">Fair Value</th>
                    <th className="px-4 py-3 font-medium text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {holdings.map((asset: any) => (
                    <tr key={asset.ticker} className="hover:bg-secondary/30 transition-colors group border-b border-border/50 last:border-0">
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center h-full min-h-[40px]">
                          <span className="font-bold text-foreground">{asset.ticker}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" defaultValue={asset.relWeight} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" defaultValue={asset.baseNominals} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" defaultValue={asset.ppc} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-end h-full min-h-[40px]">
                          <input type="number" defaultValue={asset.fv} className={inputClasses} />
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center justify-center h-full min-h-[40px]">
                          <button className="p-1.5 text-muted-foreground hover:text-negative hover:bg-negative/10 rounded transition-colors inline-flex">
                             <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Visual Analytics */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 h-[400px] flex flex-col">
            <h3 className="text-sm font-bold text-foreground mb-2">Composición del Portafolio</h3>
            <p className="text-xs text-muted-foreground mb-4">Gráfico concéntrico: Anillo interno (Sectores), Anillo externo (Tickers).</p>
            
            <div className="flex-1 w-full relative -mx-4">
              <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
            </div>
          </div>
        </div>

      </div>

      <CreatePortfolioModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          window.location.reload();
        }}
      />

      {/* Delete Alert Modal */}
      {showDeleteAlert && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-negative/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-negative" />
              </div>
              <h3 className="text-lg font-bold text-foreground">¿Mover a papelera?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Estás a punto de enviar el portafolio <strong>{selectedPf}</strong> a la papelera (capacidad: 7 últimos).
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowDeleteAlert(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/portfolios/delete_json/${encodeURIComponent(selectedPf)}`, { method: 'DELETE' });
                    if (res.ok) {
                      setShowDeleteAlert(false);
                      window.location.reload();
                    } else {
                      alert('Error al borrar el portafolio.');
                    }
                  } catch (err) {
                    console.error(err);
                    alert('Error de red al borrar.');
                  }
                }}
                className="px-4 py-2 bg-negative text-white rounded-lg text-sm font-bold hover:bg-negative/80 transition-colors"
              >
                Sí, enviar a Papelera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-lg font-bold text-foreground mb-2">Importar Portafolio via JSON</h3>
            <textarea 
              id="import-json-textarea"
              className="w-full h-32 bg-background border border-border rounded-lg p-4 text-sm font-mono text-foreground focus:outline-none focus:border-foreground mb-6"
              placeholder="Pega el JSON aquí..."
            />
            <div className="flex items-center justify-end gap-3 mt-auto">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const ta = document.getElementById('import-json-textarea') as HTMLTextAreaElement;
                  if (!ta || !ta.value) return;
                  try {
                    const blob = new Blob([ta.value], { type: 'application/json' });
                    const fd = new FormData();
                    fd.append('file', blob, 'import.json');
                    const res = await fetch('/api/portfolios/import_json', {
                      method: 'POST',
                      body: fd
                    });
                    if (res.ok) {
                      setShowImportModal(false);
                      window.location.reload();
                    } else {
                      alert('Error al importar el portafolio JSON.');
                    }
                  } catch (e) {
                    console.error(e);
                    alert('Error de red.');
                  }
                }}
                className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
