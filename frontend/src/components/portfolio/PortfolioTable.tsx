import { Check, X, RefreshCw } from "lucide-react";
import React, { useMemo, useState } from 'react';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getSortedRowModel, 
  useReactTable, 
  SortingState 
} from '@tanstack/react-table';
import { useAppStore } from '@/store/useAppStore';

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
  is_etf?: boolean;
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
}

const formatRatio = (ratio?: number | string) => {
  if (!ratio || ratio === 'N/A') return '1:1';
  const str = String(ratio);
  return str.includes(':') ? str : `${str}:1`;
};

interface PortfolioTableProps {
  data: any;
  pfType: string;
  onRefresh: () => void;
}


interface ActionDrawerProps {
  row: any;
  pfType: string;
  onRefresh: () => void;
  onClose: () => void;
}

const ActionDrawer: React.FC<ActionDrawerProps> = ({ row, pfType, onRefresh, onClose }) => {
  const [ppc, setPpc] = useState(row.ppc?.toString() || '');
  const [gfValue, setGfValue] = useState(row.gf_value?.toString() || '');
  const [pfcfValue, setPfcfValue] = useState(row.pfcf?.toString() || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload: Record<string, any> = { ticker: row.ticker };
      if (ppc !== (row.ppc?.toString() || '')) {
        payload.ppc = ppc;
      }
      if (gfValue !== (row.gf_value?.toString() || '')) {
        payload.gf_value = gfValue;
      }
      if (pfcfValue !== (row.pfcf?.toString() || '')) {
        payload.pfcf = pfcfValue;
      }

      if (Object.keys(payload).length > 1) {
        const res = await fetch('/api/portfolios/quick_update_json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al actualizar métricas');
      }
      
      onRefresh();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 flex flex-col md:flex-row gap-4 items-end bg-[#13141a] border-t border-b border-white/10 pf-action-drawers relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
      
      <div className="flex flex-col gap-1.5 flex-1">
        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">PPC (A$)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">$</span>
          <input 
            type="number" step="any" min="0"
            className="w-full h-9 pl-7 pr-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-blue-500" 
            value={ppc} onChange={e => setPpc(e.target.value)} placeholder="Ej: 25000.50"
          />
        </div>
      </div>
      
      <div className="flex flex-col gap-1.5 flex-1">
        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Fair Value (GF)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">U$D</span>
          <input 
            type="number" step="any" min="0"
            className="w-full h-9 pl-9 pr-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-blue-500" 
            value={gfValue} onChange={e => setGfValue(e.target.value)} placeholder="Ej: 150.0"
          />
        </div>
      </div>
      
      <div className="flex flex-col gap-1.5 flex-1">
        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">P/FCF Norm</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">×</span>
          <input 
            type="number" step="any" min="0"
            className="w-full h-9 pl-7 pr-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-blue-500" 
            value={pfcfValue} onChange={e => setPfcfValue(e.target.value)} placeholder="Ej: 25.5"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} 
          className="h-9 px-4 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancelar</span>
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleSave(); }} 
          disabled={loading}
          className="h-9 px-4 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span>Guardar</span>
        </button>
      </div>
    </div>
  );
};

const KNOWN_ETFS = new Set([
  'SPY', 'QQQ', 'DIA', 'IWM', 'EEM', 'EWZ', 'ARKK', 'SMH', 'URA', 'GLD', 'SLV', 'USO', 'VEA',
  'XLB', 'XLC', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLU', 'XLV', 'XLY',
  'FXI', 'ILF', 'IVW', 'EWJ', 'GDX', 'IBIT', 'ARGT'
]);

export const PortfolioTable: React.FC<PortfolioTableProps> = ({ data, pfType, onRefresh }) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'price', desc: true }
  ]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const { openTickerDrawer: openTicker360 } = useAppStore();
  
  const columnHelper = createColumnHelper<PortfolioAssetRow>();
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO',
      cell: info => {
        const row = info.row.original;
        const earningsText = row.earnings_badge?.badge_text || row.earnings_badge?.text;
        const gfText = row.gf_signal?.badge_text;
        const pfcfText = row.pfcf_signal?.badge_text;
        const isEtf = row.is_etf || KNOWN_ETFS.has(info.getValue());

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openTicker360(info.getValue(), row);
                }}
                className="font-extrabold text-white tracking-wide text-sm hover:text-blue-400 hover:underline transition-colors text-left cursor-pointer"
                title={`Ver Ficha 360° de ${info.getValue()}`}
              >
                {info.getValue() || '—'}
              </button>
              {isEtf && (
                <span 
                  className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  title="Fondo Indexado (Exchange Traded Fund)"
                >
                  ETF
                </span>
              )}
              <span className="text-[10px] text-zinc-500 font-mono">Ratio: {formatRatio(row.ratio)}</span>
            </div>
              
              {/* Badge Stack de Señales */}
              {(earningsText || gfText || pfcfText) && (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {earningsText && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold border border-orange-500/30">
                      {earningsText}
                    </span>
                  )}
                  {gfText && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30">
                      {gfText}
                    </span>
                  )}
                  {pfcfText && (
                    <span
                      title={row.pfcf_signal?.tooltip}
                      className={`cursor-help text-[10px] px-1.5 py-0.5 rounded font-bold border transition-colors ${
                        row.pfcf_signal?.state_key === 'optimo' || row.pfcf_signal?.state_key === 'compra_optima'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                          : (row.pfcf_signal?.state_key === 'no_comprar' || row.pfcf_signal?.state_key === 'sobrevaluado'
                            ? 'bg-red-500/15 text-red-300 border-red-500/30'
                            : (row.pfcf_signal?.state_key === 'sub_optimo'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : (row.pfcf_signal?.state_key === 'hold'
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700')))
                      }`}>
                      {pfcfText}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('qty', {
        header: 'CANTIDAD',
        cell: info => <span className="font-mono font-bold text-white tabular-nums text-xs">{info.getValue() ?? 0}</span>,
      }),
      columnHelper.accessor('price', {
        header: 'PRECIO ARS',
        cell: info => {
          const val = info.getValue();
          return (
            <span className="font-mono text-zinc-300 tabular-nums text-xs">
              A$ {typeof val === 'number' ? val.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '0,00'}
            </span>
          );
        },
      }),
      columnHelper.accessor('value', {
        header: 'VALOR TOTAL',
        cell: info => {
          const val = info.getValue();
          return (
            <span className="font-mono font-bold text-white tabular-nums text-xs">
              A$ {typeof val === 'number' ? val.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '0,00'}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => (typeof row.real_weight === 'number' ? row.real_weight : (typeof row.real_pct === 'number' ? row.real_pct : 0)), {
        id: 'distribution',
        header: 'DISTRIBUCIÓN',
        cell: info => {
          const row = info.row.original;
          const realPct = typeof row.real_weight === 'number' ? row.real_weight : (typeof row.real_pct === 'number' ? row.real_pct : 0);
          const targetPct = typeof row.weight === 'number' ? row.weight : (typeof row.target_pct === 'number' ? row.target_pct : 0);
          return (
            <div className="flex flex-col gap-1 w-24">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-white font-bold">{realPct.toFixed(1)}%</span>
                <span className="text-zinc-500">obj {targetPct.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden flex">
                <div 
                  className="h-full bg-blue-500 rounded-full" 
                  style={{ width: `${Math.min(100, Math.max(0, realPct))}%` }}
                />
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('rsi', {
        header: 'RSI (14)',
        cell: info => {
          const val = info.getValue();
          if (typeof val !== 'number') return <span className="text-zinc-600 font-mono text-xs">—</span>;
          const isOverbought = val > 65;
          const isOversold = val < 35;
          const colorClass = isOverbought 
            ? 'text-red-400 bg-red-500/10 border-red-500/30' 
            : (isOversold 
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' 
              : 'text-zinc-300 bg-white/5 border-white/10');
          return (
            <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border tabular-nums ${colorClass}`}>
              {val.toFixed(1)}
            </span>
          );
        },
      }),
      columnHelper.accessor('ppc_return', {
        header: 'PPC / RETORNO',
        cell: info => {
          const r = info.getValue();
          const row = info.row.original;
          if (!r || row.ppc === undefined || row.ppc === null) {
            return <span className="text-zinc-600 font-mono text-xs">—</span>;
          }
          return (
            <div className="flex flex-col text-xs font-mono">
              <span className="text-zinc-400 text-[11px]">PPC: ${row.ppc}</span>
              <span className={`font-bold text-[11px] ${r.return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.badge_text || '—'}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor('gf_signal', {
        header: 'FAIR VALUE (USD)',
        cell: info => {
          const sig = info.getValue();
          if (!sig) return <span className="text-zinc-600 font-mono text-xs">—</span>;
          return (
            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/25">
              {sig.badge_text}
            </span>
          );
        },
      }),
    ], []);
  
    const table = useReactTable({
      data: data?.result || [],
      columns,
      state: { sorting },
      onSortingChange: setSorting,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
    });

  return (
    <div className="bg-[#181920] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-white/10 bg-white/[0.02]">
                {headerGroup.headers.map(header => (
                  <th 
                    key={header.id}
                    className={`px-2.5 py-2 text-[10px] font-bold text-zinc-400 tracking-wider uppercase transition-colors select-none ${header.column.getCanSort() ? 'cursor-pointer hover:text-white hover:bg-white/5' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                    title={header.column.getCanSort() ? "Clic para ordenar" : ""}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <span className="text-[10px] opacity-50 flex flex-col -space-y-1">
                          {{
                            asc: <span className="text-blue-500 opacity-100 font-black">↑</span>,
                            desc: <span className="text-blue-500 opacity-100 font-black">↓</span>,
                          }[header.column.getIsSorted() as string] ?? (
                            <span className="text-zinc-600">↕</span>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-white/5">
            {table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
              <tr 
                className={`hover:bg-white/[0.02] transition-colors group cursor-pointer ${expandedRowId === row.id ? 'bg-white/[0.02]' : ''}`}
                onClick={() => setExpandedRowId(expandedRowId === row.id ? null : row.id)}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-2.5 py-2 align-middle">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
              {expandedRowId === row.id && (
                <tr>
                  <td colSpan={columns.length} className="p-0 border-b border-white/10 bg-black/20">
                    <ActionDrawer row={row.original} pfType={pfType} onRefresh={onRefresh} onClose={() => setExpandedRowId(null)} />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
