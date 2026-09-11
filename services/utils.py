from typing import Any, Optional


def parse_price_input(value: Any) -> Optional[float]:
    """
    Parsea entradas numéricas o de precio de forma robusta soportando formatos internacionales:
    '17.35', '17,35', '1,250.50' (US) y '1.250,50' (Latam/EU).
    Devuelve un float redondeado a 2 decimales o None si es inválido/no positivo.
    """
    if value is None:
        return None
    val_str = str(value).strip()
    if val_str in ("", "-", "—", "none", "null", "undefined"):
        return None
    try:
        # Si contiene tanto punto como coma, determinar cuál es el separador decimal por posición
        if "," in val_str and "." in val_str:
            if val_str.rfind(",") > val_str.rfind("."):
                # Formato europeo/latino: 1.250,50 -> 1250.50
                clean_str = val_str.replace(".", "").replace(",", ".")
            else:
                # Formato anglosajón: 1,250.50 -> 1250.50
                clean_str = val_str.replace(",", "")
        elif "," in val_str:
            # Solo coma: decimal en español/latino
            clean_str = val_str.replace(",", ".")
        else:
            clean_str = val_str
        val = float(clean_str)
        return round(val, 2) if val > 0 else None
    except (ValueError, TypeError):
        return None


def clamp(val: float, min_val: float, max_val: float) -> float:
    """Restringe un valor numérico dentro del rango [min_val, max_val]."""
    return max(min_val, min(max_val, val))
