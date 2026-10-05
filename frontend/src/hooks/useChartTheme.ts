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
  correlationNegative: string;
  correlationNegativeMid: string;
  correlationNeutral: string;
  correlationPositiveMid: string;
  correlationPositive: string;
  correlationDiagonal: string;
  calLineColor: string;
  sharpeOptimalColor: string;
  benchmarkColor: string;
  scatterAssetLabelColor: string;
  scatterAssetLabelBorder: string;
}

export function useChartTheme(): ChartThemeTokens {
  // Always returning Everforest Dark mode for charts for now.
  // Can be expanded to read light/dark context later.
  return {
    isDark: true,
    theme: 'dark',
    textPrimary: '#d3c6aa',
    textMuted: '#9da9a0',
    axisLine: 'rgba(211, 198, 170, 0.1)',
    splitLine: 'rgba(211, 198, 170, 0.05)',
    tooltipBg: '#323c41',
    tooltipText: '#d3c6aa',
    tooltipBorder: '#475258',
    tooltipShadow: 'none',
    cardBorder: '#475258',
    correlationNegative: '#7fbbb3',
    correlationNegativeMid: '#9db5a6',
    correlationNeutral: '#343f44',
    correlationPositiveMid: '#d69975',
    correlationPositive: '#e67e80',
    correlationDiagonal: '#475258',
    calLineColor: '#dbbc7f',
    sharpeOptimalColor: '#dbbc7f',
    benchmarkColor: '#e69875',
    scatterAssetLabelColor: '#d3c6aa',
    scatterAssetLabelBorder: '#2d353b',
  };
}

