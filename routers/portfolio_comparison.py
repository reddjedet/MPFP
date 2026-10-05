"""API para comparar dos portfolios cargados por su asignación objetivo."""

from fastapi import APIRouter

from schemas.portfolio_comparison import (
    PortfolioComparisonRequest,
    PortfolioComparisonResponse,
)
from services.portfolio_comparison_service import compare_loaded_portfolios

router = APIRouter()


@router.post("/compare", response_model=PortfolioComparisonResponse)
def compare_portfolios(body: PortfolioComparisonRequest) -> PortfolioComparisonResponse:
    """Compara dos portfolios con una inversión hipotética inicial de USD 10.000."""
    return compare_loaded_portfolios(body)
