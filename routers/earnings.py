from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from services.earnings_service import (
    get_all_earnings_summary, 
    save_confirmed_earnings_date,
    MESES_ES
)
from services.security_service import sanitize_ticker
from services.exceptions import DomainValidationError, InvalidTickerError
from datetime import datetime

router = APIRouter()

class UpdateDateRequest(BaseModel):
    ticker: str
    confirmed_date: Optional[str] = None

@router.get("/summary_json", response_class=JSONResponse)
def get_earnings_summary_json():
    now = datetime.now()
    current_month = now.month
    today_formatted = f"{now.day} de {MESES_ES.get(current_month, '')} de {now.year}"
    
    earnings_list = get_all_earnings_summary(current_month, now.date())
    
    current_month_count = sum(1 for x in earnings_list if x.get("status_tier") == "current_month")
    next_month_count = sum(1 for x in earnings_list if x.get("status_tier") == "next_month")
    later_count = sum(1 for x in earnings_list if x.get("status_tier") == "later")
    past_count = sum(1 for x in earnings_list if x.get("status_tier") == "past")
    unconfirmed_count = sum(1 for x in earnings_list if x.get("status_tier") == "unconfirmed")

    return JSONResponse({
        "today_str": today_formatted,
        "current_month": current_month,
        "current_month_name": MESES_ES.get(current_month, ""),
        "next_month_name": MESES_ES.get((current_month % 12) + 1, ""),
        "earnings": earnings_list,
        "stats": {
            "current_month_count": current_month_count,
            "next_month_count": next_month_count,
            "later_count": later_count,
            "past_count": past_count,
            "unconfirmed_count": unconfirmed_count,
            "total_count": len(earnings_list)
        }
    })

@router.post("/save_date_json", response_class=JSONResponse)
def save_confirmed_date_json(body: UpdateDateRequest):
    clean_tk = sanitize_ticker(body.ticker)
    if not clean_tk:
        raise InvalidTickerError("Ticker inválido")
        
    success = save_confirmed_earnings_date(clean_tk, body.confirmed_date)
    if success:
        return JSONResponse({"success": True, "ticker": clean_tk, "confirmed_date": body.confirmed_date})
    raise DomainValidationError("No se pudo guardar la fecha para el ticker especificado")
