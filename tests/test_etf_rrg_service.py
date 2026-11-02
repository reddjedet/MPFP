"""Tests del servicio Relative Rotation Graph (RRG) vs SPY."""

import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from services.etf_rrg_service import (
    QUADRANT_LABELS,
    _last_complete_week_label,
    _quadrant_streak,
    _rrg_axes,
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
        "CIBR": 100.0 * np.power(1.0005, steps),
    }
    return _yf_frame(prices, index)


def _raw_fetch():
    return getattr(fetch_etf_rrg, "__wrapped__", fetch_etf_rrg)


class TestClassifyRrgQuadrant(unittest.TestCase):

    def test_quadrants(self):
        # Arriba-derecha: fuerte y acelerando.
        self.assertEqual(classify_rrg_quadrant(101.0, 101.0), "LEADING")
        # Arriba-izquierda: débil pero acelerando (rotación entrante).
        self.assertEqual(classify_rrg_quadrant(99.0, 101.0), "IMPROVING")
        # Abajo-izquierda: débil y desacelerando.
        self.assertEqual(classify_rrg_quadrant(99.0, 99.0), "LAGGING")
        # Abajo-derecha: fuerte pero desacelerando (se enfría).
        self.assertEqual(classify_rrg_quadrant(101.0, 99.0), "WEAKENING")

    def test_center_boundary_uses_upper_quadrants(self):
        self.assertEqual(classify_rrg_quadrant(100.0, 100.0), "LEADING")
        self.assertEqual(classify_rrg_quadrant(100.0, 99.0), "WEAKENING")
        self.assertEqual(classify_rrg_quadrant(99.0, 100.0), "IMPROVING")

    def test_labels_match_quadrant_semantics(self):
        # Un swap de Improving/Weakening debe romper este test, no solo la clasificación.
        self.assertEqual(QUADRANT_LABELS["LEADING"], "Líder Sostenido")
        self.assertEqual(QUADRANT_LABELS["WEAKENING"], "Enfriándose")
        self.assertEqual(QUADRANT_LABELS["IMPROVING"], "Rotación Entrante")
        self.assertEqual(QUADRANT_LABELS["LAGGING"], "Rezagado")


class TestWeekClosure(unittest.TestCase):

    def test_monday_keeps_last_friday(self):
        self.assertEqual(
            _last_complete_week_label(pd.Timestamp("2026-10-19")),
            pd.Timestamp("2026-10-16"),
        )

    def test_friday_drops_the_current_week(self):
        # El viernes todavía puede ser una rueda en curso: no se considera cerrada.
        self.assertEqual(
            _last_complete_week_label(pd.Timestamp("2026-10-16")),
            pd.Timestamp("2026-10-09"),
        )

    def test_weekend_keeps_the_week_that_just_closed(self):
        for day in ("2026-10-17", "2026-10-18"):
            self.assertEqual(
                _last_complete_week_label(pd.Timestamp(day)),
                pd.Timestamp("2026-10-16"),
            )


class TestRrgAxes(unittest.TestCase):

    def test_momentum_is_symmetric_for_mirrored_series(self):
        """El mismo Δ de fuerza debe pesar igual en un sector fuerte y en uno débil."""
        index = pd.bdate_range(end=pd.Timestamp("2026-10-16"), periods=420)
        steps = np.arange(len(index))
        signal = np.sin(steps / 9.0) * 0.25 + steps * 0.0002
        base = 2.0

        left = _rrg_axes(pd.Series(base + signal, index=index), 52)
        right = _rrg_axes(pd.Series(base - signal, index=index), 52)

        common = left.index.intersection(right.index)
        self.assertGreater(len(common), 20)
        np.testing.assert_allclose(
            left.loc[common, "y"] - 100.0,
            -(right.loc[common, "y"] - 100.0),
            atol=1e-6,
        )

    def test_axes_stay_within_the_visible_scale(self):
        index = pd.bdate_range(end=pd.Timestamp("2026-10-16"), periods=420)
        steps = np.arange(len(index))
        # Un shock extremo no debe romper la escala visible 70–130.
        series = pd.Series(
            np.exp((np.sin(steps / 5.0) * 0.8) + steps * 0.001), index=index
        )

        frame = _rrg_axes(series, 52)

        self.assertFalse(frame.empty)
        self.assertGreaterEqual(float(frame["x"].min()), 70.0)
        self.assertLessEqual(float(frame["x"].max()), 130.0)
        self.assertGreaterEqual(float(frame["y"].min()), 70.0)
        self.assertLessEqual(float(frame["y"].max()), 130.0)


class TestQuadrantStreak(unittest.TestCase):

    def test_counts_the_full_series_not_only_the_tail(self):
        index = pd.bdate_range(end=pd.Timestamp("2026-10-16"), periods=20)
        xs = pd.Series([105.0] * 20, index=index)
        ys = pd.Series([105.0] * 20, index=index)

        quadrant, weeks, since = _quadrant_streak(xs, ys)

        self.assertEqual(quadrant, "LEADING")
        self.assertEqual(weeks, 20)
        self.assertEqual(since, index[0])

    def test_stops_at_the_last_quadrant_change(self):
        index = pd.bdate_range(end=pd.Timestamp("2026-10-16"), periods=10)
        xs = pd.Series([105.0] * 5 + [95.0] * 5, index=index)
        ys = pd.Series([95.0] * 10, index=index)

        quadrant, weeks, since = _quadrant_streak(xs, ys)

        self.assertEqual(quadrant, "LAGGING")
        self.assertEqual(weeks, 5)
        self.assertEqual(since, index[5])


class TestFetchEtfRrg(unittest.TestCase):

    def setUp(self):
        patcher = patch(
            "services.etf_rrg_service._reference_date",
            return_value=pd.Timestamp("2026-10-19"),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

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
            # La racha se mide sobre toda la serie: puede superar la cola.
            self.assertIn("quadrant_since", point)
            self.assertLessEqual(point["quadrant_since"], result["as_of"])
            self.assertGreaterEqual(point["x"], 70.0)
            self.assertLessEqual(point["x"], 130.0)
            self.assertGreaterEqual(point["y"], 70.0)
            self.assertLessEqual(point["y"], 130.0)
            self.assertIsNotNone(point["rsi"])
            self.assertGreaterEqual(point["rsi"], 0.0)
            self.assertLessEqual(point["rsi"], 100.0)
            self.assertEqual(point["trail"][-1]["week"], result["as_of"])
            self.assertIsNotNone(point["rsi_spy"])

        self.assertEqual(result["method"]["window_weeks"], 52)
        self.assertEqual(result["method"]["scale"], "100+10z")
        self.assertTrue(result["method"]["complete_weeks_only"])
        # Los tickers sin datos en el frame sintético se reportan, no se pierden.
        self.assertEqual(
            {entry["ticker"] for entry in result["skipped"]},
            {"XLV", "XLY", "XLC", "XLI", "XLP", "XLE", "XLRE", "XLB"},
        )

    @patch("services.etf_rrg_service.yf.download")
    def test_quadrant_streak_can_exceed_the_visible_tail(self, mock_download):
        mock_download.return_value = _synthetic_frame()

        result = _raw_fetch()(universe="sectors", weeks=52, tail=8)

        self.assertTrue(
            any(
                point["weeks_in_quadrant"] > result["tail"]
                for point in result["points"]
            ),
            "La racha debe poder superar la cola visible",
        )

    @patch("services.etf_rrg_service.yf.download")
    def test_friday_is_not_treated_as_a_closed_week(self, mock_download):
        mock_download.return_value = _synthetic_frame()

        with patch(
            "services.etf_rrg_service._reference_date",
            return_value=pd.Timestamp("2026-10-16"),
        ):
            result = _raw_fetch()(universe="sectors", weeks=52, tail=8)

        self.assertIsNone(result["error"])
        self.assertEqual(result["as_of"], "2026-10-09")

    @patch("services.etf_rrg_service.yf.download")
    def test_weekend_uses_the_week_that_just_closed(self, mock_download):
        mock_download.return_value = _synthetic_frame()

        with patch(
            "services.etf_rrg_service._reference_date",
            return_value=pd.Timestamp("2026-10-18"),
        ):
            result = _raw_fetch()(universe="sectors", weeks=52, tail=8)

        self.assertIsNone(result["error"])
        self.assertEqual(result["as_of"], "2026-10-16")

    @patch("services.etf_rrg_service.yf.download")
    def test_universe_all_includes_thematic(self, mock_download):
        mock_download.return_value = _synthetic_frame()

        sectors = _raw_fetch()(universe="sectors")
        all_universe = _raw_fetch()(universe="all")

        sector_tickers = [point["ticker"] for point in sectors["points"]]
        all_tickers = [point["ticker"] for point in all_universe["points"]]

        self.assertNotIn("QQQ", sector_tickers)
        self.assertIn("QQQ", all_tickers)
        self.assertNotIn("CIBR", sector_tickers)
        self.assertIn("CIBR", all_tickers)

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
