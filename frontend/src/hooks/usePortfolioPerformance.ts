import { useQuery } from '@tanstack/react-query';

export interface PerformanceData {
  benchmark: string;
  portfolio_return_inception: number;
  benchmark_return_inception: number;
  alpha_inception: number;
  metrics: {
    '3m': number;
    'ytd': number;
    '12m': number;
    beta: number | null;
    annualized_volatility_pct: number | null;
    max_drawdown_pct: number | null;
  };
  sparkline: Array<{
    date: string;
    value: number;
    benchmark_value: number;
  }>;
}

export function usePortfolioPerformance(pfKey: string, period: string = 'ytd') {
  const { data, isLoading: loading, error } = useQuery<PerformanceData>({
    queryKey: ['portfolio-performance', pfKey, period],
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/performance_json/${pfKey}?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch performance');
      return res.json();
    },
    enabled: !!pfKey,
    staleTime: 300 * 1000,
  });
  return { data, loading, error: error as Error | null };
}
