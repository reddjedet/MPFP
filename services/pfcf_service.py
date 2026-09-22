from pathlib import Path
from typing import Dict, Any, Optional
from services.atomic_persistence import AtomicJsonDatabase
from services.security_service import sanitize_ticker

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "pfcf_values.json"
_db = AtomicJsonDatabase(DB_PATH)


def load_pfcf_values() -> Dict[str, float]:
    """Carga el diccionario global de P/Normalized FCF {TICKER: P_FCF_VAL}."""
    data = _db.load()
    if not isinstance(data, dict):
        return {}
    return {
        k.upper(): float(v)
        for k, v in data.items()
        if v is not None and isinstance(v, (int, float)) and v > 0
    }


def get_pfcf_value(ticker: str) -> Optional[float]:
    """Obtiene el P/Normalized FCF para un ticker específico."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return None
    data = load_pfcf_values()
    return data.get(clean_tk)


def parse_pfcf_input(value: Any) -> Optional[float]:
    """
    Parsea entradas numéricas de forma robusta soportando formatos internacionales:
    '17.35', '17,35', '1,250.50' (US) y '1.250,50' (Latam/EU).
    """
    if value is None:
        return None
    val_str = str(value).strip()
    if val_str in ("", "-", "—", "none", "null"):
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
            # Solo coma: decimal en español
            clean_str = val_str.replace(",", ".")
        else:
            clean_str = val_str
        val = float(clean_str)
        return round(val, 2) if val > 0 else None
    except (ValueError, TypeError):
        return None


def save_pfcf_value(ticker: str, value: Any) -> None:
    """Guarda o actualiza el P/Normalized FCF de un ticker."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return
    data = _db.load()
    if not isinstance(data, dict):
        data = {}
    val_clean = parse_pfcf_input(value)
    if val_clean is not None:
        data[clean_tk] = val_clean
    else:
        data.pop(clean_tk, None)
    _db.save(data)


def save_bulk_pfcf_values(values_dict: Dict[str, Any]) -> None:
    """Guarda en lote múltiples P/Normalized FCF en el almacenamiento global."""
    data = _db.load()
    if not isinstance(data, dict):
        data = {}
    for tk, val in values_dict.items():
        clean_tk = sanitize_ticker(tk)
        if not clean_tk:
            continue
        val_clean = parse_pfcf_input(val)
        if val_clean is not None:
            data[clean_tk] = val_clean
        else:
            data.pop(clean_tk, None)
    _db.save(data)


def evaluate_fcf_rsi_state(
    ticker: str,
    pfcf_val: Optional[float],
    rsi_val: Optional[float]
) -> Optional[Dict[str, Any]]:
    """
    Evalúa el estado del activo cruzando Valuación Fundamental (P/Normalized FCF)
    con Momentum Técnico (RSI).

    Las recomendaciones de compra/venta se activan cuando el activo posee
    un RSI inferior a 35 (sobreventa / caída) o superior a 65 (sobrecompra / suba extendida).
    En el rango neutral (35 <= RSI <= 65), retorna None para mantener limpia la interfaz.

    Umbrales P/Norm FCF:
      - <= 18.0: Ganga Fundamental (Máximo Margen de Seguridad)
      - <= 24.0: Subvaluado (Oportunidad Atractiva)
      - <= 32.0: Valuación Justa (Razonable / DCA Táctico)
      - > 32.0:  Sobrevaluado (Sin Margen de Seguridad / Riesgo de Trampa)

    Umbrales RSI:
      - < 35.0:  Sobreventa / Caída
      - > 65.0:  Sobrecompra / Suba extendida
      - 35 a 65: Rango Neutral (Sin alertas activas)
    """
    # Formato unificado de hover / tooltip con métricas exactas
    def _build_tooltip(p_val: Optional[float], r_val: Optional[float]) -> str:
        p_str = f"{p_val:.2f}" if p_val is not None and p_val > 0 else "N/D"
        r_str = f"{r_val:.1f}" if r_val is not None else "N/D"
        return f"P/FCF Normalizado: {p_str} | RSI: {r_str}"

    # 1. CASO RSI ACTIVO (CON VALOR NUMÉRICO)
    if rsi_val is not None:
        # A) RANGO NEUTRAL: 35 <= RSI <= 65 -> Sin alerta activa
        if 35.0 <= rsi_val <= 65.0:
            return None

        # B) RÉGIMEN DE SOBREVENTA / CAÍDA: RSI < 35 -> "¿Debería comprar en la caída?"
        if rsi_val < 35.0:
            # Si no hay P/FCF cargado
            if pfcf_val is None or pfcf_val <= 0:
                return {
                    "state_key": "sobreventa_alerta",
                    "badge_text": "SOBREVENTA",
                    "badge_class": "badge-sobreventa",
                    "color": "#FFD600",
                    "tooltip": _build_tooltip(None, rsi_val),
                    "pfcf": None,
                    "rsi": rsi_val,
                    "val_desc": "P/FCF N/D"
                }

            val_desc = f"P/FCF {pfcf_val:.2f}"
            
            # Caso B1: Ganga fundamental (<= 18)
            if pfcf_val <= 18.0:
                return {
                    "state_key": "optimo",
                    "badge_text": "COMPRA FUERTE",
                    "badge_class": "badge-optimo",
                    "color": "#00E676",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Ganga ({val_desc} ≤ 18)"
                }
            # Caso B2: Subvaluado (18 < P/FCF <= 24)
            elif pfcf_val <= 24.0:
                return {
                    "state_key": "optimo",
                    "badge_text": "COMPRA ÓPTIMA",
                    "badge_class": "badge-optimo",
                    "color": "#00E676",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Subvaluado ({val_desc} ≤ 24)"
                }
            # Caso B3: Valuación Justa (24 < P/FCF <= 32)
            elif pfcf_val <= 32.0:
                return {
                    "state_key": "sub_optimo",
                    "badge_text": "COMPRA TÁCTICA",
                    "badge_class": "badge-suboptimo",
                    "color": "#FFD600",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Valuación Justa ({val_desc} ≤ 32)"
                }
            # Caso B4: Sobrevaluado (> 32)
            else:
                return {
                    "state_key": "no_comprar",
                    "badge_text": "NO COMPRAR",
                    "badge_class": "badge-nocomprar",
                    "color": "#FF5252",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Sobrevaluado ({val_desc} > 32)"
                }

        # C) RÉGIMEN DE SOBRECOMPRA / SUBA: RSI > 65 -> "¿Debería vender / tomar ganancias / frenar compras?"
        if rsi_val > 65.0:
            # Si no hay P/FCF cargado
            if pfcf_val is None or pfcf_val <= 0:
                return {
                    "state_key": "no_comprar",
                    "badge_text": "SOBRECOMPRA",
                    "badge_class": "badge-nocomprar",
                    "color": "#FF5252",
                    "tooltip": _build_tooltip(None, rsi_val),
                    "pfcf": None,
                    "rsi": rsi_val,
                    "val_desc": "P/FCF N/D"
                }

            val_desc = f"P/FCF {pfcf_val:.2f}"

            # Caso C1: Sobrevaluado + Sobrecompra (> 32)
            if pfcf_val > 32.0:
                return {
                    "state_key": "no_comprar",
                    "badge_text": "TOMAR GANANCIAS",
                    "badge_class": "badge-nocomprar",
                    "color": "#FF5252",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Sobrevaluado ({val_desc} > 32)"
                }
            # Caso C2: Valuación Justa + Sobrecompra (24 < P/FCF <= 32)
            elif pfcf_val > 24.0:
                return {
                    "state_key": "no_comprar",
                    "badge_text": "SOBRECOMPRA",
                    "badge_class": "badge-nocomprar",
                    "color": "#FF5252",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Valuación Justa ({val_desc} ≤ 32)"
                }
            # Caso C3: Fundamentalmente Sólido pero Sobrecomprado (P/FCF <= 24)
            else:
                return {
                    "state_key": "hold",
                    "badge_text": "MANTENER (HOLD)",
                    "badge_class": "badge-hold",
                    "color": "#00B0FF",
                    "tooltip": _build_tooltip(pfcf_val, rsi_val),
                    "pfcf": pfcf_val,
                    "rsi": rsi_val,
                    "val_desc": f"Subvaluado ({val_desc} ≤ 24)"
                }

    # 2. CASO RSI NO DISPONIBLE (None)
    # Si no hay RSI pero hay P/FCF cargado, solo alertar en ganga o subvaluación evidente
    if pfcf_val is not None and pfcf_val > 0:
        val_desc = f"P/FCF {pfcf_val:.2f}"
        if pfcf_val <= 18.0:
            return {
                "state_key": "optimo",
                "badge_text": "GANGA",
                "badge_class": "badge-optimo",
                "color": "#00E676",
                "tooltip": _build_tooltip(pfcf_val, None),
                "pfcf": pfcf_val,
                "rsi": None,
                "val_desc": f"Ganga ({val_desc} ≤ 18)"
            }
        elif pfcf_val <= 24.0:
            return {
                "state_key": "optimo",
                "badge_text": "SUBVALUADO",
                "badge_class": "badge-optimo",
                "color": "#00E676",
                "tooltip": _build_tooltip(pfcf_val, None),
                "pfcf": pfcf_val,
                "rsi": None,
                "val_desc": f"Subvaluado ({val_desc} ≤ 24)"
            }

    return None
