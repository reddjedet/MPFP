from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from routers import (
    cedears, 
    portfolios, 
    renta_fija, 
    performance, 
    earnings, 
    valuation, 
    markowitz, 
    rotation,
    indices
)
from services.portfolio_service import load_portfolios
from services.security_service import get_cors_configuration
from services.observability import (
    CorrelationIdMiddleware,
    configure_logging,
    get_current_request_id
)
from services.prewarm_service import prewarm_portfolio_cache
from services.exceptions import MPFPError
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
import asyncio
import logging
from contextlib import asynccontextmanager

configure_logging()
logger = logging.getLogger("MPFPBackend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando MPFP backend...")
    task = asyncio.create_task(prewarm_portfolio_cache())
    try:
        yield
    finally:
        logger.info("Cerrando MPFP backend...")
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("MPFP backend finalizado limpiamente.")

app = FastAPI(
    title="Máquina de Planes, Finanzas y Portfolios (MPFP)",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan
)

# 1. Observabilidad y Correlation-ID (API-05)
app.add_middleware(CorrelationIdMiddleware)

# 2. Compresión Gzip automática para respuestas mayores a 1 KB (reduce transferencia hasta 80%)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 3. Configuración CORS
cors_origins, cors_regex, cors_credentials = get_cors_configuration()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_regex,
    allow_credentials=cors_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# Handlers Globales de Excepciones de Dominio (API-01)
# ------------------------------------------------------------------------------

@app.exception_handler(MPFPError)
async def handle_mpfp_domain_error(request: Request, exc: MPFPError):
    req_id = getattr(request.state, "request_id", get_current_request_id())
    logger.warning(f"Domain error [{exc.code}] [req_id={req_id}]: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(request_id=req_id)
    )

@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(request: Request, exc: RequestValidationError):
    req_id = getattr(request.state, "request_id", get_current_request_id())
    error_messages = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        msg = err.get("msg", "Dato inválido")
        error_messages.append(f"{loc}: {msg}")
    
    combined_msg = "; ".join(error_messages) if error_messages else "Error de validación en parámetros de entrada."
    logger.warning(f"Validation error [req_id={req_id}]: {combined_msg}")
    return JSONResponse(
        status_code=422,
        content={
            "error": combined_msg,
            "code": "VALIDATION_ERROR",
            "details": exc.errors(),
            "request_id": req_id
        }
    )

@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(request: Request, exc: StarletteHTTPException):
    req_id = getattr(request.state, "request_id", get_current_request_id())
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "code": f"HTTP_{exc.status_code}",
            "request_id": req_id
        }
    )

@app.exception_handler(Exception)
async def handle_unhandled_exception(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", get_current_request_id())
    logger.critical(f"Unhandled server exception [req_id={req_id}]: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Error interno del servidor.",
            "code": "INTERNAL_SERVER_ERROR",
            "request_id": req_id
        }
    )

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none';"
    )
    return response

# Mount static & React assets
app.mount("/static", StaticFiles(directory="static"), name="static")
REACT_DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist"))
REACT_ASSETS_DIR = os.path.join(REACT_DIST_DIR, "assets")

if os.path.exists(REACT_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=REACT_ASSETS_DIR), name="react_assets")

@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
def get_favicon():
    fav = os.path.join(os.path.dirname(__file__), "static", "favicon.svg")
    if os.path.exists(fav):
        return FileResponse(fav, media_type="image/svg+xml")
    return Response(status_code=404)

def _serve_spa_index():
    index_file = os.path.join(REACT_DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(
            index_file,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return HTMLResponse("<h3>Compilando React... Ejecuta 'cd frontend && npm run build'</h3>")

# Include routers
app.include_router(cedears.router, prefix="/api/cedears", tags=["cedears"])
app.include_router(portfolios.router, prefix="/api/portfolios", tags=["portfolios"])
app.include_router(earnings.router, prefix="/api/earnings", tags=["earnings"])
app.include_router(valuation.router, prefix="/api/valuation", tags=["valuation"])
app.include_router(renta_fija.router, prefix="/api/renta_fija", tags=["renta_fija"])
app.include_router(performance.router, prefix="/api/performance", tags=["performance"])
app.include_router(markowitz.router, prefix="/api/markowitz", tags=["markowitz"])
app.include_router(rotation.router, prefix="/api/rotation", tags=["rotation"])
app.include_router(indices.router, prefix="/api/indices", tags=["indices"])

@app.get("/live", response_class=JSONResponse)
def live_check():
    """Verifica si el proceso FastAPI está activo y respondiendo (Liveness)."""
    return {"status": "alive"}

@app.get("/ready", response_class=JSONResponse)
def ready_check():
    """Verifica si los subsistemas de persistencia de datos están operativos (Readiness)."""
    try:
        portfolios_data = load_portfolios()
        return {
            "status": "ready",
            "checks": {
                "storage": "ok",
                "portfolios_loaded": len(portfolios_data)
            }
        }
    except Exception as e:
        logger.error(f"Readiness check falló: {e}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "error": "Fallo en lectura de persistencia"}
        )

@app.get("/health", response_class=JSONResponse)
def health_check():
    """Endpoint de salud unificado para balanceadores, Render y monitor local."""
    try:
        portfolios_data = load_portfolios()
        storage_ok = True
        pf_count = len(portfolios_data)
    except Exception:
        storage_ok = False
        pf_count = 0

    is_healthy = storage_ok
    status_code = 200 if is_healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if is_healthy else "degraded",
            "app": "Máquina de Planes, Finanzas y Portfolios (MPFP)",
            "live": True,
            "ready": storage_ok,
            "portfolios_count": pf_count
        }
    )

@app.get("/", include_in_schema=False)
def read_root():
    return _serve_spa_index()

@app.get("/{full_path:path}", include_in_schema=False)
def catch_all_spa(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("static/") or full_path.startswith("assets/"):
        return Response(status_code=404)
        
    target = os.path.abspath(os.path.join(REACT_DIST_DIR, full_path))
    # Mitigación Path Traversal: asegurar que target resuelto pertenezca estrictamente a REACT_DIST_DIR
    try:
        if os.path.commonpath([REACT_DIST_DIR, target]) != REACT_DIST_DIR:
            return Response(status_code=403)
    except ValueError:
        return Response(status_code=403)
        
    if os.path.isfile(target):
        media_type = "image/svg+xml" if target.endswith(".svg") else None
        return FileResponse(target, media_type=media_type)
    return _serve_spa_index()
