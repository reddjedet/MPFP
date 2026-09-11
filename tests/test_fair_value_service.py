import unittest
from services.fair_value_service import (
    save_fair_value,
    get_fair_value,
    load_fair_values,
    save_bulk_fair_values,
    is_emerging_market,
    evaluate_fair_value_signal,
    _db
)

import tempfile
from pathlib import Path

class TestFairValueService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        initial_data = dict(load_fair_values())
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls._orig_path = _db.file_path
        _db.file_path = Path(cls._tmp_dir.name) / "fair_values.json"
        _db._cache = None
        _db._cache_valid = False
        _db.save(initial_data)

    @classmethod
    def tearDownClass(cls):
        _db.file_path = cls._orig_path
        _db._cache = None
        _db._cache_valid = False
        cls._tmp_dir.cleanup()

    def test_inactive_when_no_fair_value(self):
        # Si no se ingresa Fair Value, debe retornar None
        sig = evaluate_fair_value_signal("FAKE_TICKER_NONE", 180.0)
        self.assertIsNone(sig)

    def test_us_market_opportunity_buy(self):
        # Activo EE.UU. con descuento del 15% (menor al 25%)
        save_fair_value("MSFT", 500.0)
        sig = evaluate_fair_value_signal("MSFT", 425.0) # Descuento = 15.0%
        self.assertIsNotNone(sig)
        self.assertEqual(sig["signal"], "buy")
        self.assertEqual(sig["badge_class"], "gf-pill-buy")
        self.assertIn("Subval.", sig["badge_text"])
        self.assertFalse(sig["is_emerging"])

    def test_us_market_urgent_buy_threshold_25(self):
        # Activo EE.UU. con descuento >= 25%
        save_fair_value("NVDA", 180.0)
        sig = evaluate_fair_value_signal("NVDA", 128.0) # Descuento = 28.89% >= 25%
        self.assertIsNotNone(sig)
        self.assertEqual(sig["signal"], "urgent_buy")
        self.assertEqual(sig["badge_class"], "gf-pill-urgent")
        self.assertIn("Subval.", sig["badge_text"])

    def test_emerging_market_classification(self):
        self.assertTrue(is_emerging_market("MELI"))
        self.assertTrue(is_emerging_market("VIST"))
        self.assertTrue(is_emerging_market("PAM"))
        self.assertTrue(is_emerging_market("NU"))
        self.assertTrue(is_emerging_market("TSM"))
        self.assertFalse(is_emerging_market("GOOGL"))
        self.assertFalse(is_emerging_market("COST"))

    def test_emerging_market_urgent_buy_threshold_35(self):
        # Para Emergentes, 28% no es urgente (requiere >= 35%)
        save_fair_value("VIST", 100.0)
        sig_standard = evaluate_fair_value_signal("VIST", 72.0) # Descuento 28% (< 35%)
        self.assertIsNotNone(sig_standard)
        self.assertEqual(sig_standard["signal"], "buy")
        self.assertEqual(sig_standard["badge_class"], "gf-pill-buy")

        # Con descuento >= 35%, se vuelve urgente
        sig_urgent = evaluate_fair_value_signal("VIST", 60.0) # Descuento 40% (>= 35%)
        self.assertIsNotNone(sig_urgent)
        self.assertEqual(sig_urgent["signal"], "urgent_buy")
        self.assertEqual(sig_urgent["badge_class"], "gf-pill-urgent")

    def test_persistence_save_and_bulk_save(self):
        save_bulk_fair_values({
            "COST": 950.0,
            "LLY": 1000.0,
            "DE": 450.0
        })
        self.assertEqual(get_fair_value("COST"), 950.0)
        self.assertEqual(get_fair_value("LLY"), 1000.0)
        self.assertEqual(get_fair_value("DE"), 450.0)

if __name__ == "__main__":
    unittest.main()
