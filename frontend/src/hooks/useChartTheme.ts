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
  return {
    isDark: true,
    theme: 'dark',
    textPrimary: '#ffffff',
    textMuted: '#9ea3b0',
    axisLine: 'rgba(255,255,255,0.1)',
    splitLine: 'rgba(255,255,255,0.05)',
    tooltipBg: '#181920',
    tooltipText: '#ffffff',
    tooltipBorder: 'rgba(255,255,255,0.15)',
    tooltipShadow: 'none',
    cardBorder: '#0f1015',
    calLineColor: '#f59e0b',
    sharpeOptimalColor: '#ffd600',
    benchmarkColor: '#ff9f0a',
    scatterAssetLabelColor: '#ffffff',
    scatterAssetLabelBorder: '#000000',
  };
}

