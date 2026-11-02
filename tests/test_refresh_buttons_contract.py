#!/usr/bin/env python3
"""
Contrato estático de los botones "Actualizar / Refrescar" de la SPA.

El proyecto no tiene runner de tests JS (`frontend/package.json` no define
script `test`), por lo que la verificación se fija sobre el fuente, en la misma
convención que `tests/test_portfolio_ui_regressions.py` y
`tests/test_buyer_mode_view.py`.

Cubre tres garantías por botón:
  1. Tiene `onClick` (blinda la clase de bug "botón sin handler").
  2. Su handler dispara una petición al endpoint esperado.
  3. El botón se deshabilita y muestra spinner mientras refresca.

Además fija las regresiones detectadas en la auditoría de refresco manual
(PRB-01 a PRB-06): cedears sin caché, errores HTTP visibles, payload de error
del proveedor de renta fija y refresco de cartera con invalidación previa.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from main import app

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"


@dataclass(frozen=True)
class RefreshButton:
    key: str
    view_file: str
    label: str
    handlers: tuple[str, ...]
    endpoints: tuple[str, ...]
    handler_file: str | None = None
    allows_inline_handler: bool = False
    is_retry: bool = False
    extra: dict = field(default_factory=dict)


BUTTONS = (
    RefreshButton(
        key="earnings",
        view_file="components/market/EarningsCalendarView.tsx",
        label="Actualizar Cronograma",
        handlers=("fetchEarningsData",),
        endpoints=("/api/earnings/summary_json",),
    ),
    RefreshButton(
        key="cedears",
        view_file="components/market/CedearsView.tsx",
        label="Actualizar",
        handlers=("fetchQuotes",),
        endpoints=("/api/cedears/quotes_json",),
    ),
    RefreshButton(
        key="fixed_income_curve",
        view_file="components/market/FixedIncomeView.tsx",
        label="Actualizar Curva",
        handlers=("fetchCurveData",),
        endpoints=("/api/renta_fija/curve_json", "/api/fixed_income/curve_json"),
    ),
    RefreshButton(
        key="etf_rotation",
        view_file="components/market/EtfRotationView.tsx",
        label="Actualizar",
        handler_file="hooks/useEtfRotation.ts",
        handlers=("fetchData",),
        endpoints=("/api/cedears/etf_rotation_analysis",),
    ),
    RefreshButton(
        key="performance",
        view_file="components/markowitz/PerformanceView.tsx",
        label="Actualizar Métricas",
        handlers=("fetchPerformanceData",),
        endpoints=("/api/performance/data_json",),
    ),
    RefreshButton(
        key="market_indices",
        view_file="components/market/MarketIndicesView.tsx",
        label='title="Refrescar cotizaciones"',
        handlers=("fetchHistory",),
        endpoints=("/api/indices/history",),
    ),
    RefreshButton(
        key="unified_portfolio",
        view_file="components/portfolio/UnifiedPortfolioView.tsx",
        label='title="Refrescar Datos"',
        handlers=("fetchMetadata", "fetchAllData"),
        endpoints=("/api/portfolios/list_json", "/api/portfolios/rebalance_json"),
        allows_inline_handler=True,
    ),
    RefreshButton(
        key="fixed_income_card",
        view_file="components/portfolio/FixedIncomePortfolioCard.tsx",
        label='title="Actualizar datos de curvas"',
        handlers=("fetchCurves",),
        endpoints=("/api/renta_fija/curve_json", "/api/fixed_income/curve_json"),
    ),
    RefreshButton(
        key="fixed_income_retry",
        view_file="components/market/FixedIncomeView.tsx",
        label="Reintentar Carga",
        handlers=("fetchCurveData",),
        endpoints=("/api/renta_fija/curve_json",),
        is_retry=True,
    ),
    RefreshButton(
        key="rrg_retry",
        view_file="components/market/EtfRotationGraph.tsx",
        label="Reintentar",
        handler_file="hooks/useEtfRotation.ts",
        handlers=("loadRrg",),
        endpoints=("/api/cedears/etf_rrg",),
        is_retry=True,
    ),
)

DATA_BUTTONS = tuple(button for button in BUTTONS if not button.is_retry)


def _read(relative_path: str) -> str:
    path = SRC / relative_path
    assert path.is_file(), f"No se encontró {path}"
    return path.read_text(encoding="utf-8")


def _button_block(source: str, label: str) -> str:
    """Devuelve el JSX completo del `<button>` que contiene `label`."""
    assert label in source, f"No se encontró el texto {label!r} en el componente"
    label_index = source.index(label)
    start = source.rindex("<button", 0, label_index)
    end = source.index("</button>", label_index) + len("</button>")
    return source[start:end]


def _balanced_block(source: str, opening_brace: int) -> str:
    """Extrae el bloque `{...}` balanceado que empieza en `opening_brace`."""
    depth = 0
    for index in range(opening_brace, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[opening_brace : index + 1]
    raise AssertionError("Llave de apertura sin cierre balanceado")


def _function_block(source: str, name: str) -> str:
    """Extrae el cuerpo de una arrow function o `function` declarada con `name`."""
    declaration = re.search(rf"\b{re.escape(name)}\s*=\s*", source)
    if declaration:
        arrow = re.search(r"\)\s*=>\s*\{", source[declaration.end() :])
        if arrow:
            opening = declaration.end() + arrow.end() - 1
            return _balanced_block(source, opening)

    named = re.search(rf"(?:async\s+)?function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", source)
    if named:
        return _balanced_block(source, named.end() - 1)

    raise AssertionError(f"No se pudo extraer el handler {name!r}")


def _onclick_body(button_block: str) -> str:
    match = re.search(r"onClick=\{", button_block)
    assert match, "El botón no define onClick"
    return _balanced_block(button_block, match.end() - 1)


def _handler_bodies(button: RefreshButton) -> list[str]:
    source = _read(button.handler_file or button.view_file)
    if button.allows_inline_handler:
        return [_function_block(source, name) for name in button.handlers]
    return [_function_block(source, name) for name in button.handlers]


def _route_paths() -> list[str]:
    # `app.routes` envuelve los routers incluidos en `_IncludedRouter` (sin
    # `.path`); el esquema OpenAPI expone las rutas efectivas con su prefijo.
    return list(app.openapi().get("paths", {}).keys())


def _route_supports(endpoint: str) -> bool:
    """Un endpoint existe si hay una ruta igual o un prefijo con parámetro dinámico."""
    for path in _route_paths():
        if path == endpoint:
            return True
        if path.startswith(endpoint + "/") and "{" in path[len(endpoint) :]:
            return True
    return False


# ---------------------------------------------------------------------------
# Garantías comunes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("button", BUTTONS, ids=[b.key for b in BUTTONS])
def test_cada_boton_de_refresco_tiene_onclick(button: RefreshButton):
    button_block = _button_block(_read(button.view_file), button.label)
    assert "onClick=" in button_block, f"{button.key}: botón de refresco sin handler"


@pytest.mark.parametrize("button", DATA_BUTTONS, ids=[b.key for b in DATA_BUTTONS])
def test_botones_de_datos_bloquean_el_doble_click_y_muestran_spinner(button: RefreshButton):
    button_block = _button_block(_read(button.view_file), button.label)
    assert "disabled={" in button_block, f"{button.key}: no se deshabilita mientras refresca"
    assert "animate-spin" in button_block, f"{button.key}: no muestra estado de carga"


@pytest.mark.parametrize("button", BUTTONS, ids=[b.key for b in BUTTONS])
def test_cada_handler_dispara_su_endpoint(button: RefreshButton):
    bodies = _handler_bodies(button)
    body = "\n".join(bodies)
    assert any(endpoint in body for endpoint in button.endpoints), (
        f"{button.key}: el handler {button.handlers} no llama a {button.endpoints}"
    )


@pytest.mark.parametrize("button", BUTTONS, ids=[b.key for b in BUTTONS])
def test_endpoints_de_refresco_existen_en_el_backend(button: RefreshButton):
    for endpoint in button.endpoints:
        assert _route_supports(endpoint), f"{button.key}: {endpoint} no está montado en FastAPI"


# ---------------------------------------------------------------------------
# Contratos de parámetros: lo que envía el botón debe existir en el router
# ---------------------------------------------------------------------------


def _router_signature(router_file: str, function_name: str) -> set[str]:
    source = (ROOT / "routers" / router_file).read_text(encoding="utf-8")
    declaration = re.search(
        rf"def\s+{re.escape(function_name)}\((.*?)\)\s*(?:->\s*[^:]+)?:",
        source,
        re.S,
    )
    assert declaration, f"No se encontró {function_name} en routers/{router_file}"
    return set(re.findall(r"^\s*(\w+)\s*:", declaration.group(1), re.M))


def test_renta_fija_envia_los_filtros_que_acepta_el_router():
    view = _read("components/market/FixedIncomeView.tsx")
    params = re.search(r"new URLSearchParams\(\{(.*?)\}\)", view, re.S)
    assert params, "FixedIncomeView no construye URLSearchParams"
    sent = set(re.findall(r"^\s*([A-Za-z_]\w*)\s*[,:]", params.group(1), re.M) or re.findall(r"^\s*([A-Za-z_]\w*)\s*$", params.group(1), re.M))
    accepted = _router_signature("fixed_income.py", "get_yield_curve_json")
    assert sent <= accepted, f"Parámetros sin soporte en el router: {sent - accepted}"


def test_indices_envia_los_filtros_que_acepta_el_router():
    view = _read("components/market/MarketIndicesView.tsx")
    accepted = _router_signature("indices.py", "api_get_indices_history")
    for param in ("region", "period", "currency", "normalized"):
        assert f"{param}=${{{param}" in view, f"El refresh de índices no envía {param}"
        assert param in accepted, f"El router de índices no acepta {param}"


def test_rotacion_etf_pide_el_universo_completo():
    hook = _read("hooks/useEtfRotation.ts")
    assert "/api/cedears/etf_rotation_analysis?universe=all" in hook


# ---------------------------------------------------------------------------
# Regresiones detectadas en la auditoría
# ---------------------------------------------------------------------------


def test_cedears_refresca_saltando_el_cache():
    view = _read("components/market/CedearsView.tsx")
    button_block = _button_block(view, "Actualizar")
    assert "fetchQuotes(watchlist, true)" in button_block, (
        "El botón debe forzar el refetch; sin `force`, react-query devuelve el "
        "caché de 90 s y el refresco manual no trae datos nuevos."
    )


@pytest.mark.parametrize(
    "key, handler",
    [
        pytest.param("performance", "fetchPerformanceData", id="performance"),
        pytest.param("market_indices", "fetchHistory", id="market_indices"),
        pytest.param("etf_rotation", "fetchData", id="etf_rotation"),
    ],
)
def test_refresco_expone_el_error_al_usuario(key: str, handler: str):
    button = next(spec for spec in BUTTONS if spec.key == key)
    source = _read(button.handler_file or button.view_file)
    body = _function_block(source, handler)
    assert re.search(r"\b(setError|setErrorMessage|setRrgError)\w*\(", body), (
        f"{key}: el handler solo registra en consola; el usuario no ve el fallo"
    )


def test_renta_fija_detecta_payload_con_error():
    body = _function_block(_read("components/market/FixedIncomeView.tsx"), "fetchCurveData")
    assert re.search(r"json\.error", body), (
        "El router responde 200 con {'error': ...}; el handler debe tratarlo como fallo."
    )


def _onrefresh_body(view: str, component: str) -> str:
    start = view.index(f"<{component}")
    end = view.index("/>", start)
    element = view[start:end]
    prop = re.search(r"onRefresh=\{", element)
    assert prop, f"<{component}> no recibe onRefresh"
    raw = _balanced_block(element, prop.end() - 1)
    inner = raw[1:-1].strip()
    resolved = re.fullmatch(r"(\w+)", inner)
    if resolved:
        return _function_block(view, resolved.group(1))
    return raw


def test_refresco_de_cartera_invalida_antes_de_refetch():
    view = _read("components/portfolio/UnifiedPortfolioView.tsx")
    for component in ("FixedIncomePortfolioCard", "PortfolioFixedIncomeTable", "PortfolioTable"):
        body = _onrefresh_body(view, component)
        assert "invalidateQueries" in body, (
            f"{component}: onRefresh llama a fetchQuery sin invalidar; dentro de "
            "staleTime=90 s el refresco manual devuelve caché."
        )
