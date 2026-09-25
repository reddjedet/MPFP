import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from services.rotation_service import (
    load_user_holdings,
    load_all_user_holdings,
    save_user_holdings,
    update_holding,
    analyze_rotation,
    _db
)
from services.ppc_service import _db as _ppc_db, load_ppc_values
from fastapi.testclient import TestClient
from main import app


class TestRotationService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        initial_data = dict(load_all_user_holdings())
        initial_ppc = dict(load_ppc_values())
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls._orig_path = _db.file_path
        cls._orig_ppc_path = _ppc_db.file_path
        
        _db.file_path = Path(cls._tmp_dir.name) / "user_holdings.json"
        _db._cache = None
        _db._cache_valid = False
        _db.save(initial_data)

        _ppc_db.file_path = Path(cls._tmp_dir.name) / "ppc_values.json"
        _ppc_db._cache = None
        _ppc_db._cache_valid = False
        _ppc_db.save(initial_ppc)
        
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        _db.file_path = cls._orig_path
        _db._cache = None
        _db._cache_valid = False
        
        _ppc_db.file_path = cls._orig_ppc_path
        _ppc_db._cache = None
        _ppc_db._cache_valid = False
        cls._tmp_dir.cleanup()

    def test_load_and_save_holdings(self):
        sample = {
            "holdings": {
                "COST": {"nominals": 10, "ppc": 30000.0},
                "LLY": {"nominals": 20, "ppc": 25000.0}
            },
            "cash_ars": 50000.0
        }
        save_user_holdings(sample)
        loaded = load_user_holdings()
        self.assertEqual(loaded["cash_ars"], 50000.0)
        self.assertEqual(loaded["holdings"]["COST"]["nominals"], 10)
        self.assertEqual(loaded["holdings"]["LLY"]["ppc"], 25000.0)

    def test_update_and_delete_holding(self):
        update_holding("VIST", 15, 38000.0)
        loaded = load_user_holdings()
        self.assertIn("VIST", loaded["holdings"])
        self.assertEqual(loaded["holdings"]["VIST"]["nominals"], 15)

        # Eliminar poniendo nominals en 0 y ppc None
        update_holding("VIST", 0, None)
        loaded_after = load_user_holdings()
        self.assertNotIn("VIST", loaded_after["holdings"])

    @patch("services.rotation_service.get_ticker_data")
    def test_analyze_rotation_math_and_gaps(self, mock_ticker_data):
        mock_ticker_data.side_effect = lambda tk: {
            "COST": {"local": 30000.0, "adr": 900.0, "ratio": 48.0, "rsi": 70.0},
            "LLY": {"local": 25000.0, "adr": 850.0, "ratio": 56.0, "rsi": 35.0},
            "DE": {"local": 15000.0, "adr": 400.0, "ratio": 40.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        holdings = {
            "holdings": {
                "COST": {"nominals": 20, "ppc": 20000.0}, # Superávit / Take Profit
                "LLY": {"nominals": 0, "ppc": None}       # Déficit
            },
            "cash_ars": 0.0
        }
        save_user_holdings(holdings, portfolio_key="min_drawdown_15")

        # Analizar contra una cartera ficticia o predeterminada
        res = analyze_rotation("min_drawdown_15")
        self.assertIn("total_real_equity", res)
        self.assertIn("items", res)
        self.assertIn("rotation_trades", res)
        self.assertGreater(res["total_real_equity"], 0)

        # Verificar que COST tiene status surplus
        cost_item = next((it for it in res["items"] if it["ticker"] == "COST"), None)
        self.assertIsNotNone(cost_item)
        self.assertEqual(cost_item["status"], "surplus")

        # Revisor del seguimiento de CEDEARs: cada activo debe exponer el
        # desvío contra el objetivo y el resumen debe coincidir con esos datos.
        self.assertIsInstance(res["avg_tracking_error"], (int, float))
        tracked_items = [
            item for item in res["items"]
            if item["in_target"] or item["real_nominals"] > 0
        ]
        self.assertTrue(tracked_items, "El seguimiento no puede quedar sin activos monitoreados")
        expected_tracking_error = round(
            sum(abs(item["weight_gap"]) for item in tracked_items) / len(tracked_items),
            2,
        )
        self.assertEqual(res["avg_tracking_error"], expected_tracking_error)
        for item in tracked_items:
            self.assertIn("weight_gap", item)
            self.assertIsInstance(item["weight_gap"], (int, float))

    def test_rotation_api_endpoints(self):
        resp = self.client.get("/api/rotation/holdings")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("holdings", resp.json())

        # Update endpoint
        post_resp = self.client.post("/api/rotation/holdings/update", json={
            "ticker": "AAPL",
            "nominals": 12,
            "ppc": 15000.0
        })
        self.assertEqual(post_resp.status_code, 200)

        # Analysis endpoint
        analysis_resp = self.client.get("/api/rotation/analysis?target_pf=min_drawdown_15")
        self.assertEqual(analysis_resp.status_code, 200)
        self.assertIn("rotation_trades", analysis_resp.json())

    @patch("services.rotation_service.get_ticker_data")
    def test_tactical_veto_overbought_rsi(self, mock_ticker_data):
        # Configurar LLY en sobrecompra (RSI = 75.0) y DE en zona normal (RSI = 45.0)
        mock_ticker_data.side_effect = lambda tk: {
            "COST": {"local": 30000.0, "adr": 900.0, "ratio": 48.0, "rsi": 72.0},
            "LLY": {"local": 25000.0, "adr": 850.0, "ratio": 56.0, "rsi": 75.0}, # En sobrecompra
            "DE": {"local": 15000.0, "adr": 400.0, "ratio": 40.0, "rsi": 45.0},  # Neutral/Oportuno
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        holdings = {
            "holdings": {
                "COST": {"nominals": 20, "ppc": 20000.0},
                "LLY": {"nominals": 0, "ppc": None}, # Déficit pero sobrecomprado
                "DE": {"nominals": 0, "ppc": None}   # Déficit y timing apto
            },
            "cash_ars": 0.0
        }
        save_user_holdings(holdings, portfolio_key="min_drawdown_15")

        res = analyze_rotation("min_drawdown_15")
        lly_item = next((it for it in res["items"] if it["ticker"] == "LLY"), None)
        self.assertIsNotNone(lly_item)
        self.assertTrue(lly_item["is_buy_blocked"])
        self.assertEqual(lly_item["timing_status"], "wait_pullback")

        # Verificar que LLY NO fue emparejado como orden de compra en rotation_trades
        buy_tickers = [t["buy"]["ticker"] for t in res["rotation_trades"] if t.get("buy")]
        self.assertNotIn("LLY", buy_tickers)

    @patch("services.rotation_service.get_ticker_data")
    def test_no_self_trading_and_no_deficit_selling(self, mock_ticker_data):
        # Escenario: LLY tiene ganancia latente masiva (+50%) pero está en DEFICIT en la cartera
        # El sistema NUNCA debe sugerir vender LLY y comprar LLY a la vez.
        mock_ticker_data.side_effect = lambda tk: {
            "COST": {"local": 30000.0, "adr": 900.0, "ratio": 48.0, "rsi": 50.0},
            "LLY": {"local": 33000.0, "adr": 950.0, "ratio": 56.0, "rsi": 55.0}, # En take profit pero en déficit
            "DE": {"local": 15000.0, "adr": 400.0, "ratio": 40.0, "rsi": 45.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        holdings = {
            "holdings": {
                "COST": {"nominals": 20, "ppc": 20000.0}, # Superávit real
                "LLY": {"nominals": 1, "ppc": 22000.0},   # Ganancia +50%, pero target es más alto (déficit)
                "DE": {"nominals": 0, "ppc": None}
            },
            "cash_ars": 0.0
        }
        save_user_holdings(holdings, portfolio_key="min_drawdown_15")

        res = analyze_rotation("min_drawdown_15")
        for trade in res["rotation_trades"]:
            s = trade.get("sell")
            b = trade.get("buy")
            if s and b:
                # Ningún trade puede vender y comprar el mismo activo
                self.assertNotEqual(s["ticker"], b["ticker"])

    def test_multi_portfolio_isolation(self):
        """Verifica que las tenencias de cada cartera/broker estén estrictamente aisladas."""
        min_dd_sample = {
            "holdings": {
                "COST": {"nominals": 5, "ppc": 30000.0},
                "DE": {"nominals": 3, "ppc": 16000.0}
            },
            "cash_ars": 10000.0
        }
        bmb_sample = {
            "holdings": {
                "CAT": {"nominals": 8, "ppc": 25000.0},
                "MRK": {"nominals": 10, "ppc": 18000.0}
            },
            "cash_ars": 20000.0
        }
        save_user_holdings(min_dd_sample, portfolio_key="min_drawdown_15")
        save_user_holdings(bmb_sample, portfolio_key="bmb")

        min_dd_loaded = load_user_holdings("min_drawdown_15")
        bmb_loaded = load_user_holdings("bmb")

        self.assertIn("COST", min_dd_loaded["holdings"])
        self.assertIn("DE", min_dd_loaded["holdings"])
        self.assertNotIn("CAT", min_dd_loaded["holdings"])
        self.assertNotIn("MRK", min_dd_loaded["holdings"])
        self.assertEqual(min_dd_loaded["cash_ars"], 10000.0)

        self.assertIn("CAT", bmb_loaded["holdings"])
        self.assertIn("MRK", bmb_loaded["holdings"])
        self.assertNotIn("COST", bmb_loaded["holdings"])
        self.assertNotIn("DE", bmb_loaded["holdings"])
        self.assertEqual(bmb_loaded["cash_ars"], 20000.0)

        # Actualizar activo solo en BMB
        update_holding("PM", 15, 12000.0, portfolio_key="bmb")
        self.assertIn("PM", load_user_holdings("bmb")["holdings"])
        self.assertNotIn("PM", load_user_holdings("min_drawdown_15")["holdings"])

    @patch("services.rotation_service.get_ticker_data")
    def test_bmb_rotation_does_not_suggest_selling_min_drawdown_assets(self, mock_ticker_data):
        """Verifica que al analizar BMB no aparezcan ni se vendan activos que solo existen en min_drawdown_15."""
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 25000.0, "adr": 350.0, "ratio": 20.0, "rsi": 50.0},
            "MRK": {"local": 18000.0, "adr": 120.0, "ratio": 10.0, "rsi": 50.0},
            "GOOGL": {"local": 8000.0, "adr": 180.0, "ratio": 58.0, "rsi": 50.0},
            "MA": {"local": 30000.0, "adr": 450.0, "ratio": 33.0, "rsi": 50.0},
            "PM": {"local": 12000.0, "adr": 100.0, "ratio": 12.0, "rsi": 50.0},
            "AMAT": {"local": 15000.0, "adr": 200.0, "ratio": 15.0, "rsi": 50.0},
            "VIST": {"local": 38000.0, "adr": 50.0, "ratio": 3.0, "rsi": 50.0},
            "DE": {"local": 15000.0, "adr": 400.0, "ratio": 40.0, "rsi": 50.0},
            "COST": {"local": 30000.0, "adr": 900.0, "ratio": 48.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        # min_drawdown_15 tiene DE y COST
        save_user_holdings({
            "holdings": {
                "DE": {"nominals": 3, "ppc": 15000.0},
                "COST": {"nominals": 8, "ppc": 30000.0}
            },
            "cash_ars": 0.0
        }, portfolio_key="min_drawdown_15")

        # BMB está vacío o tiene sus propios activos
        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 4, "ppc": 25000.0}
            },
            "cash_ars": 50000.0
        }, portfolio_key="bmb")

        # Analizar BMB
        res = analyze_rotation("bmb")
        tickers_in_bmb = [it["ticker"] for it in res["items"]]
        self.assertNotIn("DE", tickers_in_bmb)
        self.assertNotIn("COST", tickers_in_bmb)

        # En rotation_trades de BMB no debe figurar venta de DE ni COST
        for t in res["rotation_trades"]:
            if t.get("sell"):
                self.assertNotIn(t["sell"]["ticker"], ["DE", "COST", "URA", "NU"])

    def test_multi_portfolio_api_endpoints(self):
        """Verifica los endpoints REST con parámetro portfolio y endpoint /all."""
        # Endpoint /all
        all_resp = self.client.get("/api/rotation/holdings/all")
        self.assertEqual(all_resp.status_code, 200)
        self.assertIn("min_drawdown_15", all_resp.json())
        self.assertIn("bmb", all_resp.json())

        # Endpoint específico por portfolio
        bmb_resp = self.client.get("/api/rotation/holdings?portfolio=bmb")
        self.assertEqual(bmb_resp.status_code, 200)
        self.assertEqual(bmb_resp.json().get("portfolio"), "bmb")

        # Update en portfolio BMB
        update_resp = self.client.post("/api/rotation/holdings/update", json={
            "portfolio": "bmb",
            "ticker": "CAT",
            "nominals": 7,
            "ppc": 26000.0
        })
        self.assertEqual(update_resp.status_code, 200)
        self.assertEqual(update_resp.json().get("portfolio"), "bmb")

        # Delete en portfolio BMB
        del_resp = self.client.delete("/api/rotation/holdings/CAT?portfolio=bmb")
        self.assertEqual(del_resp.status_code, 200)

        # Update en fixed income BMB
        fi_update_resp = self.client.post("/api/rotation/fixed_income/update", json={
            "portfolio": "bmb",
            "ticker": "S30S6",
            "nominals": 340000,
            "ppc": 112.50
        })
        self.assertEqual(fi_update_resp.status_code, 200)
        self.assertEqual(fi_update_resp.json().get("data", {}).get("fixed_income_holdings", {}).get("S30S6", {}).get("nominals"), 340000)

        # Delete fixed income BMB
        fi_del_resp = self.client.delete("/api/rotation/fixed_income/S30S6?portfolio=bmb")
        self.assertEqual(fi_del_resp.status_code, 200)
        self.assertNotIn("S30S6", fi_del_resp.json().get("data", {}).get("fixed_income_holdings", {}))

    @patch("services.rotation_service.evaluate_fair_value_signal")
    @patch("services.rotation_service.get_ticker_data")
    def test_neutral_rsi_and_overvaluation_downgrades_to_low_priority(self, mock_ticker_data, mock_gf):
        """
        Verifica que si el RSI está en rango neutral (35 <= RSI <= 65, ej 38.2) y el activo está
        sobrevalorado (ej +118%), la sugerencia NUNCA sea clasificada como 'Alta' sino 'Baja' (esperar).
        """
        mock_ticker_data.side_effect = lambda tk: {
            "V": {"local": 33560.0, "adr": 300.0, "ratio": 1.0, "rsi": 55.1},    # PnL 0%, RSI neutral
            "COST": {"local": 30000.0, "adr": 900.0, "ratio": 48.0, "rsi": 38.2}, # RSI 38.2 (neutral)
            "LLY": {"local": 25000.0, "adr": 850.0, "ratio": 56.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        # Mockear COST como sobrevalorada (+118% sobre fair value)
        mock_gf.side_effect = lambda tk, price, gf_map: {
            "COST": {
                "signal": "overvalued",
                "discount_pct": -118.0,
                "badge_text": "Sobreval. 118%"
            }
        }.get(tk, None)

        # Cartera con superávit de V y déficit de COST en min_drawdown_15
        save_user_holdings({
            "holdings": {
                "V": {"nominals": 12, "ppc": 33560.0}, # Superávit sin ganancia (PnL = 0%)
                "COST": {"nominals": 0, "ppc": None}   # Déficit pero sobrevalorada y RSI 38.2
            },
            "cash_ars": 0.0
        }, portfolio_key="min_drawdown_15")

        res = analyze_rotation("min_drawdown_15")
        
        cost_item = next((it for it in res["items"] if it["ticker"] == "COST"), None)
        v_item = next((it for it in res["items"] if it["ticker"] == "V"), None)
        
        self.assertIsNotNone(cost_item)
        self.assertIsNotNone(v_item)
        
        # RSI 38.2 NO debe ser clasificado como sobreventa (rango neutral 35-65)
        self.assertFalse(cost_item["is_oversold"])
        self.assertTrue(cost_item["is_rsi_neutral"])
        self.assertTrue(cost_item["is_severely_overvalued"])
        self.assertEqual(cost_item["timing_status"], "buy_neutral")
        
        # Verificar que el trade de compra de COST tiene Prioridad Baja (nunca Alta)
        cost_trade = next(
            (t for t in res["rotation_trades"] if (t.get("buy") or {}).get("ticker") == "COST"),
            None
        )
        self.assertIsNotNone(cost_trade)
        self.assertEqual(cost_trade["priority"], "Baja")
        self.assertIn("Cotiza sobrevaluada", cost_trade["buy"]["reason"])

        # Ningún trade en la cartera debe tener Prioridad Alta
        for t in res["rotation_trades"]:
            self.assertNotEqual(t["priority"], "Alta")

    @patch("services.rotation_service.evaluate_fcf_rsi_state")
    @patch("services.rotation_service.evaluate_fair_value_signal")
    @patch("services.rotation_service.get_ticker_data")
    def test_high_priority_requires_confluence(self, mock_ticker_data, mock_gf, mock_pfcf):
        """
        Verifica que 'Prioridad Alta' solo se active cuando hay confluencia:
        RSI en umbral extremo (<= 30) y valuación saludable (subvaluada/fair), o Take Profit / Sobrecompra extrema.
        """
        mock_ticker_data.side_effect = lambda tk: {
            "V": {"local": 45000.0, "adr": 300.0, "ratio": 1.0, "rsi": 72.0},     # Sobrecompra extrema (RSI 72)
            "COST": {"local": 25000.0, "adr": 800.0, "ratio": 48.0, "rsi": 28.0}, # Sobreventa extrema (RSI 28)
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        mock_gf.side_effect = lambda tk, price, gf_map: {
            "COST": {
                "signal": "buy",
                "discount_pct": 20.0,
                "badge_text": "Subval. 20%"
            }
        }.get(tk, None)

        mock_pfcf.side_effect = lambda tk, val, rsi: {
            "COST": {
                "state_key": "optimo",
                "badge_text": "COMPRA ÓPTIMA"
            }
        }.get(tk, None)

        save_user_holdings({
            "holdings": {
                "V": {"nominals": 10, "ppc": 30000.0}, # Superávit + RSI 72
                "COST": {"nominals": 0, "ppc": None}   # Déficit + RSI 28 + Subvaluada
            },
            "cash_ars": 0.0
        }, portfolio_key="min_drawdown_15")

        res = analyze_rotation("min_drawdown_15")
        
        trade = next(
            (t for t in res["rotation_trades"] if (t.get("sell") or {}).get("ticker") == "V" and (t.get("buy") or {}).get("ticker") == "COST"),
            None
        )
        self.assertIsNotNone(trade)
        self.assertEqual(trade["priority"], "Alta")

    @patch("services.rotation_service.get_ticker_data")
    def test_pure_equity_portfolio_makes_fixed_income_completely_invisible(self, mock_ticker_data):
        """
        P0.3: Si la cartera objetivo no tiene Renta Fija (ej. bdi_agresiva),
        los bonos del usuario (S30S6) deben ser COMPLETAMENTE INVISIBLES en el análisis.
        """
        mock_ticker_data.side_effect = lambda tk: {
            "MSFT": {"local": 25000.0, "adr": 400.0, "ratio": 10.0, "rsi": 50.0},
            "NVDA": {"local": 15000.0, "adr": 120.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        # Usuario tiene S30S6 y acciones
        save_user_holdings({
            "holdings": {"MSFT": {"nominals": 5, "ppc": 25000.0}},
            "fixed_income_holdings": {"S30S6": {"nominals": 300000, "ppc": 112.08}},
            "cash_ars": 0.0
        }, portfolio_key="bdi_agresiva")

        res = analyze_rotation("bdi_agresiva")
        item_tickers = [it["ticker"] for it in res["items"]]
        
        # S30S6 no debe existir en los items analizados
        self.assertNotIn("S30S6", item_tickers)
        self.assertIsNone(res.get("fixed_income_summary"))
        
        # Ningún trade debe mencionar S30S6
        for t in res["rotation_trades"]:
            if t.get("sell"):
                self.assertNotEqual(t["sell"]["ticker"], "S30S6")
            if t.get("buy"):
                self.assertNotEqual(t["buy"]["ticker"], "S30S6")

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_fixed_income_quote_base_100_in_items(self, mock_ticker_data, mock_lecaps):
        """
        P0.1: En carteras con Renta Fija (ej. bmb), el precio del item debe mostrar
        Base 100 VN (~112.08) y no valor unitario inflado o desfasado.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 25000.0, "adr": 350.0, "ratio": 20.0, "rsi": 50.0}
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        save_user_holdings({
            "holdings": {},
            "fixed_income_holdings": {"S30S6": {"nominals": 100000, "ppc": 112.08}},
            "cash_ars": 0.0
        }, portfolio_key="bmb")

        res = analyze_rotation("bmb")
        s30s6_item = next((it for it in res["items"] if it["ticker"] == "S30S6"), None)
        self.assertIsNotNone(s30s6_item)
        self.assertAlmostEqual(s30s6_item["price"], 112.08, places=1)
        self.assertAlmostEqual(s30s6_item["real_value"], 112080.0, delta=100.0)

    @patch("services.rotation_service.get_ticker_data")
    def test_varias_ordenes_de_compra_no_superan_el_capital_disponible(self, mock_ticker_data):
        mock_ticker_data.side_effect = lambda tk: {
            "AAPL": {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0},
            "MSFT": {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0},
            "GOOGL": {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        # Cartera con 15.000 ARS de cash (solo alcanza para 1 compra de 10.000)
        save_user_holdings({
            "holdings": {},
            "cash_ars": 15000.0
        }, portfolio_key="min_drawdown_15")

        res = analyze_rotation("min_drawdown_15")
        trades = res["rotation_trades"]
        
        # Verificar que el capital ejecutado no supere el efectivo disponible
        total_executed = sum(
            t["buy"]["recommended_nominals_now"] * t["buy"]["price"]
            for t in trades if t.get("buy")
        )
        self.assertLessEqual(total_executed, 15000.0)

        # Si hay más de un trade de compra, el disponible debe decrementar
        buy_trades = [t for t in trades if t.get("buy")]
        if len(buy_trades) >= 2:
            self.assertGreaterEqual(
                buy_trades[0]["capital_available"],
                buy_trades[1]["capital_available"]
            )

    @patch("services.rotation_service.get_ticker_data")
    def test_cartera_vacia_expone_nominales_objetivo_no_cero(self, mock_ticker_data):
        mock_ticker_data.side_effect = lambda tk: {
            "AAPL": {"local": 1000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0},
            "MSFT": {"local": 1000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 1000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        save_user_holdings({
            "holdings": {},
            "cash_ars": 0.0
        }, portfolio_key="min_drawdown_15")

        res = analyze_rotation("min_drawdown_15")
        target_items = [it for it in res["items"] if it["in_target"]]
        self.assertTrue(len(target_items) > 0)
        # Al menos un activo objetivo debe tener nominales target > 0 gracias a capital_base_for_target
        self.assertTrue(any(it["target_nominals"] > 0 for it in target_items))

    def test_boncap_serie_letra_entra_como_renta_fija_en_rotacion(self):
        save_user_holdings({
            "holdings": {},
            "fixed_income_holdings": {"TMF27": {"nominals": 1000, "ppc": 250.0}},
            "cash_ars": 0.0
        }, portfolio_key="bmb")

        res = analyze_rotation("bmb")
        # TMF27 no debe aparecer en sell_candidates
        sell_tickers = [c["ticker"] for c in res.get("sell_candidates", [])]
        self.assertNotIn("TMF27", sell_tickers)
        for t in res["rotation_trades"]:
            if t.get("sell"):
                self.assertNotEqual(t["sell"]["ticker"], "TMF27")

    def test_holding_sin_ppc_no_rompe_la_persistencia(self):
        """Regresión: nominales > 0 sin PPC no debe persistir None (columna NOT NULL)."""
        save_user_holdings({"holdings": {"GOOGL": {"nominals": 50}}}, portfolio_key="bmb")
        guardada = load_user_holdings("bmb")
        self.assertIn("GOOGL", guardada["holdings"])
        self.assertEqual(guardada["holdings"]["GOOGL"]["nominals"], 50)
        # Nunca None: al leer puede caer al PPC global, pero siempre debe ser numérico
        self.assertIsNotNone(guardada["holdings"]["GOOGL"]["ppc"])
        self.assertIsInstance(guardada["holdings"]["GOOGL"]["ppc"], (int, float))

    def test_bulk_update_acepta_holding_sin_ppc(self):
        """Regresión HTTP 500: la UI informa nominales antes que el PPC."""
        resp = self.client.post(
            "/api/rotation/holdings/bulk_update",
            json={"portfolio": "bmb", "holdings": {"GOOGL": {"nominals": 12}}},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["data"]["holdings"]["GOOGL"]["nominals"], 12)

    def test_actualizar_pesos_de_cartera_existente(self):
        """Los pesos objetivo se actualizan con weights_json (create_json devuelve 409)."""
        resp = self.client.post(
            "/api/portfolios/weights_json/bmb",
            json={"weights_str": "CAT:50,GOOGL:50", "mode": "weights"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["assets"], {"CAT": 50.0, "GOOGL": 50.0})

    def test_fixed_income_sin_ppc_no_rompe_la_persistencia(self):
        """Regresión: renta fija con nominales > 0 sin PPC no debe persistir None (columna NOT NULL)."""
        save_user_holdings({
            "holdings": {},
            "fixed_income_holdings": {"AL30": {"nominals": 100}},
            "cash_ars": 0.0
        }, portfolio_key="bmb")
        guardada = load_user_holdings("bmb")
        self.assertIn("AL30", guardada["fixed_income_holdings"])
        self.assertEqual(guardada["fixed_income_holdings"]["AL30"]["nominals"], 100)
        self.assertIsNotNone(guardada["fixed_income_holdings"]["AL30"]["ppc"])
        self.assertIsInstance(guardada["fixed_income_holdings"]["AL30"]["ppc"], (int, float))

    def test_fixed_income_update_sin_ppc_responde_ok(self):
        """Regresión HTTP 500: informar renta fija sin PPC no debe tumbar el guardado."""
        resp = self.client.post(
            "/api/rotation/fixed_income/update",
            json={"portfolio": "bmb", "ticker": "AL30", "nominals": 100},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        data = resp.json()["data"]
        self.assertEqual(data["fixed_income_holdings"]["AL30"]["nominals"], 100)
        self.assertIsInstance(data["fixed_income_holdings"]["AL30"]["ppc"], (int, float))

    def test_save_multicartera_sin_ppc_no_rompe(self):
        """Regresión: el formato multi-cartera legacy debe normalizar PPC ausente a 0.0, no a None."""
        save_user_holdings({
            "bmb": {
                "holdings": {"GOOGL": {"nominals": 5}},
                "fixed_income_holdings": {"AL30": {"nominals": 100}},
                "cash_ars": 0.0
            },
            "min_drawdown_15": {
                "holdings": {"AAPL": {"nominals": 3}},
                "cash_ars": 0.0
            }
        })
        bmb = load_user_holdings("bmb")
        self.assertIsInstance(bmb["holdings"]["GOOGL"]["ppc"], (int, float))
        self.assertIsInstance(bmb["fixed_income_holdings"]["AL30"]["ppc"], (int, float))
        mdd = load_user_holdings("min_drawdown_15")
        self.assertIsInstance(mdd["holdings"]["AAPL"]["ppc"], (int, float))

    def test_load_all_nunca_normaliza_ppc_a_none(self):
        """Regresión: load_all_user_holdings no puede devolver ppc None (arrastrado a _db.save → float(None))."""
        save_user_holdings({
            "holdings": {"MSFT": {"nominals": 2}},
            "cash_ars": 0.0
        }, portfolio_key="min_drawdown_15")
        all_data = load_all_user_holdings()
        for pf_k, pf_v in all_data.items():
            for grupo in ("holdings", "fixed_income_holdings"):
                for tk, h in pf_v.get(grupo, {}).items():
                    self.assertIsNotNone(h.get("ppc"), f"{pf_k}/{grupo}/{tk} normalizó ppc a None")


if __name__ == "__main__":
    unittest.main()
