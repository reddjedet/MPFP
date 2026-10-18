import json
import logging
import math
logger = logging.getLogger(__name__)
import yfinance as yf
import pandas as pd
import numpy as np

MIN_CANDLES = 20

from services.atomic_persistence import AtomicJsonDatabase
from services.data_paths import data_file

RATIOS_FILE = data_file("cedear_ratios.json")
_ratios_db = AtomicJsonDatabase(RATIOS_FILE)

# Las bases SQLite ya inicializadas no vuelven a importar automáticamente el JSON seed.
_CEDEAR_RATIO_BACKFILL_TICKERS = ("GEV", "ISRG")


def _backfill_missing_cedear_ratios(ratios_db: AtomicJsonDatabase, seed_ratios: dict) -> None:
    """Añade al SQLite ratios nuevos del catálogo seed sin pisar valores guardados."""
    if not isinstance(seed_ratios, dict):
        return

    stored_ratios = ratios_db.load()
    if not isinstance(stored_ratios, dict):
        return

    stored_tickers = {str(ticker).upper() for ticker in stored_ratios}
    for ticker in _CEDEAR_RATIO_BACKFILL_TICKERS:
        if ticker in stored_tickers:
            continue

        ratio = seed_ratios.get(ticker)
        if isinstance(ratio, bool) or not isinstance(ratio, (int, float)):
            continue
        if not math.isfinite(ratio) or ratio <= 0:
            continue

        ratios_db.set_item(ticker, float(ratio))
        stored_tickers.add(ticker)


def _apply_cedear_ratio_backfill() -> None:
    """Migra al SQLite existente los CEDEARs añadidos al catálogo versionado."""
    try:
        with RATIOS_FILE.open("r", encoding="utf-8") as ratios_file:
            seed_ratios = json.load(ratios_file)
        _backfill_missing_cedear_ratios(_ratios_db, seed_ratios)
    except Exception as exc:
        logger.warning("No se pudo actualizar el catálogo SQLite de CEDEARs: %s", exc)


_apply_cedear_ratio_backfill()


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
    
    # El RSI no está definido hasta tener `period` deltas válidos
    rsi.iloc[:period] = np.nan
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
            "alert": current_rsi >= 65.0 or current_rsi <= 35.0
        }
    except Exception as e:
        logger.warning(f"Error obteniendo CEDEAR: {e}")
        return None

@smart_cache("realtime")
def get_multiple_tickers_data(symbols: list[str]) -> dict[str, dict]:
    """
    Descarga datos de múltiples tickers en un solo batch usando yfinance,
    optimizando el cold-start del dashboard de 5 segundos a ~1 segundo.
    """
    if not symbols:
        return {}
        
    unique_symbols = sorted(list(dict.fromkeys([s.upper().strip() for s in symbols if s])))
    
    adr_syms = []
    loc_syms = []
    sym_map = {}
    
    for sym in unique_symbols:
        is_pam = sym == "PAM"
        adr_sym = "BRK-B" if sym in ("BRKB", "BRK.B") else sym
        loc_sym = "PAMP.BA" if is_pam else f"{sym.replace('BRK.B', 'BRKB')}.BA"
        adr_syms.append(adr_sym)
        loc_syms.append(loc_sym)
        sym_map[sym] = {"adr": adr_sym, "loc": loc_sym}

    try:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_adr = executor.submit(yf.download, " ".join(adr_syms), period="6mo", interval="1d", group_by="ticker", progress=False)
            future_loc = executor.submit(yf.download, " ".join(loc_syms), period="5d", interval="1d", group_by="ticker", progress=False)
            df_adr = future_adr.result()
            df_loc = future_loc.result()
    except Exception as e:
        logger.warning(f"Error en batch download: {e}")
        return {}

    def extract_close(df, is_single):
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            return df.xs('Close', level=1, axis=1)
        else:
            c = df[['Close']].copy()
            if is_single:
                c.columns = [is_single]
            return c

    close_adr_df = extract_close(df_adr, adr_syms[0] if len(adr_syms) == 1 else None)
    close_loc_df = extract_close(df_loc, loc_syms[0] if len(loc_syms) == 1 else None)
    
    results = {}
    for sym in unique_symbols:
        adr_sym = sym_map[sym]["adr"]
        loc_sym = sym_map[sym]["loc"]
        
        current_adr = 0.0
        current_rsi = 50.0
        current_loc = 0.0
        
        if close_adr_df is not None and adr_sym in close_adr_df.columns:
            series_adr = close_adr_df[adr_sym].dropna()
            if len(series_adr) >= MIN_CANDLES:
                current_adr = float(series_adr.iloc[-1])
                current_rsi = float(calculate_rsi(series_adr).dropna().iloc[-1])
                
        if close_loc_df is not None and loc_sym in close_loc_df.columns:
            series_loc = close_loc_df[loc_sym].dropna()
            if not series_loc.empty:
                current_loc = float(series_loc.iloc[-1])
                
        if current_adr > 0:
            results[sym] = {
                "symbol": sym,
                "adr": round(current_adr, 2),
                "local": round(current_loc, 2),
                "rsi": round(current_rsi, 2),
                "ratio": CEDEAR_RATIOS.get(sym, "N/A"),
                "alert": current_rsi >= 65.0 or current_rsi <= 35.0
            }
            
    return results
