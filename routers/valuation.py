from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict
from services.valuation_service import (
    get_sectors_and_tickers, 
    get_profile_by_ticker, 
    evaluate_valuation
)
from services.fair_value_service import save_fair_value
from services.security_service import sanitize_ticker

router = APIRouter()

class EvaluateValuationRequest(BaseModel):
    ticker: str
    metrics: Dict[str, float]

class SyncGFRequest(BaseModel):
    ticker: str
    fair_value: float

@router.get("/data_json", response_class=JSONResponse)
def get_valuation_data_json():
    sectors = get_sectors_and_tickers()
    default_ticker = "NVDA"
    profile = get_profile_by_ticker(default_ticker)
    
    initial_metrics = {}
    if profile and "fields" in profile:
        for f in profile["fields"]:
            initial_metrics[f["key"]] = f.get("default", 0.0)
            
    initial_eval = evaluate_valuation(default_ticker, initial_metrics) if profile else None
    
    return JSONResponse({
        "sectors": sectors,
        "selected_ticker": default_ticker,
        "selected_profile": profile,
        "initial_eval": initial_eval
    })

@router.get("/profile_json/{ticker}", response_class=JSONResponse)
def get_single_profile_json(ticker: str):
    clean_tk = sanitize_ticker(ticker) or "NVDA"
    profile = get_profile_by_ticker(clean_tk)
    if not profile:
        live_price = None
        try:
            from services.cedear_service import get_ticker_data
            sym = "BRKB" if clean_tk in ("BRKB", "BRK.B") else clean_tk
            q = get_ticker_data(sym)
            if q and q.get("adr") and float(q.get("adr")) > 0:
                live_price = round(float(q.get("adr")), 2)
        except Exception:
            pass

        profile = {
            "name": clean_tk,
            "sector_id": "general",
            "model_type": "standard_fcf",
            "business_summary": "Empresa evaluada bajo metodología estándar.",
            "base_fcf_multiple": 20.0,
            "required_margin_of_safety": 0.25,
            "guidance": "Auditar estados financieros 10-K / 10-Q.",
            "live_market_price": live_price,
            "fields": [
                {"key": "price", "label": "💵 Precio de Mercado Actual (USD)", "help": "Cotización actual.", "default": live_price or 100.0, "step": 0.01},
                {"key": "fcf_per_share", "label": "📈 Dinero Libre / Acción Normalizado (USD)", "help": "Flujo de caja libre.", "default": 5.0, "step": 0.01},
                {"key": "roic", "label": "🎯 Retorno sobre Capital Invertido (ROIC %)", "help": "ROIC sostenible.", "default": 15.0, "step": 0.1},
                {"key": "wacc", "label": "⚖️ Costo Medio de Capital (WACC %)", "help": "Tasa de descuento.", "default": 9.0, "step": 0.1},
                {"key": "net_debt_ebitda", "label": "🛡️ Deuda Neta / EBITDA", "help": "Apalancamiento.", "default": 1.0, "step": 0.1},
                {"key": "shares_cagr", "label": "📉 Dilución / Recompras (Shares CAGR %)", "help": "Recompras (-) o Dilución (+).", "default": 0.0, "step": 0.1},
                {"key": "sbc_ocf", "label": "👥 Sueldos en Acciones (SBC / OCF %)", "help": "SBC sobre flujo operativo.", "default": 5.0, "step": 0.1}
            ]
        }
    return JSONResponse(profile)

@router.post("/evaluate_json", response_class=JSONResponse)
def evaluate_valuation_json(req: EvaluateValuationRequest):
    clean_tk = sanitize_ticker(req.ticker) or "GENERAL"
    result = evaluate_valuation(clean_tk, req.metrics)
    return JSONResponse(result)

@router.post("/sync_gf_json", response_class=JSONResponse)
def sync_gf_json(req: SyncGFRequest):
    clean_tk = sanitize_ticker(req.ticker)
    if clean_tk and req.fair_value and req.fair_value > 0:
        save_fair_value(clean_tk, req.fair_value)
        return JSONResponse({"success": True, "ticker": clean_tk, "fair_value": req.fair_value})
    return JSONResponse({"error": "Parámetros inválidos"}, status_code=400)
