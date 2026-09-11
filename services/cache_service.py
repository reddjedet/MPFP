import functools
import time
from datetime import datetime, time as dt_time
from zoneinfo import ZoneInfo

ART_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

def get_market_ttl(category: str = "realtime") -> int:
    """
    Calcula el TTL (Time To Live) del caché en segundos basándose en la categoría
    y el estado del mercado financiero argentino (Lunes a Viernes de 11:00 a 17:00 ART).
    Garantiza consistencia horaria independientemente de la zona horaria del host/servidor.
    """
    if category == "static":
        return 86400  # 24 horas para fichas técnicas (ISIN, Ley, Vencimiento) que nunca cambian
        
    if category == "historical":
        return 14400  # 4 horas para métricas diarias de TradingView (Perf. 3M, 6M, YTD, etc.)
        
    # Categoría: Real-time (CEDEARs, cotizaciones de bonos en MAE) en hora oficial argentina
    now = datetime.now(ART_TZ)
    
    # 1. Fin de semana (Sábado = 5, Domingo = 6)
    if now.weekday() >= 5:
        return 43200  # 12 horas si es fin de semana (el mercado está cerrado)
        
    # 2. Fuera de horario de mercado (Antes de las 11:00 o después de las 17:05 ART)
    market_start = dt_time(11, 0)
    market_end = dt_time(17, 5)
    current_time = now.time()
    
    if current_time < market_start or current_time > market_end:
        return 43200  # 12 horas si el mercado está cerrado durante la semana (noche/madrugada)
        
    # 3. Mercado abierto
    return 180  # 3 minutos durante horario de mercado (balance óptimo entre frescura y rendimiento)

import json
import os
from pathlib import Path
from collections import OrderedDict
import threading
import pandas as pd

DISK_CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / ".cache_market.json"

def _load_disk_cache() -> dict:
    if DISK_CACHE_FILE.exists():
        try:
            with open(DISK_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_disk_cache(data: dict):
    try:
        tmp_file = DISK_CACHE_FILE.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp_file, DISK_CACHE_FILE)
    except Exception:
        pass

def smart_cache(category: str = "realtime", maxsize: int = 256):
    """
    Decorador de caché inteligente en memoria con persistencia en disco y TTL dinámico.
    Permite arranques instantáneos (sub-segundo) reutilizando las últimas cotizaciones conocidas.
    Soporta DataFrames y estructuras JSON nativas.
    """
    def decorator(func):
        cache = OrderedDict()
        lock = threading.Lock()
        
        # Hidratar caché desde disco al iniciar
        initial_disk = _load_disk_cache().get(func.__name__, {})
        for k, item in initial_disk.items():
            if isinstance(item, list) and len(item) == 2:
                raw_val, timestamp = item[0], item[1]
                if isinstance(raw_val, dict) and raw_val.get("__df__") and "data" in raw_val:
                    try:
                        raw_val = pd.DataFrame(**raw_val["data"])
                    except Exception:
                        continue
                cache[k] = (raw_val, timestamp)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = str(args) + str(kwargs)
            now = time.time()
            ttl = get_market_ttl(category)
            
            with lock:
                if key in cache:
                    val, timestamp = cache[key]
                    if now - timestamp < ttl:
                        cache.move_to_end(key)
                        return val

            # Si expiró o no está en memoria, ejecutar función
            val = func(*args, **kwargs)
            
            if val is not None:
                with lock:
                    cache[key] = (val, time.time())
                    cache.move_to_end(key)
                    if len(cache) > maxsize:
                        cache.popitem(last=False)
                    
                    # Persistir snapshot en disco en segundo plano/hilo
                    try:
                        all_disk = _load_disk_cache()
                        func_cache = all_disk.get(func.__name__, {})
                        save_val = {"__df__": True, "data": val.to_dict(orient="split")} if isinstance(val, pd.DataFrame) else val
                        func_cache[key] = [save_val, time.time()]
                        all_disk[func.__name__] = func_cache
                        _save_disk_cache(all_disk)
                    except Exception:
                        pass
            else:
                # Fallback: si Yahoo Finance falló o dio timeout, devolver último valor conocido
                with lock:
                    if key in cache:
                        return cache[key][0]

            return val
        return wrapper
    return decorator

