import { useCachedFetch } from '@/lib/queryCache';

export interface PerformanceData {
  benchmark: string;
  portfolio_return_inception: number;
  benchmark_return_inception: number;
  alpha_inception: number;
  metrics: {
    '3m': number;
    'ytd': number;
    '12m': number;
    beta: number;
  };
  sparkline: Array<{
    date: string;
    value: number;
    benchmark_value: number;
  }>;
}

export function usePortfolioPerformance(pfKey: string, period: string = 'ytd') {
  const { data, loading, error } = useCachedFetch<PerformanceData>(
    pfKey ? `portfolio-performance-${pfKey}-${period}` : 'null-key',
    pfKey ? `/api/portfolios/performance_json/${pfKey}?period=${period}` : '',
    { enabled: !!pfKey, ttl: 300 }
  );
  return { data, loading, error };
}
