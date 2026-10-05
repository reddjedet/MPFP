#!/usr/bin/env python3
"""
Contrato de la papelera de carteras y de la política de nombres reservados.

Contexto: se eliminó la lista fija `RESERVED_PORTFOLIO_NAMES` ("bmb", "bal").
Ahora un nombre está reservado únicamente si existe una cartera viva con ese
nombre o si sigue presente en la papelera. Además, borrar una cartera la purga
del catálogo activo pero la papelera recuerda sus posiciones para poder
restaurarla, incluso bajo otro nombre.
"""

import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from services.portfolio_service import (
    is_portfolio_name_taken,
    normalize_weights_dict,
    load_portfolios,
    load_portfolios_trash,
    save_portfolios,
    save_portfolios_trash,
    MAX_TRASH_CAPACITY,
)
from services.rotation_service import (
    load_user_holdings,
    save_user_holdings,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
PANEL_PATH = ROOT_DIR / "frontend" / "src" / "components" / "portfolio" / "PortfolioTrashPanel.tsx"
VIEW_PATH = ROOT_DIR / "frontend" / "src" / "components" / "portfolio" / "HoldingsManagerView.tsx"


class TestReservedNamesAreDynamic(unittest.TestCase):
    """Regla: un nombre está reservado si existe la cartera, no por lista fija."""

    def test_existing_portfolio_name_is_taken(self):
        pfs = load_portfolios()
        self.assertTrue(is_portfolio_name_taken(next(iter(pfs))))

    def test_free_name_is_not_taken(self):
        self.assertFalse(is_portfolio_name_taken("nombre_inexistente_zzz"))

    def test_name_in_trash_is_taken(self):
        """Mientras la entrada siga en la papelera, su nombre no se puede reusar."""
        pfs = load_portfolios()
        pfs["pf_para_papelera"] = {"mode": "weights", "assets": {"AAPL": 100.0}}
        save_portfolios(pfs)
        try:
            self.client_delete("pf_para_papelera")
            # Salió del catálogo activo, pero su nombre sigue reservado por la papelera.
            self.assertNotIn("pf_para_papelera", load_portfolios())
            self.assertTrue(is_portfolio_name_taken("pf_para_papelera"))
        finally:
            self._cleanup()

    def client_delete(self, name):
        with TestClient(app) as client:
            return client.delete(f"/api/portfolios/delete_json/{name}")

    def _cleanup(self):
        save_portfolios_trash([t for t in load_portfolios_trash() if t.get("id") != "pf_para_papelera"])


class TestNormalizeWeights(unittest.TestCase):
    """Regla: los pesos se persisten normalizados a 100; todo en cero se rechaza."""

    def test_scales_to_one_hundred(self):
        assets, err = normalize_weights_dict({"AAPL": 47.5, "MSFT": 47.5})
        self.assertIsNone(err)
        self.assertAlmostEqual(sum(assets.values()), 100.0, places=4)
        self.assertAlmostEqual(assets["AAPL"], 50.0, places=4)

    def test_over_one_hundred_is_scaled_down(self):
        assets, err = normalize_weights_dict({"AAPL": 60.0, "MSFT": 60.0})
        self.assertIsNone(err)
        self.assertAlmostEqual(sum(assets.values()), 100.0, places=4)

    def test_already_one_hundred_is_preserved(self):
        assets, err = normalize_weights_dict({"AAPL": 30.0, "MSFT": 70.0})
        self.assertIsNone(err)
        self.assertEqual(assets, {"AAPL": 30.0, "MSFT": 70.0})

    def test_all_zero_is_rejected(self):
        assets, err = normalize_weights_dict({"AAPL": 0.0, "MSFT": 0.0})
        self.assertIsNone(assets)
        self.assertIn("cero", err)

    def test_empty_is_rejected(self):
        assets, err = normalize_weights_dict({})
        self.assertIsNone(assets)
        self.assertTrue(err)

    def test_negative_is_rejected(self):
        assets, err = normalize_weights_dict({"AAPL": -10.0, "MSFT": 110.0})
        self.assertIsNone(assets)
        self.assertIn("negativo", err)


class TestTrashSnapshotAndRestore(unittest.TestCase):
    """Borrar purga lo activo pero la papelera recuerda posiciones y bonos."""

    def setUp(self):
        self._pfs = load_portfolios()
        self._trash = load_portfolios_trash()
        self._h = load_user_holdings("pf_trash_test")

    def tearDown(self):
        save_portfolios(self._pfs)
        save_portfolios_trash(self._trash)
        save_user_holdings(self._h, portfolio_key="pf_trash_test")

    def _seed(self):
        pfs = load_portfolios()
        pfs["pf_trash_test"] = {
            "mode": "weights",
            "assets": {"AAPL": 60.0, "MSFT": 40.0},
        }
        save_portfolios(pfs)
        save_user_holdings(
            {
                "holdings": {"AAPL": {"nominals": 10, "ppc": 100.0}},
                "fixed_income_holdings": {"S30S6": {"nominals": 500, "ppc": 112.0}},
                "cash_ars": 1234.5,
            },
            portfolio_key="pf_trash_test",
        )

    def test_delete_snapshots_positions_and_purges_them(self):
        self._seed()
        with TestClient(app) as client:
            resp = client.delete("/api/portfolios/delete_json/pf_trash_test")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

        # Salió del catálogo activo...
        self.assertNotIn("pf_trash_test", load_portfolios())

        # ...y quedó en cero.
        live = load_user_holdings("pf_trash_test")
        self.assertEqual(live["holdings"], {})
        self.assertEqual(live["fixed_income_holdings"], {})
        self.assertEqual(live["cash_ars"], 0.0)

        # La papelera recuerda todo.
        entry = next(t for t in load_portfolios_trash() if t["id"] == "pf_trash_test")
        self.assertEqual(entry["data"]["assets"], {"AAPL": 60.0, "MSFT": 40.0})
        self.assertEqual(entry["holdings"], {"AAPL": {"nominals": 10, "ppc": 100.0}})
        self.assertEqual(entry["fixed_income_holdings"], {"S30S6": {"nominals": 500, "ppc": 112.0}})
        self.assertEqual(entry["cash_ars"], 1234.5)

    def test_restore_as_new_name_keeps_positions_and_leaves_original(self):
        self._seed()
        with TestClient(app) as client:
            client.delete("/api/portfolios/delete_json/pf_trash_test")
            resp = client.post(
                "/api/portfolios/restore_as_json/pf_trash_test",
                json={"new_name": "pf_trash_copia"},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

        # La copia existe con los mismos objetivos.
        self.assertIn("pf_trash_copia", load_portfolios())
        self.assertEqual(
            load_portfolios()["pf_trash_copia"]["assets"], {"AAPL": 60.0, "MSFT": 40.0}
        )

        # ...y con las mismas posiciones y bonos.
        copy = load_user_holdings("pf_trash_copia")
        self.assertEqual(copy["holdings"], {"AAPL": {"nominals": 10, "ppc": 100.0}})
        self.assertEqual(copy["fixed_income_holdings"], {"S30S6": {"nominals": 500, "ppc": 112.0}})
        self.assertEqual(copy["cash_ars"], 1234.5)

        # La entrada original sigue en la papelera: restaurar no la consume.
        self.assertIn("pf_trash_test", [t["id"] for t in load_portfolios_trash()])

    def test_restore_as_colliding_name_is_rejected(self):
        self._seed()
        with TestClient(app) as client:
            client.delete("/api/portfolios/delete_json/pf_trash_test")
            resp = client.post(
                "/api/portfolios/restore_as_json/pf_trash_test",
                json={"new_name": "bmb"},
            )
        self.assertEqual(resp.status_code, 409)
        self.assertFalse(resp.json()["success"])

    def test_trash_response_exposes_count_and_capacity(self):
        """count y max_capacity deben llegar al cliente (antes se perdían)."""
        with TestClient(app) as client:
            resp = client.get("/api/portfolios/trash_json")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("count", body)
        self.assertIn("max_capacity", body)
        self.assertEqual(body["max_capacity"], MAX_TRASH_CAPACITY)
        self.assertEqual(body["count"], len(body["trash"]))


class TestCreateNormalizesAndRejectsZero(unittest.TestCase):
    def setUp(self):
        self._pfs = load_portfolios()

    def tearDown(self):
        save_portfolios(self._pfs)

    def test_create_normalizes_weights_to_100(self):
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolios/create_json",
                json={"name": "pf_norm_test", "weights_str": "AAPL:47.5, AXP:47.5"},
            )
        self.assertEqual(resp.status_code, 200)
        assets = load_portfolios()["pf_norm_test"]["assets"]
        self.assertAlmostEqual(sum(assets.values()), 100.0, places=4)

    def test_create_rejects_all_zero_weights(self):
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolios/create_json",
                json={"name": "pf_cero_test", "weights_str": "GGAL:0, YPF:0"},
            )
        self.assertFalse(resp.json()["success"])
        self.assertNotIn("pf_cero_test", load_portfolios())

    def test_create_allows_bal_now_that_it_is_not_reserved(self):
        """`bal` dejó de estar en la lista fija de nombres reservados."""
        if "bal" in load_portfolios():
            self.skipTest("'bal' ya existe en este entorno")
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolios/create_json",
                json={"name": "bal", "weights_str": "AAPL:100"},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])
        self.assertIn("bal", load_portfolios())


class TestTrashPanelContract(unittest.TestCase):
    """
    El proyecto no tiene runner de tests JS, así que el panel se fija con
    aserciones estáticas sobre el fuente (misma convención que test_buyer_mode_view).
    """

    def setUp(self):
        self.assertTrue(PANEL_PATH.exists(), f"No se encontró {PANEL_PATH}")
        self.src = PANEL_PATH.read_text(encoding="utf-8")
        self.view = VIEW_PATH.read_text(encoding="utf-8")

    def test_panel_is_mounted_with_a_launcher(self):
        self.assertIn("PortfolioTrashPanel", self.view)
        self.assertIn("setShowTrash(true)", self.view)
        self.assertIn('title="Papelera de carteras"', self.view)

    def test_reads_the_three_trash_endpoints(self):
        self.assertIn("/api/portfolios/trash_json", self.src)
        self.assertIn("restore_as_json", self.src)
        self.assertIn("method: 'DELETE'", self.src)

    def test_restore_posts_a_new_name(self):
        self.assertIn("new_name: target", self.src)
        self.assertIn("Restaurar como...", self.src)

    def test_purge_requires_confirmation(self):
        self.assertIn("confirmPurge", self.src)
        self.assertIn("¿Eliminar", self.src)

    def test_surfaces_count_and_capacity(self):
        """count y max_capacity llegan ahora al cliente: deben mostrarse."""
        self.assertIn("data.max_capacity", self.src)
        self.assertIn("de {maxCapacity}", self.src)

    def test_every_button_has_a_click_handler(self):
        import re

        offenders = []
        for match in re.finditer(r"<button\b", self.src):
            tag, depth, i, in_str, quote = "", 0, match.start(), False, ""
            j = match.start()
            while j < len(self.src):
                c = self.src[j]
                if in_str:
                    if c == quote:
                        in_str = False
                elif c in "\"'`":
                    in_str, quote = True, c
                elif c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                elif c == ">" and depth == 0:
                    tag = self.src[match.start(): j + 1]
                    break
                j += 1
            if tag and not re.search(r"\bonClick\s*=", tag):
                offenders.append(self.src[: match.start()].count("\n") + 1)
        self.assertEqual(offenders, [], f"Botones sin onClick en el panel: {offenders}")


class TestImportJson(unittest.TestCase):
    """
    El import fallaba en silencio: el backend responde HTTP 200 incluso cuando no
    importa nada, y el frontend solo miraba el código HTTP.
    """

    def setUp(self):
        self._pfs = load_portfolios()
        self._trash = load_portfolios_trash()

    def tearDown(self):
        save_portfolios(self._pfs)
        save_portfolios_trash(self._trash)

    def _post(self, payload, name=None):
        import io as _io

        files = {"file": ("p.json", _io.BytesIO(json.dumps(payload).encode()), "application/json")}
        form = {"name": name} if name is not None else None
        with TestClient(app) as client:
            return client.post("/api/portfolios/import_json", files=files, data=form)

    def test_flat_map_without_name_asks_for_the_name(self):
        """Un mapa plano no puede inventarse el nombre: se lo pide al usuario."""
        body = self._post({"AAPL": 50, "MSFT": 50}).json()
        self.assertFalse(body["success"])
        self.assertTrue(body["needs_name"])
        self.assertIn("nombre", body["error"].lower())

    def test_flat_map_with_name_imports_one_portfolio(self):
        body = self._post({"AAPL": 50, "MSFT": 50}, name="pf_importado").json()
        self.assertTrue(body["success"])
        self.assertEqual(body["imported_count"], 1)
        self.assertIn("pf_importado", load_portfolios())

    def test_import_normalizes_weights_to_100(self):
        """Importar debe aplicar la misma normalización que crear y actualizar."""
        self._post({"AAPL": 47.5, "MSFT": 47.5}, name="pf_norm_import")
        assets = load_portfolios()["pf_norm_import"]["assets"]
        self.assertAlmostEqual(sum(assets.values()), 100.0, places=4)

    def test_import_rejects_all_zero_weights(self):
        body = self._post({"AAPL": 0, "MSFT": 0}, name="pf_cero_import").json()
        self.assertFalse(body["success"])
        self.assertNotIn("pf_cero_import", load_portfolios())

    def test_nested_json_still_imports_by_key_name(self):
        body = self._post({"pf_anidada": {"mode": "weights", "assets": {"AAPL": 100}}}).json()
        self.assertTrue(body["success"])
        self.assertIn("pf_anidada", load_portfolios())

    def test_skipped_names_are_reported_not_silent(self):
        body = self._post({"bmb": {"assets": {"AAPL": 100}}}).json()  # bmb ya existe
        self.assertFalse(body["success"])
        self.assertEqual(body["imported_count"], 0)
        self.assertIn("bmb", body["skipped"])
        self.assertIn("bmb", body["error"])


    def test_import_rejects_non_cedear_tickers_all_or_nothing(self):
        """
        GOOG existe en USA pero no como CEDEAR. Si hay un ticker inválido no se
        importa nada: no dejar carteras a medio construir.
        """
        body = self._post({"pf_mix": {"AAPL": 60, "GOOG": 40}}).json()
        self.assertFalse(body["success"])
        self.assertEqual(body["imported_count"], 0)
        self.assertIn("GOOG", body["error"])
        self.assertNotIn("pf_mix", load_portfolios())

    def test_import_accepts_only_real_cedears(self):
        body = self._post({"pf_ok": {"AAPL": 60, "AXP": 40}}).json()
        self.assertTrue(body["success"])
        self.assertIn("pf_ok", load_portfolios())

    def test_create_rejects_non_cedear_ticker(self):
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolios/create_json",
                json={"name": "pf_goog", "weights_str": "AAPL:50, GOOG:50"},
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("GOOG", resp.json()["error"])
        self.assertNotIn("pf_goog", load_portfolios())

    def test_update_weights_rejects_non_cedear_ticker(self):
        self._post({"pf_upd": {"AAPL": 100}})
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolios/weights_json/pf_upd",
                json={"weights_str": "AAPL:50, GOOG:50"},
            )
        self.assertEqual(resp.status_code, 400)
        # Los pesos previos quedan intactos: no se guardó a medias.
        self.assertEqual(load_portfolios()["pf_upd"]["assets"], {"AAPL": 100.0})

    def test_etfs_present_in_catalog_are_accepted(self):
        """Los ETFs que usa la app tienen que seguir entrando sin error."""
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolios/create_json",
                json={"name": "pf_etf", "weights_str": "SPY:60, QQQ:40"},
            )
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()