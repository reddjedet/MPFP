from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import logging

from services.market_indices_service import (
    get_available_indices_metadata,
    get_indices_history,
    get_presidential_cycles
)
from services.security_service import sanitize_ticker

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/metadata")
def api_get_indices_metadata():
    """Retorna metadatos de regiones, monedas y horizontes disponibles."""
    try:
        return get_available_indices_metadata()
    except Exception as e:
        logger.error(f"Error obteniendo metadata de índices: {e}")
        raise HTTPException(status_code=500, detail="Error interno al obtener metadatos")

@router.get("/history")
def api_get_indices_history(
    region: str = Query("arg", description="Región: arg, br, usa, global"),
    period: str = Query("max", description="Horizonte: 1y, 3y, 5y, 10y, 20y, max o ID de mandato"),
    currency: str = Query("usd", description="Moneda: usd, local"),
    normalized: bool = Query(False, description="Normalizar a Base 100")
):
    """Retorna la serie temporal de precios e indicadores para la región solicitada."""
    try:
        clean_region = region.strip().lower()
        clean_currency = currency.strip().lower()
        return get_indices_history(
            region=clean_region,
            period=period,
            currency=clean_currency,
            normalized=normalized
        )
    except Exception as e:
        logger.error(f"Error obteniendo histórico de índices: {e}")
        raise HTTPException(status_code=500, detail="Error interno al procesar el histórico")

@router.get("/cycles")
def api_get_presidential_cycles(
    region: str = Query("arg", description="Región: arg, br, usa")
):
    """Retorna los mandatos presidenciales, hitos electorales y la tabla de métricas de gobierno."""
    try:
        clean_region = region.strip().lower()
        return get_presidential_cycles(region=clean_region)
    except Exception as e:
        logger.error(f"Error obteniendo ciclos electorales: {e}")
        raise HTTPException(status_code=500, detail="Error interno al procesar los ciclos presidenciales")
