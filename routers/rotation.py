from fastapi import APIRouter, Request, Query, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional

from services.rotation_service import (
    load_user_holdings,
    load_all_user_holdings,
    save_user_holdings,
    update_holding,
    delete_holding,
    update_fixed_income_holding,
    delete_fixed_income_holding,
    analyze_rotation
)
from services.security_service import sanitize_ticker
import threading

router = APIRouter()
HOLDINGS_LOCK = threading.RLock()

class HoldingItemPayload(BaseModel):
    portfolio: Optional[str] = "bmb"
    ticker: str
    nominals: int
    ppc: Optional[float] = None

class BulkHoldingsPayload(BaseModel):
    portfolio: Optional[str] = "bmb"
    holdings: Dict[str, Dict[str, Any]]
    cash_ars: Optional[float] = 0.0

@router.get("/analysis", response_class=JSONResponse)
def get_rotation_analysis(target_pf: str = Query("min_drawdown_15")):
    """Retorna el análisis completo de brechas y sugerencias de rotación."""
    data = analyze_rotation(target_pf)
    return JSONResponse(content=data)

@router.get("/holdings", response_class=JSONResponse)
def get_holdings(portfolio: Optional[str] = Query("bmb")):
    """Retorna la tenencia real actual para la cartera solicitada."""
    pf_key = portfolio or "bmb"
    data = load_user_holdings(pf_key)
    return JSONResponse(content={"portfolio": pf_key, **data})

@router.get("/holdings/all", response_class=JSONResponse)
def get_all_holdings():
    """Retorna las tenencias reales de todas las carteras."""
    data = load_all_user_holdings()
    return JSONResponse(content=data)

@router.post("/holdings/update", response_class=JSONResponse)
def update_single_holding(payload: HoldingItemPayload):
    """Actualiza o agrega un activo a la tenencia real de la cartera."""
    clean_tk = sanitize_ticker(payload.ticker)
    if not clean_tk:
        return JSONResponse(content={"error": "Ticker inválido"}, status_code=400)
    
    pf_key = payload.portfolio or "bmb"
    with HOLDINGS_LOCK:
        updated = update_holding(clean_tk, payload.nominals, payload.ppc, portfolio_key=pf_key)
    return JSONResponse(content={"status": "ok", "portfolio": pf_key, "data": updated})

@router.post("/holdings/bulk_update", response_class=JSONResponse)
def bulk_update_holdings(payload: BulkHoldingsPayload):
    """Actualiza la tenencia completa en lote para la cartera."""
    pf_key = payload.portfolio or "bmb"
    with HOLDINGS_LOCK:
        save_user_holdings({
            "holdings": payload.holdings,
            "cash_ars": payload.cash_ars or 0.0
        }, portfolio_key=pf_key)
        data = load_user_holdings(pf_key)
    return JSONResponse(content={"status": "ok", "portfolio": pf_key, "data": data})

@router.delete("/holdings/{ticker}", response_class=JSONResponse)
def remove_holding(ticker: str, portfolio: Optional[str] = Query("bmb")):
    """Elimina un activo de la tenencia real de la cartera."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return JSONResponse(content={"error": "Ticker inválido"}, status_code=400)
    
    pf_key = portfolio or "bmb"
    with HOLDINGS_LOCK:
        current = delete_holding(clean_tk, portfolio_key=pf_key)
    return JSONResponse(content={"status": "ok", "portfolio": pf_key, "data": current})


@router.post("/fixed_income/update", response_class=JSONResponse)
def update_single_fixed_income_holding(payload: HoldingItemPayload):
    """Actualiza o agrega un activo de renta fija a la tenencia real de la cartera."""
    clean_tk = sanitize_ticker(payload.ticker)
    if not clean_tk:
        return JSONResponse(content={"error": "Ticker inválido"}, status_code=400)
    
    pf_key = payload.portfolio or "bmb"
    with HOLDINGS_LOCK:
        updated = update_fixed_income_holding(clean_tk, payload.nominals, payload.ppc, portfolio_key=pf_key)
    return JSONResponse(content={"status": "ok", "portfolio": pf_key, "data": updated})


@router.delete("/fixed_income/{ticker}", response_class=JSONResponse)
def remove_fixed_income_holding(ticker: str, portfolio: Optional[str] = Query("bmb")):
    """Elimina un activo de renta fija de la tenencia real de la cartera."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return JSONResponse(content={"error": "Ticker inválido"}, status_code=400)
    
    pf_key = portfolio or "bmb"
    with HOLDINGS_LOCK:
        current = delete_fixed_income_holding(clean_tk, portfolio_key=pf_key)
    return JSONResponse(content={"status": "ok", "portfolio": pf_key, "data": current})
