from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_correlation_palette_uses_soft_everforest_tokens():
    theme = (PROJECT_ROOT / "frontend/src/hooks/useChartTheme.ts").read_text()
    chart = (PROJECT_ROOT / "frontend/src/components/markowitz/MarkowitzCharts.tsx").read_text()

    for color in ("#7fbbb3", "#9db5a6", "#343f44", "#d69975", "#e67e80", "#475258"):
        assert color in theme
    assert "chartTheme.correlationNegative" in chart
    assert "chartTheme.correlationNeutral" in chart
    assert "chartTheme.correlationPositive" in chart
    assert "chartTheme.correlationDiagonal" in chart


def test_large_correlation_matrices_keep_axes_readable_and_values_in_tooltip():
    chart = (PROJECT_ROOT / "frontend/src/components/markowitz/MarkowitzCharts.tsx").read_text()

    assert "const largeMatrix = tickers.length >= 16;" in chart
    assert "show: !largeMatrix" in chart
    assert "rotate: largeMatrix ? 45 : 0" in chart
    assert "formatter: (params: any) =>" in chart
    assert "min: -1.0" in chart
    assert "max: 1.0" in chart
    assert "chartTheme.correlationDiagonal" in chart
