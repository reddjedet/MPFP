"""Contrato de entrada y salida para la comparación de portfolios cargados."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from services.security_service import sanitize_portfolio_name


ComparisonPeriod = Literal["1y", "3y", "5y"]


class PortfolioComparisonRequest(BaseModel):
    portfolio_a: str = Field(min_length=1, max_length=30)
    portfolio_b: str = Field(min_length=1, max_length=30)
    period: ComparisonPeriod = "5y"

    @field_validator("portfolio_a", "portfolio_b")
    @classmethod
    def clean_portfolio_name(cls, value: str) -> str:
        clean = sanitize_portfolio_name(value)
        if not clean:
            raise ValueError("El nombre de portfolio no es válido.")
        return clean

    @model_validator(mode="after")
    def portfolios_must_differ(self):
        if self.portfolio_a == self.portfolio_b:
            raise ValueError("Seleccioná dos portfolios distintos.")
        return self


class AnnualReturn(BaseModel):
    year: int
    return_pct: float
    partial: bool = False


class AssetComposition(BaseModel):
    ticker: str
    sector_id: str
    sector_name: str
    target_weight_pct: float
    end_weight_pct: float


class SectorComposition(BaseModel):
    sector_id: str
    sector_name: str
    target_weight_pct: float
    end_weight_pct: float


class PortfolioComparisonStats(BaseModel):
    initial_balance: float
    final_balance: float
    total_return_pct: float
    cagr_pct: float | None
    annualized_volatility_pct: float | None
    sharpe: float | None
    sortino: float | None
    max_drawdown_pct: float
    calmar: float | None
    alpha_annual_vs_spy_pct: float | None
    alpha_3m_vs_spy_pct: float | None
    alpha_6m_vs_spy_pct: float | None
    alpha_ytd_vs_spy_pct: float | None
    alpha_1y_vs_spy_pct: float | None
    rsi_14: float | None
    return_1y_pct: float | None
    return_3y_pct: float | None
    return_5y_pct: float | None
    best_year: AnnualReturn | None
    worst_year: AnnualReturn | None
    annual_returns: list[AnnualReturn]


class ComparedPortfolio(BaseModel):
    id: str
    name: str
    stats: PortfolioComparisonStats
    asset_composition: list[AssetComposition]
    sector_composition: list[SectorComposition]


class PortfolioComparisonPoint(BaseModel):
    date: str
    balance_a: float
    balance_b: float
    spy_balance: float
    drawdown_a_pct: float
    drawdown_b_pct: float
    spy_drawdown_pct: float


class PortfolioComparisonResponse(BaseModel):
    success: bool = True
    period: ComparisonPeriod
    requested_period_years: int
    available_years: float
    start_date: str
    end_date: str
    initial_investment: float
    risk_free_rate_pct: float
    portfolios: list[ComparedPortfolio] = Field(min_length=2, max_length=2)
    time_series: list[PortfolioComparisonPoint]
