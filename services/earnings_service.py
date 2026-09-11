import logging
logger = logging.getLogger(__name__)
import os
from datetime import datetime, date
from typing import Dict, List, Any, Optional
from pathlib import Path
import pandas as pd
from services.atomic_persistence import AtomicJsonDatabase
from services.security_service import sanitize_ticker

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "earnings_calendar.json"
_db = AtomicJsonDatabase(DB_PATH)

MESES_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
}

MESES_CORTOS = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic"
}

def load_earnings_calendar() -> dict:
    """Carga la base de datos de calendario de reportes simplificada."""
    data = _db.load()
    return data if isinstance(data, dict) else {}

def save_confirmed_earnings_date(ticker: str, date_str: Optional[str]) -> bool:
    """Guarda o actualiza la fecha exacta de reporte (YYYY-MM-DD) para un ticker."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return False
    if clean_tk == "BRKB":
        clean_tk = "BRK.B"
        
    calendar = load_earnings_calendar()
    if clean_tk not in calendar:
        return False
        
    clean_date = date_str.strip() if date_str else ""
    if clean_date:
        try:
            # Validar formato ISO YYYY-MM-DD
            datetime.strptime(clean_date, "%Y-%m-%d")
            calendar[clean_tk]["confirmed_date"] = clean_date
        except ValueError:
            return False
    else:
        calendar[clean_tk].pop("confirmed_date", None)
        
    _db.save(calendar)
    return True

def calculate_earnings_status(
    ticker: str, 
    data_item: dict, 
    current_month: Optional[int] = None,
    ref_date: Optional[date] = None
) -> dict:
    """
    Calcula el estado del reporte con soporte para fecha certera confirmada o ciclo mensual:
    - Fechas pasadas (< 0 días): clasifica como 'past' y muestra cuándo reportó.
    - Hoy (0 días): '¡Reporta HOY!'
    - Próximos días de este mes / <= 31 días: 'pronto reporte (DD/MM)'
    - Próximo mes: 'reporte @mes (DD/MM)'
    - 2 o más meses: 'en X meses'
    """
    today = ref_date or datetime.now().date()
    if current_month is None:
        current_month = today.month
        
    report_months = data_item.get("report_months", [])
    confirmed_date_str = data_item.get("confirmed_date")
    
    # 1. Caso: Fecha exacta confirmada por el usuario
    if confirmed_date_str:
        try:
            c_date = datetime.strptime(confirmed_date_str, "%Y-%m-%d").date()
            delta_days = (c_date - today).days
            c_month = c_date.month
            c_month_name = MESES_ES.get(c_month, "").lower()
            
            if delta_days < 0:
                # La fecha confirmada ya pasó
                status_tier = "past"
                badge_class = "badge-past"
                is_active = False
                months_diff = 90 + min(9, abs(delta_days) // 30) # Para ordenar al final
                
                if delta_days == -1:
                    status_text = f"reportó ayer ({c_date.strftime('%d/%m')})"
                elif delta_days >= -7:
                    status_text = f"reportó hace {abs(delta_days)}d ({c_date.strftime('%d/%m')})"
                elif delta_days >= -30:
                    status_text = f"reportó el {c_date.strftime('%d/%m')}"
                else:
                    status_text = f"reportó el {c_date.strftime('%d/%m/%Y')}"
            elif delta_days == 0:
                # ¡Reporta HOY!
                months_diff = 0
                status_tier = "current_month"
                status_text = "🚨 ¡REPORTA HOY!"
                badge_class = "pill-imminent pill-today"
                is_active = True
            elif delta_days == 1:
                # Reporta Mañana (< 14 días: Evento relevante)
                months_diff = 0
                status_tier = "current_month"
                status_text = f"⚡ reporta mañana ({c_date.strftime('%d/%m')})"
                badge_class = "pill-imminent pill-event"
                is_active = True
            elif 2 <= delta_days < 14:
                # Evento relevante / noticia en menos de 14 días
                months_diff = 0
                status_tier = "current_month"
                status_text = f"⚡ reporta en {delta_days}d ({c_date.strftime('%d/%m')})"
                badge_class = "pill-imminent pill-event"
                is_active = True
            elif delta_days <= 60 and ((c_month - current_month) % 12 == 1):
                # Reporta el próximo mes (simplificado a 'reporta DD/MM')
                months_diff = 1
                status_tier = "next_month"
                status_text = f"reporta {c_date.strftime('%d/%m')}"
                badge_class = "pill-soon"
                is_active = True
            elif delta_days <= 31:
                # Reporta este mes (>= 14 días)
                months_diff = 0
                status_tier = "current_month"
                status_text = f"reporta {c_date.strftime('%d/%m')}"
                badge_class = "pill-imminent"
                is_active = True
            else:
                months_diff = (c_month - current_month) % 12
                if months_diff == 0:
                    months_diff = 12
                status_tier = "later"
                status_text = f"reporta {c_date.strftime('%d/%m/%Y')}"
                badge_class = "badge-later"
                is_active = False
                
            return {
                "ticker": ticker,
                "company": data_item.get("company", ticker),
                "fiscal_close": data_item.get("fiscal_close", "—"),
                "report_months_text": data_item.get("report_months_text", "—"),
                "report_months": report_months,
                "typical_window": data_item.get("typical_window", "—"),
                "confirmed_date": confirmed_date_str,
                "confirmed_date_formatted": c_date.strftime("%d/%m/%Y"),
                "target_month": c_month,
                "target_month_name": c_month_name,
                "months_diff": months_diff,
                "delta_days": delta_days,
                "status_tier": status_tier,
                "status_text": status_text,
                "badge_class": badge_class,
                "is_active": is_active
            }
        except Exception as e:
            logger.warning(f"Error ignorado en earnings: {e}")
            pass

    # 2. Caso: Estimación estándar por ciclo trimestral
    if not report_months:
        return {
            "ticker": ticker,
            "company": data_item.get("company", ticker),
            "fiscal_close": data_item.get("fiscal_close", "—"),
            "report_months_text": data_item.get("report_months_text", "—"),
            "report_months": [],
            "typical_window": data_item.get("typical_window", "—"),
            "confirmed_date": None,
            "confirmed_date_formatted": "—",
            "target_month": current_month,
            "target_month_name": MESES_ES.get(current_month, "").lower(),
            "months_diff": 99,
            "delta_days": None,
            "status_tier": "later",
            "status_text": "Sin meses configurados",
            "badge_class": "badge-later",
            "is_active": False
        }
        
    if current_month in report_months:
        months_diff = 0
        target_month = current_month
        status_tier = "current_month"
        status_text = "pronto reporte"
        badge_class = "pill-imminent"
        is_active = True
    else:
        diffs = [((m - current_month) % 12, m) for m in report_months]
        diffs.sort(key=lambda x: x[0])
        months_diff, target_month = diffs[0]
        target_month_name = MESES_ES.get(target_month, "").lower()
        
        if months_diff == 1:
            status_tier = "next_month"
            status_text = f"reporta @{target_month_name}"
            badge_class = "pill-soon"
            is_active = True
        else:
            status_tier = "later"
            status_text = f"en {months_diff} meses ({target_month_name})"
            badge_class = "badge-later"
            is_active = False
            
    return {
        "ticker": ticker,
        "company": data_item.get("company", ticker),
        "fiscal_close": data_item.get("fiscal_close", "—"),
        "report_months_text": data_item.get("report_months_text", "—"),
        "report_months": report_months,
        "typical_window": data_item.get("typical_window", "—"),
        "confirmed_date": None,
        "confirmed_date_formatted": "—",
        "target_month": target_month,
        "target_month_name": MESES_ES.get(target_month, "").lower(),
        "months_diff": months_diff,
        "delta_days": None,
        "status_tier": status_tier,
        "status_text": status_text,
        "badge_class": badge_class,
        "is_active": is_active
    }

def get_all_earnings_summary(current_month: Optional[int] = None, ref_date: Optional[date] = None) -> List[dict]:
    """Retorna la lista de las empresas ordenadas cronológicamente por cercanía de reporte."""
    cal = load_earnings_calendar()
    results = []
    for ticker, item in cal.items():
        res = calculate_earnings_status(ticker, item, current_month, ref_date)
        results.append(res)
        
    # Orden jerárquico inteligente:
    # 0 = Este mes / Próximos días (ordenados por delta_days ascendente)
    # 1 = Próximo mes (ordenados por delta_days ascendente o ticker)
    # 2 = Más adelante (ordenados por meses restantes)
    # 3 = Ya reportaron / Pasados (ordenados al final de la tabla)
    def _sort_rank(item: dict):
        tier = item.get("status_tier")
        if tier == "current_month":
            tier_rank = 0
            day_order = item.get("delta_days") if item.get("delta_days") is not None else 15
        elif tier == "next_month":
            tier_rank = 1
            day_order = item.get("delta_days") if item.get("delta_days") is not None else 45
        elif tier == "later":
            tier_rank = 2
            day_order = item.get("months_diff", 99) * 30
        else: # "past"
            tier_rank = 3
            day_order = abs(item.get("delta_days", 0))
        return (tier_rank, day_order, item["ticker"])

    results.sort(key=_sort_rank)
    return results

def get_ticker_earnings_badge(ticker: str, current_month: Optional[int] = None, ref_date: Optional[date] = None, cal: Optional[dict] = None) -> Optional[dict]:
    """
    Retorna el badge de alerta in situ ultra-discreto para el análisis de portfolios:
    - Si reporta hoy: '¡reporta hoy!'
    - Si reporta este mes: 'pronto reporte'
    - Si reporta el mes que viene: 'reporte @mes'
    - Si ya pasó o faltan 2+ meses: None (no ocupa espacio en portfolio)
    """
    if cal is None:
        cal = load_earnings_calendar()
    item = cal.get(ticker.upper())
    if not item and ticker.upper() == "BRKB":
        item = cal.get("BRK.B")
    if not item:
        return None
        
    status = calculate_earnings_status(ticker, item, current_month, ref_date)
    months_diff = status.get("months_diff", 99)
    status_tier = status.get("status_tier")
    target_month_name = status.get("target_month_name", "")
    confirmed_date = status.get("confirmed_date_formatted")
    delta_days = status.get("delta_days")
    
    tooltip = f"Mes de reporte: {target_month_name.capitalize()}"
    if confirmed_date and confirmed_date != "—":
        tooltip += f" | Fecha confirmada: {confirmed_date}"
        
    if delta_days == 0:
        return {
            "badge_text": "🚨 ¡reporta hoy!",
            "badge_class": "pill-imminent pill-today",
            "target_month_name": target_month_name,
            "tooltip": tooltip,
            "months_diff": 0
        }
    elif delta_days is not None and 1 <= delta_days < 14:
        # Evento Relevante (< 14 días)
        badge_txt = "⚡ reporta mañana" if delta_days == 1 else f"⚡ reporta {confirmed_date[:5]}"
        return {
            "badge_text": badge_txt,
            "badge_class": "pill-imminent pill-event",
            "target_month_name": target_month_name,
            "tooltip": f"Evento Relevante: Balance en {delta_days} días ({confirmed_date})",
            "months_diff": 0
        }
    elif delta_days is not None and delta_days >= 14 and months_diff in [0, 1]:
        return {
            "badge_text": f"reporta {confirmed_date[:5]}",
            "badge_class": "pill-imminent" if months_diff == 0 else "pill-soon",
            "target_month_name": target_month_name,
            "tooltip": tooltip,
            "months_diff": months_diff
        }
    elif status_tier == "current_month" and months_diff == 0:
        return {
            "badge_text": "pronto reporte",
            "badge_class": "pill-imminent",
            "target_month_name": target_month_name,
            "tooltip": tooltip,
            "months_diff": 0
        }
    elif status_tier == "next_month" and months_diff == 1:
        return {
            "badge_text": f"reporta @{target_month_name}",
            "badge_class": "pill-soon",
            "target_month_name": target_month_name,
            "tooltip": tooltip,
            "months_diff": 1
        }
    else:
        return None

