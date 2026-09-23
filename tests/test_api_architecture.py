"""
Test Suite de Arquitectura de APIs, Invariantes y Observabilidad - MPFP (API-01 a API-05)
Valida la jerarquía de excepciones, contratos Pydantic v2, precalentamiento con timeouts,
reglas financieras matemáticas y trazabilidad distribuida con Correlation-ID.
"""

import asyncio
import json
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from main import app
from schemas.api_schemas import (
    BulkHoldingsPayload,
    EvaluateValuationRequest,
    FixedIncomeHoldingPayload,
    HoldingItemPayload,
    PortfolioCreateRequest,
    PortfolioSettingsRequest,
    QuickUpdateAssetRequest,
    SyncGFRequest,
)
from services.exceptions import (
    AssetNotFoundError,
    DatabaseCorruptionError,
    DomainValidationError,
    ExternalProviderError,
    FinancialInvariantError,
    FractionalCedearError,
    InvalidParameterError,
    InvalidTickerError,
    MarketDataUnavailableError,
    MPFPError,
    NegativeValueError,
    PersistenceFailureError,
    PortfolioNotFoundError,
    ProviderTimeoutError,
    ResourceNotFoundError,
    WeightsSumError,
)
from services.financial_validation import (
    validate_cash_balance,
    validate_holding_nominals,
    validate_portfolio_weights,
    validate_price_or_ppc,
    validate_ticker,
)
from services.observability import (
    CorrelationIdMiddleware,
    RequestIdFilter,
    StructuredJsonFormatter,
    get_current_request_id,
    request_id_ctx,
)
from services.prewarm_service import prewarm_portfolio_cache


class TestAPI01ExceptionsAndErrorHandlers(unittest.TestCase):
    """Pruebas de la Jerarquía de Excepciones y Handlers Globales (API-01)."""

    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_mpfp_error_envelope_structure(self):
        """Verifica que to_dict genere la estructura canónica con request_id."""
        exc = PortfolioNotFoundError("Cartera 'alpha' no existe.", details={"searched": "alpha"})
        payload = exc.to_dict(request_id="req_test_123")
        self.assertEqual(payload["error"], "Cartera 'alpha' no existe.")
        self.assertEqual(payload["code"], "PORTFOLIO_NOT_FOUND")
        self.assertEqual(payload["details"], {"searched": "alpha"})
        self.assertEqual(payload["request_id"], "req_test_123")
        self.assertEqual(exc.status_code, 404)

    def test_domain_validation_status_codes(self):
        """Verifica que las subclases de validación mantengan códigos 400 y 422 correspondientes."""
        self.assertEqual(DomainValidationError().status_code, 400)
        self.assertEqual(InvalidTickerError().status_code, 400)
        self.assertEqual(InvalidParameterError().status_code, 400)
        self.assertEqual(FinancialInvariantError().status_code, 422)
        self.assertEqual(WeightsSumError().status_code, 422)
        self.assertEqual(NegativeValueError().status_code, 422)
        self.assertEqual(FractionalCedearError().status_code, 422)

    def test_provider_and_persistence_status_codes(self):
        """Verifica códigos HTTP para proveedores de mercado y persistencia (500, 502, 503, 504)."""
        self.assertEqual(ExternalProviderError().status_code, 502)
        self.assertEqual(MarketDataUnavailableError().status_code, 502)
        self.assertEqual(ProviderTimeoutError().status_code, 504)
        self.assertEqual(PersistenceFailureError().status_code, 500)
        self.assertEqual(DatabaseCorruptionError().status_code, 503)

    def test_global_handler_portfolio_not_found(self):
        """Un endpoint que arroja PortfolioNotFoundError retorna 404 y JSON canónico."""
        resp = self.client.get("/api/portfolios/rebalance_json/inexistent_pf_xyz")
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertIn("error", data)
        self.assertEqual(data.get("code"), "PORTFOLIO_NOT_FOUND")
        self.assertIn("request_id", data)

    def test_global_handler_invalid_ticker(self):
        """Un endpoint que recibe un ticker inválido retorna 400 con código INVALID_TICKER."""
        resp = self.client.get("/api/cedears/quote_json/INVALID$$$TICKER")
        self.assertEqual(resp.status_code, 400)
        data = resp.json()
        self.assertIn("error", data)
        self.assertEqual(data.get("code"), "INVALID_TICKER")
        self.assertIn("request_id", data)

    def test_global_handler_asset_not_found(self):
        """Un endpoint que consulta un activo inexistente retorna 404 con ASSET_NOT_FOUND."""
        with patch("routers.cedears.get_ticker_data", return_value=None):
            resp = self.client.get("/api/cedears/quote_json/UNKNOWN")
            self.assertEqual(resp.status_code, 404)
            data = resp.json()
            self.assertEqual(data.get("code"), "ASSET_NOT_FOUND")
            self.assertIn("request_id", data)

    def test_pydantic_validation_error_handler(self):
        """Payload con tipo de dato incompatible retorna 422 y envelope uniforme."""
        resp = self.client.post("/api/rotation/holdings/update", json={
            "portfolio": "bmb",
            "ticker": "AAPL",
            "nominals": "NO_ES_NUMERO"
        })
        self.assertEqual(resp.status_code, 422)
        data = resp.json()
        self.assertEqual(data.get("code"), "VALIDATION_ERROR")
        self.assertIn("error", data)
        self.assertIn("request_id", data)


class TestAPI02PydanticSchemas(unittest.TestCase):
    """Pruebas de Modelos Pydantic v2 Fuertemente Tipados (API-02)."""

    def test_portfolio_create_request_valid(self):
        req = PortfolioCreateRequest(name="mi_cartera_tech", mode="weights")
        self.assertEqual(req.name, "mi_cartera_tech")
        self.assertEqual(req.mode, "weights")

    def test_portfolio_create_request_rejects_empty_name(self):
        with self.assertRaises(Exception):
            PortfolioCreateRequest(name="")

    def test_portfolio_settings_request_validation(self):
        req = PortfolioSettingsRequest(anchor="AAPL", qty=10)
        self.assertEqual(req.anchor, "AAPL")
        self.assertEqual(req.qty, 10)

        # Qty no puede ser menor a 1
        with self.assertRaises(Exception):
            PortfolioSettingsRequest(qty=0)

    def test_quick_update_asset_request_rejects_negative_metrics(self):
        with self.assertRaises(Exception):
            QuickUpdateAssetRequest(ticker="AAPL", ppc=-150.0)

    def test_holding_item_payload_rejects_negative_or_fractional(self):
        # Nominales negativos rechazados
        with self.assertRaises(Exception):
            HoldingItemPayload(ticker="AAPL", nominals=-5)

        # PPC negativo rechazado
        with self.assertRaises(Exception):
            HoldingItemPayload(ticker="AAPL", nominals=10, ppc=-100.0)

    def test_bulk_holdings_payload_rejects_negative_cash(self):
        with self.assertRaises(Exception):
            BulkHoldingsPayload(holdings={}, cash_ars=-500.0)

    def test_valuation_sync_gf_request(self):
        req = SyncGFRequest(ticker="NVDA", fair_value=130.5)
        self.assertEqual(req.ticker, "NVDA")
        self.assertEqual(req.fair_value, 130.5)

        with self.assertRaises(Exception):
            SyncGFRequest(ticker="NVDA", fair_value=-10.0)


class TestAPI03PrewarmService(unittest.TestCase):
    """Pruebas de Precalentamiento Asíncrono no Bloqueante (API-03)."""

    def test_prewarm_disabled_flag(self):
        """Verifica que ENABLE_PREWARM=false desactive el precalentamiento inmediatamente."""
        with patch.dict(os.environ, {"ENABLE_PREWARM": "false"}):
            result = asyncio.run(prewarm_portfolio_cache())
            self.assertFalse(result)

    def test_prewarm_respects_provider_timeout(self):
        """Simula retraso en proveedor externo y verifica que el timeout se ejecute limpiamente."""
        def slow_provider(*args, **kwargs):
            import time
            time.sleep(2.0)
            return {}

        with patch("services.prewarm_service.get_multiple_tickers_data", side_effect=slow_provider):
            with patch("services.prewarm_service.fetch_performance", return_value={}):
                with patch.dict(os.environ, {"ENABLE_PREWARM": "true"}):
                    # Timeout estricto de 0.2 segundos
                    result = asyncio.run(prewarm_portfolio_cache(timeout_seconds=0.2))
                    self.assertTrue(result)

    def test_readiness_and_health_remain_responsive(self):
        """Asegura que los endpoints de salud respondan inmediatamente 200 sin depender de prewarm."""
        client = TestClient(app)
        live_resp = client.get("/live")
        self.assertEqual(live_resp.status_code, 200)

        ready_resp = client.get("/ready")
        self.assertEqual(ready_resp.status_code, 200)

        health_resp = client.get("/health")
        self.assertEqual(health_resp.status_code, 200)


class TestAPI04FinancialInvariants(unittest.TestCase):
    """Pruebas de Validación Centralizada de Invariantes Financieras (API-04)."""

    def test_validate_ticker_valid(self):
        self.assertEqual(validate_ticker("aapl"), "AAPL")
        self.assertEqual(validate_ticker("BRK.B"), "BRK.B")
        self.assertEqual(validate_ticker("ggal.ba"), "GGAL.BA")

    def test_validate_ticker_invalid(self):
        with self.assertRaises(InvalidTickerError):
            validate_ticker("")
        with self.assertRaises(InvalidTickerError):
            validate_ticker("AAPL$123")
        with self.assertRaises(InvalidTickerError):
            validate_ticker("VERY_LONG_TICKER_NAME_OVER_LIMIT")

    def test_validate_portfolio_weights_exact_and_tolerance(self):
        # Exactamente 100%
        assets = {"AAPL": 40.0, "MSFT": 30.0, "GOOGL": 30.0}
        self.assertEqual(validate_portfolio_weights(assets), 100.0)

        # Dentro de tolerancia (99.8% con tolerancia 0.5%)
        assets_tol = {"AAPL": 40.0, "MSFT": 30.0, "GOOGL": 29.8}
        self.assertAlmostEqual(validate_portfolio_weights(assets_tol, tolerance_pct=0.5), 99.8, places=1)

    def test_validate_portfolio_weights_sum_error(self):
        # Suma 80% (fuera de tolerancia)
        assets_under = {"AAPL": 40.0, "MSFT": 40.0}
        with self.assertRaises(WeightsSumError):
            validate_portfolio_weights(assets_under)

        # Suma 120%
        assets_over = {"AAPL": 60.0, "MSFT": 60.0}
        with self.assertRaises(WeightsSumError):
            validate_portfolio_weights(assets_over)

    def test_validate_portfolio_weights_negative_rejected(self):
        assets_neg = {"AAPL": 120.0, "MSFT": -20.0}
        with self.assertRaises(NegativeValueError):
            validate_portfolio_weights(assets_neg)

    def test_validate_holding_nominals_integer_for_cedears(self):
        self.assertEqual(validate_holding_nominals(15, is_cedear=True), 15)
        self.assertEqual(validate_holding_nominals(15.0, is_cedear=True), 15)

        with self.assertRaises(FractionalCedearError):
            validate_holding_nominals(15.5, is_cedear=True)

        with self.assertRaises(NegativeValueError):
            validate_holding_nominals(-1, is_cedear=True)

    def test_validate_price_or_ppc(self):
        self.assertEqual(validate_price_or_ppc(100.5), 100.5)
        self.assertIsNone(validate_price_or_ppc(None, allow_none=True))

        with self.assertRaises(NegativeValueError):
            validate_price_or_ppc(-5.0)

        with self.assertRaises(NegativeValueError):
            validate_price_or_ppc(None, allow_none=False)

    def test_validate_cash_balance(self):
        self.assertEqual(validate_cash_balance(1500.50), 1500.50)
        self.assertEqual(validate_cash_balance(0.0), 0.0)

        with self.assertRaises(NegativeValueError):
            validate_cash_balance(-100.0)


class TestAPI05CorrelationIdAndObservability(unittest.TestCase):
    """Pruebas de Observabilidad, Correlation-ID y Sanitización de Logs (API-05)."""

    def setUp(self):
        self.client = TestClient(app)

    def test_auto_generated_correlation_id(self):
        """Petición sin X-Request-ID recibe uno auto-generado en los encabezados y proceso de tiempo."""
        resp = self.client.get("/live")
        self.assertEqual(resp.status_code, 200)
        req_id = resp.headers.get("X-Request-ID")
        self.assertIsNotNone(req_id)
        self.assertTrue(req_id.startswith("req_"))
        self.assertIn("X-Process-Time", resp.headers)

    def test_propagated_client_correlation_id(self):
        """Petición con X-Request-ID del cliente preserva y devuelve el mismo ID exacto."""
        client_req_id = "client-trace-abc-12345"
        resp = self.client.get("/live", headers={"X-Request-ID": client_req_id})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("X-Request-ID"), client_req_id)

    def test_correlation_id_in_error_envelope(self):
        """En caso de error, el JSON de respuesta contiene el request_id correspondiente."""
        client_req_id = "client-error-trace-999"
        resp = self.client.get(
            "/api/portfolios/rebalance_json/inexistent_pf_abc",
            headers={"X-Request-ID": client_req_id}
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.headers.get("X-Request-ID"), client_req_id)
        data = resp.json()
        self.assertEqual(data.get("request_id"), client_req_id)

    def test_log_sanitization_masks_sensitive_data(self):
        """Verifica que el RequestIdFilter y formatter enmascaren contraseñas y tokens."""
        filter_instance = RequestIdFilter()
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg='Usuario autenticado con "password": "super_secret_password" y "token": "abc123token"',
            args=(),
            exc_info=None
        )

        filter_instance.filter(record)
        self.assertNotIn("super_secret_password", record.msg)
        self.assertNotIn("abc123token", record.msg)
        self.assertIn('"password": \'***\'', record.msg)
        self.assertIn('"token": \'***\'', record.msg)

    def test_structured_json_formatter(self):
        """Verifica que StructuredJsonFormatter genere JSON válido con campos canónicos."""
        formatter = StructuredJsonFormatter()
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=20,
            msg="Operación ejecutada con éxito.",
            args=(),
            exc_info=None
        )
        record.request_id = "req_structured_test"

        formatted = formatter.format(record)
        parsed = json.loads(formatted)

        self.assertEqual(parsed["level"], "INFO")
        self.assertEqual(parsed["logger"], "test_logger")
        self.assertEqual(parsed["message"], "Operación ejecutada con éxito.")
        self.assertEqual(parsed["request_id"], "req_structured_test")
        self.assertIn("timestamp", parsed)


if __name__ == "__main__":
    unittest.main()
