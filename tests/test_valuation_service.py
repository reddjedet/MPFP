import unittest
from services.valuation_service import (
    load_valuation_database,
    get_sectors_and_tickers,
    get_profile_by_ticker,
    evaluate_valuation,
    load_user_valuation_inputs,
    get_user_valuation_inputs,
    _user_inputs_db
)

import tempfile
from pathlib import Path

class TestValuationService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        initial_data = dict(load_user_valuation_inputs())
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls._orig_path = _user_inputs_db.file_path
        _user_inputs_db.file_path = Path(cls._tmp_dir.name) / "user_valuation.json"
        _user_inputs_db._cache = None
        _user_inputs_db._cache_valid = False
        _user_inputs_db.save(initial_data)

    @classmethod
    def tearDownClass(cls):
        _user_inputs_db.file_path = cls._orig_path
        _user_inputs_db._cache = None
        _user_inputs_db._cache_valid = False
        cls._tmp_dir.cleanup()

    def setUp(self):
        self.db = load_valuation_database()

    def test_database_structure(self):
        sectors = self.db.get("sectors", [])
        profiles = self.db.get("profiles", {})
        self.assertGreaterEqual(len(sectors), 8)
        self.assertIn("NVDA", profiles)
        self.assertIn("JPM", profiles)
        self.assertIn("BRK.B", profiles)
        self.assertIn("VIST", profiles)
        self.assertIn("MSTR", profiles)

    def test_get_sectors_and_tickers(self):
        sec_list = get_sectors_and_tickers()
        self.assertEqual(len(sec_list), 8)
        tech_sec = next(s for s in sec_list if s["id"] == "tech")
        tickers = [i["ticker"] for i in tech_sec["companies"]]
        self.assertIn("GOOGL", tickers)
        self.assertIn("MSFT", tickers)

    def test_evaluate_standard_fcf_green_flag(self):
        metrics = {
            "price": 85.0,
            "fcf_per_share": 4.50, # Fair Value = 4.50 * 26 = 117.0, Buy Below = 87.75
            "roic": 55.0,
            "wacc": 10.0,          # Spread = +45% (Green)
            "net_debt_ebitda": -0.6, # Net Cash (Green)
            "shares_cagr": -1.2,   # Recompras (Green)
            "sbc_ocf": 8.0         # SBC < 10% (Green)
        }
        res = evaluate_valuation("NVDA", metrics)
        self.assertEqual(res["verdict"], "GREEN FLAG")
        self.assertEqual(res["summary_counts"]["green"], 5)
        self.assertEqual(res["summary_counts"]["red"], 0)
        self.assertAlmostEqual(res["fair_value"], 117.0, places=1)
        self.assertAlmostEqual(res["buy_below_price"], 87.75, places=1)

    def test_evaluate_banking_model_jpm(self):
        # Modelo Bancario para JPM (4 reglas operativas + 1 regla de margen de seguridad = 5 green)
        metrics = {
            "price": 160.0,
            "eps": 17.20,          # Fair Value = 17.20 * 13 = 223.6, Buy Below = 167.7
            "rotce": 19.5,         # RoTCE >= 17% (Green)
            "cet1_ratio": 15.2,    # CET1 >= 14.5% (Green)
            "nco_ratio": 0.45,     # NCO <= 0.50% (Green)
            "shares_cagr": -1.2    # Recompras (Green)
        }
        res = evaluate_valuation("JPM", metrics)
        self.assertEqual(res["verdict"], "GREEN FLAG")
        self.assertEqual(res["summary_counts"]["green"], 5)
        self.assertAlmostEqual(res["fair_value"], 223.6, places=1)

    def test_evaluate_energy_upstream_vist(self):
        # Modelo Petróleo y Gas para VIST (3 reglas operativas + 1 margen de seguridad = 4 green)
        metrics = {
            "price": 32.0,              # Precio con margen de seguridad >= 35% (Buy below = 35.91)
            "fcf_per_share": 8.5,       # Fair Value = 8.5 * 6.5 = 55.25
            "net_debt_ebitda_usd": 0.5, # Deuda <= 0.8x (Green)
            "lifting_cost": 4.2,        # Lifting Cost <= 5.0 USD (Green)
            "dollarized_revenue_pct": 90.0, # Ingresos dolarizados >= 80% (Green)
            "roic": 22.0,
            "wacc": 12.0,               # Spread >= 5% (Green)
            "shares_cagr": -1.0         # Recompras (Green)
        }
        res = evaluate_valuation("VIST", metrics)
        self.assertEqual(res["verdict"], "GREEN FLAG")
        self.assertEqual(res["summary_counts"]["green"], 4)

    def test_evaluate_financial_holding_brk(self):
        # Modelo Holding Financiero para BRK.B (2 reglas operativas + 1 margen de seguridad = 3 green)
        metrics = {
            "price": 350.0,             # Precio con margen de seguridad >= 20% (Buy below = 398.40)
            "operating_earnings_per_share": 24.0, # 24 * 17 = 408 + 90 = 498
            "excess_cash_per_share": 90.0,
            "float_cost": -0.8,         # Costo float <= 0% (Green)
            "shares_cagr": -1.5         # Recompras (Green)
        }
        res = evaluate_valuation("BRK.B", metrics)
        self.assertEqual(res["verdict"], "GREEN FLAG")
        self.assertEqual(res["summary_counts"]["green"], 3)
        self.assertAlmostEqual(res["fair_value"], 498.0, places=1)

    def test_evaluate_discarded_value_trap(self):
        # MSTR o Value Trap con deuda excesiva y dilución masiva
        metrics = {
            "price": 140.0,
            "fcf_per_share": -5.0,
            "shares_cagr": 18.0,
            "net_debt_ebitda": 8.5,
            "sbc_ocf": 45.0
        }
        res = evaluate_valuation("MSTR", metrics)
        self.assertEqual(res["verdict"], "RED FLAG")
        self.assertTrue(res["is_discarded_by_nature"])
        self.assertEqual(res["target_weight"], "0.0%")

    def test_user_valuation_inputs_persistence(self):
        # Evaluar con inputs personalizados para GOOGL
        custom_metrics = {
            "price": 182.50,
            "fcf_per_share": 9.20,
            "roic": 30.5,
            "wacc": 9.0,
            "net_debt_ebitda": -0.9,
            "shares_cagr": -3.0,
            "sbc_ocf": 8.0
        }
        evaluate_valuation("GOOGL", custom_metrics)
        
        # En la base de datos de inputs del usuario debe estar guardado el valor
        saved_inputs = get_user_valuation_inputs("GOOGL")
        self.assertEqual(saved_inputs["price"], 182.50)
        self.assertEqual(saved_inputs["fcf_per_share"], 9.20)
        self.assertEqual(saved_inputs["roic"], 30.5)

        # Al recargar el perfil de GOOGL, debe recordar los valores fundamentales
        prof = get_profile_by_ticker("GOOGL")
        fields_map = {f["key"]: f["default"] for f in prof["fields"]}
        self.assertEqual(fields_map["fcf_per_share"], 9.20)
        self.assertEqual(fields_map["roic"], 30.5)
        
        # El precio de mercado refleja la cotización en vivo si está disponible, o el input guardado
        if prof.get("live_market_price"):
            self.assertEqual(fields_map["price"], prof["live_market_price"])
        else:
            self.assertEqual(fields_map["price"], 182.50)

if __name__ == "__main__":
    unittest.main()
