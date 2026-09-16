import unittest
from unittest.mock import patch
from services.portfolio_service import (
    calculate_portfolio, 
    calculate_portfolio_data, 
    calculate_portfolio_mcm,
    calculate_portfolio_rsi,
    calculate_portfolio_alpha,
    safe_float,
    get_portfolio_fixed_income_summary,
    get_ticker_sector,
    calculate_sector_breakdown
)

class TestPortfolioCalculations(unittest.TestCase):
    
    def setUp(self):
        self.mock_data = {
            "AAPL": {"local": 1000.0, "rsi": 55.0},
            "MSFT": {"local": 2000.0, "rsi": 48.0},
            "GOOGL": {"local": 500.0, "rsi": 62.0}
        }

    def test_calculate_portfolio_rsi(self):
        # Cartera con 2 activos: AAPL ($10,000, RSI 55) y MSFT ($30,000, RSI 45)
        # Total $40,000. RSI Ponderado = (55 * 10000 + 45 * 30000) / 40000 = (550k + 1350k) / 40k = 47.5
        items = [
            {"ticker": "AAPL", "value": 10000.0, "rsi": 55.0},
            {"ticker": "MSFT", "value": 30000.0, "rsi": 45.0},
        ]
        rsi_info = calculate_portfolio_rsi(items)
        self.assertIsNotNone(rsi_info)
        self.assertEqual(rsi_info["weighted"], 47.5)
        self.assertEqual(rsi_info["simple"], 50.0)
        self.assertEqual(rsi_info["status"], "Neutral")
        
        # Test con lista vacía o sin RSI
        self.assertIsNone(calculate_portfolio_rsi([]))
        self.assertIsNone(calculate_portfolio_rsi([{"ticker": "X", "value": 100, "rsi": None}]))

    def test_calculate_portfolio_mcm(self):
        # MSFT cuesta 2000 y pesa 20% -> Ratio = 2000 / 0.20 = 10,000 (cuello de botella)
        # AAPL cuesta 1000 y pesa 80% -> Ratio = 1000 / 0.80 = 1,250
        weights = {"AAPL": 80.0, "MSFT": 20.0}
        mcm = calculate_portfolio_mcm(weights, self.mock_data)
        self.assertIsNotNone(mcm)
        self.assertEqual(mcm["bottleneck_ticker"], "MSFT")
        self.assertEqual(mcm["bottleneck_qty"], 1)
        self.assertEqual(mcm["base_nominals"]["MSFT"], 1)
        self.assertEqual(mcm["base_nominals"]["AAPL"], 8)
        self.assertEqual(mcm["total_nominals"], 9)
        self.assertEqual(mcm["base_capital"], 10000.0)
        
    def test_calculate_portfolio_weights(self):
        weights = {"AAPL": 50.0, "MSFT": 50.0}
        res = calculate_portfolio(weights, self.mock_data, "AAPL", 10)
        self.assertIsNotNone(res)
        self.assertEqual(len(res), 2)
        
        aapl_item = next(x for x in res if x["ticker"] == "AAPL")
        msft_item = next(x for x in res if x["ticker"] == "MSFT")
        
        self.assertEqual(aapl_item["qty"], 10)
        self.assertEqual(aapl_item["value"], 10000.0)
        self.assertEqual(msft_item["qty"], 5)
        self.assertEqual(msft_item["value"], 10000.0)
        self.assertAlmostEqual(aapl_item["real_weight"], 50.0, places=1)
        self.assertAlmostEqual(msft_item["real_weight"], 50.0, places=1)

    def test_calculate_portfolio_nominals_mode(self):
        pf_data = {
            "mode": "nominals",
            "assets": {"AAPL": 10, "MSFT": 5}
        }
        res = calculate_portfolio_data(pf_data, self.mock_data)
        self.assertIsNotNone(res)
        self.assertEqual(len(res), 2)
        
        aapl_item = next(x for x in res if x["ticker"] == "AAPL")
        self.assertEqual(aapl_item["qty"], 10)
        self.assertEqual(aapl_item["value"], 10000.0)
        self.assertEqual(aapl_item["error"], 0.0)

    def test_calculate_portfolio_missing_anchor(self):
        weights = {"AAPL": 50.0, "MSFT": 50.0}
        res = calculate_portfolio(weights, self.mock_data, "NONEXISTENT", 10)
        self.assertIsNone(res)

    def test_calculate_portfolio_empty_assets(self):
        weights = {}
        res = calculate_portfolio(weights, self.mock_data, "AAPL", 10)
        self.assertIsNone(res)

    @patch("services.rotation_service.load_user_holdings")
    def test_get_portfolio_fixed_income_summary_bmb(self, mock_holdings):
        mock_holdings.return_value = {
            "fixed_income_holdings": {
                "S30S6": {"nominals": 1000, "ppc": 110.0}
            }
        }
        res = get_portfolio_fixed_income_summary("bmb")
        self.assertTrue(res["has_fixed_income"])
        self.assertIsNotNone(res["asset_allocation"])
        self.assertEqual(res["asset_allocation"]["fixed_income_weight"], 54.37)
        self.assertEqual(len(res["items"]), 1)
        item = res["items"][0]
        self.assertEqual(item["ticker"], "S30S6")
        self.assertEqual(item["nominals"], 1000)
        self.assertEqual(item["ppc_base_100"], 110.0)
        self.assertAlmostEqual(item["ppc_unit"], 1.1, places=4)
        self.assertGreater(item["projected_payoff"], 1000.0)
        self.assertIn("tna_compra", item)
        self.assertIn("weighted_tna_compra", res)
        self.assertEqual(res["nearest_maturity_ticker"], "S30S6")
        self.assertTrue(res["has_imminent_maturity"])

    @patch("services.rotation_service.load_user_holdings")
    def test_get_portfolio_fixed_income_summary_min_drawdown_15(self, mock_holdings):
        mock_holdings.return_value = {
            "fixed_income_holdings": {
                "S30S6": {"nominals": 1000, "ppc": 1.10},
                "T31Y7": {"nominals": 1000, "ppc": 1.15}
            }
        }
        res = get_portfolio_fixed_income_summary("min_drawdown_15")
        self.assertTrue(res["has_fixed_income"])
        self.assertEqual(res["asset_allocation"]["fixed_income_weight"], 30.47)
        self.assertEqual(len(res["items"]), 2)
        tickers = [it["ticker"] for it in res["items"]]
        self.assertIn("S30S6", tickers)
        self.assertIn("T31Y7", tickers)
        self.assertGreater(res["total_invested"], 2000.0)
        self.assertGreater(res["total_projected_maturity_payoff"], 2000.0)

    def test_get_portfolio_fixed_income_summary_empty(self):
        res = get_portfolio_fixed_income_summary("bdi_muy_agresiva")
        self.assertFalse(res["has_fixed_income"])
        self.assertEqual(len(res["items"]), 0)

    def test_get_ticker_sector(self):
        self.assertEqual(get_ticker_sector("GOOGL")["id"], "tech")
        self.assertEqual(get_ticker_sector("MSFT")["id"], "tech")
        self.assertEqual(get_ticker_sector("NVDA")["id"], "semis")
        self.assertEqual(get_ticker_sector("V")["id"], "payments_retail")
        self.assertEqual(get_ticker_sector("LLY")["id"], "health")
        self.assertEqual(get_ticker_sector("VIST")["id"], "energy")
        self.assertEqual(get_ticker_sector("CAT")["id"], "industrials")
        self.assertEqual(get_ticker_sector("CCJ")["id"], "energy")
        self.assertEqual(get_ticker_sector("CCJ")["industry"], "Minería y combustible nuclear")
        self.assertEqual(get_ticker_sector("NNE")["id"], "energy")
        self.assertEqual(get_ticker_sector("NNE")["industry"], "Tecnología nuclear avanzada y microreactores")
        self.assertEqual(get_ticker_sector("UNKNOWN_XYZ")["id"], "other")

    def test_calculate_sector_breakdown(self):
        mock_result = [
            {"ticker": "GOOGL", "weight": 20.0, "value": 200000.0, "qty": 10, "price": 20000.0},
            {"ticker": "MSFT", "weight": 10.0, "value": 100000.0, "qty": 5, "price": 20000.0},
            {"ticker": "LLY", "weight": 30.0, "value": 300000.0, "qty": 10, "price": 30000.0},
            {"ticker": "VIST", "weight": 40.0, "value": 400000.0, "qty": 10, "price": 40000.0},
        ]
        breakdown = calculate_sector_breakdown(mock_result)
        self.assertEqual(len(breakdown), 3) # tech, health, energy
        
        # Debe estar ordenado por peso descendente
        self.assertEqual(breakdown[0]["sector_id"], "energy")
        self.assertEqual(breakdown[0]["total_target_weight"], 40.0)
        self.assertEqual(breakdown[0]["total_value"], 400000.0)
        
        tech_sector = next(s for s in breakdown if s["sector_id"] == "tech")
        self.assertEqual(tech_sector["total_target_weight"], 30.0)
        self.assertEqual(tech_sector["total_value"], 300000.0)
        self.assertEqual(len(tech_sector["assets"]), 2)
        
        # Verificar pesos relativos dentro del sector
        googl_asset = next(a for a in tech_sector["assets"] if a["ticker"] == "GOOGL")
        self.assertAlmostEqual(googl_asset["relative_weight_in_sector"], 66.7, places=1)

    def test_safe_float(self):
        self.assertEqual(safe_float("123.45"), 123.45)
        self.assertEqual(safe_float(42), 42.0)
        self.assertIsNone(safe_float(None))
        self.assertIsNone(safe_float(""))
        self.assertIsNone(safe_float("invalid_str"))
        self.assertEqual(safe_float("invalid_str", 10.0), 10.0)
        self.assertIsNone(safe_float(float("nan")))
        self.assertIsNone(safe_float(float("inf")))
        self.assertIsNone(safe_float(float("-inf")))
        self.assertEqual(safe_float(float("nan"), 0.0), 0.0)

    def test_calculate_portfolio_anchor_fallback(self):
        # AAPL no tiene cotización en mock_data_missing, pero MSFT sí
        mock_data_missing = {
            "AAPL": {"local": 0.0, "rsi": 55.0},
            "MSFT": {"local": 2000.0, "rsi": 48.0}
        }
        weights = {"AAPL": 40.0, "MSFT": 60.0}
        # Solicitamos AAPL como ancla, pero como no tiene precio debe rotar a MSFT
        res = calculate_portfolio(weights, mock_data_missing, "AAPL", 5)
        self.assertIsNotNone(res)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["ticker"], "MSFT")
        self.assertEqual(res[0]["qty"], 5)

    def test_calculate_portfolio_zero_weight_protection(self):
        weights = {"AAPL": 0.0}
        res = calculate_portfolio(weights, self.mock_data, "AAPL", 10)
        self.assertIsNone(res)

    def test_calculate_portfolio_alpha_empty(self):
        self.assertEqual(calculate_portfolio_alpha({}), {})

if __name__ == "__main__":
    unittest.main()
