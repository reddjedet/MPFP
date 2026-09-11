from fastapi.middleware.cors import CORSMiddleware
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
    rotation
)
from services.portfolio_service import load_portfolios
from services.cedear_service import get_multiple_tickers_data
from services.tv_service import fetch_performance
import os
import time
import asyncio
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

async def prewarm_portfolio_cache():
    try:
        await asyncio.sleep(1.0)
        portfolios_data = load_portfolios()
        loop = asyncio.get_running_loop()
        
        all_tickers = set()
        for pf in portfolios_data.values():
            all_tickers.update(pf.get("assets", {}).keys())
            
        if all_tickers:
            await loop.run_in_executor(None, get_multiple_tickers_data, list(all_tickers))
            all_perf_tickers = sorted(list(all_tickers | {"SPY", "QQQ", "DIA"}))
            await loop.run_in_executor(None, fetch_performance, all_perf_tickers)
            
    except Exception as e:
        logger.error(f"Error precalentando caché: {e}", exc_info=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(prewarm_portfolio_cache())
    yield
    if not task.done():
        task.cancel()

app = FastAPI(title="Máquina de Planes, Finanzas y Portfolios (MPFP)", docs_url=None, redoc_url=None, lifespan=lifespan)

ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost|.*\.onrender\.com)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    start_time = time.time()
    response: Response = await call_next(request)
    
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Process-Time"] = f"{(time.time() - start_time) * 1000:.2f}ms"
    
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

@app.get("/health", response_class=JSONResponse)
def health_check():
    return {
        "status": "healthy",
        "app": "Máquina de Planes, Finanzas y Portfolios (MPFP)"
    }

@app.get("/", include_in_schema=False)
def read_root():
    return _serve_spa_index()

@app.get("/react", include_in_schema=False)
@app.get("/react/{full_path:path}", include_in_schema=False)
def serve_react_alias(full_path: str = ""):
    return _serve_spa_index()

@app.get("/{full_path:path}", include_in_schema=False)
def catch_all_spa(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("static/") or full_path.startswith("assets/"):
        return Response(status_code=404)
    target = os.path.join(REACT_DIST_DIR, full_path)
    if os.path.isfile(target):
        media_type = "image/svg+xml" if target.endswith(".svg") else None
        return FileResponse(target, media_type=media_type)
    return _serve_spa_index()
