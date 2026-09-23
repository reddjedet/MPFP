"""
Jerarquía de Excepciones de Dominio - MPFP (API-01)
Define excepciones fuertemente tipadas con códigos canónicos y estados HTTP asociados.
"""

from typing import Any, Dict, Optional


class MPFPError(Exception):
    """Excepción base para todos los errores de dominio de MPFP."""
    status_code: int = 400
    code: str = "GENERIC_ERROR"
    message: str = "Ocurrió un error en el sistema."
    details: Dict[str, Any] = {}

    def __init__(
        self,
        message: Optional[str] = None,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self, request_id: Optional[str] = None) -> Dict[str, Any]:
        """Formato JSON uniforme de respuesta de error."""
        payload: Dict[str, Any] = {
            "error": self.message,
            "code": self.code,
            "details": self.details
        }
        if request_id:
            payload["request_id"] = request_id
        return payload


# ------------------------------------------------------------------------------
# 1. Validación de Dominio y Parámetros
# ------------------------------------------------------------------------------

class DomainValidationError(MPFPError):
    """Error al validar parámetros o datos de entrada del cliente."""
    status_code = 400
    code = "VALIDATION_ERROR"
    message = "Parámetro o dato de entrada inválido."


class InvalidTickerError(DomainValidationError):
    """Ticker financiero malformado o no reconocido."""
    status_code = 400
    code = "INVALID_TICKER"
    message = "El símbolo o ticker financiero ingresado no es válido."


class InvalidParameterError(DomainValidationError):
    """Parámetro de consulta o configuración fuera de rango permitido."""
    status_code = 400
    code = "INVALID_PARAMETER"
    message = "Uno o más parámetros de la solicitud son incorrectos."


# ------------------------------------------------------------------------------
# 2. Invariantes Financieras (API-04)
# ------------------------------------------------------------------------------

class FinancialInvariantError(DomainValidationError):
    """Violación de una regla o invariante matemática del dominio financiero."""
    status_code = 422
    code = "FINANCIAL_INVARIANT_VIOLATION"
    message = "Violación de regla o invariante financiera."


class WeightsSumError(FinancialInvariantError):
    """La suma de ponderaciones de la cartera difiere de 100%."""
    status_code = 422
    code = "WEIGHTS_SUM_ERROR"
    message = "La suma de ponderaciones de la cartera debe ser 100%."


class NegativeValueError(FinancialInvariantError):
    """Un valor monetario, precio, ponderación o cantidad nominal es menor a cero."""
    status_code = 422
    code = "NEGATIVE_VALUE_ERROR"
    message = "El valor financiero no puede ser negativo."


class FractionalCedearError(FinancialInvariantError):
    """Intento de asignar cantidades fraccionarias a un activo que requiere enteros."""
    status_code = 422
    code = "FRACTIONAL_CEDEAR_ERROR"
    message = "Los CEDEARs en tenencia física deben ser cantidades enteras."


# ------------------------------------------------------------------------------
# 3. Recursos no Encontrados (404)
# ------------------------------------------------------------------------------

class ResourceNotFoundError(MPFPError):
    """El recurso solicitado no existe."""
    status_code = 404
    code = "NOT_FOUND"
    message = "El recurso solicitado no fue encontrado."


class PortfolioNotFoundError(ResourceNotFoundError):
    """La cartera de inversión no existe en la base de datos."""
    status_code = 404
    code = "PORTFOLIO_NOT_FOUND"
    message = "La cartera de inversión especificada no existe."


class AssetNotFoundError(ResourceNotFoundError):
    """El activo o instrumento financiero no fue encontrado en los catálogos."""
    status_code = 404
    code = "ASSET_NOT_FOUND"
    message = "El activo financiero solicitado no fue encontrado."


# ------------------------------------------------------------------------------
# 4. Proveedores de Mercado Externos (502 / 504)
# ------------------------------------------------------------------------------

class ExternalProviderError(MPFPError):
    """Falla al comunicarse con un proveedor externo (TradingView, Yahoo, BYMA, MAE)."""
    status_code = 502
    code = "EXTERNAL_PROVIDER_ERROR"
    message = "Fallo temporal en la consulta a proveedores de mercado externos."


class MarketDataUnavailableError(ExternalProviderError):
    """Datos de mercado no disponibles o fuera de horario operativo."""
    status_code = 502
    code = "MARKET_DATA_UNAVAILABLE"
    message = "No se pudieron obtener cotizaciones para los activos solicitados."


class ProviderTimeoutError(ExternalProviderError):
    """Tiempo de espera agotado al consultar un servicio externo."""
    status_code = 504
    code = "PROVIDER_TIMEOUT"
    message = "Tiempo de espera agotado al conectar con el proveedor de mercado."


# ------------------------------------------------------------------------------
# 5. Persistencia y Almacenamiento
# ------------------------------------------------------------------------------

class PersistenceFailureError(MPFPError):
    """Error al acceder o escribir en la base de datos SQLite."""
    status_code = 500
    code = "PERSISTENCE_ERROR"
    message = "Error en el subsistema de almacenamiento de datos."


class DatabaseCorruptionError(PersistenceFailureError):
    """Falla crítica de integridad física en la base de datos."""
    status_code = 503
    code = "DATABASE_CORRUPTION"
    message = "Base de datos temporalmente no disponible por verificación de integridad."
