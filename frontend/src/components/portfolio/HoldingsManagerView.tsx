import React, { useState } from 'react';
import { Plus, Upload, Trash2, AlertTriangle, Save, Anchor, Download, Minus } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_PORTFOLIOS = ['Cartera 1', 'Cartera 2', 'Cartera 3'];

// Inner ring (Sectors)
const SECTOR_DATA = [
  { name: 'Tecnología', value: 45, color: '#3b82f6' },
  { name: 'Consumo', value: 30, color: '#10b981' },
  { name: 'Salud', value: 25, color: '#f59e0b' }
];

// Outer ring (Tickers)
const TICKER_DATA = [
  { name: 'AAPL', value: 25, color: '#60a5fa' },
  { name: 'MSFT', value: 20, color: '#93c5fd' },
  { name: 'KO', value: 15, color: '#34d399' },
  { name: 'MCD', value: 15, color: '#6ee7b7' },
  { name: 'JNJ', value: 15, color: '#fcd34d' },
  { name: 'PFE', value: 10, color: '#fde68a' }
];

export function HoldingsManagerView() {
  const [selectedPf, setSelectedPf] = useState(MOCK_PORTFOLIOS[0]);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [anchorAsset, setAnchorAsset] = useState('AAPL');
  const [anchorScale, setAnchorScale] = useState(1);

  // Mock scaling logic: we assume base nominals for a scale of 1
  const HOLDINGS = [
    { ticker: 'AAPL', relWeight: 25, baseNominals: 10, ppc: 150.5, fv: 180.0 },
    { ticker: 'MSFT', relWeight: 20, baseNominals: 8, ppc: 0, fv: 340.0 }
  ];

  const handleExportJSON = () => {
    // In a real app, this would trigger a download of the state JSON
    alert("Portafolio exportado a portafolio.json con éxito.");
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      
      {/* HEADER: Portfolios Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card border border-border p-5 rounded-2xl">
        
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">
              Portafolio Activo
            </label>
            <select 
              value={selectedPf}
              onChange={(e) => setSelectedPf(e.target.value)}
              className="appearance-none bg-background border border-border rounded-lg px-4 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-foreground min-w-[200px]"
            >
              {MOCK_PORTFOLIOS.map(pf => <option key={pf} value={pf}>{pf}</option>)}
            </select>
          </div>

          <div className="h-8 w-px bg-border hidden sm:block mx-2" />

          <button className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-border text-foreground transition-colors rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Nuevo
          </button>
          
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-border text-foreground transition-colors rounded-lg text-sm font-medium"
          >
            <Upload className="w-4 h-4" /> Importar
          </button>

          <button 
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-border text-foreground transition-colors rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>

        <button 
          onClick={() => setShowDeleteAlert(true)}
          className="flex items-center gap-2 px-4 py-2 bg-negative/10 hover:bg-negative/20 text-negative border border-negative/20 transition-colors rounded-lg text-sm font-bold"
        >
          <Trash2 className="w-4 h-4" /> Borrar Portafolio
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Data Entry */}
        <div className="xl:col-span-2 space-y-6">
          
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Gestión de Tenencias y Pesos</h2>
            
            <div className="flex items-center gap-3 bg-secondary/50 px-3 py-1.5 rounded-lg border border-border">
              <Anchor className="w-4 h-4 text-positive" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Ancla MCM:</span>
                <select 
                  value={anchorAsset}
                  onChange={(e) => setAnchorAsset(e.target.value)}
                  className="bg-transparent text-sm font-bold text-foreground focus:outline-none appearance-none"
                >
                  <option value="AAPL">AAPL</option>
                  <option value="SPY">SPY</option>
                  <option value="KO">KO</option>
                </select>
              </div>
              <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
                <button 
                  onClick={() => setAnchorScale(Math.max(1, anchorScale - 1))}
                  className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-sm font-mono font-bold w-6 text-center">{anchorScale}x</span>
                <button 
                  onClick={() => setAnchorScale(anchorScale + 1)}
                  className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-muted-foreground uppercase tracking-wider bg-secondary/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium text-right">Peso Rel. (%)</th>
                    <th className="px-4 py-3 font-medium text-right">Nom. Objetivo</th>
                    <th className="px-4 py-3 font-medium text-right">PPC</th>
                    <th className="px-4 py-3 font-medium text-right">Fair Value (DCF)</th>
                    <th className="px-4 py-3 font-medium text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {HOLDINGS.map((asset) => (
                    <tr key={asset.ticker} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-foreground">{asset.ticker}</td>
                      <td className="px-4 py-3 text-right">
                        <input type="number" defaultValue={asset.relWeight} className="w-16 text-right bg-background border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input 
                          type="number" 
                          value={asset.baseNominals * anchorScale} 
                          readOnly
                          className="w-20 text-right bg-secondary text-foreground font-mono font-bold border border-border rounded px-2 py-1 text-xs outline-none" 
                        />
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
                  
                  {/* Add New Row */}
                  <tr className="bg-secondary/20">
                    <td className="px-4 py-3"><input type="text" placeholder="Ticker" className="w-16 bg-background border border-border rounded px-2 py-1 text-xs font-bold" /></td>
                    <td className="px-4 py-3 text-right"><input type="number" placeholder="%" className="w-16 text-right bg-background border border-border rounded px-2 py-1 text-xs" /></td>
                    <td className="px-4 py-3 text-right"><input type="number" placeholder="Cant." className="w-20 text-right bg-background border border-border rounded px-2 py-1 text-xs" /></td>
                    <td className="px-4 py-3 text-right"><input type="number" placeholder="US$" className="w-20 text-right bg-background border border-border rounded px-2 py-1 text-xs" /></td>
                    <td className="px-4 py-3 text-right"><input type="number" placeholder="US$" className="w-20 text-right bg-background border border-border rounded px-2 py-1 text-xs" /></td>
                    <td className="px-4 py-3 text-center"><button className="text-positive font-bold hover:underline text-xs">Añadir</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-border bg-secondary/30 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Total Pesos Relativos: <strong className="text-foreground">45%</strong> (Debe sumar 100%)</span>
              <button className="flex items-center gap-2 px-4 py-2 bg-foreground text-background font-bold rounded-lg text-sm transition-opacity hover:opacity-90">
                <Save className="w-4 h-4" /> Guardar Cambios
              </button>
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
                  />
                  {/* Inner Pie: Sectors */}
                  <Pie
                    data={SECTOR_DATA}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius="45%"
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {SECTOR_DATA.map((entry, index) => (
                      <Cell key={`cell-inner-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  
                  {/* Outer Pie: Tickers */}
                  <Pie
                    data={TICKER_DATA}
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
                    {TICKER_DATA.map((entry, index) => (
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
              Estás a punto de eliminar el portafolio <strong>{selectedPf}</strong>. Esta acción es irreversible y perderás la configuración de pesos, activos ancla y tenencias asociadas a él.
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
                Sí, borrar portafolio
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
            <p className="text-sm text-muted-foreground mb-4">
              Pega el contenido JSON de tu portafolio. Debe respetar el siguiente formato estructurado.
            </p>
            
            <div className="bg-secondary/50 rounded-lg p-4 mb-6 font-mono text-xs text-muted-foreground overflow-auto">
              <pre>{`{
  "portfolioName": "Mi Cartera Tech",
  "anchorAsset": "AAPL",
  "holdings": [
    {
      "ticker": "AAPL",
      "relativeWeight": 40,
      "nominales": 20,
      "ppc": 150.00,
      "fairValue": 185.00
    }
  ]
}`}</pre>
            </div>

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
                <Upload className="w-4 h-4" /> Importar Datos
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
