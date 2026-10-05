import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { TooltipComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '@/hooks/useChartTheme';
import { EtfItem, EtfRotationData } from '@/hooks/useEtfRotation';

echarts.use([BarChart, TooltipComponent, GridComponent, CanvasRenderer]);
const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;

export const EtfRotationBarChart = ({ data, displayedItems }: { data: EtfRotationData | null, displayedItems: EtfItem[] }) => {
  const chartTheme = useChartTheme();
  const barChartOption = useMemo(() => {
    if (!data || displayedItems.length === 0) {
      return {};
    }

    const cleanList = displayedItems.filter(
      it => it.ticker !== 'TLT' && it.ticker !== 'ARGT' && it.diff_vs_spy_w !== null
    );
    if (cleanList.length === 0) {
      return {};
    }
    const sorted = [...cleanList].sort((a, b) => (a.diff_vs_spy_w ?? 0) - (b.diff_vs_spy_w ?? 0));
    const categories = sorted.map(it => `${it.ticker} • ${it.name}`);
    const values = sorted.map(it => {
      const diff = it.diff_vs_spy_w ?? 0;
      const isPositive = diff >= 0;
      return {
        value: diff,
        itemStyle: {
          color: isPositive ? 'rgba(167, 192, 128, 0.85)' : 'rgba(230, 126, 128, 0.85)',
          borderRadius: isPositive ? [0, 4, 4, 0] : [4, 0, 0, 4]
        },
        meta: it
      };
    });

    const spyPerf = data.benchmark?.perf_w;

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 20,
        right: 50,
        bottom: 25,
        left: 60
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#272e33',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        textStyle: { color: '#ffffff', fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: any) => {
          if (!params || !params[0]) return '';
          const p = params[0];
          const it: EtfItem = p.data.meta;
          const diff = p.value;
          const diffText = `${diff >= 0 ? '+' : ''}${Number(diff).toFixed(2)} p.p.`;
          const etfPerf = it.perf_w === null || it.perf_w === undefined
            ? '—'
            : `${it.perf_w >= 0 ? '+' : ''}${it.perf_w.toFixed(2)}%`;
          const spyText = spyPerf === null || spyPerf === undefined
            ? '—'
            : `${spyPerf >= 0 ? '+' : ''}${spyPerf.toFixed(2)}%`;
          return `
            <div style="font-family: monospace; min-width: 220px; padding: 2px;">
              <div style="font-weight: bold; color: #ffffff; font-size: 12px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px;">
                ${it.name} <span style="color: #a1a1aa;">(${it.ticker})</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Diferencial vs SPY (1W, p.p.):</span>
                <strong style="color: ${diff >= 0 ? '#a7c080' : '#e67e80'};">${diffText}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Retorno ETF (1W):</span>
                <span style="color: #e2e8f0;">${etfPerf}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Retorno SPY (1W):</span>
                <span style="color: #dbbc7f; font-weight: bold;">${spyText}</span>
              </div>
            </div>
          `;
        }
      },
      xAxis: {
        type: 'value',
        min: (val: { min: number }) => Math.floor(Math.min(val.min * 1.35, val.min - 1.5)),
        max: (val: { max: number }) => Math.ceil(Math.max(val.max * 1.35, val.max + 1.5)),
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v} p.p.`
        }
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLine: { show: true, lineStyle: { color: chartTheme.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: chartTheme.textPrimary,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'monospace',
          margin: 10,
          formatter: (val: string) => val.split(' • ')[0]
        }
      },
      series: [
        {
          name: 'Diferencial vs SPY (1W, p.p.)',
          type: 'bar',
          data: values,
          barWidth: '62%',
          label: {
            show: true,
            position: (params: any) => params.value >= 0 ? 'right' : 'left',
            distance: 6,
            fontSize: 9.5,
            fontFamily: 'monospace',
            fontWeight: 700,
            color: chartTheme.textPrimary,
            formatter: (p: any) => `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)} p.p.`
          }
        }
      ]
    };
  }, [data, displayedItems, chartTheme]);

  return (
    <ReactECharts
      echarts={echarts}
      option={barChartOption}
      style={{ height: '100%', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};
