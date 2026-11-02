#!/usr/bin/env python3
"""
Contrato de los endpoints que disparan los botones de refresco manual.

Complementa `tests/test_refresh_buttons_contract.py` (que verifica que el
botón llame al endpoint correcto) validando que el backend responda el shape
que consume la UI con **los mismos parámetros que envía el botón**.

No duplica lo ya cubierto por `tests/test_api_endpoints.py` (earnings,
performance, quotes y rebalance); se enfoca en los huecos:
  - `/api/cedears/etf_rotation_analysis` (solo estaba testeado a nivel servicio)
  - `/api/renta_fija/curve_json` con los filtros completos del botón
  - `/api/indices/history` con `normalized=true` (región global)
"""

import unittest
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

from main import app


class TestRefreshEndpointsContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_cedears_quotes_responde_el_shape_que_consume_el_refresco(self):
        """CedearsView refresca con `tickers=<watchlist>` y lee `quotes`."""
        payload = {
            "AAPL": {"adr_price": 200.0, "price": 15000.0, "rsi": 55.0},
            "GOOGL": {"adr_price": 180.0, "price": 12000.0, "rsi": 48.0},
        }
        with patch("routers.cedears.get_multiple_tickers_data", return_value=payload):
            response = self.client.get("/api/cedears/quotes_json?tickers=AAPL,GOOGL")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("quotes", body)
        self.assertEqual([quote["symbol"] for quote in body["quotes"]], ["AAPL", "GOOGL"])
        for quote in body["quotes"]:
            for field in ("symbol", "adr", "local", "rsi", "in_portfolio", "sector_id"):
                self.assertIn(field, quote, f"Falta {field} en el contrato de quotes")

    @patch("routers.fixed_income.fetch_lecaps")
    def test_renta_fija_responde_los_filtros_del_boton_en_ambos_alias(self, mock_lecaps):
        """FixedIncomeView envía category + ley + tipo_inst; la card solo category."""
        mock_lecaps.return_value = pd.DataFrame(
            [
                {
                    "ticker": "S30O6",
                    "tipo": "LECAP",
                    "tea": 45.0,
                    "md": 0.5,
                    "precio": 100.0,
                    "monto": 10_000_000.0,
                },
                {
                    "ticker": "T31Y7",
                    "tipo": "BONCAP",
                    "tea": 38.0,
                    "md": 1.1,
                    "precio": 98.0,
                    "monto": 5_000_000.0,
                },
            ]
        )

        queries = (
            "category=lecap&ley=Ambas&tipo_inst=Todos",
            "category=lecap&tipo_inst=Todos",
        )
        for query in queries:
            con_alias = self.client.get(f"/api/renta_fija/curve_json?{query}")
            sin_alias = self.client.get(f"/api/fixed_income/curve_json?{query}")
            self.assertEqual(con_alias.status_code, 200, query)
            self.assertEqual(sin_alias.status_code, 200, query)

            for response in (con_alias, sin_alias):
                body = response.json()
                self.assertNotIn("error", body, f"El endpoint devolvió error: {body.get('error')}")
                self.assertIn("table_data", body)
                self.assertIn("scatter_points", body)
                self.assertIn("curve_line", body)
                self.assertEqual(len(body["table_data"]), 2)

        ley_filtered = self.client.get("/api/renta_fija/curve_json?category=lecap&tipo_inst=BONCAP")
        self.assertEqual(ley_filtered.status_code, 200)
        self.assertEqual([row["ticker"] for row in ley_filtered.json()["table_data"]], ["T31Y7"])

    @patch("routers.cedears.fetch_etf_rotation_analysis")
    def test_etf_rotation_analysis_responde_al_refresco(self, mock_analysis):
        """EtfRotationView refresca con `universe=all` y lee items/benchmark."""
        mock_analysis.return_value = {
            "benchmark": {"ticker": "SPY", "close": 500.0, "perf_w": 1.2, "change_d": 0.3},
            "items": [
                {
                    "ticker": "XLK",
                    "name": "Technology",
                    "sector": "Tecnología",
                    "close": 200.0,
                    "change_d": 0.5,
                    "perf_w": 2.0,
                    "diff_vs_spy_w": 0.8,
                    "rsi": 61.0,
                    "trend_sma50": "BULLISH",
                    "volume": 1_000_000,
                }
            ],
            "breadth_w": 60.0,
            "breadth_1m": 55.0,
            "spread_extremos": 3.1,
        }

        response = self.client.get("/api/cedears/etf_rotation_analysis?universe=all")

        self.assertEqual(response.status_code, 200)
        mock_analysis.assert_called_once_with(universe="all")
        body = response.json()
        self.assertIn("benchmark", body)
        self.assertEqual([item["ticker"] for item in body["items"]], ["XLK"])

    def test_indices_history_acepta_la_normalizacion_que_envia_el_refresco(self):
        """MarketIndicesView envía normalized=true cuando el toggle está activo."""
        response = self.client.get(
            "/api/indices/history?region=global&period=max&currency=usd&normalized=true"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("dates", body)
        self.assertIn("series", body)
        self.assertIn("summary_metrics", body)
        self.assertGreater(len(body["dates"]), 0, "El histórico versionado no debería estar vacío")
        self.assertTrue(body.get("normalized") is True, "El backend debe ecoar normalized=True")

        cycles = self.client.get("/api/indices/cycles?region=arg")
        self.assertEqual(cycles.status_code, 200)
        self.assertIn("mandates", cycles.json())


if __name__ == "__main__":
    unittest.main()
