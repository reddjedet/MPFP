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

const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

interface WeightItem {
  ticker: string;
  sharpe_weight: number;
  min_vol_weight: number;
  sharpe_weight_fmt?: string;
  min_vol_weight_fmt?: string;
}

interface MarkowitzWeightsChartProps {
  data: {
    weights_table?: WeightItem[];
    [key: string]: any;
  };
}

export const MarkowitzWeightsChart: React.FC<MarkowitzWeightsChartProps> = ({ data }) => {
  const chartTheme = useChartTheme();

  const weights = data?.weights_table || [];

  // Ordenar de mayor a menor según el peso máximo en cualquiera de las dos carteras
  const sortedWeights = useMemo(() => {
    return [...weights].sort((a, b) => {
      const maxA = Math.max(a.sharpe_weight || 0, a.min_vol_weight || 0);
      const maxB = Math.max(b.sharpe_weight || 0, b.min_vol_weight || 0);
      return maxB - maxA;
    });
  }, [weights]);

  const tickers = useMemo(() => sortedWeights.map(w => w.ticker), [sortedWeights]);
  const sharpeData = useMemo(() => sortedWeights.map(w => Number((w.sharpe_weight || 0).toFixed(2))), [sortedWeights]);
  const minVolData = useMemo(() => sortedWeights.map(w => Number((w.min_vol_weight || 0).toFixed(2))), [sortedWeights]);

  // Altura adaptativa según la cantidad de activos (mínimo 260px)
  const chartHeight = useMemo(() => {
    const calculated = Math.max(260, tickers.length * 44 + 70);
    return `${calculated}px`;
  }, [tickers.length]);

  const option = useMemo(() => {
    if (tickers.length === 0) return {};

    const maxVal = Math.max(
      ...sharpeData,
      ...minVolData,
      10
    );
    // Margen superior para que no choque con el borde derecho
    const xMax = Math.min(100, Math.ceil((maxVal + 5) / 5) * 5);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: {
            color: 'rgba(255, 255, 255, 0.04)'
          }
        },
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: chartTheme.tooltipText,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace'
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const tickerName = params[0].name;
          const sharpeItem = params.find((p: any) => p.seriesName.includes('Sharpe'));
          const minVolItem = params.find((p: any) => p.seriesName.includes('Volatilidad'));

          const valSharpe = sharpeItem ? Number(sharpeItem.value) : 0;
          const valMinVol = minVolItem ? Number(minVolItem.value) : 0;
          const diff = valSharpe - valMinVol;
          const diffSign = diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
          const diffColor = diff > 0 ? '#ffd600' : '#ff453a';

          return `
            <div style="padding: 4px 6px; min-width: 190px;">
              <div style="font-size: 14px; font-weight: 900; color: #38bdf8; margin-bottom: 6px;">
                ${tickerName}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 4px;">
                <span style="color: #ffd600; font-weight: bold; font-size: 11px;">⚡ Sharpe Óptimo:</span>
                <b style="color: ${chartTheme.textPrimary};">${valSharpe.toFixed(2).replace('.', ',')}%</b>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 6px;">
                <span style="color: #ff453a; font-weight: bold; font-size: 11px;">🛡️ Mín. Volatilidad:</span>
                <b style="color: ${chartTheme.textPrimary};">${valMinVol.toFixed(2).replace('.', ',')}%</b>
              </div>
              <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: ${chartTheme.textMuted};">
                <span>Diferencial (S - MV):</span>
                <b style="color: ${diffColor};">${diffSign.replace('.', ',')}</b>
              </div>
            </div>
          `;
        }
      },
      legend: {
        top: 0,
        right: 16,
        itemWidth: 14,
        itemHeight: 10,
        textStyle: {
          color: chartTheme.textMuted,
          fontSize: 11,
          fontWeight: 'bold'
        },
        data: ['⚡ Sharpe Óptimo', '🛡️ Mínima Volatilidad']
      },
      grid: {
        left: 65,
        right: 45,
        top: 35,
        bottom: 25,
        containLabel: false
      },
      xAxis: {
        type: 'value',
        max: xMax,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: '{value}%'
        }
      },
      yAxis: {
        type: 'category',
        inverse: true, // El activo con mayor asignación queda arriba
        data: tickers,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: chartTheme.textPrimary,
          fontSize: 12,
          fontWeight: 'bold',
          fontFamily: 'JetBrains Mono, monospace'
        }
      },
      series: [
        {
          name: '⚡ Sharpe Óptimo',
          type: 'bar',
          barWidth: 11,
          barGap: '35%',
          itemStyle: {
            color: chartTheme.sharpeOptimalColor,
            borderRadius: [0, 4, 4, 0]
          },
          label: {
            show: true,
            position: 'right',
            formatter: (p: any) => (p.value > 0.05 ? `${p.value.toFixed(1).replace('.', ',')}%` : ''),
            color: chartTheme.textMuted,
            fontSize: 10,
            fontFamily: 'monospace',
            distance: 5
          },
          data: sharpeData
        },
        {
          name: '🛡️ Mínima Volatilidad',
          type: 'bar',
          barWidth: 11,
          itemStyle: {
            color: '#ff453a',
            borderRadius: [0, 4, 4, 0]
          },
          label: {
            show: true,
            position: 'right',
            formatter: (p: any) => (p.value > 0.05 ? `${p.value.toFixed(1).replace('.', ',')}%` : ''),
            color: chartTheme.textMuted,
            fontSize: 10,
            fontFamily: 'monospace',
            distance: 5
          },
          data: minVolData
        }
      ]
    };
  }, [tickers, sharpeData, minVolData, chartTheme]);

  if (tickers.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-slate-900/30 dark:bg-black/20 rounded-2xl p-4 border border-slate-200/50 dark:border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
          Comparativa Visual de Asignación por Activo
        </span>
        <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
          Escala horizontal continua (%)
        </span>
      </div>
      <div style={{ height: chartHeight, width: '100%' }}>
        <ReactECharts
          echarts={echarts}
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
};
