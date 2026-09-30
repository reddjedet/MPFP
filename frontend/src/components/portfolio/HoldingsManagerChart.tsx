import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { useChartTheme } from '@/hooks/useChartTheme';
import { HoldingRow } from '@/hooks/useHoldingsManager';

echarts.use([TreemapChart, TooltipComponent, SVGRenderer]);
const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtMoney = (n: number, currency = '') => {
  const formatted = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `$${formatted} ${currency}` : `$${formatted}`;
};
const fmtPct = (n: number, digits = 1) =>
  `${n.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const HoldingsManagerChart = ({ composition, chartMode, mcmMultiplier, onNodeClick }: { composition: any, chartMode: any, mcmMultiplier: any, onNodeClick: (params: any) => void }) => {
  const chartTheme = useChartTheme();

  const buildTooltip = (meta: any): string => {
    if (!meta) return '';
    const row: (name: string, value: string) => string = (n, v) =>
      `<div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.75">${n}</span><span>${v}</span></div>`;

    if (meta.kind === 'sector') {
      return [
        `<div style="font-weight:700;margin-bottom:4px">${escapeHtml(meta.name)}</div>`,
        row('Valor', fmtMoney(meta.value, composition.mixedCurrency ? '' : composition.currency)),
        row('Peso', fmtPct(meta.pct)),
        row('Activos', String(meta.count))
      ].join('');
    }

    const h: HoldingRow = meta.row;
    const head = `<div style="font-weight:700;margin-bottom:4px">${escapeHtml(h.ticker)} <span style="font-weight:400;opacity:.7">· ${escapeHtml(h.sector)}</span></div>`;
    const common = [row('Precio', h.price > 0 ? fmtMoney(h.price, h.currency) : '—')];
    if (h.targetNominals > 0) {
      common.push(row('Nom. objetivo', `${h.targetNominals.toLocaleString('es-AR')} (MCM ×${mcmMultiplier})`));
      common.push(row('Faltante', h.faltante > 0 ? `${h.faltante.toLocaleString('es-AR')} nom.` : 'Objetivo cumplido'));
    }

    if (chartMode === 'real') {
      return [
        head,
        ...common,
        row('Nominales', h.baseNominals.toLocaleString('es-AR')),
        row('PPC', h.ppc > 0 ? fmtMoney(h.ppc, h.currency) : '—'),
        row('Costo', fmtMoney(h.cost, h.currency)),
        row('Valor', fmtMoney(h.marketValue, h.currency)),
        row('P&L', `${h.pnl >= 0 ? '+' : ''}${fmtMoney(h.pnl, h.currency)}${h.pnlPct !== null ? ` (${h.pnl >= 0 ? '+' : ''}${fmtPct(h.pnlPct)})` : ''}`),
        row('Peso cartera', fmtPct(meta.pct)),
        row('Peso sector', fmtPct(meta.sectorPct))
      ].join('');
    }

    return [
      head,
      row('Peso objetivo', fmtPct(h.relWeight, 2)),
      row('Peso en sector', fmtPct(meta.sectorPct)),
      ...common,
      ...(h.rsi !== null ? [row('RSI', h.rsi.toFixed(1))] : []),
      ...(h.fv ? [row('Fair Value', fmtMoney(h.fv, 'USD'))] : [])
    ].join('');
  };
  const chartOption = useMemo(() => {
    if (composition.total <= 0) return null;

    const data = composition.sectors.map((s: any) => ({
      name: s.name,
      value: round2(s.total),
      itemStyle: { color: s.color },
      meta: { kind: 'sector', name: s.name, value: s.total, pct: s.pct, count: s.items.length },
      children: s.items.map((it: any) => ({
        name: it.row.ticker,
        value: round2(it.value),
        itemStyle: { color: it.shade },
        meta: { kind: 'ticker', row: it.row, value: it.value, pct: it.pct, sectorPct: it.sectorPct }
      }))
    }));

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        borderRadius: 8,
        formatter: (params: any) => buildTooltip(params.data?.meta)
      },
      series: [
        {
          type: 'treemap',
          data,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: '{b}',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowBlur: 3
          },
          itemStyle: {
            borderColor: chartTheme.cardBorder,
            borderWidth: 2,
            gapWidth: 1
          },
          levels: [
            {
              itemStyle: { borderWidth: 0, gapWidth: 2 }
            },
            {
              itemStyle: { borderWidth: 2, gapWidth: 1, borderColor: chartTheme.cardBorder },
              upperLabel: {
                show: true,
                height: 24,
                color: chartTheme.textPrimary,
                fontWeight: 'bold',
                fontSize: 11,
                backgroundColor: 'transparent'
              }
            },
            {
              itemStyle: { borderWidth: 1, gapWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
            }
          ]
        }
      ]
    };
  }, [composition, chartTheme, chartMode, mcmMultiplier]);

  return (
    <ReactECharts
      echarts={echarts}
      option={chartOption}
      style={{ width: '100%', height: '100%' }}
      onEvents={{ click: onNodeClick }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};
