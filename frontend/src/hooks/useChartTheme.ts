export interface ChartThemeTokens {
  isDark: boolean;
  theme: 'dark';
  textPrimary: string;
  textMuted: string;
  axisLine: string;
  splitLine: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
  tooltipShadow: string;
  cardBorder: string;
  calLineColor: string;
  sharpeOptimalColor: string;
  benchmarkColor: string;
  scatterAssetLabelColor: string;
  scatterAssetLabelBorder: string;
}

export function useChartTheme(): ChartThemeTokens {
  // For now, always return dark theme tokens.
  // When light mode is fully implemented, this can read from
  // document.documentElement.classList or a Zustand theme slice.
  return {
    isDark: true,
    theme: 'dark',
    textPrimary: '#e9e9e2',
    textMuted: '#8a8a98',
    axisLine: 'rgba(255,255,255,0.1)',
    splitLine: 'rgba(255,255,255,0.05)',
    tooltipBg: '#1c1c24',
    tooltipText: '#e9e9e2',
    tooltipBorder: 'rgba(255,255,255,0.15)',
    tooltipShadow: 'none',
    cardBorder: '#16161d',
    calLineColor: '#f59e0b',
    sharpeOptimalColor: '#ffd600',
    benchmarkColor: '#ff9f0a',
    scatterAssetLabelColor: '#e9e9e2',
    scatterAssetLabelBorder: '#16161d',
  };
}

