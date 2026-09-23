import os
import re
from typing import Tuple, Dict, List, Optional

TICKER_REGEX = re.compile(r"^[A-Z0-9.]{1,10}$")
PORTFOLIO_NAME_REGEX = re.compile(r"^[a-z0-9_]{1,30}$")
MAX_FILE_SIZE_BYTES = 1024 * 1024  # 1 MB

def sanitize_ticker(ticker: str) -> str | None:
    """Valida y limpia un símbolo de ticker bursátil."""
    if not ticker or not isinstance(ticker, str):
        return None
    cleaned = ticker.strip().upper()
    if TICKER_REGEX.match(cleaned):
        return cleaned
    return None

def sanitize_portfolio_name(name: str) -> str | None:
    """Sanitiza y valida el nombre de una cartera, normalizando espacios a guiones bajos."""
    if not name or not isinstance(name, str):
        return None
    normalized = re.sub(r"[\s\-]+", "_", name.lower().strip())
    cleaned = "".join([c for c in normalized if c.isalnum() or c == "_"]).strip("_")
    if PORTFOLIO_NAME_REGEX.match(cleaned):
        return cleaned
    return None

def parse_weights_string(weights_str: str) -> Tuple[Dict[str, float] | None, str | None]:
    """
    Parsea y valida una cadena de ponderaciones/nominales en formato TICKER:VALOR, ...
    Retorna (dict_resultado, mensaje_error).
    """
    if not weights_str or not isinstance(weights_str, str):
        return None, "La cadena de pesos no puede estar vacía."
    
    parts = weights_str.split(",")
    parsed = {}
    
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if ":" not in p:
            return None, f"Formato inválido en '{p}'. Use TICKER:VALOR."
        
        k, v = p.split(":", 1)
        ticker_clean = sanitize_ticker(k)
        if not ticker_clean:
            return None, f"Ticker inválido: '{k.strip()}'. Solo caracteres alfanuméricos (1-10 caracteres)."
        
        try:
            val = float(v.strip())
            if val < 0:
                return None, f"El valor para '{ticker_clean}' no puede ser negativo ({val})."
            parsed[ticker_clean] = val
        except ValueError:
            return None, f"Valor numérico no válido para el ticker '{ticker_clean}': '{v.strip()}'."
            
    if not parsed:
        return None, "No se encontraron activos válidos en la configuración."
        
    return parsed, None


def get_cors_configuration() -> Tuple[List[str], Optional[str], bool]:
    """
    Determina la configuración segura de CORS según el entorno.
    Retorna: (allow_origins, allow_origin_regex, allow_credentials)
    
    Reglas de Endurecimiento (SEC-02):
    1. Nunca usar credenciales con comodines; al no haber cookies de sesión, allow_credentials=False.
    2. En producción (APP_ENV=production): solo dominios explícitos configurados vía ALLOWED_ORIGINS
       o RENDER_EXTERNAL_URL; sin regex wildcard permisivo (*.onrender.com).
    3. En desarrollo: restringido a localhost y 127.0.0.1.
    """
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    
    if app_env == "production":
        origins_env = os.getenv("ALLOWED_ORIGINS", "")
        origins = [o.strip() for o in origins_env.split(",") if o.strip()]
        
        render_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
        if render_url and render_url not in origins:
            origins.append(render_url)
            
        return origins, None, False
    else:
        dev_origins = [
            "http://127.0.0.1:8000",
            "http://localhost:8000",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]
        dev_regex = r"^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?$"
        return dev_origins, dev_regex, False
