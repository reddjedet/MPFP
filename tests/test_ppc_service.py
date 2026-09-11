import unittest
import tempfile
from pathlib import Path

from services.ppc_service import (
    load_ppc_values,
    get_ppc_value,
    save_ppc_value,
    save_bulk_ppc_values,
    evaluate_ppc_return,
    parse_price_input,
    _db
)

class TestPpcService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        initial_data = dict(_db.load() if isinstance(_db.load(), dict) else {})
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls._orig_path = _db.file_path
        _db.file_path = Path(cls._tmp_dir.name) / "ppc_values.json"
        _db._cache = None
        _db._cache_valid = False
        _db.save(initial_data)

    @classmethod
    def tearDownClass(cls):
        _db.file_path = cls._orig_path
        _db._cache = None
        _db._cache_valid = False
        cls._tmp_dir.cleanup()

    def test_parse_price_input(self):

        self.assertEqual(parse_price_input("29.959,90"), 29959.90)
        self.assertEqual(parse_price_input("15971.31"), 15971.31)
        self.assertEqual(parse_price_input(1000.5), 1000.50)
        self.assertIsNone(parse_price_input(""))
        self.assertIsNone(parse_price_input("-"))
        self.assertIsNone(parse_price_input("invalid"))

    def test_evaluate_ppc_return_surge_and_discount(self):
        # Suba de +70% -> Take Profit
        surge = evaluate_ppc_return("GOOGL", current_price_ars=13000.0, ppc_val=7619.66)
        self.assertIsNotNone(surge)
        self.assertTrue(surge["is_take_profit"])
        self.assertFalse(surge["is_attention"])
        self.assertGreater(surge["return_pct"], 35.0)
        self.assertIn("🚀", surge["badge_text"])

        # Suba de +25% -> Zona de Atención
        att = evaluate_ppc_return("AAPL", current_price_ars=12500.0, ppc_val=10000.0)
        self.assertIsNotNone(att)
        self.assertFalse(att["is_take_profit"])
        self.assertTrue(att["is_attention"])
        self.assertEqual(att["return_pct"], 25.0)
        self.assertIn("⚠️", att["badge_text"])
        self.assertEqual(att["status"], "En Zona de Atención")

        # Suba normal de +10%
        pos = evaluate_ppc_return("COST", current_price_ars=33000.0, ppc_val=30000.0)
        self.assertIsNotNone(pos)
        self.assertFalse(pos["is_take_profit"])
        self.assertFalse(pos["is_attention"])
        self.assertEqual(pos["return_pct"], 10.0)

        # En descuento de -5%
        neg = evaluate_ppc_return("DE", current_price_ars=19000.0, ppc_val=20000.0)
        self.assertIsNotNone(neg)
        self.assertEqual(neg["return_pct"], -5.0)

    def test_ppc_persistence(self):
        save_ppc_value("TESTTK", "12.345,67")
        val = get_ppc_value("TESTTK")
        self.assertEqual(val, 12345.67)
        
        # Limpieza
        save_ppc_value("TESTTK", "")
        self.assertIsNone(get_ppc_value("TESTTK"))

if __name__ == "__main__":
    unittest.main()
