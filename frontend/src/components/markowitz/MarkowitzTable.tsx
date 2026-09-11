import React, { useMemo, useState } from 'react';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getSortedRowModel, 
  useReactTable, 
  SortingState 
} from '@tanstack/react-table';

interface WeightRow {
  ticker: string;
  sharpe_weight: number;
  min_vol_weight: number;
  sharpe_weight_fmt: string;
  min_vol_weight_fmt: string;
}


interface MarkowitzTableProps {
  data: any;
}

export const MarkowitzTable: React.FC<MarkowitzTableProps> = ({ data }) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  
const columnHelper = createColumnHelper<WeightRow>();
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: 'ACTIVO',
      cell: info => (
        <span className="font-extrabold text-slate-900 dark:text-white font-mono text-sm tracking-wide">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('sharpe_weight', {
      header: () => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200 dark:bg-yellow-500/15 dark:text-[#ffd600] dark:border-yellow-500/30 shadow-sm">
          ⚡ SHARPE ÓPTIMO
        </span>
      ),
      cell: info => {
        const val = info.getValue() || 0;
        const isZero = val < 0.01;
        return (
          <span className={`font-mono tabular-nums font-bold text-sm ${isZero ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-900 dark:text-white'}`}>
            {val.toFixed(2).replace('.', ',')}%
          </span>
        );
      },
    }),
    columnHelper.accessor('min_vol_weight', {
      header: () => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-rose-50 text-rose-900 border border-rose-200 dark:bg-red-500/15 dark:text-[#ff6b6b] dark:border-red-500/30 shadow-sm">
          🛡️ MÍNIMA VOLATILIDAD
        </span>
      ),
      cell: info => {
        const val = info.getValue() || 0;
        const isZero = val < 0.01;
        return (
          <span className={`font-mono tabular-nums font-bold text-sm ${isZero ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-900 dark:text-white'}`}>
            {val.toFixed(2).replace('.', ',')}%
          </span>
        );
      },
    }),
  ], []);

  const table = useReactTable({
    data: data?.weights_table || [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="w-full bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th 
                    key={header.id} 
                    className="p-3.5 font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 text-xs cursor-pointer hover:text-slate-900 dark:hover:text-white select-none transition-colors"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: <span className="text-blue-600 dark:text-blue-400">↑</span>,
                        desc: <span className="text-blue-600 dark:text-blue-400">↓</span>,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="p-3.5 align-middle">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
