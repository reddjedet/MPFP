import unittest
import pandas as pd
from services.cedear_service import calculate_rsi, CEDEAR_RATIOS

class TestCedearService(unittest.TestCase):
    
    def test_calculate_rsi_wilder_math(self):
        # Escenario controlado: 14 días de subida constante de 1 unidad
        # Ganancia promedio = 1.0, Pérdida promedio = 0.0 -> RSI = 100
        prices_up = pd.Series([100.0 + i for i in range(20)])
        rsi_up = calculate_rsi(prices_up, period=14)
        self.assertEqual(rsi_up.iloc[-1], 100.0)

        # Escenario controlado: 14 días de bajada constante de 1 unidad
        # Ganancia promedio = 0.0, Pérdida promedio = 1.0 -> RSI = 0
        prices_down = pd.Series([100.0 - i for i in range(20)])
        rsi_down = calculate_rsi(prices_down, period=14)
        self.assertEqual(rsi_down.iloc[-1], 0.0)

    def test_calculate_rsi_flat_price(self):
        # Escenario de precio congelado/plano
        # Ganancia = 0, Pérdida = 0 -> RSI = 50.0 por convención de estabilidad
        prices_flat = pd.Series([100.0 for _ in range(20)])
        rsi_flat = calculate_rsi(prices_flat, period=14)
        self.assertEqual(rsi_flat.iloc[-1], 50.0)

    def test_cedear_ratios_exist(self):
        self.assertIn("AAPL", CEDEAR_RATIOS)
        self.assertIn("GOOGL", CEDEAR_RATIOS)
        self.assertIn("MSFT", CEDEAR_RATIOS)
        self.assertIn("NU", CEDEAR_RATIOS)
        self.assertIn("CEG", CEDEAR_RATIOS)
        self.assertGreater(CEDEAR_RATIOS["AAPL"], 0)

    def test_get_all_portfolio_tickers(self):
        from services.portfolio_service import get_all_portfolio_tickers
        tickers = get_all_portfolio_tickers()
        self.assertIsInstance(tickers, list)
        self.assertIn("COST", tickers)
        self.assertIn("LLY", tickers)
        self.assertIn("GOOGL", tickers)

    def test_get_cedear_tickers_endpoint(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        res = client.get("/api/cedears/tickers")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("tickers", data)
        self.assertIsInstance(data["tickers"], list)
        self.assertIn("AAPL", data["tickers"])
        self.assertIn("MELI", data["tickers"])
        self.assertIn("NVDA", data["tickers"])

    def test_cedear_alert_inclusive_thresholds(self):
        """Verifica que la alerta RSI sea inclusiva a 35.0 y 65.0."""
        from unittest.mock import patch
        import pandas as pd
        from services.cedear_service import get_ticker_data

        # Simular serie con RSI exactamente en 35.0 y 65.0
        with patch("services.cedear_service.smart_cache", lambda *a, **kw: lambda fn: fn):
            with patch("services.cedear_service.yf.download") as mock_yf:
                with patch("services.cedear_service.calculate_rsi") as mock_calc:
                    mock_df = pd.DataFrame({"Close": [100.0] * 20})
                    mock_yf.return_value = mock_df
                    
                    # Caso exacto 35.0 (debe activar alerta)
                    mock_calc.return_value = pd.Series([35.0] * 20)
                    fn = getattr(get_ticker_data, "__wrapped__", get_ticker_data)
                    data_35 = fn("AAPL")
                    self.assertIsNotNone(data_35)
                    self.assertTrue(data_35["alert"], "RSI 35.0 debe activar alerta inclusiva")

                    # Caso exacto 65.0 (debe activar alerta)
                    mock_calc.return_value = pd.Series([65.0] * 20)
                    data_65 = fn("AAPL")
                    self.assertIsNotNone(data_65)
                    self.assertTrue(data_65["alert"], "RSI 65.0 debe activar alerta inclusiva")

                    # Caso intermedio 50.0 (NO debe activar alerta)
                    mock_calc.return_value = pd.Series([50.0] * 20)
                    data_50 = fn("AAPL")
                    self.assertIsNotNone(data_50)
                    self.assertFalse(data_50["alert"], "RSI 50.0 no debe activar alerta")

if __name__ == "__main__":
    unittest.main()
