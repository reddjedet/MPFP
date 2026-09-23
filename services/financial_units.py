"""
Módulo de Normalización de Unidades y Bases Financieras - MPFP
Provee funciones puras y deterministas para convertir cotizaciones
entre base monetaria institucional (cada 100 VN) y valor patrimonial unitario (por VN).
"""

from typing import Optional


def normalize_fixed_income_price(
    price: Optional[float],
    force_base_100: Optional[bool] = None
) -> float:
    """
    Convierte un precio de renta fija (bono, LECAP, BONCAP) a su cotización unitaria por cada 1 VN.
    
    En el mercado argentino (BYMA/MAE):
    - La cotización estándar de bonos y letras se publica cada 100 VN (ej: 112.08 ARS o 58.50 USD).
    - El valor patrimonial efectivo de cada título es (precio / 100.0) * nominales.
    
    Reglas:
    - Si force_base_100 es True: divide siempre por 100.0.
    - Si force_base_100 es False: asume que ya viene por unidad.
    - Si force_base_100 es None:
        - Si price >= 10.0: se trata de una cotización base 100 estándar -> price / 100.0
        - Si 0.0 < price < 10.0: ya está expresado en valor unitario por VN (ej. 1.1208).
    """
    if price is None or price <= 0:
        return 0.0

    p = float(price)
    if force_base_100 is True:
        return round(p / 100.0, 6)
    if force_base_100 is False:
        return round(p, 6)

    # Heurística canónica segura para títulos en pesos y dólares
    if p >= 10.0:
        return round(p / 100.0, 6)
    return round(p, 6)


def to_base_100(unit_price: Optional[float]) -> float:
    """
    Convierte un precio unitario (por 1 VN) a la convención estándar de mercado cada 100 VN.
    """
    if unit_price is None or unit_price <= 0:
        return 0.0

    p = float(unit_price)
    if p < 10.0:
        return round(p * 100.0, 4)
    return round(p, 4)
