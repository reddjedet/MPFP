import unittest
from datetime import date
from services.earnings_service import (
    load_earnings_calendar,
    calculate_earnings_status,
    get_all_earnings_summary,
    save_confirmed_earnings_date,
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
        
    def test_calendar_loads_27_companies(self):
        self.assertEqual(len(self.calendar), 27)
        self.assertIn("NVDA", self.calendar)
        self.assertIn("DE", self.calendar)
        self.assertIn("MSFT", self.calendar)
        self.assertIn("GOOGL", self.calendar)
        self.assertIn("COST", self.calendar)
        
    def test_earnings_status_august(self):
        # Mes de prueba: 8 (Agosto)
        curr_m = 8
        
        def _clean_item(tk):
            d = dict(self.calendar[tk])
            d.pop("confirmed_date", None)
            return d
        
        # DE reporta en Agosto -> pronto reporte
        de_status = calculate_earnings_status("DE", _clean_item("DE"), curr_m)
        self.assertEqual(de_status["months_diff"], 0)
        self.assertTrue(de_status["is_active"])
        self.assertEqual(de_status["status_tier"], "current_month")
        self.assertEqual(de_status["status_text"], "pronto reporte")
        
        # NVDA reporta en Agosto -> pronto reporte
        nvda_status = calculate_earnings_status("NVDA", _clean_item("NVDA"), curr_m)
        self.assertEqual(nvda_status["months_diff"], 0)
        self.assertTrue(nvda_status["is_active"])
        self.assertEqual(nvda_status["status_tier"], "current_month")
        self.assertEqual(nvda_status["status_text"], "pronto reporte")

        # COST reporta en Septiembre (mes 9) -> reporta @septiembre
        cost_status = calculate_earnings_status("COST", _clean_item("COST"), curr_m)
        self.assertEqual(cost_status["months_diff"], 1)
        self.assertTrue(cost_status["is_active"])
        self.assertEqual(cost_status["status_tier"], "next_month")
        self.assertEqual(cost_status["status_text"], "reporta @septiembre")

        # MSFT reporta en Octubre (mes 10) -> en 2 meses (no activo)
        msft_status = calculate_earnings_status("MSFT", _clean_item("MSFT"), curr_m)
        self.assertEqual(msft_status["months_diff"], 2)
        self.assertFalse(msft_status["is_active"])
        self.assertEqual(msft_status["status_tier"], "later")
        self.assertEqual(msft_status["status_text"], "en 2 meses (octubre)")

    def test_ticker_badge_lookup_discreet(self):
        curr_m = 8
        
        # Test con item limpio sin fecha confirmada
        raw_nvda = dict(self.calendar["NVDA"])
        raw_nvda.pop("confirmed_date", None)
        status_nvda = calculate_earnings_status("NVDA", raw_nvda, curr_m)
        self.assertEqual(status_nvda["badge_class"], "pill-imminent")
        
        raw_cost = dict(self.calendar["COST"])
        raw_cost.pop("confirmed_date", None)
        status_cost = calculate_earnings_status("COST", raw_cost, curr_m)
        self.assertEqual(status_cost["badge_class"], "pill-soon")

    def test_save_and_calculate_confirmed_date(self):

        # Asignar fecha certera próxima para NVDA: 28 de Agosto de 2026 (a 13 días -> Evento relevante)
        save_confirmed_earnings_date("NVDA", "2026-08-28")
        ref_today = date(2026, 8, 15)
        
        status = calculate_earnings_status("NVDA", load_earnings_calendar()["NVDA"], current_month=8, ref_date=ref_today)
        self.assertEqual(status["confirmed_date"], "2026-08-28")
        self.assertEqual(status["delta_days"], 13)
        self.assertEqual(status["status_tier"], "current_month")
        self.assertEqual(status["status_text"], "⚡ reporta en 13d (28/08)")
        self.assertEqual(status["badge_class"], "pill-imminent pill-event")
        self.assertTrue(status["is_active"])

        # Asignar fecha para COST en Septiembre: 24 de Septiembre de 2026 (>= 14 días -> 'reporta DD/MM')
        save_confirmed_earnings_date("COST", "2026-09-24")
        cost_status = calculate_earnings_status("COST", load_earnings_calendar()["COST"], current_month=8, ref_date=ref_today)
        self.assertEqual(cost_status["status_tier"], "next_month")
        self.assertEqual(cost_status["confirmed_date"], "2026-09-24")
        self.assertEqual(cost_status["status_text"], "reporta 24/09")

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
        summary = get_all_earnings_summary(current_month=8, ref_date=ref_today)
        tickers_ordered = [x["ticker"] for x in summary]
        self.assertEqual(tickers_ordered[0], "NVDA")
        self.assertEqual(tickers_ordered[-1], "DE")

if __name__ == "__main__":
    unittest.main()
