import unittest
import numpy as np
from fastapi.testclient import TestClient
from main import app
from services.markowitz_service import (
    optimize_min_volatility,
    optimize_max_sharpe,
    calculate_efficient_frontier_curve,
    calculate_markowitz_model
)

class TestMarkowitzService(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        self.tickers = ["AAPL", "MSFT", "GOOGL", "AMZN"]
        self.mu = np.array([0.18, 0.20, 0.15, 0.22])
        self.vols = np.array([0.22, 0.24, 0.20, 0.28])
        corr = np.eye(4) * 0.6 + 0.4
        self.cov = np.outer(self.vols, self.vols) * corr

    def test_optimize_min_volatility(self):
        w_min = optimize_min_volatility(self.cov)
        self.assertAlmostEqual(float(np.sum(w_min)), 1.0, places=4)
        self.assertTrue(np.all(w_min >= 0))
        
        # Comprobar que la volatilidad de la cartera de min vol es menor que la de cualquier activo individual
        vol_min = float(np.sqrt(np.dot(w_min, np.dot(self.cov, w_min))))
        for v in self.vols:
            self.assertLessEqual(vol_min, v + 1e-4)

    def test_optimize_max_sharpe(self):
        w_ms = optimize_max_sharpe(self.mu, self.cov, rf=0.04)
        self.assertAlmostEqual(float(np.sum(w_ms)), 1.0, places=4)
        self.assertTrue(np.all(w_ms >= 0))
        
        # Comprobar que el Sharpe es positivo y coherente
        ret_ms = float(np.dot(w_ms, self.mu))
        vol_ms = float(np.sqrt(np.dot(w_ms, np.dot(self.cov, w_ms))))
        sharpe_ms = (ret_ms - 0.04) / vol_ms
        self.assertGreater(sharpe_ms, 0.3)

    def test_calculate_efficient_frontier_curve(self):
        ef_vols, ef_rets, ef_weights = calculate_efficient_frontier_curve(
            self.mu, self.cov, r_min=0.15, r_max=0.22, n_points=10
        )
        self.assertEqual(len(ef_vols), 10)
        self.assertEqual(len(ef_rets), 10)
        self.assertEqual(len(ef_weights), 10)
        self.assertTrue(all(v > 0 for v in ef_vols))
        self.assertTrue(all(r > 0 for r in ef_rets))
        self.assertTrue(all(len(w) == 4 for w in ef_weights))

    def test_calculate_markowitz_model_full(self):
        res = calculate_markowitz_model(
            tickers=self.tickers,
            current_weights={"AAPL": 25.0, "MSFT": 25.0, "GOOGL": 25.0, "AMZN": 25.0},
            period="2y",
            rf_rate=0.04,
            num_simulations=1000
        )
        
        self.assertIn("max_sharpe", res)
        self.assertIn("min_volatility", res)
        self.assertIn("optimal_candidates", res)
        self.assertIn("weights_table", res)
        self.assertIn("frontier_data", res)
        self.assertIn("time_series", res)
        self.assertIn("current_portfolio", res)
        self.assertIn("global_stats", res)
        self.assertIn("annual_returns_table", res)

        # Validar carteras candidatas
        candidates = res["optimal_candidates"]
        self.assertIn("max_sharpe", candidates)
        self.assertIn("min_volatility", candidates)
        self.assertIn("current_portfolio", candidates)
        self.assertIn("composition", candidates["max_sharpe"])
        self.assertIn("stats", candidates["max_sharpe"])
        self.assertIn("weights", candidates["max_sharpe"])
        self.assertGreater(len(candidates["max_sharpe"]["composition"]), 0)

        # Validar que los puntos del gráfico contengan estructura de ponderaciones
        self.assertIn("weights", res["frontier_data"]["mc_points"][0])
        self.assertIn("weights", res["frontier_data"]["efficient_frontier"][0])
        self.assertIn("weights", res["frontier_data"]["max_sharpe_point"])
        self.assertIn("weights", res["frontier_data"]["min_vol_point"])
        self.assertIn("weights", res["frontier_data"]["current_portfolio_point"])
        
        # Validar consistencia matemática de estadísticas
        g_stats = res["global_stats"]
        self.assertIn("sharpe_optimo", g_stats)
        self.assertIn("min_volatilidad", g_stats)
        self.assertIn("cartera_actual", g_stats)
        self.assertIn("benchmark_spy", g_stats)
        
        sharpe_stats = g_stats["sharpe_optimo"]
        self.assertIn("cagr", sharpe_stats)
        self.assertIn("volatility", sharpe_stats)
        self.assertIn("sharpe", sharpe_stats)
        self.assertIn("sortino", sharpe_stats)
        self.assertIn("max_drawdown", sharpe_stats)
        self.assertIn("calmar", sharpe_stats)
        self.assertLessEqual(sharpe_stats["max_drawdown"], 0.0)
        self.assertGreaterEqual(sharpe_stats["volatility"], 0.0)
        
        # Validar la tabla de pesos
        table = res["weights_table"]
        self.assertEqual(len(table), 4)
        total_sharpe_w = sum(row["sharpe_weight"] for row in table)
        total_min_w = sum(row["min_vol_weight"] for row in table)
        self.assertAlmostEqual(total_sharpe_w, 100.0, places=1)
        self.assertAlmostEqual(total_min_w, 100.0, places=1)

    def test_markowitz_dashboard_endpoint(self):
        resp = self.client.post("/api/markowitz/markowitz_json", json={
            "selected_pf": "bmb",
            "custom_tickers": "",
            "period": "2y",
            "rf_rate": 4.0
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("max_sharpe", data)
        self.assertIn("min_volatility", data)
        self.assertIn("optimal_candidates", data)
        self.assertIn("weights_table", data)
        self.assertIn("global_stats", data)

    def test_markowitz_dashboard_custom_with_explicit_weights(self):
        resp = self.client.post("/api/markowitz/markowitz_json", json={
            "selected_pf": "custom",
            "custom_tickers": "AAPL:60, MSFT:40",
            "period": "2y",
            "rf_rate": 4.0
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("selected_pf"), "custom")
        self.assertIn("optimal_candidates", data)
        self.assertIn("current_portfolio", data["optimal_candidates"])
        self.assertEqual(set(data["tickers"]), {"AAPL", "MSFT"})

    def test_resolve_calendar_start_date(self):
        from services.markowitz_service import resolve_calendar_start_date
        from datetime import datetime
        year = datetime.now().year
        self.assertEqual(resolve_calendar_start_date("1y"), f"{year}-01-01")
        self.assertEqual(resolve_calendar_start_date("2y"), f"{year - 1}-01-01")
        self.assertEqual(resolve_calendar_start_date("3y"), f"{year - 2}-01-01")
        self.assertEqual(resolve_calendar_start_date("5y"), f"{year - 4}-01-01")

    def test_simulate_portfolio_returns_regimes(self):
        from services.markowitz_service import simulate_portfolio_returns
        import pandas as pd
        dates = pd.date_range("2024-01-01", "2025-12-31", freq='B')
        df = pd.DataFrame({
            "AAPL": np.random.normal(0.001, 0.015, len(dates)),
            "MSFT": np.random.normal(0.0008, 0.012, len(dates))
        }, index=dates)
        weights = np.array([0.6, 0.4])

        s_annual = simulate_portfolio_returns(df, weights, regime="annual")
        s_daily = simulate_portfolio_returns(df, weights, regime="daily")
        s_none = simulate_portfolio_returns(df, weights, regime="none")

        self.assertEqual(len(s_annual), len(dates))
        self.assertEqual(len(s_daily), len(dates))
        self.assertEqual(len(s_none), len(dates))
        self.assertFalse(s_annual.isna().any())
        self.assertFalse(s_daily.isna().any())
        self.assertFalse(s_none.isna().any())

    def test_markowitz_json_with_rebalance_regime(self):
        resp = self.client.get("/api/markowitz/markowitz_json?selected_pf=bal&period=3y&rebalance_regime=annual")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("rebalance_regime"), "annual")
        self.assertIn("global_stats", data)
        self.assertIn("cartera_actual", data["global_stats"])

if __name__ == "__main__":
    unittest.main()

