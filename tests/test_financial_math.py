import unittest
from unittest.mock import patch

from services.financial_units import normalize_fixed_income_price, to_base_100
from services.fixed_income_service import calculate_irr_and_duration
import tempfile
from pathlib import Path
from services.rotation_service import analyze_rotation, save_user_holdings, _db, load_all_user_holdings
from services.ppc_service import _db as _ppc_db, load_ppc_values


class TestFinancialMath(unittest.TestCase):
    """
    Suite de protección de fórmulas financieras y valuación patrimonial (TEST-MATH-01).
    Garantiza que errores críticos como DASH-01 (factor 100x), DASH-02 (doble conteo)
    y DASH-03 (venta espuria de renta fija) no puedan regresar al repositorio.
    """

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

    @classmethod
    def tearDownClass(cls):
        _db.file_path = cls._orig_path
        _db._cache = None
        _db._cache_valid = False
        
        _ppc_db.file_path = cls._orig_ppc_path
        _ppc_db._cache = None
        _ppc_db._cache_valid = False
        cls._tmp_dir.cleanup()

    def test_normalize_fixed_income_price_base_100(self):
        """
        DASH-01 / MATH-07: Verifica que un precio cotizado cada 100 VN
        se convierta exactamente a su valor unitario por VN.
        """
        # S30S6 cotizando a 112.08 cada 100 VN -> 1.1208 ARS por VN
        self.assertAlmostEqual(normalize_fixed_income_price(112.08), 1.1208, places=4)
        # T31Y7 cotizando a 115.50 cada 100 VN -> 1.1550 ARS por VN
        self.assertAlmostEqual(normalize_fixed_income_price(115.50), 1.1550, places=4)
        # Bono AL30 cotizando a 58.50 USD cada 100 VN -> 0.5850 USD por VN
        self.assertAlmostEqual(normalize_fixed_income_price(58.50), 0.5850, places=4)

    def test_normalize_fixed_income_price_already_unit(self):
        """Verifica que precios ya expresados por VN (< 10) se preserven."""
        self.assertAlmostEqual(normalize_fixed_income_price(1.1208), 1.1208, places=4)
        self.assertAlmostEqual(normalize_fixed_income_price(0.5850), 0.5850, places=4)
        self.assertEqual(normalize_fixed_income_price(0.0), 0.0)
        self.assertEqual(normalize_fixed_income_price(None), 0.0)

    def test_to_base_100_conversion(self):
        """Verifica la conversión inversa a base 100 para pantallas de mercado."""
        self.assertAlmostEqual(to_base_100(1.1208), 112.08, places=2)
        self.assertAlmostEqual(to_base_100(0.585), 58.50, places=2)
        self.assertAlmostEqual(to_base_100(112.08), 112.08, places=2)

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_s30s6_valuation_no_inflation_factor(self, mock_ticker_data, mock_lecaps):
        """
        DASH-01: 335.457 nominales de S30S6 a PPC 112.08 deben valuarse en
        ~375.979 ARS, NUNCA en ~37.597.000 ARS (error de factor 100x).
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "AMAT": {"local": 90000.0, "adr": 180.0, "ratio": 15.0, "rsi": 50.0},
            "GOOGL": {"local": 8000.0, "adr": 180.0, "ratio": 58.0, "rsi": 50.0},
            "PM": {"local": 15000.0, "adr": 100.0, "ratio": 12.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        save_user_holdings({
            "holdings": {},
            "fixed_income_holdings": {
                "S30S6": {"nominals": 335457, "ppc": 112.08}
            },
            "cash_ars": 0.0
        }, portfolio_key="bmb")

        res = analyze_rotation("bmb")
        s30s6_item = next((it for it in res["items"] if it["ticker"] == "S30S6"), None)
        self.assertIsNotNone(s30s6_item)

        # 335.457 nominales * 1.1208 ARS = 375.980,21 ARS (con redondeo a 4 dec: 375.979,21)
        expected_unit_val = 335457 * 1.1208
        self.assertAlmostEqual(s30s6_item["real_value"], expected_unit_val, delta=50.0)
        self.assertLess(s30s6_item["real_value"], 1000000.0)  # Totalmente alejado de los 37 millones

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_consolidated_equity_no_double_counting(self, mock_ticker_data, mock_lecaps):
        """
        DASH-02: El patrimonio consolidado debe ser exactamente igual a
        total_real_stock_value + fi_market_val + cash_ars sin sumar renta fija dos veces.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "AMAT": {"local": 90000.0, "adr": 180.0, "ratio": 15.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        save_user_holdings({
            "holdings": {
                "AMAT": {"nominals": 2, "ppc": 90000.0}  # 2 * 90.000 = 180.000 ARS
            },
            "fixed_income_holdings": {
                "S30S6": {"nominals": 100000, "ppc": 112.00}  # 100.000 * 1.12 = 112.000 ARS
            },
            "cash_ars": 50000.0  # 50.000 ARS
        }, portfolio_key="bmb")

        res = analyze_rotation("bmb")
        
        # total_real_stock_value = 180.000 ARS
        # cash_ars = 50.000 ARS
        # total_real_equity = 230.000 ARS
        # fi_market_val = 112.000 ARS
        # total_consolidated_equity = 230.000 + 112.000 = 342.000 ARS
        self.assertEqual(res["total_real_stock_value"], 180000.0)
        self.assertEqual(res["total_real_equity"], 230000.0)
        self.assertAlmostEqual(res["total_consolidated_equity"], 342000.0, delta=100.0)

    @patch("services.rotation_service.get_ticker_data")
    def test_fixed_income_not_sold_for_equity(self, mock_ticker_data):
        """
        DASH-03 / DEC-03: Instrumentos de renta fija como S30S6 nunca deben aparecer
        en las sugerencias de venta ni emparejarse con compras de acciones (ej. VIST).
        """
        mock_ticker_data.side_effect = lambda tk: {
            "VIST": {"local": 38000.0, "adr": 50.0, "ratio": 3.0, "rsi": 25.0}, # Déficit + RSI sobreventa
            "GOOGL": {"local": 8000.0, "adr": 180.0, "ratio": 58.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        save_user_holdings({
            "holdings": {},
            "fixed_income_holdings": {
                "S30S6": {"nominals": 335457, "ppc": 112.08}
            },
            "cash_ars": 0.0
        }, portfolio_key="bmb")

        res = analyze_rotation("bmb")

        # 1. S30S6 debe tener status 'preserved'
        s30s6_item = next((it for it in res["items"] if it["ticker"] == "S30S6"), None)
        self.assertIsNotNone(s30s6_item)
        self.assertEqual(s30s6_item["status"], "preserved")

        # 2. En rotation_trades NUNCA debe haber venta de S30S6
        for trade in res["rotation_trades"]:
            if trade.get("sell"):
                self.assertNotEqual(trade["sell"]["ticker"], "S30S6")

    def test_analytical_irr_and_duration(self):
        """
        Verifica el cálculo de TIR y Modified Duration para un bono bullet estándar.
        Precio: 100 USD. Flujo: 10 USD a 1 año + 110 USD a 2 años.
        La TIR analítica exacta debe ser exactamente 10.0%.
        """
        cash_flows = [(1.0, 10.0), (2.0, 110.0)]
        tir, md = calculate_irr_and_duration(100.0, cash_flows)
        self.assertIsNotNone(tir)
        self.assertIsNotNone(md)
        self.assertAlmostEqual(tir, 10.0, places=1)
        # Duration de bono bullet con cupón debe ser estrictamente menor a su vencimiento (2 años)
        self.assertGreater(md, 1.5)
        self.assertLess(md, 2.0)


    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_mcm_rotation_cat_target_8_real_3_buys_5(self, mock_ticker_data, mock_lecaps):
        """
        DEC-07 / DASH-05: CAT actual 3, target MCM 8, RSI neutral:
        recomienda comprar exactamente 5 con prioridad Baja/Media, no una cantidad arbitraria.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 10000.0, "adr": 200.0, "ratio": 1.0, "rsi": 50.0},
            "VIST": {"local": 10000.0, "adr": 50.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        # CAT=80, VIST=10: Cuello de botella VIST(10), base MCM: CAT=8, VIST=1
        custom_pf = {
            "mode": "weights",
            "assets": {"CAT": 80.0, "VIST": 10.0},
            "asset_allocation": {"equity_weight": 100.0, "fixed_income_weight": 0.0}
        }

        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 3, "ppc": 10000.0},
                "VIST": {"nominals": 1, "ppc": 10000.0}
            },
            "cash_ars": 100000.0
        }, portfolio_key="test_mcm")

        res = analyze_rotation("test_mcm", portfolio_data=custom_pf)
        cat_item = next((it for it in res["items"] if it["ticker"] == "CAT"), None)
        self.assertIsNotNone(cat_item)
        self.assertEqual(cat_item["target_nominals"], 8)
        self.assertEqual(cat_item["real_nominals"], 3)
        self.assertEqual(cat_item["delta_nominals"], -5)
        self.assertEqual(cat_item["missing_nominals"], 5)
        self.assertEqual(cat_item["status"], "deficit")

        cat_trade = next((t for t in res["rotation_trades"] if (t.get("buy") or {}).get("ticker") == "CAT"), None)
        self.assertIsNotNone(cat_trade)
        self.assertEqual(cat_trade["buy"]["nominals"], 5)
        self.assertNotEqual(cat_trade["priority"], "Alta")  # Neutral RSI -> No puede ser Alta

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_mcm_rotation_overbought_triggers_wait_pullback(self, mock_ticker_data, mock_lecaps):
        """
        DEC-07 / DEC-05: CAT actual 3, target MCM 8, pero RSI en sobrecompra (72.0):
        conserva el target y faltante, pero veta la compra inmediata marcando wait_pullback.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 10000.0, "adr": 200.0, "ratio": 1.0, "rsi": 72.0},
            "VIST": {"local": 10000.0, "adr": 50.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        custom_pf = {
            "mode": "weights",
            "assets": {"CAT": 80.0, "VIST": 10.0},
            "asset_allocation": {"equity_weight": 100.0, "fixed_income_weight": 0.0}
        }

        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 3, "ppc": 10000.0},
                "VIST": {"nominals": 1, "ppc": 10000.0}
            },
            "cash_ars": 100000.0
        }, portfolio_key="test_mcm_overbought")

        res = analyze_rotation("test_mcm_overbought", portfolio_data=custom_pf)
        cat_item = next((it for it in res["items"] if it["ticker"] == "CAT"), None)
        self.assertIsNotNone(cat_item)
        self.assertEqual(cat_item["target_nominals"], 8)
        self.assertEqual(cat_item["missing_nominals"], 5)
        self.assertTrue(cat_item["is_buy_blocked"])
        self.assertEqual(cat_item["timing_status"], "wait_pullback")

        # La compra inmediata queda bloqueada en rotation_trades
        cat_buys = [t["buy"]["ticker"] for t in res["rotation_trades"] if t.get("buy")]
        self.assertNotIn("CAT", cat_buys)

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_surplus_sells_only_excess_not_full_position(self, mock_ticker_data, mock_lecaps):
        """
        DEC-07 / DEC-04: Activo en target con tenencia 12 y target 8 (excedente 4), con RSI alto (72.0):
        recomienda vender SOLO el excedente de 4 nominales, jamás la posición total de 12.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 10000.0, "adr": 200.0, "ratio": 1.0, "rsi": 72.0},
            "VIST": {"local": 10000.0, "adr": 50.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        custom_pf = {
            "mode": "weights",
            "assets": {"CAT": 80.0, "VIST": 10.0},
            "asset_allocation": {"equity_weight": 100.0, "fixed_income_weight": 0.0}
        }

        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 12, "ppc": 10000.0},  # Target es 8 -> excedente es 4
                "VIST": {"nominals": 0, "ppc": None}
            },
            "cash_ars": 0.0
        }, portfolio_key="test_surplus")

        res = analyze_rotation("test_surplus", portfolio_data=custom_pf)
        cat_item = next((it for it in res["items"] if it["ticker"] == "CAT"), None)
        self.assertIsNotNone(cat_item)
        self.assertEqual(cat_item["target_nominals"], 8)
        self.assertEqual(cat_item["delta_nominals"], 4)
        self.assertEqual(cat_item["status"], "surplus")

        cat_sell = next((t for t in res["rotation_trades"] if (t.get("sell") or {}).get("ticker") == "CAT"), None)
        self.assertIsNotNone(cat_sell)
        self.assertEqual(cat_sell["sell"]["nominals"], 4)  # Solo vende el excedente de 4, no 12!

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_insufficient_cash_triggers_wait_cash_without_reducing_target(self, mock_ticker_data, mock_lecaps):
        """
        DEC-09 / DASH-04: Activo con déficit de 5 nominales a $10.000 ($50.000 requeridos)
        con caja insuficiente ($5.000): action es 'wait_cash', preservando missing_nominals=5.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 10000.0, "adr": 200.0, "ratio": 1.0, "rsi": 50.0},
            "VIST": {"local": 10000.0, "adr": 50.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        custom_pf = {
            "mode": "weights",
            "assets": {"CAT": 80.0, "VIST": 10.0},
            "asset_allocation": {"equity_weight": 100.0, "fixed_income_weight": 0.0}
        }

        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 3, "ppc": 10000.0},
                "VIST": {"nominals": 1, "ppc": 10000.0}
            },
            "cash_ars": 5000.0  # Solo $5.000 (precio de CAT es $10.000, 0 nominales posibles)
        }, portfolio_key="test_wait_cash")

        res = analyze_rotation("test_wait_cash", portfolio_data=custom_pf)
        cat_trade = next((t for t in res["rotation_trades"] if (t.get("buy") or {}).get("ticker") == "CAT"), None)
        self.assertIsNotNone(cat_trade)
        self.assertEqual(cat_trade["buy"]["nominals"], 5)
        self.assertEqual(cat_trade["buy"]["missing_nominals"], 5)
        self.assertEqual(cat_trade["buy"]["recommended_nominals_now"], 0)
        self.assertEqual(cat_trade["buy"]["action"], "wait_cash")
        self.assertEqual(cat_trade["buy"]["capital_required"], 50000.0)
        self.assertEqual(cat_trade["buy"]["capital_available"], 5000.0)

    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_fixed_income_implicit_target_no_gap(self, mock_ticker_data, mock_lecaps):
        """
        DEC-01 / DEC-07: Si la cartera no tiene configurada asignación de renta fija explícita,
        el objetivo implícito coincide con la asignación real actual, fixed_income_gap_pct es 0.0
        y la renta fija permanece preservada.
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 10000.0, "adr": 200.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        # Según la Regla Canónica de Invisibilidad Absoluta (arreglar.md), si la cartera
        # NO tiene renta fija configurada, la renta fija del usuario debe permanecer COMPLETAMENTE INVISIBLE.
        # Por lo tanto, el patrimonio analizado es 100% RV y no se agregan items de RF.
        custom_pf = {
            "mode": "weights",
            "assets": {"CAT": 100.0}
        }

        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 10, "ppc": 10000.0}  # $100.000 ARS
            },
            "fixed_income_holdings": {
                "S30S6": {"nominals": 100000, "ppc": 1.0}  # $100.000 ARS
            },
            "cash_ars": 0.0
        }, portfolio_key="test_fi_implicit")

        res = analyze_rotation("test_fi_implicit", portfolio_data=custom_pf)
        status = res["asset_allocation_status"]
        self.assertEqual(status["fixed_income_target_source"], "implicit_current")
        self.assertEqual(status["real_fixed_income_pct"], 0.0)
        self.assertEqual(status["target_fixed_income_pct"], 0.0)
        self.assertEqual(status["fixed_income_gap_pct"], 0.0)
        self.assertEqual(status["equity_gap_pct"], 0.0)

        s30s6_item = next((it for it in res["items"] if it["ticker"] == "S30S6"), None)
        self.assertIsNone(s30s6_item)


    @patch("services.fixed_income_service.fetch_lecaps")
    @patch("services.rotation_service.get_ticker_data")
    def test_mcm_multiplier_3x_structural_target_preserved_with_partial_budget(self, mock_ticker_data, mock_lecaps):
        """
        DEC-09: Cartera con multiplicador perseguido 3x:
        Base MCM de CAT es 8 -> Objetivo 3x es 24 nominales.
        Tenencia actual: 3 nominales -> Faltante estructural: 21 nominales ($210.000).
        Presupuesto disponible: $50.000 -> Compra posible ahora: 5 nominales.
        Verifica que el presupuesto no altera el faltante estructural (21).
        """
        mock_lecaps.return_value = None
        mock_ticker_data.side_effect = lambda tk: {
            "CAT": {"local": 10000.0, "adr": 200.0, "ratio": 1.0, "rsi": 50.0},
            "VIST": {"local": 10000.0, "adr": 50.0, "ratio": 1.0, "rsi": 50.0},
        }.get(tk, {"local": 10000.0, "adr": 100.0, "ratio": 1.0, "rsi": 50.0})

        custom_pf = {
            "mode": "weights",
            "assets": {"CAT": 80.0, "VIST": 10.0},
            "target_multiplier": 3,
            "asset_allocation": {"equity_weight": 100.0, "fixed_income_weight": 0.0}
        }

        save_user_holdings({
            "holdings": {
                "CAT": {"nominals": 3, "ppc": 10000.0},
                "VIST": {"nominals": 3, "ppc": 10000.0}
            },
            "cash_ars": 50000.0  # Presupuesto de $50.000
        }, portfolio_key="test_mcm_3x")

        res = analyze_rotation("test_mcm_3x", portfolio_data=custom_pf)
        cat_item = next((it for it in res["items"] if it["ticker"] == "CAT"), None)
        self.assertIsNotNone(cat_item)
        self.assertEqual(cat_item["target_nominals"], 24)
        self.assertEqual(cat_item["real_nominals"], 3)
        self.assertEqual(cat_item["delta_nominals"], -21)
        self.assertEqual(cat_item["missing_nominals"], 21)

        cat_trade = next((t for t in res["rotation_trades"] if (t.get("buy") or {}).get("ticker") == "CAT"), None)
        self.assertIsNotNone(cat_trade)
        # El faltante estructural sigue siendo 21
        self.assertEqual(cat_trade["buy"]["nominals"], 21)
        self.assertEqual(cat_trade["buy"]["missing_nominals"], 21)
        # La compra ejecutable ahora bajo el presupuesto es de 5 nominales ($50.000 / $10.000)
        self.assertEqual(cat_trade["buy"]["recommended_nominals_now"], 5)
        self.assertEqual(cat_trade["buy"]["action"], "buy")
        self.assertEqual(cat_trade["buy"]["capital_required"], 210000.0)
        self.assertEqual(cat_trade["buy"]["capital_available"], 50000.0)

    def test_calculate_rsi_primeras_barras_son_nan(self):
        """Bug 17: El RSI no está definido hasta tener `period` barras."""
        import numpy as np
        import pandas as pd
        from services.cedear_service import calculate_rsi

        prices = pd.Series([10.0 + i for i in range(30)])
        rsi = calculate_rsi(prices, period=14)

        # Las primeras 14 barras deben ser NaN
        self.assertTrue(np.isnan(rsi.iloc[0]))
        self.assertTrue(np.isnan(rsi.iloc[13]))
        # A partir de period (14), debe haber un valor numérico válido
        self.assertFalse(np.isnan(rsi.iloc[14]))
        self.assertTrue(0.0 <= rsi.iloc[14] <= 100.0)

    def test_calculate_rsi_converge_a_wilder(self):
        """Bug 17: Validar que una serie constante de subidas converge hacia 100."""
        import pandas as pd
        from services.cedear_service import calculate_rsi

        prices = pd.Series([100.0 + i * 2.0 for i in range(50)])
        rsi = calculate_rsi(prices, period=14)
        self.assertAlmostEqual(rsi.iloc[-1], 100.0, places=1)


if __name__ == "__main__":
    unittest.main()

