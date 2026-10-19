import json
import math
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_ratio_registry_contains_confirmed_current_values():
    ratios = _read_json(REPO_ROOT / "data" / "cedear_ratios.json")

    # Caja de Valores, tabla "Ratio CEDEARs / valor subyacente", consultada 2026-10-06.
    # SNDK no aparece en esa tabla; 170:1 fue informado por el propietario del proyecto.
    # GEV estaba en 1.0 como placeholder: la lista oficial de BYMA lo publica como
    # 180:1 y el precio de mercado lo confirma (el CEDEAR cotiza USD 5,4 cuando la
    # acción vale USD 921). XLU quedó en 15:1 porque el PDF de BYMA duplica la fila
    # de CIBR con el ticker equivocado.
    expected = {
        "GLD": 50.0,
        "SMH": 50.0,
        "SPY": 60.0,
        "URA": 5.0,
        "XLE": 2.0,
        "XLF": 2.0,
        "XLU": 15.0,
        "GEV": 180.0,
        "ISRG": 90.0,
        "SNDK": 170.0,
    }
    for ticker, expected_ratio in expected.items():
        assert ratios[ticker] == expected_ratio


def test_etf_fallbacks_match_ratios_verified_by_caja_de_valores():
    from scripts.update_cedears_sectors import ETF_RATIOS

    expected = {"GLD": 50.0, "SMH": 50.0, "SPY": 60.0, "URA": 5.0, "XLU": 15.0}
    assert {ticker: ETF_RATIOS[ticker] for ticker in expected} == expected


def test_every_example_portfolio_ticker_has_a_positive_ratio():
    ratios = _read_json(REPO_ROOT / "data" / "cedear_ratios.json")
    portfolios = _read_json(REPO_ROOT / "data" / "portfolios.json.example")
    portfolio_tickers = {
        ticker
        for portfolio in portfolios.values()
        if isinstance(portfolio, dict)
        for ticker in (portfolio.get("assets") or {})
    }

    # Lo que la app valida contra una cartera es el catálogo ya resuelto con
    # alias, no el JSON crudo: BYMA publica varios CEDEARs bajo otro símbolo
    # (NU -> UN, DIS -> DISN, FB -> META) y esos tickers igual deben operar.
    from services.cedear_service import load_cedear_ratios

    assert portfolio_tickers <= set(load_cedear_ratios())
    assert all(
        isinstance(ratio, (int, float)) and math.isfinite(ratio) and ratio > 0
        for ratio in ratios.values()
    )


def test_every_catalog_ticker_has_a_sector():
    """Ningún CEDEAR puede quedar sin sector.

    Es la garantía contra el agujero que dejó el refresco 308 -> 444: si BYMA
    suma un CEDEAR y nadie corre scripts/update_cedears_sectors.py, este test
    falla en vez de publicarlo como "Otros Activos".
    """
    from services.cedear_service import load_cedear_ratios
    from services.portfolio_service import get_ticker_sector

    missing = sorted(
        ticker
        for ticker in load_cedear_ratios()
        if get_ticker_sector(ticker).get("id") == "other"
    )

    assert missing == [], f"CEDEARs sin sector: {', '.join(missing)}"


def test_legacy_ticker_aliases_keep_their_sector():
    """Los símbolos que BYMA retiró resuelven al vigente también en sectores."""
    from services.portfolio_service import get_ticker_sector

    resolved = {
        ticker: get_ticker_sector(ticker).get("id")
        for ticker in ("DIS", "FB", "SQ", "NU", "GOLD", "TX", "TSU", "X", "BRK.B")
    }

    assert all(sector and sector != "other" for sector in resolved.values()), resolved


def test_catalog_endpoint_exposes_every_ticker_for_search():
    """Ctrl+K busca sobre este endpoint: si falta un ticker, no se puede hallar."""
    from routers.cedears import get_all_cedear_tickers
    from services.cedear_service import load_cedear_ratios

    payload = json.loads(get_all_cedear_tickers().body)
    catalog = set(load_cedear_ratios())

    assert set(payload["tickers"]) == catalog
    assert {item["ticker"] for item in payload["catalog"]} == catalog
    assert all(item.get("ratio") for item in payload["catalog"])
