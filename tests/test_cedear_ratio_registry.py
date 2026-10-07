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
    expected = {
        "GLD": 50.0,
        "SMH": 50.0,
        "SPY": 60.0,
        "URA": 5.0,
        "XLE": 2.0,
        "XLF": 2.0,
        "XLU": 15.0,
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

    assert portfolio_tickers <= ratios.keys()
    assert all(
        isinstance(ratio, (int, float)) and math.isfinite(ratio) and ratio > 0
        for ratio in ratios.values()
    )
