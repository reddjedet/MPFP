import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useChartTheme } from '@/hooks/useChartTheme';
import { EtfRrgData, RrgPoint, RrgQuadrant } from '@/hooks/useEtfRotation';

echarts.use([
  LineChart,
  ScatterChart,
  TooltipComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;

const QUADRANT_META: Record<RrgQuadrant, { label: string; color: string; bg: string }> = {
  IMPROVING: { label: 'Improving', color: '#7fbbb3', bg: 'rgba(127, 187, 179, 0.07)' },
  LEADING: { label: 'Leading', color: '#a7c080', bg: 'rgba(167, 192, 128, 0.07)' },
  WEAKENING: { label: 'Weakening', color: '#dbbc7f', bg: 'rgba(219, 188, 127, 0.07)' },
  LAGGING: { label: 'Lagging', color: '#e67e80', bg: 'rgba(230, 126, 128, 0.07)' },
};

const TICKER_COLORS = [
  '#a7c080', '#7fbbb3', '#dbbc7f', '#e67e80', '#d69975',
  '#83c092', '#e0c080', '#b8bb26', '#8ec07c', '#fabd2f',
  '#83a598', '#fe8019', '#db9f9c', '#a9b665', '#458588',
  '#b16286', '#d3869b', '#689d6a',
];

interface EtfRotationGraphProps {
  data: EtfRrgData | null;
  points: RrgPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const EtfRotationGraph: React.FC<EtfRotationGraphProps> = ({
  data,
  points,
  loading,
  error,
  onRetry,
}) => {
  const chartTheme = useChartTheme();

  const option = useMemo(() => {
    if (!data || points.length === 0) {
      return {};
    }

    const fullOrder = new Map((data.points ?? []).map((point, index) => [point.ticker, index]));
    const colorByTicker = new Map(
      points.map(point => [
        point.ticker,
        TICKER_COLORS[(fullOrder.get(point.ticker) ?? 0) % TICKER_COLORS.length],
      ])
    );

    const xs = points.flatMap(point => point.trail.map(item => item.x));
    const ys = points.flatMap(point => point.trail.map(item => item.y));
    const maxDeviation = Math.max(2, ...[...xs, ...ys].map(value => Math.abs(value - 100)));
    const halfSpan = Math.ceil(maxDeviation * 1.15 * 2) / 2;
    const axisMin = 100 - halfSpan;
    const axisMax = 100 + halfSpan;

    const quadrantAreas: any[] = [
      [
        {
          coord: [axisMin, 100],
          name: 'Improving',
          label: {
            show: true,
            position: 'insideTopLeft',
            distance: 8,
            color: 'rgba(127, 187, 179, 0.8)',
            fontSize: 10,
            fontWeight: 'bold',
            fontFamily: 'monospace',
          },
          itemStyle: { color: QUADRANT_META.IMPROVING.bg },
        },
        { coord: [100, axisMax] },
      ],
      [
        {
          coord: [100, 100],
          name: 'Leading',
          label: {
            show: true,
            position: 'insideTopRight',
            distance: 8,
            color: 'rgba(167, 192, 128, 0.85)',
            fontSize: 10,
            fontWeight: 'bold',
            fontFamily: 'monospace',
          },
          itemStyle: { color: QUADRANT_META.LEADING.bg },
        },
        { coord: [axisMax, axisMax] },
      ],
      [
        {
          coord: [100, axisMin],
          name: 'Weakening',
          label: {
            show: true,
            position: 'insideBottomRight',
            distance: 8,
            color: 'rgba(219, 188, 127, 0.85)',
            fontSize: 10,
            fontWeight: 'bold',
            fontFamily: 'monospace',
          },
          itemStyle: { color: QUADRANT_META.WEAKENING.bg },
        },
        { coord: [axisMax, 100] },
      ],
      [
        {
          coord: [axisMin, axisMin],
          name: 'Lagging',
          label: {
            show: true,
            position: 'insideBottomLeft',
            distance: 8,
            color: 'rgba(230, 126, 128, 0.85)',
            fontSize: 10,
            fontWeight: 'bold',
            fontFamily: 'monospace',
          },
          itemStyle: { color: QUADRANT_META.LAGGING.bg },
        },
        { coord: [100, 100] },
      ],
    ];

    const trailSeries = points.map(point => {
      const color = colorByTicker.get(point.ticker);
      return {
        name: point.ticker,
        type: 'line' as const,
        data: point.trail.map(item => [item.x, item.y]),
        showSymbol: false,
        silent: true,
        lineStyle: {
          color,
          width: 2,
          opacity: 0.8,
          cap: 'round' as const,
        },
        z: 3,
      };
    });

    const headSeries = {
      name: 'ETFs',
      type: 'scatter' as const,
      data: points.map(point => ({
        ...point,
        value: [point.x, point.y],
        itemStyle: {
          color: colorByTicker.get(point.ticker),
          borderColor: '#181920',
          borderWidth: 2,
        },
      })),
      symbolSize: 12,
      label: {
        show: true,
        position: 'top' as const,
        distance: 5,
        formatter: (params: any) => params.data?.ticker ?? '',
        color: chartTheme.textPrimary,
        fontSize: 10,
        fontWeight: 'bold' as const,
        fontFamily: 'monospace',
        textBorderColor: '#181920',
        textBorderWidth: 3,
      },
      labelLayout: { hideOverlap: true },
      emphasis: {
        scale: 1.5,
        itemStyle: {
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      },
      markArea: {
        silent: true,
        data: quadrantAreas,
      },
      markLine: {
        silent: true,
        symbol: 'none',
        label: { show: false },
        lineStyle: {
          color: 'rgba(211, 198, 170, 0.35)',
          width: 1,
          type: 'solid' as const,
        },
        data: [{ xAxis: 100 }, { yAxis: 100 }],
      },
      z: 10,
    };

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 16,
        right: 24,
        bottom: 52,
        left: 62,
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: chartTheme.tooltipText,
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any) => {
          const point: RrgPoint | undefined = params.data;
          if (!point?.ticker) return '';

          const meta = QUADRANT_META[point.quadrant];
          const rsi = point.rsi == null ? '—' : point.rsi.toFixed(1);
          const spyRsi = point.rsi_spy == null
            ? (data.spy_rsi == null ? '—' : data.spy_rsi.toFixed(1))
            : point.rsi_spy.toFixed(1);
          const week = point.trail[point.trail.length - 1]?.week ?? data.as_of ?? '—';

          return `
            <div style="font-family: monospace; min-width: 250px; padding: 2px;">
              <div style="font-weight: bold; color: #ffffff; font-size: 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px;">
                ${point.name} <span style="color: #a1a1aa;">(${point.ticker})</span>
              </div>
              <div style="color: ${meta.color}; font-weight: bold; font-size: 11px; margin-bottom: 6px;">
                ${meta.label} · ${point.quadrant_label}
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">RS-Ratio:</span>
                <strong style="color: #e2e8f0;">${point.x.toFixed(2)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">RS-Momentum:</span>
                <strong style="color: #e2e8f0;">${point.y.toFixed(2)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">Semanas en cuadrante:</span>
                <span style="color: #e2e8f0;">${point.weeks_in_quadrant}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">RSI 14 ETF:</span>
                <span style="color: #e2e8f0;">${rsi}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="color: #94a3b8;">RSI 14 SPY:</span>
                <span style="color: #dbbc7f; font-weight: bold;">${spyRsi}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 4px; padding-top: 4px;">
                <span style="color: #94a3b8;">Semana:</span>
                <span style="color: #a1a1aa;">${week}</span>
              </div>
            </div>
          `;
        },
      },
      xAxis: {
        type: 'value' as const,
        min: axisMin,
        max: axisMax,
        name: 'RS-Ratio (fuerza relativa vs SPY)',
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: {
          color: chartTheme.textMuted,
          fontSize: 10,
          fontWeight: 'bold' as const,
        },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (value: number) => value.toFixed(0),
        },
      },
      yAxis: {
        type: 'value' as const,
        min: axisMin,
        max: axisMax,
        name: 'RS-Momentum',
        nameLocation: 'middle' as const,
        nameGap: 42,
        nameRotate: 90,
        nameTextStyle: {
          color: chartTheme.textMuted,
          fontSize: 10,
          fontWeight: 'bold' as const,
        },
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: chartTheme.splitLine } },
        axisLabel: {
          color: chartTheme.textMuted,
          fontSize: 10,
          formatter: (value: number) => value.toFixed(0),
        },
      },
      series: [...trailSeries, headSeries],
    };
  }, [data, points, chartTheme]);

  if (points.length === 0) {
    const hasAnyData = (data?.points?.length ?? 0) > 0;
    const isInitialLoading = !data && !error;

    if (loading || isInitialLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="w-6 h-6 text-positive animate-spin" />
          <span className="text-xs font-mono">Calculando Relative Rotation Graph...</span>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <span className="text-xs font-mono text-center max-w-md px-4">
          {hasAnyData
            ? 'Sin coincidencias para el filtro actual.'
            : (error || 'Sin datos históricos suficientes para calcular el RRG.')}
        </span>
        {!hasAnyData && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-8 px-3 rounded-lg bg-secondary/50 hover:bg-secondary/50 border border-border text-muted-foreground hover:text-foreground font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </button>
        )}
      </div>
    );
  }

  const counts = points.reduce<Record<string, number>>((acc, point) => {
    acc[point.quadrant] = (acc[point.quadrant] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(QUADRANT_META) as RrgQuadrant[]).map(quadrant => {
            const meta = QUADRANT_META[quadrant];
            return (
              <span
                key={quadrant}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded border"
                style={{
                  color: meta.color,
                  borderColor: `${meta.color}66`,
                  backgroundColor: meta.bg,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
                <span className="font-mono opacity-70">{counts[quadrant] ?? 0}</span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
          {data?.as_of ? `Semana ${data.as_of} · ${data.weeks}s / cola ${data.tail}s` : ''}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactECharts
          echarts={echarts}
          option={option}
          style={{ height: '100%', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
};
