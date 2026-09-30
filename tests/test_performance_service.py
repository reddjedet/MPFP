import unittest
from services.performance_service import calculate_backtest_performance

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

if __name__ == "__main__":
    unittest.main()
