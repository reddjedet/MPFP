import React, { useState } from 'react';
import { Calendar, TrendingUp, Clock, Coins, Edit2, Check, X, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface FixedIncomeItem {
  ticker: string;
  nombre: string;
  tipo: string;
  vence: string;
  dias: number | null;
  is_imminent: boolean;
  nominals: number;
  ppc_unit: number;
  ppc_base_100: number;
  precio_spot_unit: number;
  precio_spot_base_100: number;
  tem_mkt: number | null;
  tea: number | null;
  tna: number | null;
  md: number | null;
  vf_base_100: number | null;
  invested_capital: number;
  current_market_value: number;
  pnl_ars: number;
  pnl_pct: number;
  projected_payoff: number;
  projected_profit_ars: number;
  projected_profit_pct: number;
  target_weight_portfolio: number;
  target_weight_rf: number;
}

export interface FixedIncomeSummary {
  has_fixed_income: boolean;
  asset_allocation?: {
    equity_weight: number;
    fixed_income_weight: number;
  } | null;
  items: FixedIncomeItem[];
  total_invested: number;
  total_market_value: number;
  total_pnl_ars: number;
  total_pnl_pct: number;
  total_projected_maturity_payoff: number;
  total_projected_profit_ars: number;
  total_projected_profit_pct: number;
  nearest_maturity_days: number | null;
  nearest_maturity_ticker: string | null;
  has_imminent_maturity: boolean;
}

interface Props {
  summary: FixedIncomeSummary;
  pfType: string;
  onRefresh: () => void;
}

export const PortfolioFixedIncomeTable: React.FC<Props> = ({ summary, pfType, onRefresh }) => {
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editNominals, setEditNominals] = useState<number>(0);
  const [editPpc, setEditPpc] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const startEdit = (item: FixedIncomeItem) => {
    setEditingTicker(item.ticker);
    setEditNominals(item.nominals);
    setEditPpc(item.ppc_base_100 ? item.ppc_base_100.toString() : '');
  };

  const cancelEdit = () => {
    setEditingTicker(null);
    setSaving(false);
  };

  const handleSave = async (ticker: string) => {
    setSaving(true);
    try {
      const ppcVal = parseFloat(editPpc);
      const res = await fetch('/api/rotation/fixed_income/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: pfType,
          ticker,
          nominals: Math.max(0, editNominals),
          ppc: !isNaN(ppcVal) && ppcVal > 0 ? ppcVal : null,
        }),
      });
      if (res.ok) {
        setEditingTicker(null);
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!summary.items || summary.items.length === 0) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center border border-white/10 text-zinc-400 text-sm">
        Esta cartera no tiene activos de renta fija configurados.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* TARJETAS EJECUTIVAS DE RENTA FIJA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#181920] border border-white/10 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Capital Invertido (RF)</span>
            <Coins className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-white tracking-tight">
              ${summary.total_invested.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">Costo base acumulado</span>
          </div>
        </div>

        <div className="bg-[#181920] border border-white/10 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Valor de Mercado Spot</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-white tracking-tight">
              ${summary.total_market_value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs font-mono font-bold ${summary.total_pnl_ars >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.total_pnl_ars >= 0 ? '+' : ''}${summary.total_pnl_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${summary.total_pnl_pct >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                {summary.total_pnl_pct >= 0 ? '+' : ''}{summary.total_pnl_pct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#181920] border border-white/10 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cobro a Finish (Vto)</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-blue-400 tracking-tight">
              ${summary.total_projected_maturity_payoff.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-mono font-bold text-emerald-400">
                +${summary.total_projected_profit_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">
                +{summary.total_projected_profit_pct.toFixed(2)}% total
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#181920] border border-white/10 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Próximo Vencimiento</span>
            <Clock className={`w-4 h-4 ${summary.has_imminent_maturity ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} />
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{summary.nearest_maturity_ticker || '-'}</span>
              {summary.nearest_maturity_days !== null && (
                <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${summary.has_imminent_maturity ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/10 text-zinc-300'}`}>
                  {summary.nearest_maturity_days} días
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-400">
              {summary.has_imminent_maturity ? '⚠️ Vencimiento inminente (< 30d)' : 'Posición temporal activa'}
            </span>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE RENTA FIJA */}
      <div className="bg-[#181920] border border-white/10 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Títulos de Renta Fija en Cartera</h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {summary.items.length} {summary.items.length === 1 ? 'título registrado' : 'títulos registrados'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-zinc-400 uppercase font-semibold text-[10px] tracking-wider">
                <th className="px-3 py-3">Instrumento</th>
                <th className="px-3 py-3 text-center">Vencimiento</th>
                <th className="px-3 py-3 text-right">Peso Obj.</th>
                <th className="px-3 py-3 text-right">Nominales</th>
                <th className="px-3 py-3 text-right">PPC ($)</th>
                <th className="px-3 py-3 text-right">Spot ($)</th>
                <th className="px-3 py-3 text-right">Val. Mercado</th>
                <th className="px-3 py-3 text-right">Devengado PnL</th>
                <th className="px-3 py-3 text-center">Tasa Mercado</th>
                <th className="px-3 py-3 text-right">Cobro Finish</th>
                <th className="px-3 py-3 text-right">Ganancia Vto.</th>
                <th className="px-3 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {summary.items.map((item) => {
                const isEditing = editingTicker === item.ticker;

                return (
                  <tr key={item.ticker} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-white font-mono">{item.ticker}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {item.tipo}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate max-w-[140px]">{item.nombre}</div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <div className="text-zinc-200">{item.vence}</div>
                      {item.dias !== null && (
                        <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-bold ${item.is_imminent ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-zinc-400'}`}>
                          {item.dias}d
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <div className="text-white font-bold">{item.target_weight_portfolio.toFixed(2)}%</div>
                      <div className="text-[10px] text-zinc-400">({item.target_weight_rf.toFixed(1)}% RF)</div>
                    </td>

                    <td className="px-3 py-2.5 text-right font-bold text-white">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          value={editNominals}
                          onChange={(e) => setEditNominals(parseInt(e.target.value) || 0)}
                          className="w-24 bg-black/50 border border-blue-500/50 rounded px-2 py-1 text-right text-xs text-white outline-none"
                        />
                      ) : (
                        item.nominals.toLocaleString('es-AR')
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editPpc}
                          placeholder="PPC"
                          onChange={(e) => setEditPpc(e.target.value)}
                          className="w-20 bg-black/50 border border-blue-500/50 rounded px-2 py-1 text-right text-xs text-white outline-none"
                        />
                      ) : (
                        <div>
                          <span className="text-zinc-200">${item.ppc_base_100.toFixed(2)}</span>
                          <div className="text-[9px] text-zinc-400 font-mono">(${item.ppc_unit.toFixed(4)} u)</div>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <span className="text-zinc-200 font-bold">${item.precio_spot_base_100.toFixed(2)}</span>
                      <div className="text-[9px] text-zinc-400 font-mono">(${item.precio_spot_unit.toFixed(4)} u)</div>
                    </td>

                    <td className="px-3 py-2.5 text-right font-bold text-white">
                      ${item.current_market_value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <div className={`font-bold ${item.pnl_ars >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.pnl_ars >= 0 ? '+' : ''}${item.pnl_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-[10px] ${item.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.pnl_pct >= 0 ? '+' : ''}{item.pnl_pct.toFixed(2)}%
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      {item.tem_mkt !== null ? (
                        <div>
                          <span className="text-white font-bold">{item.tem_mkt.toFixed(2)}%</span>
                          <span className="text-[10px] text-zinc-400 block font-sans">TEM</span>
                        </div>
                      ) : item.tea !== null ? (
                        <div>
                          <span className="text-white font-bold">{item.tea.toFixed(1)}%</span>
                          <span className="text-[10px] text-zinc-400 block font-sans">TEA</span>
                        </div>
                      ) : (
                        <span className="text-zinc-500 font-sans">-</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right font-bold text-blue-400">
                      ${item.projected_payoff.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <div className="text-[9px] text-zinc-400 font-mono">VF: ${item.vf_base_100?.toFixed(2)}</div>
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <div className="text-emerald-400 font-bold">
                        +${item.projected_profit_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-emerald-400/90">
                        +{item.projected_profit_pct.toFixed(2)}%
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSave(item.ticker)}
                            disabled={saving}
                            className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer"
                            title="Guardar cambios"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                          title="Editar nominales y PPC"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
