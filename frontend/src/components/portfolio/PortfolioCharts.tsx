import React, { useMemo, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { PieChart as EChartsPieChart, BarChart } from 'echarts/charts';
import { 
  TooltipComponent, 
  GridComponent, 
  LegendComponent 
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Activity, Layers, PieChart as PieIcon } from 'lucide-react';
import { useChartTheme } from '../../hooks/useChartTheme';

echarts.use([
  EChartsPieChart,
  BarChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;

// Paleta armónica por macro-sector institucional
export const SECTOR_COLOR_MAP: Record<string, { base: string; shades: string[] }> = {
  tech: {
    base: '#3b82f6', // blue-500
    shades: ['#60a5fa', '#2563eb', '#93c5fd', '#1d4ed8', '#38bdf8']
  },
  semis: {
    base: '#06b6d4', // cyan-500
    shades: ['#22d3ee', '#0891b2', '#67e8f9', '#0e7490', '#a5f3fc']
  },
  payments_retail: {
    base: '#8b5cf6', // purple-500
    shades: ['#a78bfa', '#7c3aed', '#c4b5fd', '#6d28d9', '#ddd6fe']
  },
  health: {
    base: '#10b981', // emerald-500
    shades: ['#34d399', '#059669', '#6ee7b7', '#047857', '#a7f3d0']
  },
  staples: {
    base: '#14b8a6', // teal-500
    shades: ['#2dd4bf', '#0d9488', '#5eead4', '#0f766e', '#99f6e4']
  },
  financials: {
    base: '#f59e0b', // amber-500
    shades: ['#fbbf24', '#d97706', '#fcd34d', '#b45309', '#fde68a']
  },
  industrials: {
    base: '#64748b', // slate-500
    shades: ['#94a3b8', '#475569', '#cbd5e1', '#334155', '#e2e8f0']
  },
  energy: {
    base: '#f97316', // orange-500
    shades: ['#fb923c', '#ea580c', '#fdba74', '#c2410c', '#fed7aa']
  },
  materials: {
    base: '#ec4899', // pink-500
    shades: ['#f472b6', '#db2777', '#f9a8d4', '#be185d', '#fbcfe8']
  },
  etfs: {
    base: '#6366f1', // indigo-500
    shades: ['#818cf8', '#4f46e5', '#a5b4fc', '#4338ca', '#c7d2fe']
  },
  crypto: {
    base: '#eab308', // yellow-500
    shades: ['#facc15', '#ca8a04', '#fde047', '#a16207', '#fef08a']
  },
  other: {
    base: '#71717a', // zinc-500
    shades: ['#a1a1aa', '#52525b', '#d4d4d8', '#3f3f46', '#e4e4e7']
  }
};

const DEFAULT_SECTOR_COLORS = {
  base: '#71717a',
  shades: ['#a1a1aa', '#52525b', '#d4d4d8', '#3f3f46']
};

interface PortfolioChartsProps {
  data: any;
}

export const PortfolioCharts: React.FC<PortfolioChartsProps> = ({ data }) => {
  const chartTheme = useChartTheme();
  const [viewMode, setViewMode] = useState<'sectors' | 'assets'>('sectors');

  // Procesar desglose sectorial (desde el backend o agrupando fallback)
  const sectorBreakdown = useMemo(() => {
    if (data?.sector_breakdown && data.sector_breakdown.length > 0) {
      return data.sector_breakdown;
    }
    if (!data?.result || data.result.length === 0) return [];

    // Fallback: agrupar los que tengan sector_id o 'other'
    const groups: Record<string, any> = {};
    const totalVal = data.result.reduce((acc: number, it: any) => acc + (it.value || 0), 0);

    data.result.forEach((item: any) => {
      const secId = item.sector_id || 'other';
      const secName = item.sector_name || 'Otros Activos';
      const targetW = item.target_pct || item.weight || 0;
      const val = item.value || 0;

      if (!groups[secId]) {
        groups[secId] = {
          sector_id: secId,
          sector_name: secName,
          total_target_weight: 0,
          total_value: 0,
          assets: []
        };
      }
      groups[secId].total_target_weight += targetW;
      groups[secId].total_value += val;
      groups[secId].assets.push({
        ticker: item.ticker,
        target_weight: targetW,
        value: val
      });
    });

    return Object.values(groups).map((g: any) => {
      const wPct = totalVal > 0 ? (g.total_value / totalVal) * 100 : g.total_target_weight;
      g.weight_pct = Math.round(wPct * 100) / 100;
      g.total_target_weight = Math.round(g.total_target_weight * 100) / 100;
      g.assets.forEach((a: any) => {
        a.relative_weight_in_sector = g.total_target_weight > 0 
          ? Math.round((a.target_weight / g.total_target_weight) * 1000) / 10 
          : 100;
      });
      g.assets.sort((a: any, b: any) => b.target_weight - a.target_weight);
      return g;
    }).sort((a: any, b: any) => b.total_target_weight - a.total_target_weight);
  }, [data]);

  // Opción de Gráfico ECharts (Doble Anillo Concéntrico o Donut Simple)
  const pieOption = useMemo(() => {
    if (!data?.result || data.result.length === 0) return {};

    if (viewMode === 'sectors' && sectorBreakdown.length > 0) {
      // 1. Datos Anillo Interior: Macro-Sectores
      const innerData: any[] = [];
      // 2. Datos Anillo Exterior: Activos agrupados por sector
      const outerData: any[] = [];

      sectorBreakdown.forEach((sec: any) => {
        const colorConfig = SECTOR_COLOR_MAP[sec.sector_id] || DEFAULT_SECTOR_COLORS;

        innerData.push({
          name: sec.sector_name,
          value: sec.total_value,
          sectorId: sec.sector_id,
          targetWeight: sec.total_target_weight,
          assetCount: sec.assets.length,
          itemStyle: {
            color: colorConfig.base
          }
        });

        sec.assets.forEach((asset: any, idx: number) => {
          const shadeColor = colorConfig.shades[idx % colorConfig.shades.length] || colorConfig.base;

          outerData.push({
            name: asset.ticker,
            value: asset.value,
            sectorName: sec.sector_name,
            sectorId: sec.sector_id,
            industry: asset.industry,
            targetWeight: asset.target_weight,
            relativeWeight: asset.relative_weight_in_sector,
            itemStyle: {
              color: shadeColor
            }
          });
        });
      });

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: chartTheme.tooltipBg,
          borderColor: chartTheme.tooltipBorder,
          textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
          formatter: (params: any) => {
            if (params.seriesName === 'Macro-Sectores') {
              return `
                <div style="font-family: monospace; padding: 2px;">
                  <div style="font-weight: bold; color: #fff; font-size: 12px; margin-bottom: 4px;">📁 ${params.name}</div>
                  <div>Peso en Cartera: <b>${params.percent.toFixed(1)}%</b> (Obj: ${params.data?.targetWeight || 0}%)</div>
                  <div>Capital: <b>$${Number(params.value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS</b></div>
                  <div style="color: #94a3b8; font-size: 10px; margin-top: 3px;">${params.data?.assetCount || 0} activos asignados</div>
                </div>
              `;
            } else {
              return `
                <div style="font-family: monospace; padding: 2px;">
                  <div style="font-weight: bold; color: #fff; font-size: 12px; margin-bottom: 4px;">📈 ${params.name}</div>
                  <div style="color: #93c5fd; margin-bottom: 2px;">Sector: <b>${params.data?.sectorName || ''}</b></div>
                  ${params.data?.industry ? `<div style="color: #cbd5e1; font-size: 10px; margin-bottom: 2px;">Industria: <i>${params.data.industry}</i></div>` : ''}
                  <div>Peso en Cartera: <b>${params.percent.toFixed(1)}%</b> (Obj: ${params.data?.targetWeight || 0}%)</div>
                  <div>Peso dentro del Sector: <b>${params.data?.relativeWeight || 0}%</b></div>
                  <div>Capital: <b>$${Number(params.value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS</b></div>
                </div>
              `;
            }
          }
        },
        series: [
          // ANILLO INTERIOR: Macro-Sectores
          {
            name: 'Macro-Sectores',
            type: 'pie',
            radius: ['22%', '48%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 4,
              borderColor: chartTheme.isDark ? '#181920' : '#ffffff',
              borderWidth: 2
            },
            label: {
              position: 'inner',
              fontSize: 10,
              color: '#ffffff',
              fontWeight: 'bold',
              formatter: (params: any) => (params.percent > 9 ? `${params.percent.toFixed(0)}%` : '')
            },
            labelLine: { show: false },
            data: innerData
          },
          // ANILLO EXTERIOR: Tickers individuales concéntricos
          {
            name: 'Activos',
            type: 'pie',
            radius: ['54%', '78%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 4,
              borderColor: chartTheme.isDark ? '#181920' : '#ffffff',
              borderWidth: 2
            },
            label: {
              show: true,
              fontSize: 10,
              color: chartTheme.textMuted,
              formatter: '{b} ({d}%)'
            },
            labelLine: {
              show: true,
              length: 8,
              length2: 8,
              smooth: true
            },
            data: outerData
          }
        ]
      };
    } else {
      // Modo Donut Simple (Solo Activos)
      const pieData = data.result.map((item: any, idx: number) => {
        const secId = item.sector_id || 'other';
        const colorConfig = SECTOR_COLOR_MAP[secId] || DEFAULT_SECTOR_COLORS;
        const color = colorConfig.shades[idx % colorConfig.shades.length] || colorConfig.base;
        return {
          name: item.ticker,
          value: item.value || 0,
          itemStyle: {
            color
          }
        };
      });

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: chartTheme.tooltipBg,
          borderColor: chartTheme.tooltipBorder,
          textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
          formatter: '{b}: $ {c} ({d}%)'
        },
        series: [
          {
            name: 'Distribución',
            type: 'pie',
            radius: ['45%', '75%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: chartTheme.isDark ? '#181920' : '#ffffff',
              borderWidth: 2
            },
            label: {
              show: true,
              fontSize: 10,
              color: chartTheme.textMuted,
              formatter: '{b} ({d}%)'
            },
            labelLine: {
              show: true,
              length: 8,
              length2: 8,
              smooth: true
            },
            data: pieData
          }
        ]
      };
    }
  }, [data, viewMode, sectorBreakdown, chartTheme]);

  const alphaOption = useMemo(() => {
    if (!data?.alpha_metrics) return {};
    const periods = Object.keys(data.alpha_metrics);
    if (periods.length === 0) return {};
    const pfVals = periods.map((p: any) => data.alpha_metrics[p]?.portfolio || 0);
    const spyVals = periods.map((p: any) => data.alpha_metrics[p]?.spy || 0);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        valueFormatter: (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(1)}%`
      },
      legend: {
        top: 0,
        textStyle: { color: chartTheme.textMuted, fontSize: 10 }
      },
      grid: { left: 35, right: 15, top: 30, bottom: 20 },
      xAxis: {
        type: 'category',
        data: periods,
        axisLine: { lineStyle: { color: chartTheme.axisLine } },
        axisLabel: { color: chartTheme.textMuted, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: chartTheme.textMuted, formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.splitLine } }
      },
      series: [
        {
          name: data.pf_type ? data.pf_type.toUpperCase() : 'PORTFOLIO',
          type: 'bar',
          barWidth: '25%',
          itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] },
          data: pfVals
        },
        {
          name: 'SPY',
          type: 'bar',
          barWidth: '25%',
          itemStyle: { color: '#dc2626', borderRadius: [4, 4, 0, 0] },
          data: spyVals
        }
      ]
    };
  }, [data, chartTheme]);

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* GRÁFICO DE COMPOSICIÓN (DOBLE ANILLO POR SECTOR O SOLO ACTIVOS) */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Layers className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Composición de Cartera
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">
                {viewMode === 'sectors' ? 'Doble Anillo: Macro-Sectores & Activos' : 'Distribución por Activos'}
              </p>
            </div>
          </div>

          {/* Toggle de Modo de Vista */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 self-start sm:self-auto text-xs">
            <button
              onClick={() => setViewMode('sectors')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'sectors'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              <span>Sectores & Activos</span>
            </button>
            <button
              onClick={() => setViewMode('assets')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'assets'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Solo Activos</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[290px]">
          <ReactECharts 
            echarts={echarts}
            option={pieOption} 
            notMerge={true}
            style={{ height: '290px' }} 
            opts={{ renderer: 'canvas' }}
          />
        </div>

        {/* Badges de Desglose Sectorial */}
        {viewMode === 'sectors' && sectorBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-white/5">
            {sectorBreakdown.map((sec: any) => {
              const secColor = (SECTOR_COLOR_MAP[sec.sector_id] || DEFAULT_SECTOR_COLORS).base;
              return (
                <div 
                  key={sec.sector_id}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/5 flex items-center gap-1.5 text-[11px]"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: secColor }} />
                  <span className="font-bold text-white">{sec.sector_name}</span>
                  <span className="font-mono text-zinc-300 font-bold">
                    {sec.weight_pct ? `${sec.weight_pct}%` : `${sec.total_target_weight}%`}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    ({sec.assets.map((a: any) => a.ticker).join(', ')})
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GRÁFICO DE DESVÍO DE PONDERACIÓN (TRACKING ERROR / ALPHA VS SPY) */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col relative overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Activity className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Rendimiento Histórico & Alpha
            </h3>
            <p className="text-[11px] text-zinc-400 font-medium">Comparativa de Rentabilidad vs SPY</p>
          </div>
        </div>
        <div className="flex-1 min-h-[290px]">
          <ReactECharts 
            echarts={echarts}
            option={alphaOption} 
            notMerge={true}
            style={{ height: '290px' }} 
            opts={{ renderer: 'canvas' }}
          />
        </div>
      </div>
    </div>
  );
};

