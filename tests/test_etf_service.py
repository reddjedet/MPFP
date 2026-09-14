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

        xlk = result[1]
        self.assertEqual(xlk["ticker"], "XLK")
        self.assertEqual(xlk["name"], "Tecnologia")
        self.assertEqual(xlk["perf_w"], 0.25)
        self.assertEqual(xlk["perf_1m"], -0.95)
        self.assertEqual(xlk["rsi"], 55.10)
        self.assertEqual(xlk["trend_sma50"], "BULLISH")
        self.assertEqual(xlk["trend_sma200"], "BULLISH")

    @patch("services.etf_service.scanner_scan")
    def test_fetch_sector_etf_thermometer_error_handling(self, mock_scan):
        """Verifica que ante una excepcion de red el servicio maneje el error limpiamente."""
        mock_scan.side_effect = Exception("API Unavailable")
        fn = getattr(fetch_sector_etf_thermometer, "__wrapped__", fetch_sector_etf_thermometer)
        result = fn()
        self.assertEqual(result, [])

if __name__ == "__main__":
    unittest.main()
