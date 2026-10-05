import unittest
import math
import numpy as np
import pandas as pd
from services.performance_service import calculate_backtest_performance, calculate_one_year_risk_metrics

class TestPerformanceService(unittest.TestCase):
    
    def test_calculate_backtest_performance_invalid_pf(self):
        result = calculate_backtest_performance("invalid_portfolio")
        self.assertFalse(result.get("success"))
        self.assertIn("not found", result.get("error", "").lower())
        
    def test_calculate_backtest_performance_valid(self):
        # bmb is a standard portfolio fixture
        result = calculate_backtest_performance("bmb", chart_period="ytd")
        if result.get("success"):
            self.assertIn("benchmark", result)
            self.assertIn("portfolio_return_inception", result)
            self.assertIn("sparkline", result)
            self.assertIn("metrics", result)
            self.assertIn("beta", result["metrics"])
            self.assertIn("annualized_volatility_pct", result["metrics"])
            self.assertIn("max_drawdown_pct", result["metrics"])

    def test_one_year_risk_metrics_use_trailing_252_daily_returns(self):
        benchmark_returns = pd.Series(np.tile([0.01, -0.005], 126))
        portfolio_returns = benchmark_returns * 2

        metrics = calculate_one_year_risk_metrics(portfolio_returns, benchmark_returns)

        self.assertAlmostEqual(metrics["beta"], 2.0)
        expected_volatility = portfolio_returns.std(ddof=1) * math.sqrt(252) * 100
        self.assertAlmostEqual(metrics["annualized_volatility_pct"], expected_volatility)
        nav = pd.concat([
            pd.Series([1.0]),
            (1 + portfolio_returns).cumprod().reset_index(drop=True),
        ], ignore_index=True)
        expected_drawdown = ((nav / nav.cummax()) - 1).min() * 100
        self.assertAlmostEqual(metrics["max_drawdown_pct"], expected_drawdown)

    def test_one_year_risk_metrics_are_unavailable_without_full_year(self):
        short_returns = pd.Series([0.01, -0.01] * 100)

        metrics = calculate_one_year_risk_metrics(short_returns, short_returns)

        self.assertIsNone(metrics["beta"])
        self.assertIsNone(metrics["annualized_volatility_pct"])
        self.assertIsNone(metrics["max_drawdown_pct"])

if __name__ == "__main__":
    unittest.main()
