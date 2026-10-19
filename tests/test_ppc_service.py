import unittest

from services.ppc_service import (
    evaluate_ppc_return,
    parse_price_input,
)


class TestPpcService(unittest.TestCase):

    def test_parse_price_input(self):
        self.assertEqual(parse_price_input("29.959,90"), 29959.90)
        self.assertEqual(parse_price_input("15971.31"), 15971.31)
        self.assertEqual(parse_price_input(1000.5), 1000.50)
        self.assertIsNone(parse_price_input(""))
        self.assertIsNone(parse_price_input("-"))
        self.assertIsNone(parse_price_input("invalid"))

    def test_no_global_store_api(self):
        """El PPC dejó de ser global: ppc_service ya no expone un store."""
        import services.ppc_service as ppc_service

        for forbidden in ("_db", "load_ppc_values", "get_ppc_value", "save_ppc_value", "save_bulk_ppc_values"):
            self.assertFalse(hasattr(ppc_service, forbidden), f"ppc_service no debe exponer {forbidden}")

    def test_ppc_solo_vive_en_la_tenencia_por_cartera(self):
        """No debe existir archivo/store global de PPC: el dato vive en user_holdings."""
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        self.assertFalse(
            (root / "data" / "ppc_values.json").exists(),
            "data/ppc_values.json ya no debe existir; el PPC vive en la tenencia de cada cartera",
        )

        offenders = []
        for base in (root / "services", root / "routers"):
            for path in base.rglob("*.py"):
                text = path.read_text(encoding="utf-8")
                if 'SQLiteTableStore("ppc_values"' in text or "SQLiteTableStore('ppc_values'" in text:
                    offenders.append(str(path.relative_to(root)))
        self.assertEqual(offenders, [])

    def test_ningun_modulo_importa_el_store_global(self):
        """Ningún módulo de services/ ni routers/ referencia el store global de PPC."""
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        forbidden = ("load_ppc_values", "get_ppc_value", "save_ppc_value", "save_bulk_ppc_values")
        offenders = []
        for base in (root / "services", root / "routers"):
            for path in base.rglob("*.py"):
                text = path.read_text(encoding="utf-8")
                if any(name in text for name in forbidden):
                    offenders.append(str(path.relative_to(root)))
        self.assertEqual(offenders, [])

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

    def test_evaluate_ppc_return_sin_ppc_es_none(self):
        """Función pura: sin PPC explícito no hay cálculo (nunca busca un valor global)."""
        self.assertIsNone(evaluate_ppc_return("GOOGL", current_price_ars=13000.0))
        self.assertIsNone(evaluate_ppc_return("GOOGL", current_price_ars=13000.0, ppc_val=0))
        self.assertIsNone(evaluate_ppc_return("GOOGL", current_price_ars=None, ppc_val=7619.66))


if __name__ == "__main__":
    unittest.main()
