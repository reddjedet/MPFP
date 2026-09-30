import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, LegendComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '@/hooks/useChartTheme';
import { EtfItem, EtfRotationData, ETF_COLORS } from '@/hooks/useEtfRotation';

echarts.use([LineChart, BarChart, TooltipComponent, GridComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);
const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;

export const EtfRotationWeeklyChart = ({ data, displayedItems, selectedTicker }: { data: EtfRotationData | null, displayedItems: EtfItem[], selectedTicker: string | null }) => {
  const chartTheme = useChartTheme();
  const weeklyEvolutionOption = useMemo(() => {
    if (!data || !data.benchmark || displayedItems.length === 0) {
      return {};
    }

    const dates = data.week_dates && data.week_dates.length === 5 
      ? data.week_dates 
      : ['D-4', 'D-3', 'D-2', 'D-1', 'Hoy'];

    const spyHistory = data.benchmark.history_5d || [0, 0, 0, 0, data.benchmark.perf_w];

    // Serie de referencia: SPY (Benchmark)
    // 1) Halo protector oscuro: corta cualquier línea que se cruce detrás de SPY
    // 2) Línea principal brillante: ámbar/oro, 4.5px, glow, nodos blancos y etiqueta fija al final
    const series: any[] = [
      {
        id: 'spy-halo',
        name: 'SPY (Benchmark)',
        type: 'line',
        data: spyHistory,
        lineStyle: { color: '#181920', width: 9, type: 'solid', cap: 'round' },
        symbol: 'none',
        silent: true,
        tooltip: { show: false },
        z: 40
      },
      {
        id: 'spy-main',
        name: 'SPY (Benchmark)',
        type: 'line',
        data: spyHistory,
        lineStyle: {
          color: '#dbbc7f',
          width: selectedTicker ? 3.5 : 4,
          type: 'solid',
          shadowColor: 'rgba(251, 191, 36, 0.75)',
          shadowBlur: 10,
          shadowOffsetY: 0
        },
        itemStyle: {
          color: '#dbbc7f',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        symbol: 'circle',
        symbolSize: selectedTicker ? 7 : 8,
        emphasis: { disabled: true },
        endLabel: {
          show: true,
          formatter: (params: any) => {
            const val = params.value;
            const sign = val !== undefined && val !== null && val > 0 ? '+' : '';
            const num = val !== undefined && val !== null ? Number(val).toFixed(1) : '0.0';
            return ` ★ SPY (${sign}${num}%)`;
          },
          color: '#dbbc7f',
          fontWeight: 'bolder',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(45, 53, 59, 0.95)',
          borderColor: '#dbbc7f',
          borderWidth: 1.5,
          borderRadius: 4,
          padding: [3, 6],
          distance: 8
        },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: 0,
              lineStyle: {
                type: 'dashed',
                color: 'rgba(255, 255, 255, 0.2)',
                width: 1
              },
              label: {
                show: true,
                position: 'start',
                formatter: '0%',
                color: 'rgba(255, 255, 255, 0.35)',
                fontSize: 10,
                fontFamily: 'monospace'
              }
            }
          ]
        },
        z: 50
      }
    ];

    // Helper para determinar opacidad y ancho según selección
    const getStyle = (ticker: string, defaultWidth: number, defaultOpacity: number, baseColor: string) => {
      if (!selectedTicker) {
        return {
          width: defaultWidth,
          opacity: defaultOpacity,
          color: baseColor,
          zIndex: 20
        };
      }
      if (selectedTicker === ticker) {
        return {
          width: 4,
          opacity: 1,
          color: baseColor,
          zIndex: 45
        };
      }
      // Atenuar fuertemente las otras líneas cuando hay un ticker seleccionado
      return {
        width: 1,
        opacity: 0.12,
        color: '#475569',
        zIndex: 5
      };
    };

    // Series de los otros tres Grandes Índices: QQQ, DIA e IWM
    const qqq = data.items.find(it => it.ticker === 'QQQ');
    if (qqq && displayedItems.some(it => it.ticker === 'QQQ')) {
      const history = qqq.history_5d || [0, 0, 0, 0, qqq.perf_w ?? 0];
      const st = getStyle('QQQ', 2.2, 0.85, ETF_COLORS.QQQ || '#06b6d4');
      series.push({
        id: 'qqq-main',
        name: 'QQQ (Nasdaq 100)',
        type: 'line',
        data: history,
        lineStyle: {
          color: st.color,
          width: st.width,
          opacity: st.opacity
        },
        itemStyle: { color: st.color },
        symbol: selectedTicker === 'QQQ' ? 'circle' : 'none',
        symbolSize: 6,
        smooth: true,
        emphasis: { disabled: true },
        endLabel: selectedTicker === 'QQQ' ? {
          show: true,
          formatter: () => ` QQQ (${(qqq.perf_w ?? 0) > 0 ? '+' : ''}${(qqq.perf_w ?? 0).toFixed(1)}%)`,
          color: st.color,
          fontWeight: 'bold',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(50, 60, 65, 0.9)',
          borderColor: st.color,
          borderWidth: 1,
          borderRadius: 4,
          padding: [2, 5],
          distance: 6
        } : { show: false },
        z: st.zIndex
      });
    }

    const dia = data.items.find(it => it.ticker === 'DIA');
    if (dia && displayedItems.some(it => it.ticker === 'DIA')) {
      const history = dia.history_5d || [0, 0, 0, 0, dia.perf_w ?? 0];
      const st = getStyle('DIA', 2.2, 0.85, ETF_COLORS.DIA || '#818cf8');
      series.push({
        id: 'dia-main',
        name: 'DIA (Dow Jones)',
        type: 'line',
        data: history,
        lineStyle: {
          color: st.color,
          width: st.width,
          opacity: st.opacity
        },
        itemStyle: { color: st.color },
        symbol: selectedTicker === 'DIA' ? 'circle' : 'none',
        symbolSize: 6,
        smooth: true,
        emphasis: { disabled: true },
        endLabel: selectedTicker === 'DIA' ? {
          show: true,
          formatter: () => ` DIA (${(dia.perf_w ?? 0) > 0 ? '+' : ''}${(dia.perf_w ?? 0).toFixed(1)}%)`,
          color: st.color,
          fontWeight: 'bold',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(50, 60, 65, 0.9)',
          borderColor: st.color,
          borderWidth: 1,
          borderRadius: 4,
          padding: [2, 5],
          distance: 6
        } : { show: false },
        z: st.zIndex
      });
    }

    const iwm = data.items.find(it => it.ticker === 'IWM');
    if (iwm && displayedItems.some(it => it.ticker === 'IWM')) {
      const history = iwm.history_5d || [0, 0, 0, 0, iwm.perf_w ?? 0];
      const st = getStyle('IWM', 2.2, 0.85, ETF_COLORS.IWM || '#c084fc');
      series.push({
        id: 'iwm-main',
        name: 'IWM (Russell 2000)',
        type: 'line',
        data: history,
        lineStyle: {
          color: st.color,
          width: st.width,
          opacity: st.opacity
        },
        itemStyle: { color: st.color },
        symbol: selectedTicker === 'IWM' ? 'circle' : 'none',
        symbolSize: 6,
        smooth: true,
        emphasis: { disabled: true },
        endLabel: selectedTicker === 'IWM' ? {
          show: true,
          formatter: () => ` IWM (${(iwm.perf_w ?? 0) > 0 ? '+' : ''}${(iwm.perf_w ?? 0).toFixed(1)}%)`,
          color: st.color,
          fontWeight: 'bold',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(50, 60, 65, 0.9)',
          borderColor: st.color,
          borderWidth: 1,
          borderRadius: 4,
          padding: [2, 5],
          distance: 6
        } : { show: false },
        z: st.zIndex
      });
    }

    // Series de los demás ETFs sectoriales y temáticos (excluyendo SPY, QQQ, DIA, IWM, TLT, ARGT)
    const majorSet = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'ARGT']);
    displayedItems.filter(it => !majorSet.has(it.ticker)).forEach(it => {
      const history = it.history_5d || [0, 0, 0, 0, it.perf_w ?? 0];
      const baseColor = ETF_COLORS[it.ticker] || '#94a3b8';
      const st = getStyle(it.ticker, 1.4, 0.45, baseColor);
      const isSelected = selectedTicker === it.ticker;

      series.push({
        name: `${it.ticker} (${it.name})`,
        type: 'line',
        data: history,
        lineStyle: {
          color: st.color,
          width: st.width,
          opacity: st.opacity
        },
        itemStyle: { color: st.color },
        symbol: isSelected ? 'circle' : 'none',
        symbolSize: 6,
        smooth: true,
        emphasis: { disabled: true },
        endLabel: isSelected ? {
          show: true,
          formatter: () => ` ${it.ticker} (${(it.perf_w ?? 0) > 0 ? '+' : ''}${(it.perf_w ?? 0).toFixed(1)}%)`,
          color: st.color,
          fontWeight: 'bold',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(50, 60, 65, 0.9)',
          borderColor: st.color,
          borderWidth: 1,
          borderRadius: 4,
          padding: [2, 5],
          distance: 6
        } : { show: false },
        z: st.zIndex
      });
    });

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 25,
        right: 95, // Espacio para etiquetas finales
        bottom: 25,
        left: 45
      },
      legend: { show: false }, // Manejaremos la selección de tickers directamente en la región superior interactiva
      tooltip: { show: false }, // Hover eliminado por completo según requerimiento de UX limpia
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10, fontWeight: 600 }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
        }
      },
      series
    };
  }, [data, displayedItems, selectedTicker, chartTheme]);

  return (
    <ReactECharts 
      echarts={echarts} 
      option={weeklyEvolutionOption} 
      style={{ height: '100%', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};

export const EtfRotationBarChart = ({ data, displayedItems }: { data: EtfRotationData | null, displayedItems: EtfItem[] }) => {
  const chartTheme = useChartTheme();
  const barChartOption = useMemo(() => {
    if (!data || displayedItems.length === 0) {
      return {};
    }

    // Filtrar TLT y ARGT
    const cleanList = displayedItems.filter(it => it.ticker !== 'TLT' && it.ticker !== 'ARGT');
    // Ordenar de menor a mayor para que el más alto quede arriba en el eje Y
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

    const spyPerf = data.benchmark?.perf_w ?? 0;

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 20,
        right: 50,
        bottom: 25,
        left: 60 // Margen reservado exclusivamente a los tickers Y para evitar superposición
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
          return `
            <div style="font-family: monospace; min-width: 220px; padding: 2px;">
              <div style="font-weight: bold; color: #ffffff; font-size: 12px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px;">
                ${it.name} <span style="color: #a1a1aa;">(${it.ticker})</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Diferencial vs SPY (1W):</span>
                <strong style="color: ${diff >= 0 ? '#a7c080' : '#e67e80'};">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Retorno ETF (1W):</span>
                <span style="color: #e2e8f0;">${(it.perf_w ?? 0) >= 0 ? '+' : ''}${(it.perf_w ?? 0).toFixed(2)}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Retorno SPY Benchmark:</span>
                <span style="color: #dbbc7f; font-weight: bold;">${spyPerf >= 0 ? '+' : ''}${spyPerf.toFixed(2)}%</span>
              </div>
            </div>
          `;
        }
      },
      xAxis: {
        type: 'value',
        // Escala dinámica con holgura garantizada para que las barras nunca alcancen las etiquetas del eje Y
        min: (val: { min: number }) => Math.floor(Math.min(val.min * 1.35, val.min - 1.5)),
        max: (val: { max: number }) => Math.ceil(Math.max(val.max * 1.35, val.max + 1.5)),
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
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
          name: 'Diferencial vs SPY (1W)',
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
            formatter: (p: any) => `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%`
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
