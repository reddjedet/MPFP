import unittest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

class TestIndicesService(unittest.TestCase):

    def test_calculate_series_metrics_math(self):
        from services.market_indices_service import calculate_series_metrics
        # Serie controlada: 252 días (1 año trading), inicia en 100, pico en 150, cae a 75, termina en 120
        dates = pd.date_range("2022-01-01", periods=252, freq="B")
        prices = np.linspace(100, 150, 100).tolist() + np.linspace(150, 75, 80).tolist() + np.linspace(75, 120, 72).tolist()
        series = pd.Series(prices, index=dates)

        metrics = calculate_series_metrics(series)
        self.assertIn("total_return_pct", metrics)
        self.assertIn("cagr_pct", metrics)
        self.assertIn("max_drawdown_pct", metrics)
        self.assertIn("annualized_volatility_pct", metrics)

        # Retorno total = (120 - 100) / 100 = 20%
        self.assertAlmostEqual(metrics["total_return_pct"], 20.0, places=1)
        # Max drawdown = (75 - 150) / 150 = -50%
        self.assertAlmostEqual(metrics["max_drawdown_pct"], -50.0, places=1)

    def test_get_available_indices_metadata(self):
        from services.market_indices_service import get_available_indices_metadata
        meta = get_available_indices_metadata()
        self.assertIn("regions", meta)
        regions = [r["id"] for r in meta["regions"]]
        self.assertIn("arg", regions)
        self.assertIn("br", regions)
        self.assertIn("usa", regions)
        self.assertIn("global", regions)

    def test_get_presidential_cycles_argentina(self):
        from services.market_indices_service import get_presidential_cycles
        cycles = get_presidential_cycles("arg")
        self.assertIn("mandates", cycles)
        self.assertIn("elections", cycles)
        self.assertIn("performance_table", cycles)
        
        # Verificar que existan mandatos clave como Macri y Milei
        mandates_names = [m["president"] for m in cycles["mandates"]]
        self.assertTrue(any("Macri" in name for name in mandates_names))
        self.assertTrue(any("Milei" in name for name in mandates_names))
        
        # Verificar hitos electorales clave
        election_names = [e["label"] for e in cycles["elections"]]
        self.assertTrue(any("PASO 2019" in label for label in election_names))

    def test_get_indices_history_structure(self):
        from services.market_indices_service import get_indices_history
        hist = get_indices_history(region="arg", period="5y", currency="usd", normalized=False)
        self.assertIn("dates", hist)
        self.assertIn("series", hist)
        self.assertIn("summary_metrics", hist)
        self.assertGreater(len(hist["dates"]), 0)

    def test_api_indices_endpoints(self):
        from main import app
        client = TestClient(app)
        
        # Metadata endpoint
        res_meta = client.get("/api/indices/metadata")
        self.assertEqual(res_meta.status_code, 200)
        
        # Cycles endpoint
        res_cycles = client.get("/api/indices/cycles?region=arg")
        self.assertEqual(res_cycles.status_code, 200)
        cycles_data = res_cycles.json()
        self.assertIn("mandates", cycles_data)
        
        # History endpoint
        res_hist = client.get("/api/indices/history?region=arg&period=10y&currency=usd")
        self.assertEqual(res_hist.status_code, 200)
        hist_data = res_hist.json()
        self.assertIn("dates", hist_data)
        self.assertIn("series", hist_data)

if __name__ == "__main__":
    unittest.main()
