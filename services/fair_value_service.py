from typing import Dict, Any, Optional
from services.atomic_persistence import AtomicJsonDatabase
from services.data_paths import data_file
from services.security_service import sanitize_ticker
from services.utils import parse_price_input

DB_PATH = data_file("fair_values.json")
_db = AtomicJsonDatabase(DB_PATH)

# Conjunto de tickers correspondientes a mercados emergentes (LATAM, Asia Emergente, etc.)
EMERGING_MARKETS_TICKERS = {
    "MELI", "NU", "VIST", "PAM", "TSM", "PBR", "VALE", 
    "BBD", "TX", "EWZ", "FXI", "EEM", "ILF"
}

def load_fair_values() -> Dict[str, float]:
    """Carga el diccionario global de Fair Values {TICKER: GF_VALUE_USD}."""
    data = _db.load()
    if not isinstance(data, dict):
        return {}
    return {k.upper(): float(v) for k, v in data.items() if v is not None and isinstance(v, (int, float)) and v > 0}

def get_fair_value(ticker: str) -> Optional[float]:
    """Obtiene el Fair Value en USD para un ticker específico."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return None
    data = load_fair_values()
    return data.get(clean_tk)

def save_fair_value(ticker: str, value: Any) -> None:
    """Guarda o actualiza el Fair Value global de un ticker."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return
    data = _db.load()
    if not isinstance(data, dict):
        data = {}
    val_clean = parse_price_input(value)
    if val_clean is not None:
        data[clean_tk] = val_clean
    else:
        data.pop(clean_tk, None)
    _db.save(data)

def save_bulk_fair_values(values_dict: Dict[str, Any]) -> None:
    """Guarda en lote múltiples Fair Values en el almacenamiento global."""
    data = _db.load()
    if not isinstance(data, dict):
        data = {}
    for tk, val in values_dict.items():
        clean_tk = sanitize_ticker(tk)
        if not clean_tk:
            continue
        val_clean = parse_price_input(val)
        if val_clean is not None:
            data[clean_tk] = val_clean
        else:
            data.pop(clean_tk, None)
    _db.save(data)

def is_emerging_market(ticker: str) -> bool:
    """Indica si el activo pertenece a un mercado emergente."""
    clean_tk = sanitize_ticker(ticker)
    return clean_tk in EMERGING_MARKETS_TICKERS if clean_tk else False

def evaluate_fair_value_signal(ticker: str, current_price_usd: Optional[float], gf_val_map: Optional[Dict[str, float]] = None) -> Optional[Dict[str, Any]]:
    """
    Evalúa la señal de GuruFocus Fair Value para un activo:
    - Inactivo si no se ingresó Fair Value (o es <= 0) o no hay precio en USD.
    - Mercados de EE.UU./Desarrollados:
        * Descuento >= 25%: margen seg. -X%
        * Descuento > 0%: fair -X%
        * Sobrevaluado: fair +X%
    - Mercados Emergentes:
        * Descuento >= 35%: margen seg. -X%
        * Descuento > 0%: fair -X%
        * Sobrevaluado: fair +X%
    """
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return None
        
    if gf_val_map is not None:
        gf_val = gf_val_map.get(clean_tk)
    else:
        gf_val = get_fair_value(clean_tk)
        
    if not gf_val or gf_val <= 0:
        return None
        
    if current_price_usd is None or current_price_usd <= 0:
        return {
            "gf_value": gf_val,
            "current_price_usd": None,
            "discount_pct": None,
            "signal": "no_price",
            "badge_text": f"fair ${gf_val:.2f}",
            "badge_class": "gf-pill-neutral",
            "is_emerging": is_emerging_market(clean_tk)
        }
        
    discount_pct = ((gf_val - current_price_usd) / gf_val) * 100.0
    is_emerging = is_emerging_market(clean_tk)
    urgent_threshold = 35.0 if is_emerging else 25.0
    
    if discount_pct >= urgent_threshold:
        signal = "urgent_buy"
        badge_text = f"Subval. {discount_pct:.0f}%"
        badge_class = "gf-pill-urgent"
        tooltip = f"Margen de Seguridad ({urgent_threshold:.0f}%): Cotiza a ${current_price_usd:.2f} vs Fair Value de ${gf_val:.2f} ({discount_pct:.1f}% subvaluado)."
    elif discount_pct > 0:
        signal = "buy"
        badge_text = f"Subval. {discount_pct:.0f}%"
        badge_class = "gf-pill-buy"
        tooltip = f"Cotiza a ${current_price_usd:.2f} vs Fair Value de ${gf_val:.2f} ({discount_pct:.1f}% subvaluado)."
    else:
        signal = "overvalued"
        badge_text = f"Sobreval. {abs(discount_pct):.0f}%"
        badge_class = "gf-pill-neutral"
        tooltip = f"Cotiza a ${current_price_usd:.2f} vs Fair Value de ${gf_val:.2f} ({abs(discount_pct):.1f}% sobrevaluado)."

    return {
        "gf_value": gf_val,
        "current_price_usd": round(current_price_usd, 2),
        "discount_pct": round(discount_pct, 1),
        "signal": signal,
        "badge_text": badge_text,
        "badge_class": badge_class,
        "tooltip": tooltip,
        "is_emerging": is_emerging,
        "urgent_threshold": urgent_threshold
    }
