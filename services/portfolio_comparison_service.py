"""Historial común y métricas para comparar dos portfolios por pesos objetivo."""

from __future__ import annotations

from datetime import date, timedelta
import logging
import math
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

from services.cache_service import smart_cache
from services.cedear_service import calculate_rsi
from services.exceptions import (
    DomainValidationError,
    MarketDataUnavailableError,
    PortfolioNotFoundError,
)
from services.portfolio_service import get_ticker_sector, load_portfolios
from services.security_service import sanitize_ticker
from schemas.portfolio_comparison import (
    AnnualReturn,
    AssetComposition,
    ComparedPortfolio,
    PortfolioComparisonPoint,
    PortfolioComparisonRequest,
    PortfolioComparisonResponse,
    PortfolioComparisonStats,
    SectorComposition,
)

logger = logging.getLogger(__name__)

INITIAL_INVESTMENT = 10_000.0
RISK_FREE_RATE = 0.04
TRADING_DAYS_PER_YEAR = 252
PERIOD_YEARS = {"1y": 1, "3y": 3, "5y": 5}


def _yahoo_symbol(ticker: str) -> str:
    return "BRK-B" if ticker in {"BRKB", "BRK.B"} else ticker


@smart_cache("historical")
def fetch_adjusted_prices(tickers: tuple[str, ...], start: str) -> pd.DataFrame:
    """Descarga precios diarios ajustados; nunca sustituye datos faltantes por simulaciones."""
    yahoo_to_ticker = {_yahoo_symbol(ticker): ticker for ticker in tickers}
    try:
        raw = yf.download(
            list(yahoo_to_ticker),
            start=start,
            interval="1d",
            auto_adjust=True,
            progress=False,
            threads=8,
            timeout=10,
        )
    except Exception as exc:
        logger.warning("No se pudieron descargar precios para comparación: %s", exc)
        raise MarketDataUnavailableError(
            "No se pudieron consultar precios históricos ajustados. Intentá nuevamente más tarde."
        ) from exc

    if raw is None or raw.empty:
        raise MarketDataUnavailableError("El proveedor no devolvió precios históricos para los activos seleccionados.")

    close: Any = None
    if isinstance(raw.columns, pd.MultiIndex):
        for level in range(raw.columns.nlevels):
            if "Close" in raw.columns.get_level_values(level):
                close = raw.xs("Close", axis=1, level=level, drop_level=True)
                break
    elif "Close" in raw.columns:
        close = raw.loc[:, ["Close"]].copy()
        if len(yahoo_to_ticker) == 1:
            close.columns = [next(iter(yahoo_to_ticker))]

    if close is None or close.empty:
        raise MarketDataUnavailableError("El proveedor no devolvió precios ajustados en un formato válido.")

    if isinstance(close, pd.Series):
        close = close.to_frame()
    close.columns = [str(column) for column in close.columns]
    close = close.rename(columns=yahoo_to_ticker)
    close.index = pd.to_datetime(close.index)
    if getattr(close.index, "tz", None) is not None:
        close.index = close.index.tz_localize(None)
    close = close.sort_index()
    return close


def _normalized_weights(portfolio_id: str, portfolio_data: dict[str, Any]) -> dict[str, float]:
    assets = portfolio_data.get("assets", {}) if isinstance(portfolio_data, dict) else {}
    if not isinstance(assets, dict) or not assets:
        raise DomainValidationError(f"El portfolio '{portfolio_id}' no tiene pesos objetivo para comparar.")

    weights: dict[str, float] = {}
    for raw_ticker, raw_weight in assets.items():
        ticker = sanitize_ticker(str(raw_ticker))
        try:
            weight = float(raw_weight)
        except (TypeError, ValueError):
            raise DomainValidationError(f"El peso de {raw_ticker} en '{portfolio_id}' no es válido.") from None
        if not ticker or not math.isfinite(weight) or weight < 0:
            raise DomainValidationError(f"El activo o peso de {raw_ticker} en '{portfolio_id}' no es válido.")
        if weight > 0:
            weights[ticker] = weights.get(ticker, 0.0) + weight

    total = sum(weights.values())
    if not math.isfinite(total) or total <= 0:
        raise DomainValidationError(f"El portfolio '{portfolio_id}' no tiene pesos positivos.")
    return {ticker: weight / total for ticker, weight in weights.items()}


def _window_start_index(index: pd.DatetimeIndex, requested_start: pd.Timestamp) -> int | None:
    if index.empty or index[0] > requested_start:
        return None
    start_index = int(index.searchsorted(requested_start, side="right") - 1)
    return start_index if 0 <= start_index < len(index) else None


def _period_start_index(index: pd.DatetimeIndex, years: int) -> int:
    requested_start = index[-1] - pd.DateOffset(years=years)
    start_index = _window_start_index(index, requested_start)
    return start_index if start_index is not None else 0


def _simulate_buy_and_hold(
    prices: pd.DataFrame,
    weights: dict[str, float],
    start_index: int,
) -> tuple[pd.Series, dict[str, float]]:
    """Invierte según los pesos iniciales y mantiene las mismas unidades hasta el final."""
    selected_prices = prices.loc[:, list(weights)].iloc[start_index:]
    first_prices = selected_prices.iloc[0]
    shares = {
        ticker: INITIAL_INVESTMENT * weight / float(first_prices[ticker])
        for ticker, weight in weights.items()
    }
    nav = selected_prices.mul(pd.Series(shares), axis=1).sum(axis=1)
    return nav, shares


def _annual_returns(returns: pd.Series, start_date: pd.Timestamp, end_date: pd.Timestamp) -> list[AnnualReturn]:
    if returns.empty:
        return []
    grouped = returns.groupby(returns.index.year)
    annual: list[AnnualReturn] = []
    for year, values in grouped:
        first_day = pd.Timestamp(year=int(year), month=1, day=1)
        last_day = pd.Timestamp(year=int(year), month=12, day=31)
        partial = (int(year) == start_date.year and start_date > first_day) or (
            int(year) == end_date.year and end_date < last_day
        )
        annual.append(AnnualReturn(
            year=int(year),
            return_pct=round(float((1.0 + values).prod() - 1.0) * 100.0, 2),
            partial=partial,
        ))
    return annual


def _calculate_stats(
    nav: pd.Series,
    prices: pd.DataFrame,
    weights: dict[str, float],
) -> PortfolioComparisonStats:
    spy_prices = prices["SPY"].iloc[prices.index.get_indexer(nav.index)]
    spy_nav = spy_prices / float(spy_prices.iloc[0]) * INITIAL_INVESTMENT
    start_value = float(nav.iloc[0])
    end_value = float(nav.iloc[-1])
    total_return = end_value / start_value - 1.0 if start_value > 0 else 0.0
    elapsed_years = (nav.index[-1] - nav.index[0]).total_seconds() / (365.2425 * 24 * 60 * 60)
    cagr = (end_value / start_value) ** (1.0 / elapsed_years) - 1.0 if elapsed_years > 0 and end_value > 0 else None

    returns = nav.pct_change().dropna()
    annual_volatility: float | None = None
    sharpe: float | None = None
    sortino: float | None = None
    daily_rf = (1.0 + RISK_FREE_RATE) ** (1.0 / TRADING_DAYS_PER_YEAR) - 1.0
    if len(returns) > 1:
        daily_vol = float(returns.std(ddof=1))
        annual_volatility = daily_vol * math.sqrt(TRADING_DAYS_PER_YEAR)
        if annual_volatility > 0:
            sharpe = (float(returns.mean()) - daily_rf) * TRADING_DAYS_PER_YEAR / annual_volatility
        downside = np.minimum(returns.to_numpy(dtype=float) - daily_rf, 0.0)
        downside_deviation = float(np.sqrt(np.mean(downside**2)) * math.sqrt(TRADING_DAYS_PER_YEAR))
        if downside_deviation > 0:
            sortino = (float(returns.mean()) - daily_rf) * TRADING_DAYS_PER_YEAR / downside_deviation

    drawdown = nav / nav.cummax() - 1.0
    max_drawdown = float(drawdown.min()) if not drawdown.empty else 0.0
    calmar = cagr / abs(max_drawdown) if cagr is not None and abs(max_drawdown) > 1e-12 else None

    benchmark_years = (spy_nav.index[-1] - spy_nav.index[0]).total_seconds() / (365.2425 * 24 * 60 * 60)
    benchmark_cagr = (
        (float(spy_nav.iloc[-1] / spy_nav.iloc[0]) ** (1.0 / benchmark_years) - 1.0)
        if benchmark_years > 0 and float(spy_nav.iloc[-1]) > 0
        else None
    )

    latest_date = nav.index[-1]

    def window_metrics(requested_start: pd.Timestamp) -> tuple[float | None, float | None]:
        start_index = _window_start_index(prices.index, requested_start)
        if start_index is None:
            return None, None
        window_nav, _ = _simulate_buy_and_hold(prices, weights, start_index)
        window_spy = prices["SPY"].iloc[start_index:]
        portfolio_return = float(window_nav.iloc[-1] / window_nav.iloc[0] - 1.0)
        spy_return = float(window_spy.iloc[-1] / window_spy.iloc[0] - 1.0)
        return portfolio_return, spy_return

    alpha_3m, spy_3m = window_metrics(latest_date - pd.DateOffset(months=3))
    alpha_6m, spy_6m = window_metrics(latest_date - pd.DateOffset(months=6))
    alpha_ytd, spy_ytd = window_metrics(pd.Timestamp(year=latest_date.year, month=1, day=1))
    alpha_1y, spy_1y = window_metrics(latest_date - pd.DateOffset(years=1))

    annual = _annual_returns(returns, nav.index[0], nav.index[-1])
    best_year = max(annual, key=lambda item: item.return_pct) if annual else None
    worst_year = min(annual, key=lambda item: item.return_pct) if annual else None
    rsi_values = calculate_rsi(nav, period=14).dropna()
    rsi = float(rsi_values.iloc[-1]) if not rsi_values.empty else None

    horizon_returns: dict[int, float | None] = {}
    for years in (1, 3, 5):
        horizon_start = _window_start_index(prices.index, latest_date - pd.DateOffset(years=years))
        if horizon_start is None:
            horizon_returns[years] = None
        else:
            horizon_nav, _ = _simulate_buy_and_hold(prices, weights, horizon_start)
            horizon_returns[years] = float(horizon_nav.iloc[-1] / horizon_nav.iloc[0] - 1.0) * 100.0

    def alpha_diff(portfolio_window: float | None, spy_window: float | None) -> float | None:
        if portfolio_window is None or spy_window is None:
            return None
        return round((portfolio_window - spy_window) * 100.0, 2)

    return PortfolioComparisonStats(
        initial_balance=INITIAL_INVESTMENT,
        final_balance=round(INITIAL_INVESTMENT * (1.0 + total_return), 2),
        total_return_pct=round(total_return * 100.0, 2),
        cagr_pct=round(cagr * 100.0, 2) if cagr is not None else None,
        annualized_volatility_pct=round(annual_volatility * 100.0, 2) if annual_volatility is not None else None,
        sharpe=round(sharpe, 3) if sharpe is not None else None,
        sortino=round(sortino, 3) if sortino is not None else None,
        max_drawdown_pct=round(max_drawdown * 100.0, 2),
        calmar=round(calmar, 3) if calmar is not None else None,
        alpha_annual_vs_spy_pct=(round((cagr - benchmark_cagr) * 100.0, 2) if cagr is not None and benchmark_cagr is not None else None),
        alpha_3m_vs_spy_pct=alpha_diff(alpha_3m, spy_3m),
        alpha_6m_vs_spy_pct=alpha_diff(alpha_6m, spy_6m),
        alpha_ytd_vs_spy_pct=alpha_diff(alpha_ytd, spy_ytd),
        alpha_1y_vs_spy_pct=alpha_diff(alpha_1y, spy_1y),
        rsi_14=round(rsi, 2) if rsi is not None else None,
        return_1y_pct=round(horizon_returns[1], 2) if horizon_returns[1] is not None else None,
        return_3y_pct=round(horizon_returns[3], 2) if horizon_returns[3] is not None else None,
        return_5y_pct=round(horizon_returns[5], 2) if horizon_returns[5] is not None else None,
        best_year=best_year,
        worst_year=worst_year,
        annual_returns=annual,
    )


def _composition(weights: dict[str, float], shares: dict[str, float], latest_prices: pd.Series) -> tuple[list[AssetComposition], list[SectorComposition]]:
    end_values = {ticker: float(shares[ticker] * latest_prices[ticker]) for ticker in weights}
    total_end_value = sum(end_values.values())
    assets: list[AssetComposition] = []
    sectors: dict[str, dict[str, Any]] = {}
    for ticker, weight in weights.items():
        sector = get_ticker_sector(ticker)
        end_weight = end_values[ticker] / total_end_value if total_end_value > 0 else 0.0
        assets.append(AssetComposition(
            ticker=ticker,
            sector_id=sector["id"],
            sector_name=sector["name"],
            target_weight_pct=round(weight * 100.0, 2),
            end_weight_pct=round(end_weight * 100.0, 2),
        ))
        bucket = sectors.setdefault(sector["id"], {
            "name": sector["name"], "target": 0.0, "end": 0.0
        })
        bucket["target"] += weight
        bucket["end"] += end_weight

    assets.sort(key=lambda item: item.target_weight_pct, reverse=True)
    sector_rows = [
        SectorComposition(
            sector_id=sector_id,
            sector_name=values["name"],
            target_weight_pct=round(values["target"] * 100.0, 2),
            end_weight_pct=round(values["end"] * 100.0, 2),
        )
        for sector_id, values in sectors.items()
    ]
    sector_rows.sort(key=lambda item: item.target_weight_pct, reverse=True)
    return assets, sector_rows


def compare_loaded_portfolios(request: PortfolioComparisonRequest) -> PortfolioComparisonResponse:
    portfolios = load_portfolios()
    portfolio_ids = [request.portfolio_a, request.portfolio_b]
    missing = [portfolio_id for portfolio_id in portfolio_ids if portfolio_id not in portfolios]
    if missing:
        raise PortfolioNotFoundError(f"No se encontraron estos portfolios: {', '.join(missing)}.")

    weights_by_id = {
        portfolio_id: _normalized_weights(portfolio_id, portfolios[portfolio_id])
        for portfolio_id in portfolio_ids
    }
    tickers = sorted({ticker for weights in weights_by_id.values() for ticker in weights} | {"SPY"})
    fetch_start = (date.today() - timedelta(days=5 * 365 + 45)).isoformat()
    prices = fetch_adjusted_prices(tuple(tickers), fetch_start)

    missing_columns = [ticker for ticker in tickers if ticker not in prices.columns or prices[ticker].dropna().empty]
    if missing_columns:
        raise MarketDataUnavailableError(
            "Faltan precios históricos reales para algunos activos; no se generaron valores de reemplazo.",
            details={"tickers": missing_columns},
        )
    prices = prices.loc[:, tickers].apply(pd.to_numeric, errors="coerce")
    prices = prices.replace([np.inf, -np.inf], np.nan).where(prices > 0).dropna(how="any")
    prices = prices.loc[~prices.index.duplicated(keep="last")]
    if len(prices) < 20:
        raise MarketDataUnavailableError("No hay suficientes fechas comunes de precios para comparar estos portfolios.")

    index = pd.DatetimeIndex(prices.index)
    latest_date = index[-1]
    available_years = max(0.0, (latest_date - index[0]).total_seconds() / (365.2425 * 24 * 60 * 60))
    period_years = PERIOD_YEARS[request.period]
    start_index = _period_start_index(index, period_years)

    selected_series: list[pd.Series] = []
    shares_by_id: dict[str, dict[str, float]] = {}
    for portfolio_id in portfolio_ids:
        nav, shares = _simulate_buy_and_hold(prices, weights_by_id[portfolio_id], start_index)
        selected_series.append(nav)
        shares_by_id[portfolio_id] = shares

    chart_spy_prices = prices["SPY"].iloc[start_index:]
    normalized_spy = chart_spy_prices / float(chart_spy_prices.iloc[0]) * INITIAL_INVESTMENT
    chart_dates = prices.index[start_index:]

    compared: list[ComparedPortfolio] = []
    for portfolio_id, selected_nav in zip(portfolio_ids, selected_series):
        asset_composition, sector_composition = _composition(
            weights_by_id[portfolio_id], shares_by_id[portfolio_id], prices.iloc[-1]
        )
        compared.append(ComparedPortfolio(
            id=portfolio_id,
            name=portfolio_id.replace("_", " ").upper(),
            stats=_calculate_stats(selected_nav, prices, weights_by_id[portfolio_id]),
            asset_composition=asset_composition,
            sector_composition=sector_composition,
        ))

    normalized_a = selected_series[0]
    normalized_b = selected_series[1]
    drawdown_a = normalized_a / normalized_a.cummax() - 1.0
    drawdown_b = normalized_b / normalized_b.cummax() - 1.0
    drawdown_spy = normalized_spy / normalized_spy.cummax() - 1.0

    time_series = [
        PortfolioComparisonPoint(
            date=timestamp.strftime("%Y-%m-%d"),
            balance_a=round(float(normalized_a.iloc[position]), 2),
            balance_b=round(float(normalized_b.iloc[position]), 2),
            spy_balance=round(float(normalized_spy.iloc[position]), 2),
            drawdown_a_pct=round(float(drawdown_a.iloc[position]) * 100.0, 2),
            drawdown_b_pct=round(float(drawdown_b.iloc[position]) * 100.0, 2),
            spy_drawdown_pct=round(float(drawdown_spy.iloc[position]) * 100.0, 2),
        )
        for position, timestamp in enumerate(chart_dates)
    ]

    return PortfolioComparisonResponse(
        period=request.period,
        requested_period_years=period_years,
        available_years=round(available_years, 2),
        start_date=chart_dates[0].strftime("%Y-%m-%d"),
        end_date=chart_dates[-1].strftime("%Y-%m-%d"),
        initial_investment=INITIAL_INVESTMENT,
        risk_free_rate_pct=RISK_FREE_RATE * 100.0,
        portfolios=compared,
        time_series=time_series,
    )
