import logging
logger = logging.getLogger(__name__)
import yfinance as yf
import pandas as pd
import numpy as np

MIN_CANDLES = 20

from pathlib import Path
from services.atomic_persistence import AtomicJsonDatabase

RATIOS_FILE = Path(__file__).resolve().parent.parent / "data" / "cedear_ratios.json"
_ratios_db = AtomicJsonDatabase(RATIOS_FILE)

def load_cedear_ratios() -> dict[str, float]:
    """Carga los ratios de conversión de CEDEARs desde persistencia atómica."""
    return _ratios_db.load()

def save_cedear_ratio(ticker: str, ratio: float) -> None:
    """Guarda o actualiza el ratio de conversión de un CEDEAR."""
    data = _ratios_db.load()
    data[ticker.upper().strip()] = float(ratio)
    _ratios_db.save(data)

def get_cedear_ratio(ticker: str) -> float | None:
    """Obtiene el ratio de conversión de un CEDEAR por ticker."""
    ratios = load_cedear_ratios()
    return ratios.get(ticker.upper().strip())

class _RatiosProxy(dict):
    """Proxy dinámico para retrocompatibilidad total con accesos a CEDEAR_RATIOS."""
    def __getitem__(self, key):
        return load_cedear_ratios()[key]
    def get(self, key, default=None):
        return load_cedear_ratios().get(key, default)
    def __contains__(self, key):
        return key in load_cedear_ratios()
    def items(self):
        return load_cedear_ratios().items()
    def keys(self):
        return load_cedear_ratios().keys()
    def values(self):
        return load_cedear_ratios().values()
    def __len__(self):
        return len(load_cedear_ratios())

CEDEAR_RATIOS = _RatiosProxy()


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    RSI usando método de Wilder con protección contra división por cero
    y series con varianza nula.
    """
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    
    # Manejo de división por cero
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    
    # Si avg_loss fue 0 y hubo ganancias, RSI = 100
    rsi = rsi.fillna(100.0).where(avg_loss != 0, 100.0)
    # Si ambas fueron 0 (precio plano), RSI = 50.0
    rsi = rsi.where((avg_gain != 0) | (avg_loss != 0), 50.0)
    
    return rsi

from services.cache_service import smart_cache

@smart_cache("realtime")
def get_ticker_data(symbol: str) -> dict | None:
    sym_clean = symbol.upper().strip()
    is_pam = sym_clean == "PAM"
    adr_sym = "BRK-B" if sym_clean in ("BRKB", "BRK.B") else sym_clean
    loc_sym = "PAMP.BA" if is_pam else f"{sym_clean.replace('BRK.B', 'BRKB')}.BA"
    
    try:
        # Descargar velas diarias (6 meses) para asegurar convergencia precisa del RSI de 14 días
        df_adr = yf.download(adr_sym, period="6mo", interval="1d", progress=False)
        if df_adr.empty or df_adr["Close"].dropna().empty:
            return None
            
        df_loc = yf.download(loc_sym, period="5d", progress=False)
        close_adr = df_adr["Close"]
        if isinstance(close_adr, pd.DataFrame):
            close_adr = close_adr.iloc[:, 0]
        close_adr = close_adr.dropna()
        
        if len(close_adr) < MIN_CANDLES:
            return None
            
        close_loc = None
        if not df_loc.empty:
            cl = df_loc["Close"]
            if isinstance(cl, pd.DataFrame):
                cl = cl.iloc[:, 0]
            cl = cl.dropna()
            if not cl.empty:
                close_loc = cl
                
        current_adr = float(close_adr.iloc[-1])
        current_loc = float(close_loc.iloc[-1]) if close_loc is not None else 0.0
        current_rsi = float(calculate_rsi(close_adr).dropna().iloc[-1])
        
        return {
            "symbol": symbol.upper(),
            "adr": round(current_adr, 2),
            "local": round(current_loc, 2),
            "rsi": round(current_rsi, 2),
            "ratio": CEDEAR_RATIOS.get(symbol.upper(), "N/A"),
            "alert": current_rsi > 65.0 or current_rsi < 35.0
        }
    except Exception as e:
        logger.warning(f"Error obteniendo CEDEAR: {e}")
        return None

from concurrent.futures import ThreadPoolExecutor, as_completed

_shared_executor = ThreadPoolExecutor(max_workers=12)

def get_multiple_tickers_data(symbols: list[str]) -> dict[str, dict]:
    """
    Descarga datos de múltiples tickers en paralelo usando un pool global,
    aprovechando smart_cache y reduciendo el overhead de hilos.
    """
    if not symbols:
        return {}
        
    unique_symbols = list(dict.fromkeys([s.upper() for s in symbols if s]))
    results = {}
    
    future_to_sym = {_shared_executor.submit(get_ticker_data, sym): sym for sym in unique_symbols}
    for future in as_completed(future_to_sym):
        sym = future_to_sym[future]
        try:
            data = future.result(timeout=5)
            if data:
                results[sym] = data
        except Exception as e:
            logger.warning(f"Fallo en pool multiple CEDEARs: {e}")
            pass
                
    return results
