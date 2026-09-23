from fastapi import APIRouter, Query
import logging

from services.market_indices_service import (
    get_available_indices_metadata,
    get_indices_history,
    get_presidential_cycles
)
from services.exceptions import DomainValidationError, ExternalProviderError

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_REGIONS = {"arg", "br", "usa", "global"}

@router.get("/metadata")
def api_get_indices_metadata():
    """Retorna metadatos de regiones, monedas y horizontes disponibles."""
    try:
        return get_available_indices_metadata()
    except Exception as e:
        logger.error(f"Error obteniendo metadata de índices: {e}")
        raise ExternalProviderError(f"Error al obtener metadatos de índices: {e}")

@router.get("/history")
def api_get_indices_history(
    region: str = Query("arg", description="Región: arg, br, usa, global"),
    period: str = Query("max", description="Horizonte: 1y, 3y, 5y, 10y, 20y, max o ID de mandato"),
    currency: str = Query("usd", description="Moneda: usd, local"),
    normalized: bool = Query(False, description="Normalizar a Base 100")
):
    """Retorna la serie temporal de precios e indicadores para la región solicitada."""
    clean_region = region.strip().lower()
    clean_currency = currency.strip().lower()
    if clean_region not in VALID_REGIONS:
        raise DomainValidationError(f"Región '{clean_region}' no válida. Opciones permitidas: {', '.join(sorted(VALID_REGIONS))}")
    try:
        return get_indices_history(
            region=clean_region,
            period=period,
            currency=clean_currency,
            normalized=normalized
        )
    except Exception as e:
        logger.error(f"Error obteniendo histórico de índices: {e}")
        raise ExternalProviderError(f"Error al procesar el histórico de índices: {e}")

@router.get("/cycles")
def api_get_presidential_cycles(
    region: str = Query("arg", description="Región: arg, br, usa")
):
    """Retorna los mandatos presidenciales, hitos electorales y la tabla de métricas de gobierno."""
    clean_region = region.strip().lower()
    if clean_region not in {"arg", "br", "usa"}:
        raise DomainValidationError(f"Región '{clean_region}' no soportada para ciclos electorales. Opciones permitidas: arg, br, usa")
    try:
        return get_presidential_cycles(region=clean_region)
    except Exception as e:
        logger.error(f"Error obteniendo ciclos electorales: {e}")
        raise ExternalProviderError(f"Error al procesar los ciclos presidenciales: {e}")
