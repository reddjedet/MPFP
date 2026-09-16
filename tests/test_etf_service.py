import unittest
from unittest.mock import patch
from services.etf_service import fetch_sector_etf_thermometer, SECTOR_ETFS

class TestEtfThermometerService(unittest.TestCase):

    def setUp(self):
        # Limpiar el cache en memoria antes de cada prueba para aislamiento estricto
        if hasattr(fetch_sector_etf_thermometer, "cache_clear"):
            fetch_sector_etf_thermometer.cache_clear()
        elif hasattr(fetch_sector_etf_thermometer, "__wrapped__"):
            pass

    def test_sector_etfs_definition(self):
        """Verifica que esten definidos los 11 sectores oficiales del S&P 500 con sus nombres en espanol."""
        self.assertEqual(len(SECTOR_ETFS), 11)
        expected_tickers = ["XLK", "XLF", "XLV", "XLY", "XLC", "XLI", "XLP", "XLE", "XLRE", "XLB", "XLU"]
        for ticker in expected_tickers:
            self.assertIn(ticker, SECTOR_ETFS)
            self.assertTrue(len(SECTOR_ETFS[ticker]["name"]) > 0)
            self.assertTrue(len(SECTOR_ETFS[ticker]["sector"]) > 0)

    @patch("services.etf_service.scanner_scan")
    def test_fetch_sector_etf_thermometer_success(self, mock_scan):
        """Verifica que el servicio procese correctamente las columnas y metricas del termometro."""
        mock_scan.return_value = {
            "data": [
                {
                    "symbol": "AMEX:XLK",
                    "name": "XLK",
                    "close": 187.67,
                    "change": 1.32,
                    "Perf.W": 0.25,
                    "Perf.1M": -0.95,
                    "RSI": 55.10,
                    "SMA50": 182.72,
                    "SMA200": 161.33,
                },
                {
                    "symbol": "AMEX:XLE",
                    "name": "XLE",
                    "close": 65.14,
                    "change": 0.32,
                    "Perf.W": 1.71,
                    "Perf.1M": 7.72,
                    "RSI": 66.13,
                    "SMA50": 60.13,
                    "SMA200": 55.23,
                }
            ]
        }

        # Invocar directamente la funcion base desempaquetada para bypass de cache en test
        fn = getattr(fetch_sector_etf_thermometer, "__wrapped__", fetch_sector_etf_thermometer)
        result = fn()
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 2)
        
        # Como XLE tiene Perf.W de 1.71 y XLK 0.25, XLE queda primero por orden descendente
        xle = result[0]
        self.assertEqual(xle["ticker"], "XLE")
        self.assertEqual(xle["name"], "Energia")
        self.assertEqual(xle["perf_w"], 1.71)
        self.assertIn("diff_vs_spy_w", xle)

        xlk = result[1]
        self.assertEqual(xlk["ticker"], "XLK")
        self.assertEqual(xlk["name"], "Tecnologia")
        self.assertEqual(xlk["perf_w"], 0.25)
        self.assertEqual(xlk["perf_1m"], -0.95)
        self.assertEqual(xlk["rsi"], 55.10)
        self.assertEqual(xlk["trend_sma50"], "BULLISH")
        self.assertEqual(xlk["trend_sma200"], "BULLISH")
        self.assertIn("diff_vs_spy_w", xlk)


    @patch("services.etf_service.scanner_scan")
    def test_fetch_sector_etf_thermometer_error_handling(self, mock_scan):
        """Verifica que ante una excepcion de red el servicio maneje el error limpiamente."""
        mock_scan.side_effect = Exception("API Unavailable")
        fn = getattr(fetch_sector_etf_thermometer, "__wrapped__", fetch_sector_etf_thermometer)
        result = fn()
        self.assertEqual(result, [])

    @patch("services.etf_service.scanner_scan")
    def test_fetch_etf_rotation_analysis_success(self, mock_scan):
        """Verifica el análisis cuantitativo completo de rotación: benchmark, cuadrantes y régimen."""
        from services.etf_service import fetch_etf_rotation_analysis
        mock_scan.return_value = {
            "data": [
                {
                    "symbol": "AMEX:SPY",
                    "name": "SPY",
                    "close": 500.0,
                    "change": 0.5,
                    "Perf.W": 1.0,
                    "Perf.1M": 2.0,
                    "Perf.3M": 5.0,
                    "Perf.YTD": 12.0,
                },
                {
                    "symbol": "AMEX:XLK",
                    "name": "XLK",
                    "close": 200.0,
                    "change": 1.2,
                    "Perf.W": 3.5,     # Alpha 1W = +2.5%
                    "Perf.1M": 4.5,    # Alpha 1M = +2.5% -> LEADERS
                    "Perf.3M": 8.0,
                    "Perf.YTD": 18.0,
                    "RSI": 62.0,
                    "SMA50": 190.0,
                    "SMA200": 175.0,
                },
                {
                    "symbol": "AMEX:XLU",
                    "name": "XLU",
                    "close": 65.0,
                    "change": -0.8,
                    "Perf.W": -0.5,    # Alpha 1W = -1.5%
                    "Perf.1M": -1.0,   # Alpha 1M = -3.0% -> LAGGING
                    "Perf.3M": 1.0,
                    "Perf.YTD": 3.0,
                    "RSI": 38.0,
                    "SMA50": 68.0,
                    "SMA200": 64.0,
                }
            ]
        }

        fn = getattr(fetch_etf_rotation_analysis, "__wrapped__", fetch_etf_rotation_analysis)
        result = fn(universe="sectors")

        self.assertIsNotNone(result)
        self.assertIn("benchmark", result)
        self.assertEqual(result["benchmark"]["ticker"], "SPY")
        self.assertEqual(result["benchmark"]["perf_w"], 1.0)

        items = result["items"]
        self.assertEqual(len(items), 2)

        # XLK outperforming (diff_w = +2.5) -> top leader
        xlk = next(it for it in items if it["ticker"] == "XLK")
        self.assertEqual(xlk["diff_vs_spy_w"], 2.5)
        self.assertEqual(xlk["diff_vs_spy_1m"], 2.5)
        self.assertEqual(xlk["quadrant"], "LEADERS")

        # XLU underperforming (diff_w = -1.5) -> lagging
        xlu = next(it for it in items if it["ticker"] == "XLU")
        self.assertEqual(xlu["diff_vs_spy_w"], -1.5)
        self.assertEqual(xlu["diff_vs_spy_1m"], -3.0)
        self.assertEqual(xlu["quadrant"], "LAGGING")

        # Market regime: XLK (growth) +2.5 vs XLU (defensive) -1.5 -> spread = 4.0 > 0.5 -> RISK_ON
        self.assertEqual(result["market_regime"]["regime"], "RISK_ON")
        self.assertEqual(result["top_leader"]["ticker"], "XLK")
        self.assertEqual(result["top_laggard"]["ticker"], "XLU")

    @patch("services.etf_service.scanner_scan")
    def test_fetch_etf_rotation_analysis_thematic(self, mock_scan):
        """Verifica que el universo temático consulte los ETFs extendidos (QQQ, etc.)."""
        from services.etf_service import fetch_etf_rotation_analysis
        mock_scan.return_value = {
            "data": [
                {"symbol": "AMEX:SPY", "name": "SPY", "close": 500.0, "Perf.W": 1.0, "Perf.1M": 2.0},
                {"symbol": "NASDAQ:QQQ", "name": "QQQ", "close": 450.0, "Perf.W": 2.0, "Perf.1M": 3.5}
            ]
        }
        fn = getattr(fetch_etf_rotation_analysis, "__wrapped__", fetch_etf_rotation_analysis)
        result = fn(universe="thematic")
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["ticker"], "QQQ")
        self.assertEqual(result["items"][0]["diff_vs_spy_w"], 1.0)


if __name__ == "__main__":
    unittest.main()

