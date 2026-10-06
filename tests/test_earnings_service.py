import unittest
from datetime import date
from unittest.mock import patch
from services.earnings_service import (
    load_earnings_calendar,
    calculate_earnings_status,
    get_all_earnings_summary,
    save_confirmed_earnings_date,
    get_ticker_earnings_badge,
    _db
)

import tempfile
from pathlib import Path

class TestEarningsService(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Aislar completamente la base de datos real del usuario mediante archivo temporal
        initial_data = dict(load_earnings_calendar())
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls._orig_path = _db.file_path
        _db.file_path = Path(cls._tmp_dir.name) / "earnings.json"
        _db._cache = None
        _db._cache_valid = False
        _db.save(initial_data)
        
    @classmethod
    def tearDownClass(cls):
        # Restaurar fielmente la ruta original y limpiar archivo temporal
        _db.file_path = cls._orig_path
        _db._cache = None
        _db._cache_valid = False
        cls._tmp_dir.cleanup()
        
    def setUp(self):
        self.calendar = load_earnings_calendar()
        
    def test_calendar_loads_existing_user_dates(self):
        self.assertIn("NVDA", self.calendar)
        self.assertIn("DE", self.calendar)
        self.assertIn("MSFT", self.calendar)
        self.assertIn("GOOGL", self.calendar)
        self.assertIn("COST", self.calendar)

    def test_unconfirmed_status_ignores_legacy_historical_months(self):
        item = {
            "company": "Empresa de prueba",
            "report_months": [8, 11],
            "typical_window": "Finales de Agosto",
        }
        status = calculate_earnings_status(
            "TEST", item, current_month=8, ref_date=date(2026, 8, 15)
        )

        self.assertEqual(status["status_tier"], "unconfirmed")
        self.assertEqual(status["status_text"], "Sin fecha confirmada")
        self.assertIsNone(status["delta_days"])
        self.assertFalse(status["is_active"])
        self.assertNotIn("report_months", status)
        self.assertNotIn("typical_window", status)

    def test_earnings_badge_requires_confirmed_date(self):
        historical_only = {"report_months": [8], "typical_window": "Agosto"}
        self.assertIsNone(
            get_ticker_earnings_badge(
                "NVDA", ref_date=date(2026, 8, 15), cal={"NVDA": historical_only}
            )
        )

        confirmed = {"confirmed_date": "2026-08-28"}
        badge = get_ticker_earnings_badge(
            "NVDA", ref_date=date(2026, 8, 15), cal={"NVDA": confirmed}
        )
        self.assertIsNotNone(badge)
        self.assertEqual(badge["badge_text"], "⚡ reporta 28/08")

    def test_confirmed_date_in_next_month_keeps_calendar_month_filter(self):
        status = calculate_earnings_status(
            "TEST",
            {"confirmed_date": "2026-09-02"},
            ref_date=date(2026, 8, 25),
        )
        self.assertEqual(status["status_tier"], "next_month")
        self.assertEqual(status["delta_days"], 8)

    def test_summary_uses_union_of_cedears_and_portfolio_tickers(self):
        with (
            patch("services.cedear_service.load_cedear_ratios", return_value={"NEW": 1}),
            patch("services.portfolio_service.get_all_portfolio_tickers", return_value=["PORT"]),
        ):
            summary = get_all_earnings_summary(ref_date=date(2026, 8, 15))

        self.assertEqual({item["ticker"] for item in summary}, {"NEW", "PORT"})
        self.assertTrue(all(item["status_tier"] == "unconfirmed" for item in summary))
        in_portfolio = {item["ticker"]: item["in_portfolio"] for item in summary}
        self.assertTrue(in_portfolio["PORT"])
        self.assertFalse(in_portfolio["NEW"])

    def test_save_date_for_eligible_ticker_and_clear_it(self):
        with (
            patch("services.cedear_service.load_cedear_ratios", return_value={"NEW": 1}),
            patch("services.portfolio_service.get_all_portfolio_tickers", return_value=["PORT"]),
        ):
            self.assertTrue(save_confirmed_earnings_date("PORT", "2026-09-01"))
            self.assertEqual(load_earnings_calendar()["PORT"]["confirmed_date"], "2026-09-01")
            self.assertTrue(save_confirmed_earnings_date("PORT", None))
            self.assertNotIn("confirmed_date", load_earnings_calendar()["PORT"])
            self.assertFalse(save_confirmed_earnings_date("UNKNOWN", "2026-09-01"))

    def test_save_and_calculate_confirmed_date(self):

        # Asignar fecha certera próxima para NVDA: 28 de Agosto de 2026 (a 13 días -> Evento relevante)
        save_confirmed_earnings_date("NVDA", "2026-08-28")
        ref_today = date(2026, 8, 15)
        
        status = calculate_earnings_status("NVDA", load_earnings_calendar()["NVDA"], current_month=8, ref_date=ref_today)
        self.assertEqual(status["confirmed_date"], "2026-08-28")
        self.assertEqual(status["delta_days"], 13)
        self.assertEqual(status["status_tier"], "current_month")
        self.assertEqual(status["status_text"], "reporta en 13d (28/08)")
        self.assertEqual(status["badge_class"], "pill-imminent pill-event")
        self.assertTrue(status["is_active"])

        # Asignar fecha para COST en Septiembre: 24 de Septiembre de 2026 (>= 14 días -> 'reporta DD/MM')
        save_confirmed_earnings_date("COST", "2026-09-24")
        cost_status = calculate_earnings_status("COST", load_earnings_calendar()["COST"], current_month=8, ref_date=ref_today)
        self.assertEqual(cost_status["status_tier"], "next_month")
        self.assertEqual(cost_status["confirmed_date"], "2026-09-24")
        self.assertEqual(cost_status["status_text"], "reporta el 24/09/2026")

    def test_confirmed_date_today_and_past(self):
        ref_today = date(2026, 8, 19)
        
        # Caso 1: Reporta HOY (19/08/2026)
        save_confirmed_earnings_date("NVDA", "2026-08-19")
        status_today = calculate_earnings_status("NVDA", load_earnings_calendar()["NVDA"], current_month=8, ref_date=ref_today)
        self.assertEqual(status_today["delta_days"], 0)
        self.assertIn("HOY", status_today["status_text"])
        self.assertEqual(status_today["status_tier"], "current_month")
        
        # Caso 2: Reportó en el pasado (15/08/2026 -> hace 4 días)
        save_confirmed_earnings_date("DE", "2026-08-15")
        status_past = calculate_earnings_status("DE", load_earnings_calendar()["DE"], current_month=8, ref_date=ref_today)
        self.assertEqual(status_past["delta_days"], -4)
        self.assertEqual(status_past["status_tier"], "past")
        self.assertIn("reportó", status_past["status_text"])
        self.assertFalse(status_past["is_active"])

        # Verificar ordenamiento: NVDA (hoy) al principio, DE (pasado) al final
        with patch(
            "services.earnings_service.load_earnings_calendar",
            return_value={
                "NVDA": {"confirmed_date": "2026-08-19"},
                "DE": {"confirmed_date": "2026-08-15"},
            },
        ):
            summary = get_all_earnings_summary(current_month=8, ref_date=ref_today)
        tickers_ordered = [x["ticker"] for x in summary]
        self.assertEqual(tickers_ordered[0], "NVDA")
        self.assertEqual(tickers_ordered[-1], "DE")

if __name__ == "__main__":
    unittest.main()
