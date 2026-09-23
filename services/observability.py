"""
Módulo de Observabilidad, Correlation-ID y Logging Estructurado - MPFP (API-05)
Garantiza trazabilidad de solicitudes, métricas de rendimiento y sanitización de datos privados en logs.
"""

import json
import logging
import os
import re
import time
import uuid
from contextvars import ContextVar
from typing import Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Variable de contexto asíncrona para propagar el ID de solicitud actual
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")

# Patrones para enmascarar información sensible en logs
SENSITIVE_PATTERNS = [
    (re.compile(r"('password'|\"password\"):\s*('[^']+'|\"[^\"]+\")", re.IGNORECASE), r"\1: '***'"),
    (re.compile(r"('token'|\"token\"):\s*('[^']+'|\"[^\"]+\")", re.IGNORECASE), r"\1: '***'"),
    (re.compile(r"('secret'|\"secret\"):\s*('[^']+'|\"[^\"]+\")", re.IGNORECASE), r"\1: '***'"),
]


def get_current_request_id() -> str:
    """Obtiene el Correlation-ID del contexto actual o genera uno fallback."""
    req_id = request_id_ctx.get()
    return req_id if req_id else "system"


class RequestIdFilter(logging.Filter):
    """Inyecta el request_id del contexto asíncrono en cada registro de log."""
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_current_request_id()
        # Sanitizar mensaje en busca de datos sensibles
        if isinstance(record.msg, str):
            for pattern, repl in SENSITIVE_PATTERNS:
                record.msg = pattern.sub(repl, record.msg)
        return True


class StructuredJsonFormatter(logging.Formatter):
    """Formateador JSON estructurado para entornos de producción/observabilidad."""
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "system")
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware HTTP que genera o propaga el Correlation-ID (X-Request-ID)
    e inyecta métricas de latencia de ejecución (X-Process-Time).
    """
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        # Obtener o generar Correlation-ID
        req_id = request.headers.get("X-Request-ID")
        if not req_id:
            req_id = f"req_{uuid.uuid4().hex[:12]}"

        # Establecer en el contexto y estado del request
        token = request_id_ctx.set(req_id)
        request.state.request_id = req_id

        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)

        # Inyectar encabezados en la respuesta
        elapsed_ms = (time.time() - start_time) * 1000.0
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time"] = f"{elapsed_ms:.2f}ms"

        return response


def configure_logging(level: int = logging.INFO) -> None:
    """Configura el sistema de logging con correlation-id y filtros de privacidad."""
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Evitar duplicar handlers
    if not any(isinstance(f, RequestIdFilter) for h in root_logger.handlers for f in h.filters):
        is_production = os.getenv("APP_ENV", "development").lower() == "production"
        
        handler = logging.StreamHandler()
        handler.addFilter(RequestIdFilter())

        if is_production:
            handler.setFormatter(StructuredJsonFormatter())
        else:
            handler.setFormatter(
                logging.Formatter("[%(asctime)s] [%(levelname)s] [%(request_id)s] %(name)s: %(message)s")
            )

        root_logger.handlers = [handler]
