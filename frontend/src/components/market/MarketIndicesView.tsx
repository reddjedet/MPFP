import React, { useEffect, useState, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '@/hooks/useChartTheme';
import { Dropdown, DropdownOption } from '@/components/ui/Dropdown';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  Globe,
  RefreshCw,
  Landmark,
  Award,
  Vote,
  Scale,
  Percent,
  Activity,
  Maximize2
} from 'lucide-react';

echarts.use([
  LineChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  CanvasRenderer
]);

const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;

interface Mandate {
  id: string;
  president: string;
  party: string;
  start_date: string;
  end_date: string;
  color: string;
  note: string;
}

interface Election {
  date: string;
  label: string;
  detail: string;
}

interface MandatePerformance {
  id: string;
  president: string;
  party: string;
  start_date: string;
  end_date: string;
  initial_level: number | null;
  final_level: number | null;
  total_return_pct: number;
  cagr_pct: number;
  max_drawdown_pct: number;
  volatility_pct: number;
  color: string;
  note: string;
}

interface UsCycleStat {
  year_num: number;
  label: string;
  avg_return_pct: number;
  win_rate_pct: number;
  historical_bias: string;
}

interface CyclesResponse {
  region: string;
  primary_ticker: string;
  mandates: Mandate[];
  elections: Election[];
  performance_table: MandatePerformance[];
  us_cycle_stats?: UsCycleStat[] | null;
}

interface HistoryResponse {
  dates: string[];
  series: Record<string, (number | null)[]>;
  summary_metrics: {
    total_return_pct: number;
    cagr_pct: number;
    max_drawdown_pct: number;
    annualized_volatility_pct: number;
    start_price: number;
    end_price: number;
    peak_price: number;
    trough_price: number;
  };
  primary_key: string;
  currency: string;
  region: string;
  normalized: boolean;
}

type RegionType = 'arg' | 'br' | 'usa' | 'global';
type PeriodType = '1y' | '3y' | '5y' | '10y' | '20y' | 'max';

/**
 * Encuentra la fecha más cercana dentro del array ordenado de fechas de la serie.
 * Es indispensable para que ECharts pueda posicionar markArea y markLine en un eje de tipo 'category'.
 */
const findClosestDate = (target: string, allDates: string[]): string => {
  if (!allDates || allDates.length === 0) return target;
  if (target <= allDates[0]) return allDates[0];
  if (target >= allDates[allDates.length - 1]) return allDates[allDates.length - 1];

  let closest = allDates[0];
  let minDiff = Math.abs(new Date(target).getTime() - new Date(closest).getTime());

  for (let i = 1; i < allDates.length; i++) {
    const diff = Math.abs(new Date(target).getTime() - new Date(allDates[i]).getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = allDates[i];
    } else if (diff > minDiff) {
      break;
    }
  }
  return closest;
};

export const MarketIndicesView: React.FC = () => {
  const chartTokens = useChartTheme();

  // Estados de control de filtros
  const [region, setRegion] = useState<RegionType>('arg');
  const [period, setPeriod] = useState<string>('max');
  const [currency, setCurrency] = useState<'usd' | 'local'>('usd');
  const [normalized, setNormalized] = useState<boolean>(false);
  const [showElections, setShowElections] = useState<boolean>(true);
  const [useLogScale, setUseLogScale] = useState<boolean>(false);

  // Estados de datos
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [cyclesData, setCyclesData] = useState<CyclesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedMandateId, setSelectedMandateId] = useState<string>('all');

  // Fetch de series históricas
  const fetchHistory = async () => {
    try {
      setRefreshing(true);
      const res = await fetch(
        `/api/indices/history?region=${region}&period=${period}&currency=${currency}&normalized=${normalized || region === 'global'}`
      );
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data);
      }
    } catch (e) {
      console.error('Error fetching indices history:', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  // Fetch de ciclos presidenciales y mandatos
  const fetchCycles = async () => {
    try {
      const reg = region === 'global' ? 'arg' : region;
      const res = await fetch(`/api/indices/cycles?region=${reg}`);
      if (res.ok) {
        const data = await res.json();
        setCyclesData(data);
      }
    } catch (e) {
      console.error('Error fetching cycles:', e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [region, period, currency, normalized]);

  useEffect(() => {
    fetchCycles();
  }, [region]);

  // Manejador para zoom a mandato específico
  const handleSelectMandate = (mandateId: string) => {
    setSelectedMandateId(mandateId);
    if (mandateId === 'all') {
      setPeriod('max');
    } else {
      setPeriod(mandateId);
    }
  };

  // Opciones para el Dropdown de Mandatos
  const mandateDropdownOptions: DropdownOption<string>[] = useMemo(() => {
    const opts: DropdownOption<string>[] = [
      { value: 'all', label: 'Todos los períodos (Histórico Completo)' }
    ];
    if (cyclesData?.mandates) {
      cyclesData.mandates.forEach((m) => {
        const startY = m.start_date.slice(0, 4);
        const endY = m.end_date.slice(0, 4);
        opts.push({
          value: m.id,
          label: `${m.president} (${startY}-${endY})`,
          badge: m.party
        });
      });
    }
    return opts;
  }, [cyclesData]);

  // Construcción del gráfico ECharts
  const chartOption = useMemo(() => {
    if (!historyData || !historyData.dates || historyData.dates.length === 0) {
      return {};
    }

    const { dates, series } = historyData;

    // Colores semánticos para las curvas principales
    const palette = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#f87171'];

    // Construcción de zonas sombreadas de mandatos (markArea)
    const markAreaPieces: any[] = [];
    if (showElections && cyclesData?.mandates && region !== 'global') {
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      cyclesData.mandates.forEach((m) => {
        // Encontrar si el mandato intersecta con el rango de fechas visible
        if (m.end_date >= minDate && m.start_date <= maxDate) {
          const startX = m.start_date <= minDate ? minDate : findClosestDate(m.start_date, dates);
          const endX = m.end_date >= maxDate ? maxDate : findClosestDate(m.end_date, dates);

          const sIdx = dates.indexOf(startX);
          const eIdx = dates.indexOf(endX);

          // Asegurar que el inicio sea estrictamente anterior al fin
          if (sIdx < eIdx) {
            markAreaPieces.push([
              {
                name: m.president,
                xAxis: startX,
                itemStyle: {
                  color: m.color,
                  opacity: 0.12
                },
                label: {
                  show: true,
                  position: 'insideTop',
                  color: '#e4e4e7',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: [3, 6],
                  backgroundColor: 'rgba(24, 25, 32, 0.85)',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  borderWidth: 1,
                  borderRadius: 3,
                  formatter: `${m.president}\n(${m.start_date.slice(0, 4)}-${m.end_date.slice(0, 4)})`
                }
              },
              {
                xAxis: endX
              }
            ]);
          }
        }
      });
    }

    // Construcción de líneas de hitos electorales (markLine)
    const markLineData: any[] = [];
    if (showElections && cyclesData?.elections && region !== 'global') {
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      cyclesData.elections.forEach((el) => {
        if (el.date >= minDate && el.date <= maxDate) {
          const elX = findClosestDate(el.date, dates);
          markLineData.push({
            name: el.label,
            xAxis: elX,
            lineStyle: {
              color: 'rgba(245, 158, 11, 0.85)',
              type: 'dashed',
              width: 1.5
            },
            label: {
              show: true,
              formatter: el.label,
              position: 'insideEndTop',
              fontSize: 9,
              fontWeight: 600,
              color: '#facc15',
              padding: [2, 5],
              backgroundColor: 'rgba(24, 25, 32, 0.9)',
              borderColor: 'rgba(245, 158, 11, 0.5)',
              borderWidth: 1,
              borderRadius: 2
            }
          });
        }
      });
    }

    // Series de líneas de precios
    const seriesKeys = Object.keys(series);
    const echartsSeries = seriesKeys.map((name, idx) => {
      const isPrimary = idx === 0;
      const color = palette[idx % palette.length];

      const sObj: any = {
        name,
        type: 'line',
        data: series[name],
        smooth: 0.15,
        showSymbol: false,
        lineStyle: {
          width: isPrimary ? 2.5 : 1.5,
          color: color
        },
        itemStyle: {
          color: color
        }
      };

      // Si es la serie primaria y tenemos mandatos electorales activos, adjuntar markArea y markLine
      if (isPrimary && showElections && region !== 'global') {
        if (markAreaPieces.length > 0) {
          sObj.markArea = {
            silent: true,
            data: markAreaPieces
          };
        }
        if (markLineData.length > 0) {
          sObj.markLine = {
            symbol: ['none', 'none'],
            data: markLineData
          };
        }
      }

      return sObj;
    });

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 600,
      grid: {
        left: '2%',
        right: '2%',
        top: '12%',
        bottom: '15%',
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: chartTokens.tooltipBg,
        borderColor: chartTokens.tooltipBorder,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: chartTokens.tooltipText,
          fontSize: 12
        },
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: 'rgba(255,255,255,0.2)',
            type: 'dashed'
          }
        },
        formatter: (params: any[]) => {
          if (!params || params.length === 0) return '';
          const dateStr = params[0].axisValue;

          // Buscar si había un presidente en funciones en esa fecha
          let activePresident = '';
          if (cyclesData?.mandates) {
            const mand = cyclesData.mandates.find(
              (m) => dateStr >= m.start_date && dateStr <= m.end_date
            );
            if (mand) {
              activePresident = `<div class="text-[11px] text-muted-foreground mt-1 pb-1 border-b border-border flex items-center justify-between">
                <span>Gestión:</span>
                <span class="font-bold text-foreground" style="color:${mand.color}">${mand.president}</span>
              </div>`;
            }
          }

          let html = `<div class="font-mono text-xs font-bold text-foreground mb-1 pb-1 border-b border-border flex items-center justify-between gap-4">
            <span>${dateStr}</span>
            <span class="text-[10px] text-muted-foreground uppercase font-sans">${region.toUpperCase()}</span>
          </div>${activePresident}<div class="space-y-1 mt-1.5">`;

          params.forEach((item) => {
            if (item.value !== null && item.value !== undefined) {
              const numVal = Number(item.value);
              const valFormatted =
                normalized || region === 'global'
                  ? `${numVal.toFixed(2)} pts (Base 100)`
                  : currency === 'local' && region === 'arg'
                  ? `ARS $ ${numVal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                  : currency === 'local' && region === 'br'
                  ? `BRL R$ ${numVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `USD $ ${numVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

              html += `<div class="flex items-center justify-between gap-4 text-xs font-mono">
                <span class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full" style="background-color: ${item.color}"></span>
                  <span class="text-muted-foreground font-sans">${item.seriesName}:</span>
                </span>
                <span class="font-bold text-foreground">${valFormatted}</span>
              </div>`;
            }
          });

          html += `</div>`;
          return html;
        }
      },
      legend: {
        top: 0,
        right: '2%',
        textStyle: {
          color: chartTokens.textMuted,
          fontSize: 11
        },
        icon: 'roundRect'
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: {
          lineStyle: { color: chartTokens.axisLine }
        },
        axisLabel: {
          color: chartTokens.textMuted,
          fontSize: 10,
          formatter: (value: string) => {
            // Mostrar formato YYYY o MMM YY
            return value.slice(0, 4);
          }
        },
        splitLine: {
          show: true,
          lineStyle: { color: chartTokens.splitLine }
        }
      },
      yAxis: {
        type: useLogScale ? 'log' : 'value',
        scale: true,
        name: normalized || region === 'global'
          ? 'Base 100'
          : currency === 'usd'
          ? 'USD ($)'
          : region === 'arg'
          ? 'ARS ($)'
          : 'BRL (R$)',
        nameTextStyle: {
          color: chartTokens.textMuted,
          fontSize: 10,
          align: 'left',
          padding: [0, 0, 4, 0]
        },
        axisLine: {
          show: false
        },
        splitLine: {
          lineStyle: { color: chartTokens.splitLine }
        },
        axisLabel: {
          color: chartTokens.textMuted,
          fontSize: 10,
          formatter: (val: number) => {
            if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
            if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
            return val.toFixed(0);
          }
        }
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        },
        {
          type: 'slider',
          show: true,
          bottom: 0,
          height: 20,
          borderColor: 'transparent',
          backgroundColor: 'rgba(255,255,255,0.03)',
          fillerColor: 'rgba(56, 189, 248, 0.15)',
          handleStyle: {
            color: '#38bdf8',
            borderColor: 'transparent'
          },
          textStyle: {
            color: chartTokens.textMuted,
            fontSize: 9
          }
        }
      ],
      series: echartsSeries
    };
  }, [historyData, cyclesData, showElections, useLogScale, chartTokens, region, currency, normalized]);

  const metrics = historyData?.summary_metrics;

  return (
    <div className="space-y-5 select-none w-full max-w-full overflow-x-hidden">
      {/* 1. BARRA SUPERIOR: SELECTOR DE REGIÓN Y CONTROLES PRINCIPALES */}
      <div className="bg-secondary border border-border rounded-lg p-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 shadow-md">
        {/* Selector de Regiones (Píldoras) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => {
              setRegion('arg');
              setSelectedMandateId('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              region === 'arg'
                ? 'bg-blue-600/25 text-blue-300 border border-blue-500/50 shadow-sm'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
            }`}
          >
            <span>🇦🇷</span>
            <span>Argentina</span>
          </button>

          <button
            onClick={() => {
              setRegion('br');
              setSelectedMandateId('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              region === 'br'
                ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
            }`}
          >
            <span>🇧🇷</span>
            <span>Brasil</span>
          </button>

          <button
            onClick={() => {
              setRegion('usa');
              setSelectedMandateId('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              region === 'usa'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/50 shadow-sm'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
            }`}
          >
            <span>🇺🇸</span>
            <span>Estados Unidos</span>
          </button>

          <button
            onClick={() => {
              setRegion('global');
              setSelectedMandateId('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              region === 'global'
                ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>Comparativa Global</span>
          </button>
        </div>

        {/* Filtros de Rango Temporal y Controles */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-start xl:justify-end">
          {/* Horizontes Rápidos */}
          <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5">
            {(['1y', '3y', '5y', '10y', '20y', 'max'] as PeriodType[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriod(p);
                  setSelectedMandateId('all');
                }}
                className={`px-2 py-1 text-[11px] font-mono font-medium rounded-lg transition-all cursor-pointer ${
                  period === p
                    ? 'bg-blue-600 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Selector de Mandatos Presidenciales con Dropdown Canónico */}
          {region !== 'global' && (
            <div className="min-w-[220px]">
              <Dropdown
                value={selectedMandateId}
                options={mandateDropdownOptions}
                onChange={handleSelectMandate}
                size="sm"
                accentColor="blue"
                icon={<Landmark className="w-3.5 h-3.5 text-foreground" />}
                placeholder="Filtrar por Mandato..."
              />
            </div>
          )}

          {/* Toggle de Moneda (si aplica) */}
          {(region === 'arg' || region === 'br') && (
            <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5 text-[11px] font-mono">
              <button
                onClick={() => setCurrency('usd')}
                className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                  currency === 'usd'
                    ? 'bg-emerald-600 text-foreground font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency('local')}
                className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                  currency === 'local'
                    ? 'bg-emerald-600 text-foreground font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {region === 'arg' ? 'ARS' : 'BRL'}
              </button>
            </div>
          )}

          {/* Botón de Refresco */}
          <button
            onClick={fetchHistory}
            disabled={refreshing}
            title="Refrescar cotizaciones"
            className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary/50 text-muted-foreground hover:text-foreground border border-border transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. SCORECARD DE RENDIMIENTO CUANTITATIVO DEL PERÍODO VISIBLE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Retorno Acumulado */}
        <div className="bg-secondary border border-border rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>Retorno Acumulado</span>
            <TrendingUp className="w-3.5 h-3.5 text-foreground" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl font-black font-mono tracking-tight ${
                (metrics?.total_return_pct ?? 0) >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {(metrics?.total_return_pct ?? 0) >= 0 ? '+' : ''}
              {metrics?.total_return_pct?.toFixed(2) ?? '0.00'}%
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            Desde {metrics?.start_price !== undefined ? (normalized || region === 'global' ? `${metrics.start_price} pts` : currency === 'local' && region === 'arg' ? `ARS $${metrics.start_price.toLocaleString('es-AR')}` : currency === 'local' && region === 'br' ? `BRL R$${metrics.start_price.toLocaleString('pt-BR')}` : `USD $${metrics.start_price.toLocaleString('en-US')}`) : '—'} a {metrics?.end_price !== undefined ? (normalized || region === 'global' ? `${metrics.end_price} pts` : currency === 'local' && region === 'arg' ? `ARS $${metrics.end_price.toLocaleString('es-AR')}` : currency === 'local' && region === 'br' ? `BRL R$${metrics.end_price.toLocaleString('pt-BR')}` : `USD $${metrics.end_price.toLocaleString('en-US')}`) : '—'}
          </div>
        </div>

        {/* CAGR Anualizado */}
        <div className="bg-secondary border border-border rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>CAGR Anualizado</span>
            <Percent className="w-3.5 h-3.5 text-positive" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl font-black font-mono tracking-tight ${
                (metrics?.cagr_pct ?? 0) >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {(metrics?.cagr_pct ?? 0) >= 0 ? '+' : ''}
              {metrics?.cagr_pct?.toFixed(2) ?? '0.00'}%
            </span>
            <span className="text-[10px] text-muted-foreground uppercase">año</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            Tasa geométrica anual
          </div>
        </div>

        {/* Máximo Drawdown */}
        <div className="bg-secondary border border-border rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>Máximo Drawdown</span>
            <TrendingDown className="w-3.5 h-3.5 text-negative" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black font-mono tracking-tight text-negative">
              {metrics?.max_drawdown_pct?.toFixed(2) ?? '0.00'}%
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            Caída máxima desde pico
          </div>
        </div>

        {/* Volatilidad Anualizada */}
        <div className="bg-secondary border border-border rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span>Volatilidad Anualizada</span>
            <Activity className="w-3.5 h-3.5 text-foreground" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black font-mono tracking-tight text-foreground">
              {metrics?.annualized_volatility_pct?.toFixed(2) ?? '0.00'}%
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1">
            Desvío estándar anualizado
          </div>
        </div>
      </div>

      {/* 3. GRÁFICO PRINCIPAL DE APACHE ECHARTS CON SUPERPOSICIÓN ELECTORAL */}
      <div className="bg-secondary border border-border rounded-lg p-4 shadow-md">
        {/* Cabecera del Gráfico con Toggles */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="w-4 h-4 text-positive" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              {region === 'arg'
                ? 'Evolución Histórica — S&P Merval'
                : region === 'br'
                ? 'Evolución Histórica — Brasil (EWZ / Bovespa)'
                : region === 'usa'
                ? 'Evolución Histórica — Wall Street (S&P 500)'
                : 'Comparativa Global de Mercados (Base 100)'}
            </h3>
            <span className="px-2 py-0.5 rounded-lg bg-secondary/50 border border-border text-[10px] text-muted-foreground font-mono">
              {historyData?.dates?.length ?? 0} registros
            </span>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold flex items-center gap-1 bg-emerald-500/10 text-positive border border-emerald-500/30">
              {region === 'global'
                ? 'Moneda: USD (Base 100)'
                : normalized
                ? 'Escala: Base 100 (USD)'
                : currency === 'usd'
                ? 'Moneda: USD (Dólares Reales)'
                : region === 'arg'
                ? 'Moneda: ARS (Pesos Nominales)'
                : 'Moneda: BRL (Reales)'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Escala Logarítmica */}
            <button
              type="button"
              onClick={() => setUseLogScale(!useLogScale)}
              title={useLogScale ? "Desactivar escala logarítmica (lineal)" : "Activar escala logarítmica (útil para series con crecimiento exponencial)"}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                useLogScale
                  ? 'bg-blue-600/25 text-blue-300 border-blue-500/40 shadow-sm'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-foreground" />
              <span>Escala Log</span>
              <span className={`w-2 h-2 rounded-full transition-colors ${useLogScale ? 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]' : 'bg-zinc-600'}`} />
            </button>

            {/* Toggle Base 100 */}
            <button
              type="button"
              onClick={() => setNormalized(!normalized)}
              disabled={region === 'global'}
              title={region === 'global' ? "La comparativa global siempre se expresa en Base 100" : normalized ? "Ver precios e índices nominales" : "Normalizar a Base 100 desde el inicio del período seleccionado"}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                normalized || region === 'global'
                  ? 'bg-indigo-600/25 text-indigo-300 border-indigo-500/40 shadow-sm'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground border-border'
              } ${region === 'global' ? 'opacity-80 cursor-default' : ''}`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Base 100</span>
              <span className={`w-2 h-2 rounded-full transition-colors ${normalized || region === 'global' ? 'bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.6)]' : 'bg-zinc-600'}`} />
            </button>

            {/* Toggle Ciclos Electorales */}
            {region === 'global' ? (
              <div
                className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-secondary/50 text-muted-foreground border border-border cursor-not-allowed"
                title="Los ciclos electorales y bandas presidenciales se visualizan al filtrar por país (Argentina, Brasil o EE.UU.)"
              >
                <Vote className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Ciclos (Filtrar por país)</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowElections(!showElections)}
                title={showElections ? "Ocultar bandas presidenciales e hitos electorales" : "Mostrar bandas presidenciales e hitos electorales en el gráfico"}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  showElections
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground border-border'
                }`}
              >
                <Vote className="w-3.5 h-3.5 text-amber-400" />
                <span>Ciclos Electorales</span>
                <span className={`w-2 h-2 rounded-full transition-colors ${showElections ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]' : 'bg-zinc-600'}`} />
              </button>
            )}
          </div>
        </div>

        {/* Canvas de ECharts */}
        <div className="w-full h-[420px] mt-2">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground font-mono text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
              <span>Cargando series históricas...</span>
            </div>
          ) : (
            <ReactECharts
              echarts={echarts}
              option={chartOption}
              style={{ width: '100%', height: '100%' }}
              notMerge={true}
              lazyUpdate={true}
            />
          )}
        </div>
      </div>

      {/* 4. TABLA CUANTITATIVA DE RENDIMIENTO POR MANDATO PRESIDENCIAL */}
      {region !== 'global' && cyclesData?.performance_table && (
        <div className="bg-secondary border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Rendimiento Bursátil por Mandato Presidencial
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-emerald-500/10 text-positive border border-emerald-500/30">
              Métricas en USD ({cyclesData.primary_ticker || (region === 'arg' ? 'MERVAL USD' : region === 'br' ? 'EWZ USD' : 'S&P 500 USD')})
            </span>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs text-muted-foreground font-mono">
              <thead className="bg-secondary text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th className="px-3 py-2">Presidente / Mandato</th>
                  <th className="px-3 py-2">Partido</th>
                  <th className="px-3 py-2">Período</th>
                  <th className="px-3 py-2 text-right">Nivel Inicial (USD)</th>
                  <th className="px-3 py-2 text-right">Nivel Final (USD)</th>
                  <th className="px-3 py-2 text-right">Retorno Total</th>
                  <th className="px-3 py-2 text-right">CAGR</th>
                  <th className="px-3 py-2 text-right">Max Drawdown</th>
                  <th className="px-3 py-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {cyclesData.performance_table.map((row) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      selectedMandateId === row.id ? 'bg-blue-600/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-sans font-bold text-foreground flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span>{row.president}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-sans text-[11px]">
                      {row.party}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-[11px]">
                      {row.start_date.slice(0, 7)} al {row.end_date.slice(0, 7)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      ${row.initial_level?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      ${row.final_level?.toFixed(1) ?? '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-bold ${
                        row.total_return_pct >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {row.total_return_pct >= 0 ? '+' : ''}
                      {row.total_return_pct.toFixed(1)}%
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${
                        row.cagr_pct >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {row.cagr_pct >= 0 ? '+' : ''}
                      {row.cagr_pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-negative">
                      {row.max_drawdown_pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleSelectMandate(row.id)}
                        className="px-2 py-0.5 rounded-lg bg-secondary/50 hover:bg-white/15 text-foreground hover:text-foreground border border-border text-[10px] transition-all cursor-pointer"
                      >
                        Ver en Gráfico
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. CICLO PRESIDENCIAL DE 4 AÑOS (SOLO PARA ESTADOS UNIDOS) */}
      {region === 'usa' && cyclesData?.us_cycle_stats && (
        <div className="bg-secondary border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Teoría del Ciclo Presidencial de 4 Años en Wall Street
              </h3>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              Stock Trader's Almanac Historical Benchmark
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {cyclesData.us_cycle_stats.map((stat) => (
              <div
                key={stat.year_num}
                className="bg-black/30 border border-border rounded-lg p-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-foreground mb-1 font-sans">
                    <span>{stat.label}</span>
                    <span className="text-positive font-mono">
                      +{stat.avg_return_pct}% prom.
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-sans mt-2 leading-relaxed">
                    {stat.historical_bias}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span>Tasa de Acierto (Win Rate):</span>
                  <span className="text-foreground font-bold">{stat.win_rate_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. SÍNTESIS DE DINÁMICA ELECTORAL Y APRENDIZAJES CLAVE */}
      <div className="bg-secondary border border-border rounded-lg p-4 text-xs text-muted-foreground leading-relaxed shadow-md">
        <div className="flex items-center gap-2 font-bold text-foreground uppercase tracking-wider mb-2">
          <Calendar className="w-3.5 h-3.5 text-foreground" />
          <span>Dinámica de Mercados en Años Electorales: Claves de Análisis</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div className="p-3 bg-black/20 rounded-lg border border-border">
            <h4 className="font-bold text-foreground mb-1">🇦🇷 Ciclos en Argentina</h4>
            <p className="text-muted-foreground text-[11px]">
              El Merval en USD experimenta rallies de fuerte expectativa pre-electoral cuando el mercado anticipa reformas o giros pro-mercado (ej. 2015 y 2023). Por el contrario, sorpresas electorales imprevistas desencadenan shocks de revaluación extrema (ej. PASO 2019, caída histórica del 48% en un solo día).
            </p>
          </div>
          <div className="p-3 bg-black/20 rounded-lg border border-border">
            <h4 className="font-bold text-positive mb-1">🇧🇷 Ciclos en Brasil</h4>
            <p className="text-muted-foreground text-[11px]">
              El Ibovespa y el ETF EWZ en USD reflejan una interacción dual entre el ciclo global de commodities (soja y mineral de hierro) y la disciplina fiscal del gobierno de turno. El período 2003-2007 combinó boom externo y ortodoxia, mientras que 2015-2016 demostró cómo la crisis política y el impeachment generaron pisos de valuación históricos.
            </p>
          </div>
          <div className="p-3 bg-black/20 rounded-lg border border-border">
            <h4 className="font-bold text-foreground mb-1">🇺🇸 Ciclos en EE.UU.</h4>
            <p className="text-muted-foreground text-[11px]">
              El S&P 500 muestra consistencia estadística con el ciclo de 4 años: el Año 3 (pre-electoral) es históricamente el más alcista (+16.2% promedio), mientras que el Año 2 (Midterms) genera correcciones temporales que preceden fuertes rallies alcistas una vez que se despeja la incertidumbre del Congreso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
