import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { 
  TooltipComponent, 
  GridComponent, 
  LegendComponent 
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '../../hooks/useChartTheme';

echarts.use([
  BarChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;

export interface AnnualReturnRow {
  year: number;
  sharpe?: number | null;
  min_vol?: number | null;
  cartera_actual?: number | null;
  spy?: number | null;
}

interface AnnualReturnsBarChartProps {
  annualRows: AnnualReturnRow[];
  hasCurrent: boolean;
  currentPfName?: string;
  hasSpy: boolean;
}

export const AnnualReturnsBarChart: React.FC<AnnualReturnsBarChartProps> = ({
  annualRows,
  hasCurrent,
  currentPfName,
  hasSpy
}) => {
  const chartTheme = useChartTheme();

  const barOption = useMemo(() => {
    if (!annualRows || annualRows.length === 0) return {};

    const years = annualRows.map(r => String(r.year));
    const currentName = currentPfName ? currentPfName.toUpperCase() : 'CARTERA ACTUAL';

    const seriesList: any[] = [
      {
        name: 'Sharpe Óptimo',
        type: 'bar',
        barWidth: annualRows.length > 5 ? '14%' : '18%',
        itemStyle: { 
          color: '#f59e0b',
          borderRadius: [3, 3, 0, 0]
        },
        data: annualRows.map(r => r.sharpe ?? null)
      },
      {
        name: 'Mín. Volatilidad',
        type: 'bar',
        barWidth: annualRows.length > 5 ? '14%' : '18%',
        itemStyle: { 
          color: '#ef4444',
          borderRadius: [3, 3, 0, 0]
        },
        data: annualRows.map(r => r.min_vol ?? null)
      }
    ];

    if (hasCurrent) {
      seriesList.push({
        name: currentName,
        type: 'bar',
        barWidth: annualRows.length > 5 ? '14%' : '18%',
        itemStyle: { 
          color: '#10b981',
          borderRadius: [3, 3, 0, 0]
        },
        data: annualRows.map(r => r.cartera_actual ?? null)
      });
    }

    if (hasSpy) {
      seriesList.push({
        name: 'SPY Benchmark',
        type: 'bar',
        barWidth: annualRows.length > 5 ? '14%' : '18%',
        itemStyle: { 
          color: '#3b82f6',
          borderRadius: [3, 3, 0, 0]
        },
        data: annualRows.map(r => r.spy ?? null)
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: any[]) => {
          if (!params || params.length === 0) return '';
          const yearLabel = params[0]?.name || '';
          let html = `<div style="font-weight: bold; margin-bottom: 6px; color: #fff; font-size: 12px;">Año ${yearLabel}</div>`;
          
          let sharpeVal: number | null = null;
          let spyVal: number | null = null;

          params.forEach((item: any) => {
            const val = typeof item.value === 'number' ? item.value : null;
            if (item.seriesName === 'Sharpe Óptimo') sharpeVal = val;
            if (item.seriesName === 'SPY Benchmark') spyVal = val;

            const formattedVal = val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : '—';
            const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${item.color};margin-right:6px;"></span>`;
            
            html += `<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
              <span>${colorDot}${item.seriesName}:</span>
              <b>${formattedVal}</b>
            </div>`;
          });

          if (sharpeVal !== null && spyVal !== null) {
            const alpha = sharpeVal - spyVal;
            const alphaColor = alpha >= 0 ? '#34d399' : '#f87171';
            html += `<div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px; color: ${alphaColor}; font-weight: bold;">
              Alpha (Sharpe - SPY): ${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)}%
            </div>`;
          }

          return html;
        }
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' }
      },
      grid: {
        left: 45,
        right: 15,
        top: 36,
        bottom: 25
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 11, fontWeight: 'bold' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { 
          color: chartTheme.textMuted, 
          fontSize: 10,
          formatter: '{value}%' 
        },
        splitLine: { 
          lineStyle: { 
            color: chartTheme.splitLine, 
            type: 'dashed' 
          } 
        }
      },
      series: seriesList
    };
  }, [annualRows, hasCurrent, currentPfName, hasSpy, chartTheme]);

  if (!annualRows || annualRows.length === 0) return null;

  return (
    <div className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
          Rendimiento por Año Calendario
        </h4>
        <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
          {annualRows.length} períodos anuales calculados
        </span>
      </div>
      <div className="h-64 w-full">
        <ReactECharts
          echarts={echarts}
          option={barOption}
          notMerge={true}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
};
