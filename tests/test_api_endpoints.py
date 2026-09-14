import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
import json
import io
from services.earnings_service import load_earnings_calendar, _db as _earnings_db
from services.fair_value_service import load_fair_values, _db as _gf_db
from services.valuation_service import load_user_valuation_inputs, _user_inputs_db as _val_db
from services.portfolio_service import load_portfolios, _db as _pf_db
from services.ppc_service import load_ppc_values, _db as _ppc_db
from services.pfcf_service import load_pfcf_values, _db as _pfcf_db
from services.rotation_service import load_user_holdings, _db as _holdings_db

MOCK_TV_DATA = {
    "COST": {"price": 950.0, "rsi": 55.0, "change": 1.2, "volume": 1000000},
    "LLY": {"price": 1000.0, "rsi": 62.0, "change": 0.5, "volume": 800000},
    "DE": {"price": 450.0, "rsi": 48.0, "change": -0.8, "volume": 500000},
    "NEM": {"price": 45.0, "rsi": 42.0, "change": 2.1, "volume": 2000000},
    "VIST": {"price": 48.0, "rsi": 58.0, "change": 3.4, "volume": 1200000},
    "NVDA": {"price": 128.0, "rsi": 65.0, "change": 1.8, "volume": 50000000},
    "GOOGL": {"price": 180.0, "rsi": 52.0, "change": 0.4, "volume": 15000000}
}

def mock_get_multi_data(symbols):
    return {
        s.upper(): {
            "symbol": s.upper(),
            "adr": 100.0,
            "local": 1000.0,
            "rsi": 50.0,
            "ratio": 1.0,
            "alert": False
        }
        for s in symbols
    }

import tempfile
from pathlib import Path

class TestAPIEndpoints(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        
        # 1. Leer datos reales del disco antes de reasignar rutas
        initial_earnings = dict(load_earnings_calendar())
        initial_gf = dict(load_fair_values())
        initial_val = dict(load_user_valuation_inputs())
        initial_pf = dict(load_portfolios())
        initial_ppc = dict(load_ppc_values())
        initial_pfcf = dict(load_pfcf_values())
        initial_holdings = dict(load_user_holdings())

        cls._tmp_dir = tempfile.TemporaryDirectory()
        tmp_path = Path(cls._tmp_dir.name)
        
        cls._orig_earnings_path = _earnings_db.file_path
        cls._orig_gf_path = _gf_db.file_path
        cls._orig_val_path = _val_db.file_path
        cls._orig_pf_path = _pf_db.file_path
        cls._orig_ppc_path = _ppc_db.file_path
        cls._orig_pfcf_path = _pfcf_db.file_path
        cls._orig_holdings_path = _holdings_db.file_path

        _earnings_db.file_path = tmp_path / "earnings.json"
        _earnings_db._cache = None
        _earnings_db._cache_valid = False
        _earnings_db.save(initial_earnings)

        _gf_db.file_path = tmp_path / "fair_values.json"
        _gf_db._cache = None
        _gf_db._cache_valid = False
        _gf_db.save(initial_gf)

        _val_db.file_path = tmp_path / "user_valuation.json"
        _val_db._cache = None
        _val_db._cache_valid = False
        _val_db.save(initial_val)

        _pf_db.file_path = tmp_path / "portfolios.json"
        _pf_db._cache = None
        _pf_db._cache_valid = False
        _pf_db.save(initial_pf)

        _ppc_db.file_path = tmp_path / "ppc_values.json"
        _ppc_db._cache = None
        _ppc_db._cache_valid = False
        _ppc_db.save(initial_ppc)

        _pfcf_db.file_path = tmp_path / "pfcf_values.json"
        _pfcf_db._cache = None
        _pfcf_db._cache_valid = False
        _pfcf_db.save(initial_pfcf)

        _holdings_db.file_path = tmp_path / "user_holdings.json"
        _holdings_db._cache = None
        _holdings_db._cache_valid = False
        _holdings_db.save(initial_holdings)

        cls._patcher = patch("routers.portfolios.get_multiple_tickers_data", side_effect=mock_get_multi_data)
        cls._patcher.start()

    @classmethod
    def tearDownClass(cls):
        cls._patcher.stop()
        _earnings_db.file_path = cls._orig_earnings_path
        _earnings_db._cache = None
        _earnings_db._cache_valid = False
        _gf_db.file_path = cls._orig_gf_path
        _gf_db._cache = None
        _gf_db._cache_valid = False
        _val_db.file_path = cls._orig_val_path
        _val_db._cache = None
        _val_db._cache_valid = False
        _pf_db.file_path = cls._orig_pf_path
        _pf_db._cache = None
        _pf_db._cache_valid = False
        _ppc_db.file_path = cls._orig_ppc_path
        _ppc_db._cache = None
        _ppc_db._cache_valid = False
        _pfcf_db.file_path = cls._orig_pfcf_path
        _pfcf_db._cache = None
        _pfcf_db._cache_valid = False
        _holdings_db.file_path = cls._orig_holdings_path
        _holdings_db._cache = None
        _holdings_db._cache_valid = False
        cls._tmp_dir.cleanup()

        
    def test_health_endpoint(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "healthy")
        
    def test_security_headers_present(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(resp.headers.get("X-Frame-Options"), "DENY")
        self.assertIn("X-Process-Time", resp.headers)

    def test_root_dashboard(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Máquina de Planes, Finanzas y Portfolios", resp.text)
        self.assertIn("root", resp.text)

    def test_cedear_card_invalid_ticker(self):
        resp = self.client.post("/api/cedears/card", data={"ticker": "INVALID<XSS>"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("inválido", resp.text)

    def test_portfolio_create_protected_override(self):
        resp = self.client.post("/api/portfolios/create", data={
            "name": "bmb",
            "mode": "weights",
            "weights_str": "AAPL: 100"
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn("No puedes sobreescribir el portfolio predeterminado", resp.text)

    def test_portfolio_delete_protected(self):
        resp = self.client.delete("/api/portfolios/delete/bmb")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("No se puede eliminar el portfolio predeterminado", resp.text)

    def test_portfolio_import_invalid_json(self):
        file_content = b"Not a JSON content"
        files = {"file": ("test.json", io.BytesIO(file_content), "application/json")}
        resp = self.client.post("/api/portfolios/import", files=files)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("no contiene un formato JSON válido", resp.text)

    def test_earnings_table_endpoint(self):
        resp = self.client.get("/api/earnings/summary_json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("NVDA", resp.text)
        self.assertIn("earnings", resp.text)

    def test_valuation_dashboard_endpoint(self):
        resp = self.client.post("/api/valuation/dashboard")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("sectors", resp.text)

    def test_valuation_form_endpoint(self):
        resp = self.client.get("/api/valuation/profile_json/NVDA")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("NVIDIA", resp.text)
        self.assertIn("fcf_per_share", resp.text)

    def test_valuation_evaluate_endpoint(self):
        resp = self.client.post("/api/valuation/evaluate_json", json={
            "ticker": "NVDA",
            "metrics": {
                "price": 85.0,
                "fcf_per_share": 4.5,
                "roic": 50.0,
                "wacc": 9.0,
                "net_debt_ebitda": -0.5,
                "shares_cagr": -1.0,
                "sbc_ocf": 8.0
            }
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn("verdict", resp.text)

    def test_valuation_sync_gf_json(self):
        resp = self.client.post("/api/valuation/sync_gf_json", json={
            "ticker": "CAT",
            "fair_value": 296.0
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("ticker"), "CAT")
        self.assertEqual(data.get("fair_value"), 296.0)

    def test_portfolio_gf_value_single_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "AAPL",
            "gf_value": 150.0
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_portfolio_gf_value_bulk_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "COST",
            "gf_value": 850.0
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_portfolio_pfcf_single_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "NVDA",
            "pfcf": 45.2
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_earnings_update_confirmed_date(self):
        resp = self.client.post("/api/earnings/save_date_json", json={
            "ticker": "NVDA",
            "confirmed_date": "2026-08-28"
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn("NVDA", resp.text)
        self.assertIn("2026-08-28", resp.text)

    def test_portfolio_ppc_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "COST",
            "ppc": 29959.90
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_portfolio_ppc_bulk_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "COST",
            "ppc": 29959.90
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_portfolio_pfcf_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "COST",
            "pfcf": 38.84
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_portfolio_pfcf_bulk_update(self):
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "COST",
            "pfcf": 38.84
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("success"))

    def test_portfolio_quick_update_json(self):
        """Verifica la actualización atómica y liviana de métricas para el ActionDrawer."""
        resp = self.client.post("/api/portfolios/quick_update_json", json={
            "ticker": "AAPL",
            "ppc": 12500.50,
            "gf_value": 220.0,
            "pfcf": 28.5
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("ticker"), "AAPL")
        self.assertEqual(data.get("ppc"), 12500.50)
        self.assertEqual(data.get("gf_value"), 220.0)
        self.assertEqual(data.get("pfcf"), 28.5)

    def test_portfolio_settings_json_and_rebalance_json_idempotency(self):
        """Verifica que settings_json persista configuración y que GET rebalance_json sea de solo lectura."""
        # 1. Configurar anchor y qty explícitamente vía POST
        post_resp = self.client.post("/api/portfolios/settings_json/min_drawdown_15", json={
            "anchor": "COST",
            "qty": 5
        })
        self.assertEqual(post_resp.status_code, 200)
        self.assertEqual(post_resp.json().get("anchor"), "COST")
        self.assertEqual(post_resp.json().get("qty"), 5)

        # 2. Consultar GET rebalance_json pasando parámetros temporales
        get_resp = self.client.get("/api/portfolios/rebalance_json/min_drawdown_15?anchor=LLY&qty=20")
        self.assertEqual(get_resp.status_code, 200)
        get_data = get_resp.json()
        self.assertEqual(get_data.get("anchor"), "LLY")
        self.assertEqual(get_data.get("qty"), 20)

        # 3. Consultar nuevamente sin parámetros para confirmar que el GET no sobreescribió el estado guardado
        get_default = self.client.get("/api/portfolios/rebalance_json/min_drawdown_15")
        self.assertEqual(get_default.status_code, 200)
        default_data = get_default.json()
        self.assertEqual(default_data.get("anchor"), "COST")
        self.assertEqual(default_data.get("qty"), 5)

    def test_react_json_endpoints_contracts(self):
        """Verifica los contratos de datos REST JSON que alimentan a la SPA en React 19."""
        # 1. CEDEARs quotes y tickers
        resp_quotes = self.client.get("/api/cedears/quotes_json")
        self.assertEqual(resp_quotes.status_code, 200)
        quotes_data = resp_quotes.json()
        self.assertIn("quotes", quotes_data)
        self.assertIsInstance(quotes_data["quotes"], list)

        resp_pftk = self.client.get("/api/cedears/portfolio_tickers")
        self.assertEqual(resp_pftk.status_code, 200)
        pftk_data = resp_pftk.json()
        self.assertIn("portfolio_tickers", pftk_data)
        self.assertIsInstance(pftk_data["portfolio_tickers"], list)

        # 2. Portfolios list
        resp_pflist = self.client.get("/api/portfolios/list_json")
        self.assertEqual(resp_pflist.status_code, 200)
        self.assertIn("portfolios", resp_pflist.json())

        # 3. Earnings Hub
        resp_earn = self.client.get("/api/earnings/summary_json")
        self.assertEqual(resp_earn.status_code, 200)
        earn_data = resp_earn.json()
        self.assertIn("earnings", earn_data)
        self.assertIn("heatmap", earn_data)
        self.assertIn("stats", earn_data)

        # 4. Renta Fija
        resp_rf = self.client.get("/api/renta_fija/curve_json?category=lecap")
        self.assertEqual(resp_rf.status_code, 200)
        rf_data = resp_rf.json()
        self.assertIn("category", rf_data)
        self.assertIn("scatter_points", rf_data)
        self.assertIn("table_data", rf_data)

        # 5. Performance Multi-Asset
        resp_perf = self.client.get("/api/performance/data_json")
        self.assertEqual(resp_perf.status_code, 200)
        perf_data = resp_perf.json()
        self.assertIn("portfolio_summaries", perf_data)
        self.assertIn("benchmarks", perf_data)

        # 6. Valuación Fundamental
        resp_val = self.client.get("/api/valuation/data_json")
        self.assertEqual(resp_val.status_code, 200)
        val_data = resp_val.json()
        self.assertIn("sectors", val_data)
        self.assertIn("selected_profile", val_data)

        # 7. Valuación Evaluación JSON
        resp_eval = self.client.post("/api/valuation/evaluate_json", json={
            "ticker": "NVDA",
            "metrics": {
                "price": 120.0,
                "fcf_per_share": 4.5,
                "roic": 35.0,
                "wacc": 10.0,
                "net_debt_ebitda": -0.5,
                "shares_cagr": -1.2,
                "sbc_ocf": 6.5
            }
        })
        self.assertEqual(resp_eval.status_code, 200)
        eval_data = resp_eval.json()
        self.assertEqual(eval_data.get("ticker"), "NVDA")
        self.assertIn("fair_value", eval_data)
        self.assertIn("verdict", eval_data)
        self.assertIn("flags", eval_data)

    def test_portfolio_rebalance_404_and_sanitization(self):
        """Verifica 404 para carteras inexistentes y sanitización de nombres con espacios."""
        # Cartera inexistente
        resp_404 = self.client.get("/api/portfolios/rebalance_json/cartera_inexistente_xyz")
        self.assertEqual(resp_404.status_code, 404)
        self.assertIn("error", resp_404.json())

        # Sanitización de cartera con espacios
        from services.security_service import sanitize_portfolio_name
        self.assertEqual(sanitize_portfolio_name("BDI Momentum"), "bdi_momentum")
        self.assertEqual(sanitize_portfolio_name("  min - drawdown - 15  "), "min_drawdown_15")


    @patch("routers.cedears.fetch_sector_etf_thermometer")
    def test_cedears_etf_thermometer_endpoint(self, mock_fetch):
        mock_fetch.return_value = [
            {
                "ticker": "XLK",
                "name": "Tecnologia",
                "sector": "Information Technology",
                "close": 187.67,
                "change_d": 1.32,
                "perf_w": 0.25,
                "perf_1m": -0.95,
                "rsi": 55.10,
                "trend_sma50": "BULLISH",
                "trend_sma200": "BULLISH"
            }
        ]
        resp = self.client.get("/api/cedears/etf_thermometer")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["ticker"], "XLK")
        self.assertEqual(data[0]["perf_w"], 0.25)

if __name__ == "__main__":
    unittest.main()

