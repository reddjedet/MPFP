import React, { useMemo, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
const ReactECharts = (ReactEChartsCore as any).default || ReactEChartsCore;
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { usePortfolioPerformance } from '../../hooks/usePortfolioPerformance';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  title: string;
  pfKey: string;
  totalValue: number;
}

export const PortfolioSummaryCards: React.FC<Props> = ({ title, pfKey, totalValue }) => {
  const [chartPeriod, setChartPeriod] = useState<string>('ytd');
  const { data, loading, error } = usePortfolioPerformance(pfKey, chartPeriod);

  const chartOptions = useMemo(() => {
    if (!data) {
      return {};
    }
    return {
      grid: { top: 5, bottom: 5, left: 0, right: 0 },
      xAxis: { type: 'category', show: false, data: data.sparkline.map((s: any) => s.date) },
      yAxis: { type: 'value', show: false, min: 'dataMin' },
      tooltip: { trigger: 'axis', textStyle: { fontSize: 10 }, padding: [4, 8] },
      series: [
        {
          name: 'Cartera',
          data: data.sparkline.map((s: any) => s.value),
          type: 'line',
          areaStyle: { opacity: 0.2, color: '#a7c080' },
          lineStyle: { color: '#a7c080', width: 2 },
          showSymbol: false,
        },
        {
          name: data.benchmark || 'Benchmark',
          data: data.sparkline.map((s: any) => s.benchmark_value),
          type: 'line',
          lineStyle: { color: '#859289', type: 'dashed', width: 1.5 },
          showSymbol: false,
        }
      ]
    };
  }, [data]);

  if (loading) return <div className="bg-card text-foreground p-4 rounded-lg w-full max-w-md animate-pulse h-64 border border-border"></div>;
  if (error || !data) return <div className="bg-card text-negative p-4 rounded-lg w-full max-w-md border border-border flex items-center justify-center h-64">Rendimiento no disponible.</div>;

  const formatPercent = (val: number) => `${(val * 100).toFixed(1)}%`;
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  
  const alphaPp = (data.alpha_inception * 100).toFixed(1);
  const isAlphaPositive = data.alpha_inception >= 0;

  const portReturn = data.portfolio_return_inception;
  const benchReturn = data.benchmark_return_inception;

  const maxReturn = Math.max(Math.abs(portReturn), Math.abs(benchReturn), 0.01);
  const portWidth = `${Math.min((Math.abs(portReturn) / maxReturn) * 100, 100)}%`;
  const benchWidth = `${Math.min((Math.abs(benchReturn) / maxReturn) * 100, 100)}%`;

  const periodLabel = {
    '1m': 'Último Mes',
    '3m': 'Últimos 3 Meses',
    'ytd': 'YTD (Este Año)',
    '1y': 'Último Año'
  }[chartPeriod] || 'Último Año';

  return (
    <div className="bg-card text-foreground p-5 rounded-2xl shadow-sm flex flex-col gap-4 border border-border w-full">
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${portReturn >= 0 ? 'bg-positive' : 'bg-negative'}`}></div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</h3>
          </div>
          <p className="text-2xl font-black tracking-tight text-foreground">{formatCurrency(totalValue)}</p>
        </div>
        <div className="text-right">
          <div className={`text-xs font-bold px-2 py-1 rounded bg-secondary/50 border border-border ${isAlphaPositive ? 'text-positive' : 'text-negative'}`}>
            {isAlphaPositive ? '+' : ''}{alphaPp} pp vs {data.benchmark || 'SPY'}
          </div>
          <select 
            value={chartPeriod} 
            onChange={e => setChartPeriod(e.target.value)}
            className="text-[10px] bg-transparent outline-none cursor-pointer block text-muted-foreground mt-1 uppercase tracking-wider ml-auto text-right font-bold hover:text-foreground transition-colors"
          >
            <option value="1m">Último Mes</option>
            <option value="3m">Últimos 3 Meses</option>
            <option value="ytd">YTD (Este Año)</option>
            <option value="1y">Último Año</option>
          </select>
        </div>
      </div>

      <div className="h-24 w-full mt-1 -mx-2 px-2">
        <ReactECharts echarts={echarts} option={chartOptions} style={{ height: '100%', width: '100%' }} />
      </div>

      <div className="flex flex-col gap-3 mt-1">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground font-medium">Cartera</span>
            <span className={`font-mono font-bold ${portReturn >= 0 ? 'text-positive' : 'text-negative'}`}>{portReturn > 0 ? '+' : ''}{formatPercent(portReturn)}</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${portReturn >= 0 ? 'bg-positive' : 'bg-negative'}`} style={{ width: portWidth }} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground font-medium">{data.benchmark || 'Benchmark'}</span>
            <span className="text-muted-foreground font-mono font-bold">{benchReturn > 0 ? '+' : ''}{formatPercent(benchReturn)}</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-muted-foreground/60 transition-all duration-1000" style={{ width: benchWidth }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-2 pt-4 border-t border-border text-center">
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">3M</p>
          <p className={`text-xs font-mono font-bold ${data.metrics['3m'] >= 0 ? 'text-positive' : 'text-negative'}`}>{data.metrics['3m'] > 0 ? '+' : ''}{formatPercent(data.metrics['3m'])}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">YTD</p>
          <p className={`text-xs font-mono font-bold ${data.metrics.ytd >= 0 ? 'text-positive' : 'text-negative'}`}>{data.metrics.ytd > 0 ? '+' : ''}{formatPercent(data.metrics.ytd)}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">1Y</p>
          <p className={`text-xs font-mono font-bold ${data.metrics['12m'] >= 0 ? 'text-positive' : 'text-negative'}`}>{data.metrics['12m'] > 0 ? '+' : ''}{formatPercent(data.metrics['12m'])}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Beta</p>
          <p className="text-xs font-mono font-bold text-foreground">{data.metrics.beta.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};
