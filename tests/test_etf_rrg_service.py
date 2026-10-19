"""Tests del servicio Relative Rotation Graph (RRG) vs SPY."""

import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from services.etf_rrg_service import (
    classify_rrg_quadrant,
    fetch_etf_rrg,
)


def _business_days(periods: int = 1400) -> pd.DatetimeIndex:
    return pd.bdate_range(end=pd.Timestamp("2026-10-16"), periods=periods)


def _yf_frame(prices: dict[str, np.ndarray], index: pd.DatetimeIndex) -> pd.DataFrame:
    """Simula la respuesta MultiIndex de yfinance con el bloque Close."""
    close = pd.DataFrame(prices, index=index)
    return pd.concat({"Close": close}, axis=1)


def _synthetic_frame(periods: int = 1400) -> pd.DataFrame:
    index = _business_days(periods)
    steps = np.arange(periods)
    prices = {
        "SPY": 100.0 * np.power(1.0002, steps),
        "XLK": 100.0 * np.power(1.0009, steps),
        "XLU": 100.0 * np.power(0.9998, steps),
        "XLF": 100.0 * np.power(1.0003, steps),
        "QQQ": 100.0 * np.power(1.0006, steps),
    }
    return _yf_frame(prices, index)


def _raw_fetch():
    return getattr(fetch_etf_rrg, "__wrapped__", fetch_etf_rrg)


class TestClassifyRrgQuadrant(unittest.TestCase):

    def test_quadrants(self):
        self.assertEqual(classify_rrg_quadrant(101.0, 101.0), "LEADING")
        self.assertEqual(classify_rrg_quadrant(99.0, 101.0), "WEAKENING")
        self.assertEqual(classify_rrg_quadrant(99.0, 99.0), "LAGGING")
        self.assertEqual(classify_rrg_quadrant(101.0, 99.0), "IMPROVING")

    def test_center_boundary_uses_upper_quadrants(self):
        self.assertEqual(classify_rrg_quadrant(100.0, 100.0), "LEADING")
        self.assertEqual(classify_rrg_quadrant(100.0, 99.0), "IMPROVING")


class TestFetchEtfRrg(unittest.TestCase):

    @patch("services.etf_rrg_service.yf.download")
    def test_computes_points_and_trails(self, mock_download):
        mock_download.return_value = _synthetic_frame()

        result = _raw_fetch()(universe="sectors", weeks=52, tail=8)

        self.assertEqual(result["benchmark"], "SPY")
        self.assertIsNone(result["error"])
        self.assertIsNotNone(result["as_of"])

        by_ticker = {point["ticker"]: point for point in result["points"]}
        self.assertEqual(set(by_ticker), {"XLK", "XLU", "XLF"})

        # Fuerza relativa creciente vs decreciente respecto a SPY
        self.assertGreater(by_ticker["XLK"]["x"], 100.0)
        self.assertLess(by_ticker["XLU"]["x"], 100.0)

        for point in result["points"]:
            self.assertEqual(len(point["trail"]), 8)
            self.assertIn(
                point["quadrant"],
                {"LEADING", "WEAKENING", "IMPROVING", "LAGGING"},
            )
            self.assertGreaterEqual(point["weeks_in_quadrant"], 1)
            self.assertLessEqual(point["weeks_in_quadrant"], 8)
            self.assertIsNotNone(point["rsi"])
            self.assertGreaterEqual(point["rsi"], 0.0)
            self.assertLessEqual(point["rsi"], 100.0)
            self.assertEqual(point["trail"][-1]["week"], result["as_of"])
            self.assertIsNotNone(point["rsi_spy"])

    @patch("services.etf_rrg_service.yf.download")
    def test_universe_all_includes_thematic(self, mock_download):
        mock_download.return_value = _synthetic_frame()

        sectors = _raw_fetch()(universe="sectors")
        all_universe = _raw_fetch()(universe="all")

        self.assertNotIn("QQQ", [point["ticker"] for point in sectors["points"]])
        self.assertIn("QQQ", [point["ticker"] for point in all_universe["points"]])

    @patch("services.etf_rrg_service.yf.download")
    def test_uses_last_completed_week(self, mock_download):
        frame = _synthetic_frame()
        monday = pd.Timestamp("2026-10-19")
        extra_row = frame.iloc[[-1]].copy()
        extra_row.index = [monday]
        mock_download.return_value = pd.concat([frame, extra_row])

        result = _raw_fetch()(universe="sectors", weeks=52, tail=8)

        self.assertIsNone(result["error"])
        self.assertEqual(result["as_of"], "2026-10-16")
        self.assertEqual(result["points"][0]["trail"][-1]["week"], "2026-10-16")

    @patch("services.etf_rrg_service.yf.download")
    def test_missing_benchmark_returns_empty(self, mock_download):
        frame = _synthetic_frame()
        mock_download.return_value = frame.drop(columns=[("Close", "SPY")])

        result = _raw_fetch()(universe="sectors")

        self.assertEqual(result["points"], [])
        self.assertIsNotNone(result["error"])
        self.assertIn("SPY", result["error"])

    @patch("services.etf_rrg_service.yf.download")
    def test_insufficient_history_returns_empty(self, mock_download):
        mock_download.return_value = _synthetic_frame(periods=120)

        result = _raw_fetch()(universe="sectors")

        self.assertEqual(result["points"], [])
        self.assertIsNotNone(result["error"])

    @patch("services.etf_rrg_service.yf.download")
    def test_download_failure_returns_empty(self, mock_download):
        mock_download.side_effect = Exception("network down")

        result = _raw_fetch()(universe="sectors")

        self.assertEqual(result["points"], [])
        self.assertIsNone(result["as_of"])
        self.assertIsNotNone(result["error"])


class TestEtfRrgEndpoint(unittest.TestCase):

    def setUp(self):
        from main import app

        self.client = TestClient(app)

    @patch("routers.cedears.fetch_etf_rrg")
    def test_endpoint_contract(self, mock_fetch):
        mock_fetch.return_value = {
            "benchmark": "SPY",
            "as_of": "2026-10-16",
            "weeks": 52,
            "tail": 8,
            "spy_rsi": 55.0,
            "points": [
                {
                    "ticker": "XLK",
                    "name": "Tecnologia",
                    "sector": "Information Technology",
                    "x": 102.5,
                    "y": 101.1,
                    "quadrant": "LEADING",
                    "quadrant_label": "Líder Sostenido",
                    "weeks_in_quadrant": 3,
                    "rsi": 60.0,
                    "rsi_spy": 55.0,
                    "trail": [{"week": "2026-10-16", "x": 102.5, "y": 101.1}],
                }
            ],
            "error": None,
        }

        response = self.client.get(
            "/api/cedears/etf_rrg?universe=sectors&weeks=52&tail=8"
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["benchmark"], "SPY")
        self.assertEqual(body["points"][0]["ticker"], "XLK")
        self.assertEqual(body["points"][0]["quadrant"], "LEADING")
        mock_fetch.assert_called_once_with(universe="sectors", weeks=52, tail=8)

    @patch("routers.cedears.fetch_etf_rrg")
    def test_endpoint_rejects_invalid_params(self, mock_fetch):
        response = self.client.get("/api/cedears/etf_rrg?weeks=10")

        self.assertEqual(response.status_code, 422)
        mock_fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
