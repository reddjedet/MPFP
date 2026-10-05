from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from main import app
from schemas.portfolio_comparison import PortfolioComparisonRequest
from services import portfolio_comparison_service as comparison_service


def sample_prices() -> pd.DataFrame:
    end = pd.Timestamp.today().normalize()
    while end.weekday() >= 5:
        end -= pd.Timedelta(days=1)
    dates = pd.bdate_range(end=end, periods=1320)
    step = np.arange(len(dates), dtype=float)
    return pd.DataFrame(
        {
            "AAPL": 100.0 * np.power(1.0010, step),
            "MSFT": 100.0 * np.power(1.0003, step),
            "SPY": 100.0 * np.power(1.0006, step),
        },
        index=dates,
    )


@pytest.fixture
def loaded_portfolios(monkeypatch):
    portfolios = {
        "growth": {"mode": "weights", "assets": {"AAPL": 75.0, "MSFT": 25.0}},
        "balanced": {"mode": "weights", "assets": {"AAPL": 25.0, "MSFT": 75.0}},
    }
    monkeypatch.setattr(comparison_service, "load_portfolios", lambda: portfolios)
    prices = sample_prices()
    monkeypatch.setattr(comparison_service, "fetch_adjusted_prices", lambda tickers, start: prices.loc[:, list(tickers)])
    return portfolios, prices


def test_request_requires_two_different_loaded_portfolios():
    with pytest.raises(ValidationError):
        PortfolioComparisonRequest(portfolio_a="growth", portfolio_b="growth")

    request = PortfolioComparisonRequest(portfolio_a=" GROWTH ", portfolio_b="balanced")
    assert request.portfolio_a == "growth"
    assert request.period == "5y"


def test_comparison_uses_common_period_and_unrebalanced_target_weights(loaded_portfolios):
    _, prices = loaded_portfolios
    request = PortfolioComparisonRequest(
        portfolio_a="growth", portfolio_b="balanced", period="5y"
    )

    result = comparison_service.compare_loaded_portfolios(request)

    assert len(result.portfolios) == 2
    assert result.initial_investment == 10_000.0
    assert result.risk_free_rate_pct == 4.0
    assert result.start_date <= result.end_date
    assert result.time_series[0].balance_a == pytest.approx(10_000.0)
    assert result.time_series[0].balance_b == pytest.approx(10_000.0)
    assert result.time_series[0].spy_balance == pytest.approx(10_000.0)

    growth = result.portfolios[0]
    assert growth.stats.initial_balance == 10_000.0
    assert growth.stats.final_balance == result.time_series[-1].balance_a
    assert growth.stats.return_1y_pct is not None
    assert growth.stats.return_3y_pct is not None
    assert growth.stats.return_5y_pct is not None
    assert growth.stats.rsi_14 is not None

    target_aapl_weight = next(
        asset.target_weight_pct for asset in growth.asset_composition if asset.ticker == "AAPL"
    )
    end_aapl_weight = next(
        asset.end_weight_pct for asset in growth.asset_composition if asset.ticker == "AAPL"
    )
    assert target_aapl_weight == 75.0
    assert end_aapl_weight > target_aapl_weight
    assert sum(sector.target_weight_pct for sector in growth.sector_composition) == pytest.approx(100.0)

    # Verifica la simulación buy-and-hold: la cantidad comprada al inicio no cambia.
    selected_start = pd.Timestamp(result.start_date)
    common_start_idx = prices.index.searchsorted(selected_start, side="left")
    start_prices = prices.iloc[common_start_idx]
    last_prices = prices.iloc[-1]
    units_aapl = 10_000.0 * 0.75 / start_prices["AAPL"]
    units_msft = 10_000.0 * 0.25 / start_prices["MSFT"]
    expected_balance = units_aapl * last_prices["AAPL"] + units_msft * last_prices["MSFT"]
    assert growth.stats.final_balance == pytest.approx(expected_balance, abs=0.02)


def test_comparison_endpoint_uses_pydantic_contract(loaded_portfolios):
    del loaded_portfolios
    client = TestClient(app)

    response = client.post(
        "/api/portfolios/compare",
        json={"portfolio_a": "growth", "portfolio_b": "balanced", "period": "3y"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["period"] == "3y"
    assert body["requested_period_years"] == 3
    assert len(body["portfolios"]) == 2
    assert body["portfolios"][0]["stats"]["alpha_annual_vs_spy_pct"] is not None


def test_comparison_submenu_is_between_frontier_and_valuation():
    project_root = Path(__file__).resolve().parents[1]
    header = (project_root / "frontend/src/components/layout/WorkspaceHeader.tsx").read_text()
    layout = (project_root / "frontend/src/components/layout/RootLayout.tsx").read_text()

    assert header.index("id: 'frontera'") < header.index("id: 'comparacion'") < header.index("id: 'valuacion'")
    assert "case 'comparacion':" in layout
    assert "return <PortfolioComparisonView />;" in layout


def test_comparison_view_loads_existing_portfolios_and_requests_two():
    project_root = Path(__file__).resolve().parents[1]
    view = (project_root / "frontend/src/components/markowitz/PortfolioComparisonView.tsx").read_text()

    assert "fetch('/api/portfolios/list_json')" in view
    assert "fetch('/api/portfolios/compare'" in view
    assert "portfolio_a: portfolioA, portfolio_b: portfolioB" in view
    assert "portfolioA === portfolioB" in view
    assert "Rendimiento acumulado · 5 años" in view


def test_comparison_charts_pass_the_echarts_instance_and_clear_old_errors():
    project_root = Path(__file__).resolve().parents[1]
    view = (project_root / "frontend/src/components/markowitz/PortfolioComparisonView.tsx").read_text()

    assert view.count("<ReactECharts echarts={echarts} option=") == 3
    assert view.count("setError(null); setResult(null);") == 3


def test_frontier_percentage_formatter_does_not_scale_backend_percentages_again():
    project_root = Path(__file__).resolve().parents[1]
    table = (project_root / "frontend/src/components/markowitz/PortfolioStatsTable.tsx").read_text()
    backend = (project_root / "services/markowitz_service.py").read_text()

    assert '"total_return": round(total_return * 100.0, 2)' in backend
    assert '"cagr": round(cagr * 100.0, 2)' in backend
    assert '"volatility": round(annual_vol * 100.0, 2)' in backend
    assert "const pctVal = val;" in table
    assert "const pctVal = val * 100;" not in table


def test_asset_composition_uses_per_portfolio_relative_drift_and_sector_totals():
    project_root = Path(__file__).resolve().parents[1]
    view = (project_root / "frontend/src/components/markowitz/PortfolioComparisonView.tsx").read_text()

    assert "result.portfolios.map((portfolio, portfolioIndex)" in view
    assert "(changePp / asset.target_weight_pct) * 100" in view
    assert "Por ejemplo, 10% → 7,5% equivale a −25% (−2,5 p.p.)" in view
    assert "Peso sectorial final · comparación entre portfolios" in view
    assert "min-w-[530px]" not in view


def test_adjusted_price_download_is_parallel_and_bounded(monkeypatch):
    dates = pd.date_range("2024-01-02", periods=2, freq="B")
    columns = pd.MultiIndex.from_tuples([("Close", "AAPL"), ("Close", "SPY")])
    raw = pd.DataFrame([[100.0, 200.0], [101.0, 202.0]], index=dates, columns=columns)
    captured = {}

    def fake_download(tickers, **kwargs):
        captured.update(kwargs)
        return raw

    monkeypatch.setattr(comparison_service.yf, "download", fake_download)
    prices = comparison_service.fetch_adjusted_prices.__wrapped__(("AAPL", "SPY"), "2024-01-01")

    assert captured["auto_adjust"] is True
    assert captured["threads"] == 8
    assert captured["timeout"] == 10
    assert list(prices.columns) == ["AAPL", "SPY"]


def test_no_synthetic_data_when_provider_has_no_asset_history(loaded_portfolios, monkeypatch):
    _, prices = loaded_portfolios
    incomplete = prices.drop(columns=["MSFT"])
    monkeypatch.setattr(comparison_service, "fetch_adjusted_prices", lambda tickers, start: incomplete)

    with pytest.raises(comparison_service.MarketDataUnavailableError):
        comparison_service.compare_loaded_portfolios(
            PortfolioComparisonRequest(portfolio_a="growth", portfolio_b="balanced")
        )
