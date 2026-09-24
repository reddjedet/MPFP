import unittest
from unittest.mock import patch
from datetime import datetime
import pandas as pd
from fastapi.testclient import TestClient
from main import app
from services.fixed_income_service import (
    calc_spread,
    fit_yield_curve,
    LECAP_BONCAP_SPECS
)

class TestFixedIncomeService(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_fit_yield_curve(self):
        """Verifica el cálculo de curva benchmark teórica y spreads en bps."""
        df = pd.DataFrame([
            {"ticker": "S1", "md": 0.2, "tea": 40.0},
            {"ticker": "S2", "md": 0.5, "tea": 35.0},
            {"ticker": "S3", "md": 1.0, "tea": 32.0},
            {"ticker": "S4", "md": 1.5, "tea": 30.0},
        ])
        res = fit_yield_curve(df, x_col="md", y_col="tea")
        self.assertIn("teorica", res.columns)
        self.assertIn("spread_curva_bps", res.columns)
        self.assertIn("posicion_curva", res.columns)
        self.assertTrue(all(res["teorica"].notna()))
        self.assertTrue(all(res["spread_curva_bps"].notna()))
        self.assertTrue(all(res["posicion_curva"].isin(["arriba", "abajo"])))

    def test_lecap_specs_structure(self):
        """Verifica que el registro de LECAPs y BONCAPs tenga las claves requeridas y contenga S30S6."""
        self.assertGreater(len(LECAP_BONCAP_SPECS), 15)
        self.assertIn("S30S6", LECAP_BONCAP_SPECS)
        self.assertIn("S13N6", LECAP_BONCAP_SPECS)
        self.assertIn("T15E7", LECAP_BONCAP_SPECS)
        for ticker, spec in LECAP_BONCAP_SPECS.items():
            self.assertIn("nombre", spec)
            self.assertIn("emision", spec)
            self.assertIn("vencimiento", spec)
            self.assertIn("tem_emision", spec)
            self.assertIn("tipo", spec)
            self.assertGreater(spec["tem_emision"], 0)

    @patch("services.fixed_income_service.fetch_datos", return_value=[])
    @patch("services.fixed_income_service.fetch_panel")
    def test_endpoint_lecap_curve_filters(self, mock_panel, mock_datos):
        """Verifica filtros por tipo de instrumento (LECAP, BONCAP) en /api/renta_fija/curve_json."""
        mock_panel.return_value = {
            "data": [
                {"symbol": "S30S6 24HS", "trade": 112.08, "volumeAmount": 5000000},
                {"symbol": "T31Y7 24HS", "trade": 115.50, "volumeAmount": 3000000}
            ]
        }
        resp_all = self.client.get("/api/renta_fija/curve_json?category=lecap&tipo_inst=Todos")
        self.assertEqual(resp_all.status_code, 200)
        self.assertIn("S30S6", resp_all.text)

        resp_lecap = self.client.get("/api/renta_fija/curve_json?category=lecap&tipo_inst=LECAP")
        self.assertEqual(resp_lecap.status_code, 200)
        self.assertIn("LECAP", resp_lecap.text)

    @patch("routers.renta_fija.fetch_yield_curve")
    def test_endpoint_hard_dollar_curve_filters(self, mock_curve):
        """Verifica filtros por Ley (Local, NY) en Hard Dollar."""
        mock_df = pd.DataFrame([
            {"ticker": "AL30", "nombre": "Bono USD 2030 Ley Local", "tir": 15.2, "md": 2.1, "ley": "Ley Local", "precio": 65.0, "paridad": 65.0, "spread_curva_bps": 12.0, "posicion_curva": "arriba", "teorica": 15.0},
            {"ticker": "GD30", "nombre": "Bono USD 2030 Ley NY", "tir": 14.5, "md": 2.2, "ley": "Ley NY", "precio": 67.0, "paridad": 67.0, "spread_curva_bps": -15.0, "posicion_curva": "abajo", "teorica": 14.7},
        ])
        mock_curve.return_value = mock_df

        resp_local = self.client.get("/api/renta_fija/curve_json?category=hard_dollar&ley=Ley+Local&rem=30.0&target_tir=0.0")
        self.assertEqual(resp_local.status_code, 200)

        resp_ny = self.client.get("/api/renta_fija/curve_json?category=hard_dollar&ley=Ley+NY&rem=30.0&target_tir=0.0")
        self.assertEqual(resp_ny.status_code, 200)

    def test_lecap_calculation_formulas(self):
        """Verifica las fórmulas matemáticas de VF, TEA, TEM y Duration."""
        d_emis = datetime(2025, 10, 31).date()
        d_vto = datetime(2027, 4, 30).date()
        hoy = datetime(2026, 8, 20).date()
        dias_tot = (d_vto - d_emis).days
        dias = (d_vto - hoy).days
        tem_emis = 0.0255
        precio = 129.95

        vf = 100.0 * ((1.0 + tem_emis) ** (dias_tot / 30.0))
        r = (vf / precio) - 1.0
        tea = ((1.0 + r) ** (365.0 / dias) - 1.0) * 100.0
        tem_mkt = (((1.0 + tea / 100.0) ** (30.0 / 365.0)) - 1.0) * 100.0
        tna = r * (365.0 / dias) * 100.0
        md = (dias / 365.0) / (1.0 + (tea / 100.0))

        self.assertGreater(vf, 150.0)
        self.assertGreater(tea, 20.0)
        self.assertLess(tea, 60.0)
        self.assertGreater(tna, 15.0)
        self.assertLess(tna, 55.0)
        self.assertGreater(tem_mkt, 1.5)
        self.assertLess(tem_mkt, 4.0)
        self.assertGreater(md, 0.3)
        self.assertLess(md, 1.0)

    def test_calc_spread(self):
        """Verifica el cálculo de spread respecto a un benchmark."""
        df = pd.DataFrame([
            {"ticker": "AL30", "tir": 15.0},
            {"ticker": "GD30", "tir": 14.2},
            {"ticker": "AL35", "tir": 16.5}
        ])
        res = calc_spread(df, "AL30")
        self.assertEqual(res.loc[res["ticker"] == "AL30", "spread"].iloc[0], 0.0)
        self.assertEqual(res.loc[res["ticker"] == "GD30", "spread"].iloc[0], -0.8)
        self.assertEqual(res.loc[res["ticker"] == "AL35", "spread"].iloc[0], 1.5)

    @patch("services.fixed_income_service.fetch_datos", return_value=[])
    @patch("services.fixed_income_service.fetch_panel")
    def test_endpoint_lecap_curve(self, mock_panel, mock_datos):
        """Verifica que el endpoint /api/renta_fija/curve_json responda datos válidos para LECAPs."""
        mock_panel.return_value = {
            "data": [
                {"symbol": "S30S6 24HS", "trade": 112.08, "volumeAmount": 5000000}
            ]
        }
        resp = self.client.get("/api/renta_fija/curve_json?category=lecap")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("table_data", resp.text)
        self.assertIn("tea", resp.text)

    @patch("routers.renta_fija.fetch_yield_curve")
    def test_endpoint_hard_dollar_curve(self, mock_curve):
        """Verifica el endpoint para Hard Dollar."""
        mock_df = pd.DataFrame([
            {"ticker": "AL30", "nombre": "Bono USD 2030 Ley Local", "tir": 15.2, "md": 2.1, "ley": "Ley Local", "precio": 65.0, "paridad": 65.0, "spread_curva_bps": 12.0, "posicion_curva": "arriba", "teorica": 15.0},
        ])
        mock_curve.return_value = mock_df
        resp = self.client.get("/api/renta_fija/curve_json?category=hard_dollar&ley=Ambas&rem=30.0&target_tir=0.0")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Bono", resp.text)

    @patch("routers.renta_fija.fetch_yield_curve")
    def test_endpoint_soberanos_category_alias(self, mock_curve):
        """Verifica que category=soberanos funcione de forma equivalente a hard_dollar."""
        mock_df = pd.DataFrame([
            {"ticker": "GD30", "nombre": "Bono USD 2030 Ley NY", "tir": 14.5, "md": 2.2, "ley": "Ley NY", "tipo": "Ley NY", "precio": 67.0, "paridad": 67.0, "spread_curva_bps": -15.0, "posicion_curva": "abajo", "teorica": 14.7},
        ])
        mock_curve.return_value = mock_df
        resp = self.client.get("/api/renta_fija/curve_json?category=soberanos&ley=Ambas")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("GD30", resp.text)
        mock_curve.assert_called_with("soberanos")

    def test_calculate_irr_and_duration_numerical(self):
        """Verifica el cálculo cuantitativo exacto de TIR y Modified Duration."""
        from services.fixed_income_service import calculate_irr_and_duration
        cfs = [(0.5, 4.0), (1.0, 8.0), (1.5, 8.0), (2.0, 8.0), (2.5, 8.0), (3.0, 8.0), (3.5, 8.0), (4.0, 56.0)]
        tir, md = calculate_irr_and_duration(65.0, cfs)
        self.assertIsNotNone(tir)
        self.assertIsNotNone(md)
        self.assertGreater(tir, 15.0)
        self.assertLess(tir, 25.0)
        self.assertGreater(md, 1.5)
        self.assertLess(md, 3.5)

    def test_calc_spread_numeric_and_lecap(self):
        """Verifica que calc_spread soporte tanto benchmarks numéricos como DataFrames con columna 'tea'."""
        df_lecap = pd.DataFrame([
            {"ticker": "S30S6", "tea": 38.5},
            {"ticker": "S15D6", "tea": 36.0},
        ])
        # Test con float numérico
        res_num = calc_spread(df_lecap, 35.0)
        self.assertEqual(res_num.loc[res_num["ticker"] == "S30S6", "spread"].iloc[0], 3.5)
        self.assertEqual(res_num.loc[res_num["ticker"] == "S15D6", "spread"].iloc[0], 1.0)

        # Test con ticker de LECAP
        res_tk = calc_spread(df_lecap, "S15D6")
        self.assertEqual(res_tk.loc[res_tk["ticker"] == "S30S6", "spread"].iloc[0], 2.5)
        self.assertEqual(res_tk.loc[res_tk["ticker"] == "S15D6", "spread"].iloc[0], 0.0)

    @patch("routers.renta_fija.fetch_yield_curve")
    def test_endpoint_hard_dollar_highlights_best_tir_and_currency(self, mock_curve):
        """Verifica que highlights.best_tir se calcule para bonos con columna 'tir' y que most_liquid use U$."""
        mock_df = pd.DataFrame([
            {"ticker": "AL30", "nombre": "Bono USD 2030", "tir": 16.8, "md": 2.1, "ley": "Ley Local", "tipo": "Ley Local", "precio": 65.0, "monto": 2500000.0, "moneda": "USD", "paridad": 75.0, "posicion_curva": "arriba", "spread_curva_bps": 50, "teorica": 16.3},
            {"ticker": "GD30", "nombre": "Bono USD 2030 NY", "tir": 15.2, "md": 2.2, "ley": "Ley NY", "tipo": "Ley NY", "precio": 67.0, "monto": 5000000.0, "moneda": "USD", "paridad": 77.0, "posicion_curva": "abajo", "spread_curva_bps": -30, "teorica": 15.5},
        ])
        mock_curve.return_value = mock_df
        resp = self.client.get("/api/renta_fija/curve_json?category=soberanos&ley=Ambas")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("highlights", data)
        hl = data["highlights"]
        self.assertIn("best_tir", hl)
        self.assertEqual(hl["best_tir"]["ticker"], "AL30")
        self.assertEqual(hl["best_tir"]["val"], "16.8%")
        self.assertIn("most_liquid", hl)
        self.assertEqual(hl["most_liquid"]["ticker"], "GD30")
        self.assertTrue(hl["most_liquid"]["val"].startswith("U$"))

    @patch("services.cache_service._load_disk_cache", return_value={})
    @patch("services.cache_service._save_disk_cache")
    def test_smart_cache_dataframe_support(self, mock_save, mock_load):
        """Verifica que smart_cache maneje correctamente DataFrames sin fallos de serialización JSON."""
        from services.cache_service import smart_cache

        call_count = 0
        @smart_cache("static", maxsize=10)
        def dummy_df_fetcher(name: str):
            nonlocal call_count
            call_count += 1
            return pd.DataFrame([{"symbol": name, "val": 100.0}])

        df1 = dummy_df_fetcher("test_sym")
        self.assertIsInstance(df1, pd.DataFrame)
        self.assertEqual(df1.iloc[0]["symbol"], "test_sym")
        self.assertEqual(call_count, 1)

        # Segunda llamada debe servirse del caché
        df2 = dummy_df_fetcher("test_sym")
        self.assertEqual(call_count, 1)
        self.assertEqual(df2.iloc[0]["val"], 100.0)

if __name__ == "__main__":
    unittest.main()

