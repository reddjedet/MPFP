#!/usr/bin/env python3
"""
Contrato estático de `frontend/src/components/action/BuyerModeView.tsx`.

El proyecto no tiene runner de tests JS (ver `frontend/package.json`: no define
script `test`), por lo que los cambios en la vista se fijan con aserciones
estáticas sobre el fuente, en la misma convención que `test_hooks_contract.py`.

Cubre tres defectos corregidos:
  1. "Consultar el resto de cedears" era un no-op silencioso: la API respondía
     200 con el panel de BYMA vacío, el merge por symbol no aportaba nada y el
     usuario no recibía ninguna señal.
  2. "Destinos Estratégicos" incluía activos que ya estaban en cartera,
     duplicando la columna "Oportunidades en Cartera".
  3. El botón "Evaluar" no tenía onClick.
"""

import re
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
VIEW_PATH = ROOT_DIR / "frontend" / "src" / "components" / "action" / "BuyerModeView.tsx"


def _read() -> str:
    if not VIEW_PATH.exists():
        raise AssertionError(f"No se encontró {VIEW_PATH}")
    return VIEW_PATH.read_text(encoding="utf-8")


def _block(src: str, start_marker: str) -> str:
    """Devuelve el bloque `{...}` que abre tras `start_marker`."""
    start = src.index(start_marker)
    i = start
    depth = 0
    opened = False
    while i < len(src):
        c = src[i]
        if c in "\"'`":
            quote = c
            i += 1
            while i < len(src):
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == quote:
                    break
                i += 1
        elif c == "{":
            depth += 1
            opened = True
        elif c == "}":
            depth -= 1
            if opened and depth == 0:
                return src[start : i + 1]
        i += 1
    raise AssertionError(f"Bloque sin cierre para {start_marker!r}")


def _statement(src: str, marker: str) -> str:
    """Devuelve una expresión que termina en `;`, hasta la línea en blanco o el return."""
    start = src.index(marker)
    m = re.compile(r"\n\s*\n|^\s*return\b", re.M).search(src, start)
    return src[start : m.start()] if m else src[start:]


class TestDeepScanFeedback(unittest.TestCase):
    """Problema 1: el escaneo profundo no debe fallar en silencio."""

    def setUp(self):
        self.src = _read()
        self.body = _block(self.src, "const handleDeepScan")

    def test_declares_scan_message_state(self):
        self.assertRegex(self.src, r"const\s*\[scanMsg,\s*setScanMsg\]\s*=\s*useState")

    def test_clears_previous_message_before_scan(self):
        self.assertRegex(self.body, r"setScanMsg\(null\)")

    def test_every_terminal_path_sets_a_message(self):
        """ok=false, quotes vacío, hay nuevos, no hay nuevos y excepción."""
        self.assertGreaterEqual(
            self.body.count("setScanMsg("),
            5,
            "handleDeepScan debe informar en todas sus salidas (fallo HTTP, "
            "respuesta vacía, con novedades, sin novedades y error de red)",
        )

    def test_handles_non_ok_http_response(self):
        self.assertRegex(self.body, r"if\s*\(!res\.ok\)")

    def test_handles_empty_quote_payload(self):
        self.assertRegex(self.body, r"incoming\.length\s*={2,3}\s*0")

    def test_counts_new_tickers_outside_the_state_updater(self):
        """
        Contar dentro del updater de setQuotes es un bug: React puede invocarlo
        más de una vez y el contador quedaría inflado.
        """
        self.assertRegex(self.body, r"new Set\(quotes\.map")

        updater = _block(self.body, "setQuotes(prev =>")
        self.assertNotIn(
            "added +=",
            updater,
            "El conteo de agregados no debe mutarse dentro del updater de estado",
        )

    def test_reports_zero_new_tickers_distinctly(self):
        self.assertRegex(self.body, r"Sin novedades")

    def test_catches_network_errors(self):
        self.assertRegex(self.body, r"catch\s*\(")

    def test_message_is_rendered_in_the_view(self):
        self.assertRegex(self.src, r"\{scanMsg\s*&&")


class TestStrategicCandidatesExclusions(unittest.TestCase):
    """Problema 2: "Destinos Estratégicos" no debe repetir lo que ya poseés."""

    def setUp(self):
        self.src = _read()

    def test_candidates_exclude_assets_already_in_a_portfolio(self):
        block = _statement(self.src, "const buyCandidates")
        self.assertRegex(
            block,
            r"!q\.in_portfolio",
            "buyCandidates debe excluir in_portfolio para no duplicar la columna izquierda",
        )

    def test_description_matches_the_new_behaviour(self):
        self.assertIn(
            "NO tenés en ninguna cartera",
            self.src,
            "El subtítulo debe describir que son activos fuera de cartera",
        )

    def test_left_column_still_scans_the_selected_portfolio(self):
        """La exclusión no debe romper 'Oportunidades en Cartera'."""
        self.assertRegex(
            self.src,
            r"if\s*\(!selectedPf\s*\|\|\s*!portfolios\[selectedPf\]\)\s*return \[\]",
        )
        self.assertIn("portfolioOversold", self.src)


class TestEvaluateButtonWiring(unittest.TestCase):
    """Problema 3: todo <button> visible debe tener onClick."""

    def test_evaluate_button_has_a_click_handler(self):
        src = _read()
        found = None
        for match in re.finditer(r"<button\b", src):
            tag = _tag_of(src, match.start())
            after = src[match.start() + len(tag) :][:60].lstrip()
            if after.startswith("Evaluar"):
                found = tag
                break

        self.assertIsNotNone(found, "No se encontró el botón 'Evaluar'")
        self.assertRegex(
            found,
            r"\bonClick\s*=",
            "El botón 'Evaluar' debe tener onClick para abrir la ficha 360",
        )
        self.assertIn(
            "openTickerDrawer",
            found,
            "El onClick debe delegar en openTickerDrawer, igual que EtfRotationView y CedearsView",
        )

    def test_row_container_does_not_fake_interactivity(self):
        """La fila completa se颐aba con cursor-pointer sin tener handler."""
        src = _read()
        self.assertNotIn(
            "justify-between cursor-pointer",
            src,
            "El contenedor de la fila ya no debe declarar cursor-pointer sin acción",
        )

    def test_no_button_in_the_view_is_missing_a_handler(self):
        """
        Salvo type="submit" (funcional vía el <form> padre), ningún <button>
        puede declararse sin onClick.
        """
        src = _read()
        offenders = []
        for match in re.finditer(r"<button\b", src):
            tag = _tag_of(src, match.start())
            has_click = bool(re.search(r"\bonClick\s*=", tag))
            is_submit = bool(re.search(r'type\s*=\s*["\']submit', tag))
            if not has_click and not is_submit:
                line = src[: match.start()].count("\n") + 1
                offenders.append(line)
        self.assertEqual(
            offenders, [], f"Botones sin onClick en líneas {offenders}"
        )


def _tag_of(src: str, start: int) -> str:
    """Extrae el tag completo desde `<button` respetando llaves y strings."""
    depth = 0
    i = start
    while i < len(src):
        c = src[i]
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif c in "\"'`":
            quote = c
            i += 1
            while i < len(src):
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == quote:
                    break
                i += 1
        elif c == ">" and depth == 0:
            return src[start : i + 1]
        i += 1
    raise AssertionError("Tag <button> sin cierre")


if __name__ == "__main__":
    unittest.main()