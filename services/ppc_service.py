from pathlib import Path
from typing import Dict, Any, Optional
from services.atomic_persistence import AtomicJsonDatabase
from services.security_service import sanitize_ticker

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ppc_values.json"
_db = AtomicJsonDatabase(DB_PATH)

def load_ppc_values() -> Dict[str, float]:
    """Carga el diccionario global de Precios Promedio de Compra {TICKER: PPC_ARS}."""
    data = _db.load()
    if not isinstance(data, dict):
        return {}
    return {k.upper(): float(v) for k, v in data.items() if v is not None and isinstance(v, (int, float)) and v > 0}

def get_ppc_value(ticker: str) -> Optional[float]:
    """Obtiene el PPC en ARS para un ticker específico."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return None
    data = load_ppc_values()
    return data.get(clean_tk)

from services.utils import parse_price_input

def save_ppc_value(ticker: str, value: Any) -> None:
    """Guarda o actualiza el PPC de un ticker."""
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

def save_bulk_ppc_values(values_dict: Dict[str, Any]) -> None:
    """Guarda en lote múltiples PPC en el almacenamiento global."""
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

def evaluate_ppc_return(ticker: str, current_price_ars: Optional[float], ppc_val: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """
    Calcula el rendimiento individual de un activo respecto a su PPC:
    - Ganancia >= 35%: Take Profit / Alerta de Rebalanceo
    - Ganancia >= 20%: En Zona de Atención (Alerta Temprana)
    - Ganancia >= 0%: Ganancia Latente
    - Descuento < 0%: En Descuento / Acumulación
    """
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return None
        
    if ppc_val is None or ppc_val <= 0:
        ppc_val = get_ppc_value(clean_tk)
        
    if not ppc_val or ppc_val <= 0 or current_price_ars is None or current_price_ars <= 0:
        return None
        
    ret_pct = ((current_price_ars / ppc_val) - 1.0) * 100.0
    ret_rounded = round(ret_pct, 1)
    
    is_take_profit = ret_rounded >= 35.0
    is_attention = ret_rounded >= 20.0 and not is_take_profit

    if is_take_profit:
        badge_class = "profit-pill-surge"
        badge_text = f"+{ret_rounded}% 🚀"
        status = "Take Profit / Alerta Rebalanceo"
    elif is_attention:
        badge_class = "profit-pill-attention"
        badge_text = f"+{ret_rounded}% ⚠️"
        status = "En Zona de Atención"
    elif ret_rounded >= 0.0:
        badge_class = "profit-pill-pos"
        badge_text = f"+{ret_rounded}%"
        status = "Ganancia Latente"
    else:
        badge_class = "profit-pill-neg"
        badge_text = f"{ret_rounded}%"
        status = "En Descuento"
        
    return {
        "ppc": round(ppc_val, 2),
        "return_pct": ret_rounded,
        "badge_class": badge_class,
        "badge_text": badge_text,
        "is_take_profit": is_take_profit,
        "is_attention": is_attention,
        "status": status
    }
