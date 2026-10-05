import logging
logger = logging.getLogger(__name__)
from datetime import datetime, date
from typing import List, Optional
from services.atomic_persistence import AtomicJsonDatabase
from services.data_paths import data_file
from services.security_service import sanitize_ticker

DB_PATH = data_file("earnings_calendar.json")
_db = AtomicJsonDatabase(DB_PATH)

MESES_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
}

def load_earnings_calendar() -> dict:
    """Carga la base de datos de calendario de reportes simplificada."""
    data = _db.load()
    return data if isinstance(data, dict) else {}

def _normalize_ticker(ticker: str) -> Optional[str]:
    clean_ticker = sanitize_ticker(ticker)
    if clean_ticker == "BRKB":
        return "BRK.B"
    return clean_ticker

def _get_ticker_universe() -> tuple[list[str], set[str]]:
    """Devuelve tickers elegibles y cuáles pertenecen a carteras activas."""
    from services.cedear_service import load_cedear_ratios
    from services.portfolio_service import get_all_portfolio_tickers

    def normalize_many(tickers) -> set[str]:
        normalized_tickers = set()
        for ticker in tickers:
            normalized = _normalize_ticker(ticker)
            if normalized:
                normalized_tickers.add(normalized)
        return normalized_tickers

    portfolio_tickers = normalize_many(get_all_portfolio_tickers())
    cedear_tickers = normalize_many(load_cedear_ratios())
    return sorted(cedear_tickers | portfolio_tickers), portfolio_tickers

def _get_eligible_tickers() -> list[str]:
    return _get_ticker_universe()[0]

def save_confirmed_earnings_date(ticker: str, date_str: Optional[str]) -> bool:
    """Guarda o elimina la fecha exacta ingresada por el usuario."""
    clean_tk = _normalize_ticker(ticker)
    if not clean_tk or clean_tk not in _get_eligible_tickers():
        return False

    calendar = load_earnings_calendar()
    storage_ticker = next(
        (key for key in calendar if _normalize_ticker(key) == clean_tk),
        clean_tk,
    )
    item = calendar.get(storage_ticker)
    if not isinstance(item, dict):
        item = {"company": clean_tk}

    if date_str is not None and not isinstance(date_str, str):
        return False
    clean_date = date_str.strip() if date_str else ""
    if clean_date:
        try:
            parsed_date = date.fromisoformat(clean_date)
            if parsed_date.isoformat() != clean_date:
                return False
            item["confirmed_date"] = clean_date
        except ValueError:
            return False
    else:
        item.pop("confirmed_date", None)

    calendar[storage_ticker] = item
    _db.save(calendar)
    return True

def calculate_earnings_status(
    ticker: str, 
    data_item: dict, 
    current_month: Optional[int] = None,
    ref_date: Optional[date] = None
) -> dict:
    """Calcula el estado exclusivamente desde una fecha exacta confirmada."""
    today = ref_date or datetime.now().date()
    confirmed_date_str = data_item.get("confirmed_date")
    base_status = {
        "ticker": ticker,
        "company": data_item.get("company", ticker),
        "confirmed_date": None,
        "confirmed_date_formatted": "—",
        "delta_days": None,
        "status_tier": "unconfirmed",
        "status_text": "Sin fecha confirmada",
        "badge_class": "badge-unconfirmed",
        "is_active": False,
    }
    if not confirmed_date_str:
        return base_status

    try:
        c_date = date.fromisoformat(confirmed_date_str)
        if c_date.isoformat() != confirmed_date_str:
            raise ValueError("La fecha no está en formato ISO")
    except (TypeError, ValueError) as error:
        logger.warning("Fecha de reporte inválida para %s: %s", ticker, error)
        return base_status

    delta_days = (c_date - today).days
    if delta_days < 0:
        status_tier = "past"
        badge_class = "badge-past"
        is_active = False
        if delta_days == -1:
            status_text = f"reportó ayer ({c_date.strftime('%d/%m')})"
        elif delta_days >= -7:
            status_text = f"reportó hace {abs(delta_days)}d ({c_date.strftime('%d/%m')})"
        elif delta_days >= -30:
            status_text = f"reportó el {c_date.strftime('%d/%m')}"
        else:
            status_text = f"reportó el {c_date.strftime('%d/%m/%Y')}"
    else:
        next_month = today.month % 12 + 1
        next_year = today.year + (1 if today.month == 12 else 0)
        if c_date.year == today.year and c_date.month == today.month:
            status_tier = "current_month"
        elif c_date.year == next_year and c_date.month == next_month:
            status_tier = "next_month"
        else:
            status_tier = "later"

        if delta_days == 0:
            status_text = "🚨 ¡REPORTA HOY!"
            badge_class = "pill-imminent pill-today"
        elif delta_days < 14:
            status_text = f"reporta en {delta_days}d ({c_date.strftime('%d/%m')})"
            badge_class = "pill-imminent pill-event"
        else:
            status_text = f"reporta el {c_date.strftime('%d/%m/%Y')}"
            badge_class = {
                "current_month": "pill-imminent",
                "next_month": "pill-soon",
                "later": "badge-later",
            }[status_tier]
        is_active = status_tier in {"current_month", "next_month"}

    return {
        **base_status,
        "confirmed_date": confirmed_date_str,
        "confirmed_date_formatted": c_date.strftime("%d/%m/%Y"),
        "delta_days": delta_days,
        "status_tier": status_tier,
        "status_text": status_text,
        "badge_class": badge_class,
        "is_active": is_active
    }

def get_all_earnings_summary(current_month: Optional[int] = None, ref_date: Optional[date] = None) -> List[dict]:
    """Lista el universo vigente de CEDEARs/carteras, con fechas solo si fueron ingresadas."""
    calendar = load_earnings_calendar()
    normalized_calendar = {
        normalized: item
        for ticker, item in calendar.items()
        if (normalized := _normalize_ticker(ticker)) and isinstance(item, dict)
    }
    eligible_tickers, portfolio_tickers = _get_ticker_universe()
    results = []
    for ticker in eligible_tickers:
        item = dict(normalized_calendar.get(ticker, {}))
        item.setdefault("company", ticker)
        status = calculate_earnings_status(ticker, item, current_month, ref_date)
        status["in_portfolio"] = ticker in portfolio_tickers
        results.append(status)

    def _sort_rank(item: dict):
        tier = item.get("status_tier")
        tier_ranks = {"current_month": 0, "next_month": 1, "later": 2, "unconfirmed": 3, "past": 4}
        tier_rank = tier_ranks.get(tier, 5)
        if tier == "past":
            day_order = abs(item.get("delta_days", 0))
        elif tier == "unconfirmed":
            day_order = 0
        else:
            day_order = item.get("delta_days") or 0
        return (tier_rank, day_order, item["ticker"])

    results.sort(key=_sort_rank)
    return results

def get_ticker_earnings_badge(ticker: str, current_month: Optional[int] = None, ref_date: Optional[date] = None, cal: Optional[dict] = None) -> Optional[dict]:
    """Retorna una alerta solo cuando existe fecha exacta confirmada próxima."""
    if cal is None:
        cal = load_earnings_calendar()
    clean_ticker = _normalize_ticker(ticker)
    if not clean_ticker:
        return None
    item = next(
        (value for key, value in cal.items() if _normalize_ticker(key) == clean_ticker),
        None,
    )
    if not isinstance(item, dict) or not item.get("confirmed_date"):
        return None

    status = calculate_earnings_status(ticker, item, current_month, ref_date)
    status_tier = status.get("status_tier")
    confirmed_date = status.get("confirmed_date_formatted")
    delta_days = status.get("delta_days")
    tooltip = f"Fecha confirmada: {confirmed_date}"

    if delta_days == 0:
        return {
            "badge_text": "🚨 ¡reporta hoy!",
            "badge_class": "pill-imminent pill-today",
            "tooltip": tooltip,
        }
    elif delta_days is not None and 1 <= delta_days < 14:
        badge_txt = "⚡ reporta mañana" if delta_days == 1 else f"⚡ reporta {confirmed_date[:5]}"
        return {
            "badge_text": badge_txt,
            "badge_class": "pill-imminent pill-event",
            "tooltip": f"Evento relevante: fecha confirmada en {delta_days} días ({confirmed_date})",
        }
    elif delta_days is not None and delta_days >= 14 and status_tier in {"current_month", "next_month"}:
        return {
            "badge_text": f"reporta {confirmed_date[:5]}",
            "badge_class": "pill-imminent" if status_tier == "current_month" else "pill-soon",
            "tooltip": tooltip,
        }
    else:
        return None
