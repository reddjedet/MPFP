import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Upload, Trash2, AlertTriangle, Save, Anchor, Download, Minus } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export function HoldingsManagerView() {
  const [portfolios, setPortfolios] = useState<Record<string, any>>({});
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [selectedPf, setSelectedPf] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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
  const { holdings, sectorData, tickerData } = useMemo(() => {
    if (!selectedPf || !portfolios[selectedPf]) {
      return { holdings: [], sectorData: [], tickerData: [] };
    }

    const pfAssets = portfolios[selectedPf].assets || {};
    const pfNominals = portfolios[selectedPf].nominals || {};
    const pfFv = portfolios[selectedPf].fv || {};
    const pfPpc = portfolios[selectedPf].ppc || {};

    const rawHoldings = [];
    let totalValue = 0;
    const sectorValues: Record<string, number> = {};

    for (const [ticker, weight] of Object.entries(pfAssets)) {
      const q = quotes[ticker] || {};
      const price = q.local || q.cedear_usd || 0;
      const nominals = pfNominals[ticker] || 0;
      const fv = pfFv[ticker] || q.gf_value || 0;
      const ppc = pfPpc[ticker] || 0;
      const sector = q.is_etf ? 'ETF' : 'Acciones'; // simplified sector logic for now

      const val = nominals > 0 ? (nominals * price) : (Number(weight) * 1000); // Fallback
      totalValue += val;

      rawHoldings.push({
        ticker,
        relWeight: Number(weight),
        baseNominals: nominals,
        ppc,
        fv,
        price,
        value: val,
        sector
      });
    }

    rawHoldings.forEach(h => {
      sectorValues[h.sector] = (sectorValues[h.sector] || 0) + h.value;
    });

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];
    let cIdx = 0;
    
    const sData = Object.entries(sectorValues)
      .map(([name, val]) => ({ name, value: val, color: COLORS[cIdx++ % COLORS.length] }))
      .sort((a, b) => b.value - a.value);

    let tIdx = 0;
    const tData = rawHoldings
      .map(h => ({ name: h.ticker, value: h.value, color: COLORS[tIdx++ % COLORS.length] }))
      .sort((a, b) => b.value - a.value);

    return { holdings: rawHoldings.sort((a, b) => b.value - a.value), sectorData: sData, tickerData: tData };
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Data Table */}
        <div className="lg:col-span-2 space-y-6">
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
                    <tr key={asset.ticker} className="hover:bg-secondary/30 transition-colors group">
                      <td className="px-4 py-3 font-bold text-foreground flex items-center gap-2">
                        {asset.ticker}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input type="number" defaultValue={asset.relWeight} className="w-16 text-right bg-background border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input type="number" defaultValue={asset.baseNominals} className="w-20 text-right bg-background border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input type="number" defaultValue={asset.ppc} className="w-20 text-right bg-background border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input type="number" defaultValue={asset.fv} className="w-20 text-right bg-background border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-3 text-center"><button className="text-negative hover:underline text-xs">Quitar</button></td>
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
            
            <div className="flex-1 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                    formatter={(val: any) => `$${Number(val).toLocaleString('es-AR', {maximumFractionDigits:0})}`}
                  />
                  {/* Inner Pie: Sectors */}
                  <Pie
                    data={sectorData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius="45%"
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {sectorData.map((entry: any, index: number) => (
                      <Cell key={`cell-inner-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  
                  {/* Outer Pie: Tickers */}
                  <Pie
                    data={tickerData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="70%"
                    stroke="var(--background)"
                    strokeWidth={2}
                    label={({ name }) => name}
                    labelLine={false}
                  >
                    {tickerData.map((entry: any, index: number) => (
                      <Cell key={`cell-outer-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* Delete Alert Modal */}
      {showDeleteAlert && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-negative/10 rounded-full">
                <AlertTriangle className="w-6 h-6 text-negative" />
              </div>
              <h3 className="text-lg font-bold text-foreground">¿Estás completamente seguro?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Estás a punto de eliminar el portafolio <strong>{selectedPf}</strong>.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowDeleteAlert(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => setShowDeleteAlert(false)}
                className="px-4 py-2 bg-negative text-background rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
              >
                Sí, borrar
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
                onClick={() => setShowImportModal(false)}
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
