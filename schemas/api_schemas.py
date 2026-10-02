"""
Esquemas Pydantic v2 Fuertemente Tipados para Contratos REST - MPFP (API-02)
Define modelos de entrada y salida, serializadores y validadores de invariantes.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

from services.financial_validation import (
    validate_cash_balance,
    validate_holding_nominals,
    validate_price_or_ppc,
    validate_ticker,
)
from services.security_service import sanitize_portfolio_name


# ------------------------------------------------------------------------------
# 1. Envoltorios de Respuesta y Errores
# ------------------------------------------------------------------------------

class ErrorEnvelope(BaseModel):
    """Esquema estándar para respuestas de error de la API."""
    error: str = Field(..., description="Mensaje explicativo del error.")
    code: str = Field(..., description="Código canónico del error.")
    details: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Detalles adicionales.")
    request_id: Optional[str] = Field(None, description="Identificador único de correlación.")


class SuccessEnvelope(BaseModel):
    """Esquema estándar de éxito."""
    success: bool = True
    message: Optional[str] = None
    data: Optional[Any] = None


# ------------------------------------------------------------------------------
# 2. Portfolios y Asignación de Activos
# ------------------------------------------------------------------------------

class QuickUpdateAssetRequest(BaseModel):
    """Petición para actualización rápida de métricas clave de un activo."""
    ticker: str = Field(..., description="Símbolo del activo.")
    ppc: Optional[Any] = Field(None, description="Precio Promedio de Compra.")
    gf_value: Optional[Any] = Field(None, description="GuruFocus Fair Value en USD.")
    pfcf: Optional[Any] = Field(None, description="Múltiplo P/Normalized FCF.")

    @field_validator("ticker")
    @classmethod
    def sanitize_symbol(cls, v: str) -> str:
        return validate_ticker(v)

    @field_validator("ppc", "gf_value", "pfcf")
    @classmethod
    def validate_non_negative_metric(cls, v: Any) -> Optional[float]:
        return validate_price_or_ppc(v, allow_none=True)


class PortfolioCreateRequest(BaseModel):
    """Petición para crear o clonar una cartera."""
    name: str = Field(..., min_length=1, max_length=50, description="Nombre de la cartera.")
    mode: Optional[str] = Field("weights", description="Modo operativo: 'weights' o 'shares'.")
    weights_str: Optional[str] = Field(None, description="Cadena de ponderaciones en formato TICKER: PESO.")
    assets: Optional[Dict[str, float]] = Field(default_factory=dict, description="Diccionario de activos y pesos.")

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        clean = sanitize_portfolio_name(v)
        if not clean:
            raise ValueError("El nombre de cartera no es válido.")
        return clean


class PortfolioWeightsRequest(BaseModel):
    """Petición para actualizar los pesos objetivo de una cartera existente."""
    weights_str: Optional[str] = None
    mode: Optional[str] = "weights"


class PortfolioSettingsRequest(BaseModel):
    """Petición para configurar ancla, cantidades y asignación fija/variable."""
    anchor: Optional[str] = None
    qty: Optional[int] = Field(None, ge=1)
    mode: Optional[str] = "weights"
    equity_weight: Optional[float] = Field(None, ge=0.0, le=100.0)
    fixed_income_weight: Optional[float] = Field(None, ge=0.0, le=100.0)
    fixed_income_assets: Optional[Dict[str, Any]] = None

    @field_validator("anchor")
    @classmethod
    def validate_anchor_ticker(cls, v: Optional[str]) -> Optional[str]:
        return validate_ticker(v) if v else None


# ------------------------------------------------------------------------------
# 3. Tenencias Reales (Holdings) y Rotación Táctica
# ------------------------------------------------------------------------------

class HoldingItemPayload(BaseModel):
    """Payload para actualizar o insertar una posición física de renta variable/CEDEAR."""
    portfolio: Optional[str] = "bmb"
    ticker: str = Field(..., description="Símbolo del CEDEAR o acción.")
    nominals: int = Field(..., ge=0, description="Cantidad entera de títulos físicos.")
    ppc: Optional[float] = Field(None, ge=0.0, description="Precio Promedio de Compra en ARS.")

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)

    @field_validator("nominals")
    @classmethod
    def check_nominals(cls, v: int) -> int:
        return validate_holding_nominals(v, is_cedear=True)

    @field_validator("ppc")
    @classmethod
    def check_ppc(cls, v: Optional[float]) -> Optional[float]:
        return validate_price_or_ppc(v, allow_none=True, field_name="PPC")


class FixedIncomeHoldingPayload(BaseModel):
    """Payload para actualizar o insertar un título de Renta Fija (Bono o LECAP)."""
    portfolio: Optional[str] = "bmb"
    ticker: str = Field(..., description="Ticker del bono o instrumento.")
    nominals: int = Field(..., ge=0, description="Cantidad nominal de títulos.")
    ppc: Optional[float] = Field(None, ge=0.0, description="PPC en ARS o USD.")

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)

    @field_validator("ppc")
    @classmethod
    def check_ppc(cls, v: Optional[float]) -> Optional[float]:
        return validate_price_or_ppc(v, allow_none=True, field_name="PPC Renta Fija")


class FixedIncomeTargetItem(BaseModel):
    """Peso objetivo de un título dentro del sleeve (mandato) de renta fija."""
    ticker: str = Field(..., description="Ticker del instrumento de renta fija objetivo.")
    target_weight_rf: float = Field(..., ge=0.0, le=100.0, description="Peso relativo dentro de la porción de renta fija, en % (0-100).")

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)


class PortfolioFixedIncomeTargetRequest(BaseModel):
    """
    Objetivo de renta fija de una cartera.

    El usuario informa únicamente el TAMAÑO del sleeve de renta fija y el REPARTO dentro de
    ese sleeve. El peso de cada título sobre la cartera total (`target_weight_portfolio`) y el
    peso de renta variable (`equity_weight`) se derivan en el servidor para que ambos campos
    nunca puedan quedar desincronizados.

    Los `target_weight_rf` que no sumen exactamente 100 se normalizan proporcionalmente,
    igual que ya se hace con los pesos de renta variable en el motor de rotación.
    """
    fixed_income_weight: float = Field(
        0.0, ge=0.0, le=100.0,
        description="Porción de la cartera destinada a renta fija, en % (0-100). Con 0 se desactiva la renta fija."
    )
    fixed_income_assets: List[FixedIncomeTargetItem] = Field(
        default_factory=list,
        description="Reparto del sleeve de renta fija entre títulos. Vacío equivale a sin renta fija objetivo."
    )


class BulkHoldingItem(BaseModel):
    """Entrada individual para el guardado en lote de tenencias."""
    nominals: int = Field(..., ge=0)
    ppc: Optional[float] = Field(None, ge=0.0)

    @field_validator("nominals")
    @classmethod
    def check_nominals(cls, v: int) -> int:
        return validate_holding_nominals(v, is_cedear=True)

    @field_validator("ppc")
    @classmethod
    def check_ppc(cls, v: Optional[float]) -> Optional[float]:
        return validate_price_or_ppc(v, allow_none=True, field_name="PPC")


class BulkHoldingsPayload(BaseModel):
    """Payload para importación o guardado en lote de tenencias físicas."""
    portfolio: Optional[str] = "bmb"
    holdings: Dict[str, BulkHoldingItem] = Field(default_factory=dict)
    cash_ars: Optional[float] = Field(None, ge=0.0, description="Saldo líquido en ARS. Si se omite, se conserva el existente.")

    @field_validator("cash_ars")
    @classmethod
    def check_cash(cls, v: Optional[float]) -> Optional[float]:
        return None if v is None else validate_cash_balance(v)


# ------------------------------------------------------------------------------
# 4. Valuación Fundamental
# ------------------------------------------------------------------------------

class EvaluateValuationRequest(BaseModel):
    """Petición para evaluar valuación fundamental por múltiplos y DCF."""
    ticker: str = Field(..., description="Símbolo de la empresa a valuar.")
    metrics: Dict[str, float] = Field(default_factory=dict, description="Métricas e inputs financieros.")

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)


class SyncGFRequest(BaseModel):
    """Petición para sincronizar el GuruFocus Fair Value."""
    ticker: str = Field(..., description="Símbolo del activo.")
    fair_value: float = Field(..., ge=0.0, description="Valor intrínseco en USD.")

    @field_validator("ticker")
    @classmethod
    def check_ticker(cls, v: str) -> str:
        return validate_ticker(v)

    @field_validator("fair_value")
    @classmethod
    def check_fv(cls, v: float) -> float:
        val = validate_price_or_ppc(v, allow_none=False, field_name="Fair Value")
        return val if val is not None else 0.0

# ------------------------------------------------------------------------------
# 5. Responses and Additional Requests
# ------------------------------------------------------------------------------
from typing import List

class BulkQuickUpdateAssetRequest(BaseModel):
    items: List[QuickUpdateAssetRequest]

class RenamePortfolioRequest(BaseModel):
    old_name: str
    new_name: str

class QuickUpdateAssetResponse(BaseModel):
    success: bool
    ticker: str
    ppc: Optional[float]
    gf_value: Optional[float]
    pfcf: Optional[float]

class PortfolioListResponse(BaseModel):
    portfolios: Dict[str, Any]
    weights_str_map: Dict[str, str]
    fair_values_map: Dict[str, Any]
    selected_pf: str

class PortfolioRebalanceResponse(BaseModel):
    pf_type: str
    mode: str
    anchor: Optional[str]
    qty: int
    weights: Dict[str, float]
    asset_allocation: Optional[Dict[str, Any]]
    fixed_income_summary: Optional[Dict[str, Any]]
    result: List[Dict[str, Any]]
    sector_breakdown: List[Dict[str, Any]]
    mcm_info: Optional[Dict[str, Any]]
    take_profit_alerts: List[Dict[str, Any]]
    rotation_trades: List[Dict[str, Any]]
    alpha_metrics: Optional[Dict[str, Any]]
    summary: Dict[str, Any]

class PortfolioCreateResponse(BaseModel):
    success: bool
    name: str
    mode: str
    assets: Dict[str, float]

class TrashListResponse(BaseModel):
    trash: List[Dict[str, Any]]

class RenamePortfolioResponse(BaseModel):
    success: bool
    old_name: str
    new_name: str
    error: Optional[str] = None

class ImportPortfoliosResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    imported_count: Optional[int] = None
    portfolios: Optional[Dict[str, Any]] = None

class DeletePortfolioResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
    moved_to_trash: Optional[str] = None
