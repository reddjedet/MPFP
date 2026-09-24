"""
Módulo de Normalización de Unidades y Bases Financieras - MPFP
Provee funciones deterministas para clasificar activos y convertir cotizaciones
entre convención de mercado argentino (cada 100 VN) y valor patrimonial unitario (por 1 VN).
"""

from typing import Optional
import logging
import re
import warnings

logger = logging.getLogger(__name__)

# --- Registro canónico de títulos de Renta Fija (fuente única de verdad) ---
# Clave: ticker oficial BYMA/MAE. Debe mantenerse sincronizado con
# services/fixed_income_service.LECAP_BONCAP_SPECS (hay un test que lo garantiza).
KNOWN_FIXED_INCOME_TICKERS: frozenset[str] = frozenset({
    # LECAPs
    "S31G6", "S15S6", "S30S6", "S16O6", "S30O6", "S13N6", "S30N6", "S15D6", "S31D6",
    "S15E7", "S29E7", "S12F7", "S26F7", "S12M7", "S31M7", "S16A7", "S30A7", "S14Y7", "S28Y7",
    # BONCAPs (¡incluye los de serie-letra que el regex no detectaba!)
    "TTD26", "T15E7", "TMF27", "T30A7", "T31Y7", "T30J7", "TML27", "TMG27", "TMF28", "TMG28",
    # BONTEs
    "TY30P",
    # Soberanos USD
    "AL30", "GD30", "AL35", "GD35", "AE38", "GD38", "AL41", "GD41",
    # BOPREAL
    "BPOB7", "BPOC7", "BPOD7",
})

# Patrones genéricos para títulos NO listados arriba (emisiones futuras).
FIXED_INCOME_REGEX = re.compile(
    r"^(?:"
    r"S\d{2}[A-Z\d]\d"        # LECAP  (S31G6)
    r"|T\d{2}[A-Z\d]\d"       # BONCAP serie-dígito (T15E7)
    r"|T[A-Z]{2}\d{2}"        # BONCAP serie-letra   (TTD26, TMF27, TMG28)  <-- NUEVO
    r"|T[A-Z]\d{2}[A-Z\d]"    # BONTE                (TY30P)               <-- NUEVO
    r"|AL\d{2}|GD\d{2}|AE\d{2}"
    r"|BP(?:O\w*|\d{2})"
    r"|TX\d{2}|TV\d{2}"
    r"|BONCER\w*|LECAP\w*"
    r")",
    re.IGNORECASE,
)

# Universo de Renta Variable (CEDEARs/acciones) que NUNCA debe catalogarse como Renta Fija.
EQUITY_EXCLUSIONS = frozenset({
    "SPY", "TSLA", "T", "AMZN", "AAPL", "GOOGL", "NVDA", "BBD", "BMA", "TX", "TV",
    "CAT", "DE", "COST", "LLY", "V", "VIST", "MELI", "PFE", "XOM", "KO", "MCD", "JNJ",
})


def is_fixed_income_ticker(ticker: Optional[str]) -> bool:
    """
    Identifica de forma unívoca si un símbolo bursátil corresponde a Renta Fija.
    Fuente única de verdad compartida para todo el backend.
    """
    if not ticker or not isinstance(ticker, str):
        return False
    t = ticker.strip().upper()
    if t in EQUITY_EXCLUSIONS:
        return False
    if t in KNOWN_FIXED_INCOME_TICKERS:
        return True
    return bool(FIXED_INCOME_REGEX.match(t))


def to_unit_price(raw_price: Optional[float], ticker: Optional[str] = None) -> float:
    """
    Convierte cualquier precio o PPC al valor unitario patrimonial por cada 1 VN.
    - Para Renta Fija: si viene cotizado en Base 100 (>= 5.0), lo divide por 100.0.
    - Para Renta Variable: el precio unitario es idéntico a su cotización de mercado.
    """
    if raw_price is None or raw_price <= 0:
        return 0.0
    p = float(raw_price)

    if ticker is None:
        msg = f"to_unit_price() llamado sin ticker; usando heurística numérica deprecada (p={p})"
        logger.warning(msg)
        warnings.warn(msg, DeprecationWarning, stacklevel=2)
        is_rf = p < 2500.0
    else:
        is_rf = is_fixed_income_ticker(ticker)

    if is_rf:
        # En BYMA/MAE, títulos cotizados entre 5.0 y 2500.0 están en Base 100
        return round(p / 100.0, 6) if p >= 5.0 else round(p, 6)
    return round(p, 6)


def to_market_quote(unit_price: Optional[float], ticker: Optional[str] = None) -> float:
    """
    Convierte un valor unitario (por 1 VN) a la convención de mercado BYMA/MAE (Base 100 VN).
    Para Renta Variable, devuelve el precio sin alterar.
    """
    if unit_price is None or unit_price <= 0:
        return 0.0
    p = float(unit_price)

    if ticker is None:
        msg = f"to_market_quote() llamado sin ticker; usando heurística numérica deprecada (p={p})"
        logger.warning(msg)
        warnings.warn(msg, DeprecationWarning, stacklevel=2)
        is_rf = p < 5.0
    else:
        is_rf = is_fixed_income_ticker(ticker)

    if is_rf:
        if p < 5.0:
            return round(p * 100.0, 4)
        return round(p, 4)
    return round(p, 2)


def normalize_quote_to_base_100(raw: Optional[float], ticker: Optional[str] = None) -> float:
    """Normaliza cualquier convención de entrada a Base 100 VN (convención BYMA/MAE)."""
    return to_market_quote(to_unit_price(raw, ticker=ticker), ticker=ticker)


# Alias canónicos para retrocompatibilidad total
normalize_fixed_income_price = to_unit_price
to_base_100 = to_market_quote
