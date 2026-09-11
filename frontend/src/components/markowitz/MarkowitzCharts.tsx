import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { ScatterChart, LineChart, HeatmapChart } from 'echarts/charts';
import { 
  TooltipComponent, 
  GridComponent, 
  LegendComponent, 
  DataZoomComponent, 
  MarkPointComponent,
  VisualMapComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '../../hooks/useChartTheme';

echarts.use([
  ScatterChart,
  LineChart,
  HeatmapChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  VisualMapComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

interface MarkowitzChartsProps {
  data: any;
  onSelectPoint?: (pointData: any) => void;
}

export const MarkowitzCharts: React.FC<MarkowitzChartsProps> = ({ data, onSelectPoint }) => {
  const chartTheme = useChartTheme();

  const frontierOption = useMemo(() => {
    if (!data?.frontier_data) return {};
    const fd = data.frontier_data;

    const getPointVal = (p: any) => (Array.isArray(p) ? p : (p?.value || [0, 0, 0]));
    const sharpes = (fd.mc_points || [])
      .map((p: any) => getPointVal(p)[2])
      .filter((s: any) => typeof s === 'number' && !isNaN(s));
    const minSharpe = sharpes.length > 0 ? Math.min(...sharpes) : 0;
    const maxSharpe = sharpes.length > 0 ? Math.max(...sharpes) : 2;

    const series: any[] = [
      // 1. Monte Carlo Cloud (4000 portafolios)
      {
        name: 'Portfolios Simulados',
        type: 'scatter',
        symbolSize: 4.5,
        data: fd.mc_points,
        itemStyle: {
          opacity: 0.75,
        },
        z: 2,
      },
      // 2. Línea de Asignación de Capital (CAL)
      {
        name: 'CAL (Línea Capital)',
        type: 'line',
        data: fd.cal_line,
        lineStyle: {
          color: chartTheme.calLineColor,
          width: 2.5,
          type: 'dashed',
        },
        showSymbol: false,
        z: 4,
      },
      // 3. Frontera Eficiente (Curva convexa)
      {
        name: 'Frontera Eficiente',
        type: 'line',
        smooth: true,
        data: fd.efficient_frontier,
        lineStyle: {
          color: '#0082ff',
          width: 3.5,
        },
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#0082ff',
          borderColor: '#ffffff',
          borderWidth: 1.5,
        },
        emphasis: {
          scale: 1.8,
          itemStyle: {
            borderColor: '#38bdf8',
            borderWidth: 2,
          }
        },
        z: 8,
      },
      // 4. Máximo Sharpe (Tangente)
      {
        name: 'Sharpe Óptimo',
        type: 'scatter',
        symbol: 'diamond',
        symbolSize: 16,
        data: [fd.max_sharpe_point],
        itemStyle: {
          color: chartTheme.sharpeOptimalColor,
          borderColor: chartTheme.isDark ? '#ffffff' : '#0f172a',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: chartTheme.isDark ? '#ffd600' : 'rgba(217, 119, 6, 0.35)',
        },
        z: 10,
      },
      // 5. Mínima Volatilidad
      {
        name: 'Mínima Volatilidad',
        type: 'scatter',
        symbol: 'circle',
        symbolSize: 14,
        data: [fd.min_vol_point],
        itemStyle: {
          color: '#ff453a',
          borderColor: '#ffffff',
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: '#ff453a',
        },
        z: 10,
      },
    ];

    // 6. Cartera Actual (si existe)
    if (fd.current_portfolio_point) {
      series.push({
        name: `Cartera Actual (${data.selected_pf.toUpperCase()})`,
        type: 'scatter',
        symbol: 'pin',
        symbolSize: 22,
        data: [fd.current_portfolio_point],
        itemStyle: {
          color: '#10b981',
          borderColor: '#ffffff',
          borderWidth: 2,
          shadowBlur: 12,
          shadowColor: '#10b981',
        },
        z: 12,
      });
    }

    // 7. Activos Individuales
    if (fd.assets_points && fd.assets_points.length > 0) {
      series.push({
        name: 'Activos Individuales',
        type: 'scatter',
        symbol: 'circle',
        symbolSize: 9,
        data: fd.assets_points.map((a: any) => ({
          value: [a.vol, a.ret, a.sharpe],
          ticker: a.ticker,
        })),
        itemStyle: {
          color: chartTheme.isDark ? '#ffffff' : '#0284c7',
          borderColor: chartTheme.isDark ? '#38bdf8' : '#0369a1',
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: (p: any) => p.data?.ticker || '',
          position: 'top',
          color: chartTheme.scatterAssetLabelColor,
          fontWeight: 'bold',
          fontSize: 10,
          textBorderColor: chartTheme.scatterAssetLabelBorder,
          textBorderWidth: 2,
        },
        z: 11,
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        formatter: (params: any) => {
          const seriesName = params.seriesName;
          const val = params.value || (params.data && params.data.value) || params.data;
          if (!val || !Array.isArray(val)) return '';
          const tickerHeader = params.data?.ticker ? `<div style="font-size:13px;font-weight:900;color:${chartTheme.isDark ? '#38bdf8' : '#0284c7'};margin-bottom:2px;">${params.data.ticker}</div>` : '';
          
          let weightsHtml = '';
          const weights = params.data?.weights;
          if (weights && typeof weights === 'object' && Object.keys(weights).length > 0) {
            const sortedWeights = Object.entries(weights)
              .map(([tk, w]: [string, any]) => ({
                ticker: tk,
                weight: (typeof w === 'number' && w <= 1.0 ? w * 100.0 : Number(w))
              }))
              .filter(item => item.weight >= 0.5)
              .sort((a, b) => b.weight - a.weight);

            const topAssets = sortedWeights.slice(0, 4);
            const remaining = sortedWeights.length - topAssets.length;
            const previewStr = topAssets
              .map(a => `<span style="color:#ffffff;font-weight:bold;">${a.ticker}</span> ${a.weight.toFixed(1)}%`)
              .join(', ');

            weightsHtml = `
              <div style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.1);font-size:10px;">
                <span style="color:${chartTheme.textMuted};">Composición:</span> ${previewStr}${remaining > 0 ? ` <span style="color:${chartTheme.textMuted};">+${remaining} más</span>` : ''}
                <div style="color:#10b981;font-weight:bold;margin-top:4px;font-size:10px;">★ Clic para inspeccionar o guardar</div>
              </div>
            `;
          }

          return `
            <div style="padding: 2px 4px; max-width: 260px;">
              ${tickerHeader}
              <div style="font-weight:bold;color:${chartTheme.textPrimary};margin-bottom:4px;">${seriesName}</div>
              <div style="display:flex;justify-content:space-between;gap:12px;color:${chartTheme.textMuted};"><span>Volatilidad anual:</span><b style="color:${chartTheme.textPrimary}">${val[0].toFixed(2)}%</b></div>
              <div style="display:flex;justify-content:space-between;gap:12px;color:${chartTheme.textMuted};"><span>Retorno anual:</span><b style="color:${chartTheme.textPrimary}">${val[1].toFixed(2)}%</b></div>
              ${val[2] !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px;color:${chartTheme.isDark ? '#fbbf24' : '#b45309'};"><span>Ratio de Sharpe:</span><b>${val[2].toFixed(3)}</b></div>` : ''}
              ${weightsHtml}
            </div>
          `;
        },
      },
      visualMap: {
        min: Math.floor(minSharpe * 10) / 10,
        max: Math.ceil(maxSharpe * 10) / 10,
        dimension: 2,
        seriesIndex: 0,
        orient: 'vertical',
        right: 10,
        top: 'middle',
        text: ['Alto Sharpe', 'Bajo'],
        textStyle: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' },
        inRange: {
          color: [
            '#313695',
            '#4575b4',
            '#74add1',
            '#abd9e9',
            '#fee090',
            '#fdae61',
            '#f46d43',
            '#d73027',
            '#a50026',
          ],
        },
        calculable: true,
      },
      legend: {
        type: 'scroll',
        top: 0,
        selected: {
          'Portfolios Simulados': true,
          'CAL (Línea Capital)': true,
          'Frontera Eficiente': true,
          'Sharpe Óptimo': true,
          'Mínima Volatilidad': true,
          'Activos Individuales': true,
        },
        textStyle: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' },
        pageTextStyle: { color: chartTheme.textPrimary },
      },
      grid: { left: 55, right: 85, top: 40, bottom: 45 },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', show: true, bottom: 5, height: 18, borderColor: 'transparent', fillerColor: 'rgba(59, 130, 246, 0.2)', textStyle: { color: chartTheme.textMuted, fontSize: 9 } },
      ],
      xAxis: {
        type: 'value',
        name: 'Volatilidad Anual (%)',
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: chartTheme.textMuted, fontSize: 11, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
      },
      yAxis: {
        type: 'value',
        name: 'Rendimiento Anual (%)',
        nameTextStyle: { color: chartTheme.textMuted, fontSize: 11, fontWeight: 'bold' },
        axisLabel: { color: chartTheme.textMuted, formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
      },
      series,
    };
  }, [data, chartTheme]);

  // ECharts Option: Cumulative Returns (Assets)
  const cumAssetsOption = useMemo(() => {
    if (!data?.time_series) return {};
    const series = Object.entries(data.time_series.assets_cumulative).map(([ticker, values], i) => ({
      name: ticker,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.8 },
      data: values
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        valueFormatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
      },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: chartTheme.textMuted, fontSize: 10 },
        pageTextStyle: { color: chartTheme.textPrimary }
      },
      grid: { left: 45, right: 20, top: 35, bottom: 25 },
      xAxis: {
        type: 'category',
        data: data.time_series.dates,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: chartTheme.textMuted, formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.splitLine } }
      },
      series
    };
  }, [data, chartTheme]);

  // ECharts Option: Cumulative Returns (Portfolios)
  const cumPortfoliosOption = useMemo(() => {
    if (!data?.time_series) return {};
    const p = data.time_series.portfolios_cumulative;
    const series: any[] = [
      {
        name: 'Sharpe Óptimo',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: chartTheme.sharpeOptimalColor, width: 2.5 },
        data: p.sharpe_optimo
      },
      {
        name: 'Mínima Volatilidad',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#ff453a', width: 2.2 },
        data: p.min_volatilidad
      }
    ];

    if (p.cartera_actual) {
      series.push({
        name: 'Cartera Actual',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#10b981', width: 2, type: 'dashed' },
        data: p.cartera_actual
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        valueFormatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
      },
      legend: {
        top: 0,
        textStyle: { color: chartTheme.textMuted, fontSize: 11 }
      },
      grid: { left: 45, right: 20, top: 35, bottom: 25 },
      xAxis: {
        type: 'category',
        data: data.time_series.dates,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: chartTheme.textMuted, formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.splitLine } }
      },
      series
    };
  }, [data, chartTheme]);

  // ECharts Option: Correlation Matrix Heatmap (Blue-to-Red Diverging Palette)
  const heatmapOption = useMemo(() => {
    if (!data?.corr_matrix) return {};
    const tickers = Object.keys(data.corr_matrix);
    const heatmapData: [number, number, number][] = [];

    tickers.forEach((t1, i) => {
      tickers.forEach((t2, j) => {
        heatmapData.push([i, j, Number(data.corr_matrix[t1][t2].toFixed(2))]);
      });
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        formatter: (params: any) => {
          const t1 = tickers[params.data[0]];
          const t2 = tickers[params.data[1]];
          const corr = params.data[2];
          let desc = 'Correlación neutra (alta diversificación)';
          if (corr <= -0.2) desc = 'Correlación inversa (cobertura / hedge)';
          else if (corr >= 0.7) desc = 'Alta correlación (riesgo de concentración)';
          else if (corr >= 0.4) desc = 'Correlación moderada';
          
          return `<b>${t1} ↔ ${t2}</b><br/>Coeficiente Pearson: <b>${corr > 0 ? '+' : ''}${corr}</b><br/><span style="color:${chartTheme.textMuted};font-size:10px;">${desc}</span>`;
        }
      },
      grid: { left: 60, right: 60, top: 20, bottom: 55 },
      xAxis: {
        type: 'category',
        data: tickers,
        axisLabel: { color: chartTheme.textPrimary, fontSize: 11, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitArea: { show: false }
      },
      yAxis: {
        type: 'category',
        data: tickers,
        axisLabel: { color: chartTheme.textPrimary, fontSize: 11, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitArea: { show: false }
      },
      visualMap: {
        min: -1.0,
        max: 1.0,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: {
          color: [
            '#1d4ed8', // -1.0 (Azul royal - Máxima Descorrelación/Hedge)
            '#3b82f6', // -0.5 (Azul eléctrico)
            '#38bdf8', // -0.2 (Cyan / Celeste)
            '#e2e8f0', //  0.0 (Neutro / Blanco pizarra)
            '#fde047', // +0.3 (Amarillo suave)
            '#fb923c', // +0.6 (Naranja)
            '#ef4444', // +0.8 (Rojo)
            '#991b1b'  // +1.0 (Rojo oscuro - Máxima Correlación)
          ]
        },
        text: ['+1.0 (Alta/Rojo)', '-1.0 (Inversa/Azul)'],
        textStyle: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 'bold' }
      },
      series: [{
        name: 'Correlación',
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          color: '#ffffff',
          textBorderColor: 'rgba(0, 0, 0, 0.75)',
          textBorderWidth: 2.5,
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: 'bold',
          formatter: (p: any) => (p.data[2] > 0 ? `+${p.data[2].toFixed(2)}` : p.data[2].toFixed(2))
        },
        itemStyle: {
          borderColor: chartTheme.cardBorder,
          borderWidth: 1.5,
          borderRadius: 4
        }
      }]
    };
  }, [data, chartTheme]);


  const chartEvents = useMemo(() => ({
    click: (params: any) => {
      if (!onSelectPoint) return;
      const val = params.value || (params.data && params.data.value) || params.data;
      if (!val || !Array.isArray(val)) return;

      const weights = params.data?.weights;
      if (!weights || typeof weights !== 'object') return;

      const vol = Number(val[0]);
      const ret = Number(val[1]);
      const sharpe = val[2] !== undefined ? Number(val[2]) : undefined;
      const name = params.data?.ticker 
        ? `Activo ${params.data.ticker}` 
        : params.seriesName || 'Cartera Seleccionada';

      onSelectPoint({
        name,
        volatility: vol,
        return: ret,
        sharpe,
        weights,
      });
    }
  }), [onSelectPoint]);

  if (!data) return null;

  return (
    <>
      <div className="glass-panel p-6 rounded-2xl flex flex-col relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 relative z-10 flex items-center gap-2">
          <span className="p-1.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
          </span>
          Frontera Eficiente & Simulación Monte Carlo
        </h3>
        <div className="flex-1 min-h-[600px] relative z-10">
          {data.frontier_data ? (
            <ReactECharts 
              echarts={echarts}
              option={frontierOption} 
              onEvents={chartEvents}
              style={{ height: '600px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              No hay suficientes datos históricos para trazar la Frontera Eficiente.
            </div>
          )}
        </div>
      </div>

      {data.time_series && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="glass-panel p-6 rounded-2xl flex flex-col relative overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10">Rendimiento Acumulado (Activos)</h3>
            <div className="flex-1 min-h-[300px] relative z-10">
              <ReactECharts echarts={echarts} option={cumAssetsOption} style={{ height: '300px' }} />
            </div>
          </div>
          
          <div className="glass-panel p-6 rounded-2xl flex flex-col relative overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10">Rendimiento Acumulado (Carteras)</h3>
            <div className="flex-1 min-h-[300px] relative z-10">
              <ReactECharts echarts={echarts} option={cumPortfoliosOption} style={{ height: '300px' }} />
            </div>
          </div>
        </div>
      )}

      {data.corr_matrix && (
        <div className="glass-panel p-6 rounded-2xl flex flex-col relative overflow-hidden mb-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 relative z-10">Matriz de Correlación Cruzada</h3>
          <div className="flex-1 min-h-[360px] relative z-10">
            <ReactECharts echarts={echarts} option={heatmapOption} style={{ height: '360px' }} />
          </div>
        </div>
      )}
    </>
  );
};
