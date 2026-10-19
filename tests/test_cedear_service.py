import unittest
import pandas as pd
from services.cedear_service import calculate_rsi, CEDEAR_RATIOS

class TestCedearService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from tests.portfolio_fixtures import seed_required_portfolios
        seed_required_portfolios()

    def test_calculate_rsi_wilder_math(self):
        # Escenario controlado: 14 días de subida constante de 1 unidad
        # Ganancia promedio = 1.0, Pérdida promedio = 0.0 -> RSI = 100
        prices_up = pd.Series([100.0 + i for i in range(20)])
        rsi_up = calculate_rsi(prices_up, period=14)
        self.assertEqual(rsi_up.iloc[-1], 100.0)

        # Escenario controlado: 14 días de bajada constante de 1 unidad
        # Ganancia promedio = 0.0, Pérdida promedio = 1.0 -> RSI = 0
        prices_down = pd.Series([100.0 - i for i in range(20)])
        rsi_down = calculate_rsi(prices_down, period=14)
        self.assertEqual(rsi_down.iloc[-1], 0.0)

    def test_calculate_rsi_flat_price(self):
        # Escenario de precio congelado/plano
        # Ganancia = 0, Pérdida = 0 -> RSI = 50.0 por convención de estabilidad
        prices_flat = pd.Series([100.0 for _ in range(20)])
        rsi_flat = calculate_rsi(prices_flat, period=14)
        self.assertEqual(rsi_flat.iloc[-1], 50.0)

    def test_cedear_ratios_exist(self):
        self.assertIn("AAPL", CEDEAR_RATIOS)
        self.assertIn("GOOGL", CEDEAR_RATIOS)
        self.assertIn("MSFT", CEDEAR_RATIOS)
        self.assertIn("NU", CEDEAR_RATIOS)
        self.assertIn("CEG", CEDEAR_RATIOS)
        self.assertIn("NEE", CEDEAR_RATIOS)
        self.assertEqual(CEDEAR_RATIOS["NEE"], 19.0)
        self.assertGreater(CEDEAR_RATIOS["AAPL"], 0)
        self.assertEqual(CEDEAR_RATIOS["GEV"], 180.0)
        self.assertEqual(CEDEAR_RATIOS["ISRG"], 90.0)

    def test_catalog_matches_byma_official_ratios(self):
        """Regresión del refresco contra la lista oficial de BYMA.

        El catálogo venía de una tabla de Comafi con 182 CEDEARs menos, por lo
        que el armador rechazaba 161 CEDEARs negociables (CRWD, PANW, CIBR,
        MRVL...). Estos pines detectan tanto una vuelta al origen viejo como
        un ratio placeholder (varioscekears tenían 1 sin informar).
        """
        from services.cedear_service import get_cedear_ratio

        esperado = {
            "PANW": 50.0,   # Palo Alto Networks
            "CRWD": 79.0,   # CrowdStrike
            "CIBR": 10.0,   # First Trust NASDAQ Cybersecurity
            "MRVL": 14.0,   # Marvell
            "NBIS": 27.0,   # Nebius
            "GEV": 180.0,   # GE Vernova
            "XLU": 15.0,    # Utilities Select Sector SPDR
            "AAPL": 20.0,
            "NVDA": 24.0,
        }
        for ticker, ratio in esperado.items():
            with self.subTest(ticker=ticker):
                self.assertEqual(get_cedear_ratio(ticker), ratio)

    def test_no_placeholder_ratios_left_in_catalog(self):
        """Un ratio de 1 con subyacente caro es un placeholder, no un dato.

        Se comparan contra el precio relativo: si 1 CEDEAR vale lo mismo que
        1 acción, el ratio 1 sólo puede ser real para subyacentes baratos.
        """
        from services.cedear_service import get_cedear_ratio

        # Underlying en USD > 100 USD con ratio 1: el catálogo está mintiendo.
        caros_en_1_a_1 = ["GEV", "CRWV", "MRVL", "NBIS", "GEV", "RGTI", "FCX"]
        for ticker in caros_en_1_a_1:
            with self.subTest(ticker=ticker):
                ratio = get_cedear_ratio(ticker)
                self.assertIsNotNone(ratio, f"{ticker} deberia estar catalogado")
                self.assertGreater(ratio, 1.0, f"{ticker} quedo como ratio 1:1")

    def test_retired_tickers_are_rejected_and_aliases_still_work(self):
        """BYMA cambió de símbolo varios CEDEARs: el viejo se rechaza, el alias no."""
        from services.cedear_service import get_cedear_ratio
        from services.portfolio_service import find_non_cedear_tickers

        # Tickers que BYMA ya no publica (incluye SI: emisor quebrado en 2023).
        self.assertEqual(
            find_non_cedear_tickers(["ACH", "CHA", "WBK", "TEFO", "SI"]),
            ["ACH", "CHA", "SI", "TEFO", "WBK"],
        )
        # Alias de símbolos retirados por BYMA, con su ticker vigente.
        self.assertEqual(
            find_non_cedear_tickers(["DIS", "FB", "SQ", "TX", "TSU", "X", "GOLD", "NU"]),
            [],
        )
        for alias, ratio in (("DIS", 12.0), ("FB", 24.0), ("SQ", 20.0),
                             ("TX", 4.0), ("GOLD", 2.0), ("NU", 2.0)):
            with self.subTest(alias=alias):
                self.assertEqual(get_cedear_ratio(alias), ratio)

    def test_sync_prunes_tickers_that_byma_retired(self):
        """Sin prune, un ticker dado de baja queda aceptando carteras para siempre."""
        from pathlib import Path
        from tempfile import TemporaryDirectory

        from services.atomic_persistence import AtomicJsonDatabase
        from services.cedear_service import _sync_cedear_ratios

        scratch_dir = Path(__file__).resolve().parents[1] / "scratch"
        with TemporaryDirectory(dir=scratch_dir) as temp_dir:
            ratios_db = AtomicJsonDatabase(Path(temp_dir) / "cedear_ratios.json")
            ratios_db.save({"AAPL": 20.0, "SI": 10.0, "WBK": 3.0})

            _sync_cedear_ratios(ratios_db, {"AAPL": 20.0, "PANW": 50.0})

            stored = ratios_db.load()
            self.assertEqual(stored["AAPL"], 20.0)
            self.assertEqual(stored["PANW"], 50.0)
            self.assertNotIn("SI", stored)
            self.assertNotIn("WBK", stored)

    def test_backfill_inserts_missing_ratios_and_corrects_drift(self):
        """El JSON versionado es la fuente de verdad: inserta altas y realinea divergencias."""
        from pathlib import Path
        from tempfile import TemporaryDirectory

        from services.atomic_persistence import AtomicJsonDatabase
        from services.cedear_service import _sync_cedear_ratios

        scratch_dir = Path(__file__).resolve().parents[1] / "scratch"
        with TemporaryDirectory(dir=scratch_dir) as temp_dir:
            ratios_db = AtomicJsonDatabase(Path(temp_dir) / "cedear_ratios.json")
            # Store replicando el drift histórico: valores viejos de la tabla SQLite.
            ratios_db.save({"SPY": 20.0, "SNDK": 1.0})

            _sync_cedear_ratios(
                ratios_db,
                {"SPY": 60.0, "SNDK": 170.0, "MRNA": 19.0},
            )

            stored = ratios_db.load()
            self.assertEqual(stored["SPY"], 60.0)
            self.assertEqual(stored["SNDK"], 170.0)
            self.assertEqual(stored["MRNA"], 19.0)

    def test_ratio_sync_skips_unusable_seed_values(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory

        from services.atomic_persistence import AtomicJsonDatabase
        from services.cedear_service import _sync_cedear_ratios

        scratch_dir = Path(__file__).resolve().parents[1] / "scratch"
        with TemporaryDirectory(dir=scratch_dir) as temp_dir:
            ratios_db = AtomicJsonDatabase(Path(temp_dir) / "cedear_ratios.json")
            ratios_db.save({"SPY": 60.0})

            _sync_cedear_ratios(ratios_db, {
                "SPY": 60.0, "ZERO": 0.0, "NEG": -4.0,
                "NAN": float("nan"), "FLAG": True, "TXT": "veinte",
            })

            stored = ratios_db.load()
            self.assertEqual(stored["SPY"], 60.0)
            for ticker in ("ZERO", "NEG", "NAN", "FLAG", "TXT"):
                self.assertNotIn(ticker, stored)

    def test_ratio_alias_resolves_brk_dot_b_to_brkb(self):
        """BRK.B es la forma de TradingView/GuruFocus y debe heredar el ratio de BRKB."""
        from services.cedear_service import CEDEAR_RATIOS, get_cedear_ratio, load_cedear_ratios

        ratios = load_cedear_ratios()
        self.assertEqual(ratios["BRK.B"], 22.0)
        self.assertEqual(CEDEAR_RATIOS["BRK.B"], 22.0)
        self.assertEqual(get_cedear_ratio("BRK.B"), 22.0)
        self.assertEqual(get_cedear_ratio("brk.b"), 22.0)

    def test_mrna_ratio_is_catalogued(self):
        from services.cedear_service import CEDEAR_RATIOS, get_cedear_ratio

        self.assertIn("MRNA", CEDEAR_RATIOS)
        self.assertEqual(get_cedear_ratio("MRNA"), 19.0)

    def test_ratio_store_matches_versioned_seed(self):
        """Guarda antirregresión: el store no puede divergir del catálogo versionado."""
        import json

        from services.cedear_service import RATIOS_FILE, load_cedear_ratios

        seed = json.loads(RATIOS_FILE.read_text(encoding="utf-8"))
        store = load_cedear_ratios()
        drift = {
            ticker: (expected, store.get(ticker))
            for ticker, expected in seed.items()
            if not isinstance(store.get(ticker), (int, float))
            or abs(float(expected) - float(store.get(ticker))) > 1e-9
        }
        self.assertEqual(drift, {})

    def test_new_cedears_are_accepted_by_portfolio_validation(self):
        from services.portfolio_service import find_non_cedear_tickers

        self.assertEqual(find_non_cedear_tickers(["GEV", "ISRG"]), [])

    def test_get_all_portfolio_tickers(self):
        from services.portfolio_service import get_all_portfolio_tickers
        tickers = get_all_portfolio_tickers()
        self.assertIsInstance(tickers, list)
        self.assertIn("COST", tickers)
        self.assertIn("LLY", tickers)
        self.assertIn("GOOGL", tickers)

    def test_get_cedear_tickers_endpoint(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        res = client.get("/api/cedears/tickers")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("tickers", data)
        self.assertIsInstance(data["tickers"], list)
        self.assertIn("AAPL", data["tickers"])
        self.assertIn("MELI", data["tickers"])
        self.assertIn("NVDA", data["tickers"])
        self.assertIn("GEV", data["tickers"])
        self.assertIn("ISRG", data["tickers"])

        catalog = {item["ticker"]: item for item in data["catalog"]}
        self.assertEqual(catalog["GEV"]["ratio"], 180.0)
        self.assertEqual(catalog["ISRG"]["ratio"], 90.0)

    def test_cedear_alert_inclusive_thresholds(self):
        """Verifica que la alerta RSI sea inclusiva a 35.0 y 65.0."""
        from unittest.mock import patch
        import pandas as pd
        from services.cedear_service import get_ticker_data

        # Simular serie con RSI exactamente en 35.0 y 65.0
        with patch("services.cedear_service.smart_cache", lambda *a, **kw: lambda fn: fn):
            with patch("services.cedear_service.yf.download") as mock_yf:
                with patch("services.cedear_service.calculate_rsi") as mock_calc:
                    mock_df = pd.DataFrame({"Close": [100.0] * 20})
                    mock_yf.return_value = mock_df
                    
                    # Caso exacto 35.0 (debe activar alerta)
                    mock_calc.return_value = pd.Series([35.0] * 20)
                    fn = getattr(get_ticker_data, "__wrapped__", get_ticker_data)
                    data_35 = fn("AAPL")
                    self.assertIsNotNone(data_35)
                    self.assertTrue(data_35["alert"], "RSI 35.0 debe activar alerta inclusiva")

                    # Caso exacto 65.0 (debe activar alerta)
                    mock_calc.return_value = pd.Series([65.0] * 20)
                    data_65 = fn("AAPL")
                    self.assertIsNotNone(data_65)
                    self.assertTrue(data_65["alert"], "RSI 65.0 debe activar alerta inclusiva")

                    # Caso intermedio 50.0 (NO debe activar alerta)
                    mock_calc.return_value = pd.Series([50.0] * 20)
                    data_50 = fn("AAPL")
                    self.assertIsNotNone(data_50)
                    self.assertFalse(data_50["alert"], "RSI 50.0 no debe activar alerta")

if __name__ == "__main__":
    unittest.main()
