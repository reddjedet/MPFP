import React, { useState } from 'react';
import { RefreshCcw, Coins, TrendingUp, ShieldCheck, Clock, Calendar } from "lucide-react";

export interface FixedIncomeItem {
  ticker: string;
  nombre: string;
  tipo: string;
  vence: string;
  dias: number | null;
  dias_transcurridos?: number | null;
  dias_totales?: number | null;
  pct_ciclo?: number | null;
  is_imminent: boolean;
  nominals: number;
  ppc_unit: number;
  ppc_base_100: number;
  precio_spot_unit: number;
  precio_spot_base_100: number;
  tem_mkt: number | null;
  tea: number | null;
  tna: number | null;
  tna_compra?: number | null;
  tea_compra?: number | null;
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
  real_weight_rf?: number;
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
  weighted_tna_compra?: number | null;
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
      <div className="glass-panel p-8 rounded-2xl text-center border border-border text-muted-foreground text-sm">
        Esta cartera no tiene activos de renta fija configurados.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* TARJETAS EJECUTIVAS DE RENTA FIJA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Capital Invertido (RF)</span>
            <Coins className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-white tracking-tight">
              ${summary.total_invested.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">Costo base acumulado</span>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
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

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cobro a Finish (Vto)</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-xl font-mono font-bold text-blue-400 tracking-tight">
              ${summary.total_projected_maturity_payoff.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs font-mono font-bold text-emerald-400">
                +${summary.total_projected_profit_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">
                +{summary.total_projected_profit_pct.toFixed(2)}% total
              </span>
              {summary.weighted_tna_compra !== null && summary.weighted_tna_compra !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  TNA Pond: {summary.weighted_tna_compra.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Próximo Vencimiento</span>
            <Clock className={`w-4 h-4 ${summary.has_imminent_maturity ? 'text-amber-400 animate-pulse' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{summary.nearest_maturity_ticker || '-'}</span>
              {summary.nearest_maturity_days !== null && (
                <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${summary.has_imminent_maturity ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/10 text-muted-foreground'}`}>
                  {summary.nearest_maturity_days} días
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {summary.has_imminent_maturity ? '⚠️ Vencimiento inminente (< 30d)' : 'Posición temporal activa'}
            </span>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE RENTA FIJA */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Títulos de Renta Fija en Cartera</h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {summary.items.length} {summary.items.length === 1 ? 'título registrado' : 'títulos registrados'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
                        <thead>
              {/* TIER 1: MACRO-GRUPOS DE UTILIDAD */}
              <tr className="border-b border-border bg-secondary text-[10px] uppercase font-mono font-bold tracking-wider">
                <th colSpan={2} className="px-2.5 py-2 border-r border-border text-muted-foreground">
                  1. QUÉ COMPRÉ
                </th>
                <th colSpan={3} className="px-2.5 py-2 border-r border-border text-muted-foreground text-center">
                  2. CÓMO ERA (AL COMPRAR)
                </th>
                <th colSpan={4} className="px-2.5 py-2 border-r border-border text-muted-foreground text-center">
                  3. CÓMO VA (SPOT)
                </th>
                <th colSpan={2} className="px-2.5 py-2 text-muted-foreground text-center">
                  4. CÓMO TERMINARÁ (FINISH)
                </th>
              </tr>

              {/* TIER 2: COLUMNAS CLARAS Y DIRECTAS */}
              <tr className="border-b border-border bg-white/[0.02] text-muted-foreground uppercase font-semibold text-[10px] tracking-wider font-mono">
                {/* 1. QUÉ COMPRÉ */}
                <th className="px-2.5 py-2 text-left">Instrumento</th>
                <th className="px-2.5 py-2 text-center border-r border-border">Vencimiento</th>

                {/* 2. CÓMO ERA (AL COMPRAR) */}
                <th className="px-2.5 py-2 text-right">Nominales</th>
                <th className="px-2.5 py-2 text-right">PPC (Base 100)</th>
                <th className="px-2.5 py-2 text-right border-r border-border">Costo Invertido</th>

                {/* 3. CÓMO VA (SPOT) */}
                <th className="px-2.5 py-2 text-right">Precio Spot (Base 100)</th>
                <th className="px-2.5 py-2 text-right">Val. Mercado</th>
                <th className="px-2.5 py-2 text-right">PnL Acum.</th>
                <th className="px-2.5 py-2 text-center border-r border-border" title="Tasa Interna de Retorno del mercado actual (TEM / TNA)">TIR Mercado</th>

                {/* 4. CÓMO TERMINARÁ (FINISH) */}
                <th className="px-2.5 py-2 text-right">Cobro Finish</th>
                <th className="px-2.5 py-2 text-right">Ganancia Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-xs">
              {summary.items.map((item) => {

                return (
                  <tr key={item.ticker} className="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                    {/* 1. Instrumento */}
                    <td className="px-2.5 py-2 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-xs text-white font-mono">{item.ticker}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                          {item.tipo}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.nombre}</div>
                    </td>

                    {/* Vto & Ciclo */}
                    <td className="px-2.5 py-2 text-center border-r border-border">
                      <div className="text-foreground font-mono text-xs font-semibold">{item.vence}</div>
                      {item.dias !== null && (
                        <div className="flex flex-col items-center gap-0.5 mt-0.5">
                          <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-bold font-mono ${
                            item.is_imminent 
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse' 
                              : 'text-muted-foreground bg-white/5'
                          }`}>
                            {item.dias}d restantes
                          </span>
                          {item.pct_ciclo !== null && item.pct_ciclo !== undefined && (
                            <div className="w-14 bg-black/40 h-1 rounded-full overflow-hidden mt-0.5" title={`${item.dias_transcurridos || 0}d transcurridos de ${item.dias_totales || item.dias}d (${item.pct_ciclo}%)`}>
                              <div 
                                className={`h-full ${item.pct_ciclo >= 80 ? 'bg-amber-400' : 'bg-blue-400'}`} 
                                style={{ width: `${item.pct_ciclo}%` }} 
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </td>



                    {/* 2. Mi Inversión: Nominales */}
                    <td className="px-2.5 py-2 text-right font-bold text-white font-mono">
                      {item.nominals.toLocaleString('es-AR')}
                    </td>

                    {/* Precio Compra (PPC) */}
                    <td className="px-2.5 py-2 text-right font-mono">
                      <div>
                        <span className="text-foreground font-semibold">${item.ppc_base_100.toFixed(2)}</span>
                        <div className="text-[9px] text-muted-foreground">(${item.ppc_unit.toFixed(4)} u)</div>
                      </div>
                    </td>

                    {/* Invertido ($) */}
                    <td className="px-2.5 py-2 text-right font-bold text-foreground font-mono border-r border-border">
                      ${item.invested_capital.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>



                    {/* 4. Mercado Spot: SPOT ($) */}
                    <td className="px-2.5 py-2 text-right font-mono">
                      <span className="text-foreground font-bold">${item.precio_spot_base_100.toFixed(2)}</span>
                      <div className="text-[9px] text-muted-foreground">(${item.precio_spot_unit.toFixed(4)} u)</div>
                    </td>

                    {/* Val. Mercado */}
                    <td className="px-2.5 py-2 text-right font-bold text-white font-mono">
                      ${item.current_market_value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Ganancia Acumulada */}
                    <td className="px-2.5 py-2 text-right font-mono">
                      <div className={`font-bold ${item.pnl_ars >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.pnl_ars >= 0 ? '+' : ''}${item.pnl_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-[10px] ${item.pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.pnl_pct >= 0 ? '+' : ''}{item.pnl_pct.toFixed(2)}%
                      </div>
                    </td>

                    {/* Tasa Mercado */}
                    <td className="px-2.5 py-2 text-center font-mono border-r border-border">
                      {item.tem_mkt !== null && item.tem_mkt !== undefined ? (
                        <div>
                          <span className="text-white font-bold text-xs">TEM {item.tem_mkt.toFixed(2)}%</span>
                          {item.tna !== null && item.tna !== undefined && (
                            <span className="text-[9px] text-muted-foreground block font-sans">TNA {item.tna.toFixed(1)}%</span>
                          )}
                        </div>
                      ) : item.tna !== null && item.tna !== undefined ? (
                        <span className="text-white font-bold text-xs">TNA {item.tna.toFixed(1)}%</span>
                      ) : (
                        <span className="text-muted-foreground font-sans">-</span>
                      )}
                    </td>

                    {/* 5. Al Vencimiento: Cobro Finish */}
                    <td className="px-2.5 py-2 text-right font-mono">
                      <div className="font-bold text-blue-400 text-xs">
                        ${item.projected_payoff.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {item.vf_base_100 && (
                        <span className="inline-block text-[9px] px-1 py-0.2 rounded bg-blue-500/15 text-blue-300 font-mono mt-0.5">
                          VF: ${item.vf_base_100.toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* Ganancia a Vto */}
                    <td className="px-2.5 py-2 text-right font-mono">
                      <div className="text-emerald-400 font-bold text-xs">
                        +${item.projected_profit_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 mt-0.5">
                        +{item.projected_profit_pct.toFixed(2)}%
                      </span>
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
