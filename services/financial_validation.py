"""
Módulo de Validación Centralizada de Invariantes Financieras - MPFP (API-04)
Asegura la coherencia matemática y de reglas de negocio en carteras, activos y tenencias.
"""

import math
from typing import Any, Dict, Optional, Tuple

from services.exceptions import (
    FractionalCedearError,
    InvalidTickerError,
    NegativeValueError,
    WeightsSumError,
)
from services.security_service import sanitize_ticker


def validate_ticker(ticker: str) -> str:
    """Valida y normaliza un ticker financiero. Arroja InvalidTickerError si es inválido."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        raise InvalidTickerError(f"El ticker '{ticker}' contiene caracteres no permitidos o está vacío.")
    return clean_tk


def validate_portfolio_weights(
    assets: Dict[str, float],
    tolerance_pct: float = 0.5,
    allow_empty: bool = False
) -> float:
    """
    Valida las ponderaciones de una cartera en modo 'weights':
    1. Ningún peso puede ser estrictamente negativo (< 0).
    2. La suma de las ponderaciones debe ser 100% dentro de la tolerancia admitida (± tolerance_pct).
    Retorna la suma total calculada.
    """
    if not assets:
        if allow_empty:
            return 0.0
        raise WeightsSumError("La cartera no contiene activos configurados.")

    total_weight = 0.0
    for tk, w in assets.items():
        validate_ticker(tk)
        try:
            val = float(w)
        except (ValueError, TypeError):
            raise NegativeValueError(f"El peso del activo '{tk}' debe ser numérico: {w}")

        if math.isnan(val) or math.isinf(val):
            raise NegativeValueError(f"El peso del activo '{tk}' no es un número válido (NaN o Inf).")

        if val < 0.0:
            raise NegativeValueError(f"El peso del activo '{tk}' no puede ser negativo ({val}%).")

        total_weight += val

    # Comprobación de suma 100% ± tolerancia
    min_allowed = 100.0 - tolerance_pct
    max_allowed = 100.0 + tolerance_pct

    if total_weight < min_allowed or total_weight > max_allowed:
        raise WeightsSumError(
            f"La suma de ponderaciones de la cartera es {round(total_weight, 2)}% (se requiere 100% ± {tolerance_pct}%)."
        )

    return round(total_weight, 4)


def validate_holding_nominals(nominals: Any, is_cedear: bool = True) -> int:
    """
    Valida la cantidad de títulos/nominales de una posición física:
    1. Debe ser un valor no negativo (>= 0).
    2. Si es un CEDEAR, debe ser un número entero estricto.
    """
    try:
        val = float(nominals)
    except (ValueError, TypeError):
        raise NegativeValueError(f"La cantidad de nominales debe ser numérica: {nominals}")

    if math.isnan(val) or math.isinf(val):
        raise NegativeValueError("La cantidad de nominales no puede ser NaN o Inf.")

    if val < 0.0:
        raise NegativeValueError(f"La cantidad de nominales no puede ser negativa ({val}).")

    if is_cedear:
        if not val.is_integer():
            raise FractionalCedearError(
                f"Los CEDEARs no admiten fracciones en tenencias físicas: {val} nominales ingresados."
            )
        return int(val)

    return int(val) if val.is_integer() else val


def validate_price_or_ppc(
    value: Any,
    allow_none: bool = True,
    field_name: str = "Precio"
) -> Optional[float]:
    """Valida que un precio de mercado o PPC sea estrictamente no negativo."""
    if value is None:
        if allow_none:
            return None
        raise NegativeValueError(f"{field_name} es requerido y no puede ser nulo.")

    try:
        val = float(value)
    except (ValueError, TypeError):
        raise NegativeValueError(f"{field_name} debe ser numérico: {value}")

    if math.isnan(val) or math.isinf(val):
        raise NegativeValueError(f"{field_name} no puede ser NaN o Inf.")

    if val < 0.0:
        raise NegativeValueError(f"{field_name} no puede ser negativo ({val}).")

    return val


def validate_cash_balance(cash_ars: Any) -> float:
    """Valida que el saldo en efectivo de la cartera sea mayor o igual a cero."""
    try:
        val = float(cash_ars)
    except (ValueError, TypeError):
        raise NegativeValueError(f"El saldo en efectivo debe ser numérico: {cash_ars}")

    if math.isnan(val) or math.isinf(val):
        raise NegativeValueError("El saldo en efectivo no puede ser NaN o Inf.")

    if val < 0.0:
        raise NegativeValueError(f"El saldo en efectivo no puede ser negativo (${val:,.2f} ARS).")

    return round(val, 2)
