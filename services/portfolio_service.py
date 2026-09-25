import math
from typing import Any, Optional
import logging
from services.data_paths import data_file
from services.sqlite_persistence import SQLiteTableStore

logger = logging.getLogger(__name__)
from services.financial_units import normalize_fixed_income_price, to_base_100, normalize_quote_to_base_100

from datetime import datetime

DB_PATH = data_file("portfolios.json")
_db = SQLiteTableStore("portfolios", DB_PATH)

TRASH_DB_PATH = data_file("portfolios_trash.json")
_trash_db = SQLiteTableStore("portfolios_trash", TRASH_DB_PATH)
MAX_TRASH_CAPACITY = 7

RESERVED_PORTFOLIO_NAMES = frozenset({"bmb", "bal"})

def load_portfolios_trash() -> list[dict]:
    """Carga la lista de carteras en papelera de reciclaje."""
    data = _trash_db.load()
    if isinstance(data, list):
        return data
    return []

def save_portfolios_trash(data: list[dict]) -> None:
    """Guarda la lista de carteras en papelera de reciclaje con límite máximo de 7."""
    # Aplicar política FIFO: retener solo las últimas MAX_TRASH_CAPACITY carteras
    pruned = data[-MAX_TRASH_CAPACITY:] if len(data) > MAX_TRASH_CAPACITY else data
    _trash_db.save(pruned)

def move_portfolio_to_trash(pf_clean: str) -> dict:
    """
    Traslada una cartera activa a la papelera de reciclaje.
    Si la papelera supera las 7 carteras, la más antigua se elimina definitivamente (FIFO).
    """
    if pf_clean.lower() in RESERVED_PORTFOLIO_NAMES:
        return {"success": False, "error": "No se puede eliminar el portfolio predeterminado (BMB o BAL)."}

    portfolios_data = load_portfolios()
    if pf_clean not in portfolios_data:
        return {"success": False, "error": f"La cartera '{pf_clean}' no existe."}

    pf_data = portfolios_data.pop(pf_clean)
    save_portfolios(portfolios_data)

    trash = load_portfolios_trash()
    # Filtrar si ya existía una entrada previa con el mismo id
    trash = [item for item in trash if item.get("id") != pf_clean]

    entry = {
        "id": pf_clean,
        "name": pf_clean,
        "data": pf_data,
        "deleted_at": datetime.now().isoformat(),
        "asset_count": len(pf_data.get("assets", {})),
        "mode": pf_data.get("mode", "weights")
    }
    trash.append(entry)
    save_portfolios_trash(trash)

    updated_trash = load_portfolios_trash()
    return {
        "success": True,
        "moved_to_trash": pf_clean,
        "trash_count": len(updated_trash),
        "max_capacity": MAX_TRASH_CAPACITY
    }

def restore_portfolio_from_trash(pf_clean: str) -> dict:
    """
    Rescata/restaura una cartera desde la papelera de reciclaje al catálogo activo.
    """
    trash = load_portfolios_trash()
    found = None
    for item in trash:
        if item.get("id") == pf_clean or item.get("name") == pf_clean:
            found = item
            break

    if not found:
        return {"success": False, "error": f"La cartera '{pf_clean}' no se encuentra en la papelera."}

    # Remover de la papelera
    trash = [item for item in trash if item.get("id") != pf_clean and item.get("name") != pf_clean]
    _trash_db.save(trash)

    # Reinsertar en portfolios activos
    portfolios_data = load_portfolios()
    portfolios_data[pf_clean] = found.get("data", {"mode": "weights", "assets": {}})
    save_portfolios(portfolios_data)

    return {
        "success": True,
        "restored": pf_clean,
        "portfolio": portfolios_data[pf_clean]
    }

def delete_permanently_from_trash(pf_clean: str) -> dict:
    """
    Elimina definitivamente una cartera individual que se encuentra en la papelera.
    """
    trash = load_portfolios_trash()
    new_trash = [item for item in trash if item.get("id") != pf_clean and item.get("name") != pf_clean]
    _trash_db.save(new_trash)
    return {"success": True, "purged": pf_clean}

def load_portfolios() -> dict:
    data = _db.load()

    # Garantizar que el portfolio predeterminado exista si la base de datos está vacía o no tiene bmb
    if not data or "bmb" not in data:
        if not data:
            data = {}
        data["bmb"] = {
            "mode": "weights",
            "assets": {
                "CAT": 13.93, "MRK": 15.7, "GOOGL": 29.48, "MA": 11.52,
                "PM": 8.93, "AMAT": 4.25, "VIST": 16.19,
            }
        }

    # Migrar formatos antiguos (flat dict) a la estructura con "mode" y "assets"
    for k, v in list(data.items()):
        if not isinstance(v, dict):
            data[k] = {"mode": "weights", "assets": {}}
        elif "assets" not in v:
            # Formato plano legacy: todo el dict SON los assets
            data[k] = {"mode": "weights", "assets": v}
        elif "mode" not in v:
            # Tiene assets pero falta mode: agregar mode SIN envolver el resto
            new_v = dict(v)
            new_v["mode"] = "weights"
            data[k] = new_v
    return data

def save_portfolios(data: dict):
    _db.save(data)

def get_all_portfolio_tickers() -> list[str]:
    """Retorna una lista ordenada y sin duplicados de todos los tickers presentes en carteras."""
    pfs = load_portfolios()
    all_tk = set()
    for pf in pfs.values():
        if isinstance(pf, dict):
            assets = pf.get("assets", {})
            if isinstance(assets, dict):
                all_tk.update(assets.keys())
            elif isinstance(assets, list):
                for a in assets:
                    if isinstance(a, dict) and "ticker" in a:
                        all_tk.add(a["ticker"])
    return sorted([t.upper() for t in all_tk if t and isinstance(t, str)])

def calculate_portfolio_mcm(weights: dict, data: dict) -> dict | None:
    """
    Calcula el Mínimo Común Múltiplo (MCM) o Cartera Base Mínima (1x).
    Identifica el activo cuello de botella (mayor precio en relación a su peso)
    y determina la combinación entera mínima sin ningún activo en 0 VN.
    """
    if not weights or not data:
        return None
    total_w = sum(weights.values())
    if total_w == 0:
        return None
    norm = {t: w * 100.0 / total_w for t, w in weights.items()}

    ratios = {}
    for t, w in norm.items():
        if t in data and data[t].get("local") and data[t]["local"] > 0 and w > 0:
            p = data[t]["local"]
            ratios[t] = p / (w / 100.0)

    if not ratios:
        return None

    bottleneck_ticker = max(ratios, key=ratios.get)
    base_capital = ratios[bottleneck_ticker]

    base_nominals = {}
    for t, w in norm.items():
        if t in data and data[t].get("local") and data[t]["local"] > 0:
            p = data[t]["local"]
            base_nominals[t] = max(1, int(round((base_capital * (w / 100.0)) / p)))

    total_nominals = sum(base_nominals.values())
    actual_base_capital = sum(base_nominals[t] * data[t]["local"] for t in base_nominals if t in data and data[t].get("local"))

    # Find the most expensive ticker in pesos
    valid_prices = {t: data[t]["local"] for t in norm.keys() if t in data and data[t].get("local")}
    most_expensive_ticker = max(valid_prices, key=valid_prices.get) if valid_prices else bottleneck_ticker

    return {
        "bottleneck_ticker": bottleneck_ticker,
        "bottleneck_qty": base_nominals.get(bottleneck_ticker, 1),
        "most_expensive_ticker": most_expensive_ticker,
        "most_expensive_qty": base_nominals.get(most_expensive_ticker, 1),
        "base_capital": round(actual_base_capital, 2),
        "total_nominals": total_nominals,
        "base_nominals": base_nominals
    }

def safe_float(val: Any, default: Optional[float] = None) -> Optional[float]:
    """Convierte de forma segura un valor a float o retorna default si es nulo, inválido o NaN/inf."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default

def calculate_portfolio(weights: dict, data: dict, anchor_ticker: str, anchor_qty: int) -> list[dict] | None:
    if not weights or not data:
        return None
    if anchor_ticker not in weights:
        return None

    # Fallback si el ticker ancla no tiene cotización local > 0 en data
    if anchor_ticker not in data or not data[anchor_ticker].get("local") or data[anchor_ticker].get("local", 0) <= 0:
        available_anchors = [
            t for t, w in sorted(weights.items(), key=lambda x: x[1], reverse=True)
            if t in data and data[t].get("local") and data[t].get("local", 0) > 0
        ]
        if not available_anchors:
            return None
        anchor_ticker = available_anchors[0]

    total_w = sum(weights.values())
    if total_w <= 0:
        return None
    norm = {t: w * 100 / total_w for t, w in weights.items()}
    anchor_price = data[anchor_ticker]["local"]
    anchor_weight_norm = norm.get(anchor_ticker, 0.0)
    if anchor_weight_norm <= 0:
        return None
    total_value = (anchor_price * anchor_qty) / (anchor_weight_norm / 100)
    
    result = []
    actual_total_value = 0.0
    
    # Primera pasada: calcular cantidades nominales y sus valores reales
    for ticker, weight in norm.items():
        d = data.get(ticker)
        if not d or not d.get("local"):
            continue
        price = d["local"]
        
        # Forzar que la cantidad nominal del ticker ancla coincida exactamente con la ingresada
        if ticker == anchor_ticker:
            qty = anchor_qty
        else:
            qty = max(1, round(weight / 100 * total_value / price)) if price > 0 else 0
            
        value = qty * price
        actual_total_value += value
        
        result.append({
            "ticker": ticker,
            "weight": round(weight, 2),
            "price": round(price, 2),
            "adr_price": d.get("adr"),
            "ratio": d.get("ratio"),
            "qty": qty,
            "value": round(value, 2),
            "rsi": d.get("rsi")
        })
        
    # Segunda pasada: calcular los pesos reales basados en la sumatoria real del patrimonio
    for item in result:
        real_w = (item["value"] / actual_total_value * 100) if actual_total_value else 0
        item["real_weight"] = round(real_w, 2)
        
        # Filtro de Fricción / Turn-over:
        # Ignorar micro-rebalanceos (error < 2.5%) para evitar pérdidas por comisiones y spread
        raw_error = real_w - item["weight"]
        if abs(raw_error) < 2.5:
            item["error"] = 0.0
        else:
            item["error"] = round(raw_error, 2)
        
    return result

def calculate_portfolio_data(pf_data: dict, data: dict, anchor_ticker: str = None, anchor_qty: int = None) -> list[dict] | None:
    mode = pf_data.get("mode", "weights")
    assets = pf_data.get("assets", {})
    
    if not assets:
        return None
        
    if mode == "nominals":
        # Modo cantidades nominales fijas
        result = []
        actual_total_value = 0.0
        for ticker, qty in assets.items():
            d = data.get(ticker)
            if not d or not d.get("local"):
                continue
            price = d["local"]
            value = qty * price
            actual_total_value += value
            result.append({
                "ticker": ticker,
                "weight": 0.0, # Se calculará como el peso real
                "price": round(price, 2),
                "adr_price": d.get("adr"),
                "ratio": d.get("ratio"),
                "qty": qty,
                "value": round(value, 2),
                "rsi": d.get("rsi")
            })
            
        for item in result:
            real_w = (item["value"] / actual_total_value * 100) if actual_total_value else 0
            item["weight"] = round(real_w, 2) # Para nominales, el peso objetivo coincide con el real
            item["real_weight"] = round(real_w, 2)
            item["error"] = 0.0
            
        return result
    else:
        # Modo pesos objetivo estándar
        return calculate_portfolio(assets, data, anchor_ticker, anchor_qty)

def calculate_portfolio_rsi(result: list[dict]) -> dict | None:
    """
    Calcula el RSI ponderado por capital de la cartera y su diagnóstico de momentum.
    """
    if not result:
        return None
        
    valid_items = [item for item in result if item.get("rsi") is not None and isinstance(item.get("rsi"), (int, float))]
    if not valid_items:
        return None
        
    total_val = sum(item.get("value", 0.0) for item in valid_items)
    if total_val > 0:
        weighted_rsi = sum(item["rsi"] * item.get("value", 0.0) for item in valid_items) / total_val
    else:
        weighted_rsi = sum(item["rsi"] for item in valid_items) / len(valid_items)
        
    simple_rsi = sum(item["rsi"] for item in valid_items) / len(valid_items)
    
    # Determinar régimen y color semafórico
    w_rounded = round(weighted_rsi, 1)
    if w_rounded > 65.0:
        status = "Sobrecomprado"
        color = "#FF5252"
        show_status = True
    elif w_rounded < 35.0:
        status = "Sobrevendido (Oportunidad)"
        color = "#00E676"
        show_status = True
    else:
        status = "Neutral"
        color = "#81D4FA"
        show_status = False
        
    return {
        "weighted": w_rounded,
        "simple": round(simple_rsi, 1),
        "status": status,
        "color": color,
        "show_status": show_status,
        "percentage": min(100.0, max(0.0, w_rounded)),
        "valid_count": len(valid_items),
        "total_count": len(result)
    }


# Catálogo Maestro de Macro-Sectores GICS para Cartera
SECTOR_MAP: dict[str, dict[str, str]] = {
    # Tecnología & Cloud / Software
    "AABA": {"id": "tech", "name": "Tecnología & Cloud"},
    "AAPL": {"id": "tech", "name": "Tecnología & Cloud"},
    "ADBE": {"id": "tech", "name": "Tecnología & Cloud"},
    "ADP": {"id": "tech", "name": "Tecnología & Cloud"},
    "AMX": {"id": "tech", "name": "Tecnología & Telecom"},
    "AMZN": {"id": "tech", "name": "Tecnología & Cloud"},
    "ANET": {"id": "tech", "name": "Tecnología & Cloud"},
    "BB": {"id": "tech", "name": "Tecnología & Cloud"},
    "BIDU": {"id": "tech", "name": "Tecnología & Cloud"},
    "CAJ": {"id": "tech", "name": "Tecnología & Hardware"},
    "CRM": {"id": "tech", "name": "Tecnología & Cloud"},
    "CRWV": {"id": "tech", "name": "Tecnología & Cloud"},
    "CSCO": {"id": "tech", "name": "Tecnología & Cloud"},
    "DCMYY": {"id": "tech", "name": "Tecnología & Telecom"},
    "DOCU": {"id": "tech", "name": "Tecnología & Cloud"},
    "ERIC": {"id": "tech", "name": "Tecnología & Cloud"},
    "GLNT": {"id": "tech", "name": "Tecnología & Cloud"},
    "GLW": {"id": "tech", "name": "Tecnología & Cloud"},
    "GOOGL": {"id": "tech", "name": "Tecnología & Cloud"},
    "GRMN": {"id": "tech", "name": "Tecnología & Cloud"},
    "HPQ": {"id": "tech", "name": "Tecnología & Cloud"},
    "HWM": {"id": "tech", "name": "Tecnología & Cloud"},
    "IBM": {"id": "tech", "name": "Tecnología & Cloud"},
    "INFY": {"id": "tech", "name": "Tecnología & Cloud"},
    "MBT": {"id": "tech", "name": "Tecnología & Telecom"},
    "MELI": {"id": "tech", "name": "Tecnología & Cloud"},
    "META": {"id": "tech", "name": "Tecnología & Cloud"},
    "MSFT": {"id": "tech", "name": "Tecnología & Cloud"},
    "MSI": {"id": "tech", "name": "Tecnología & Cloud"},
    "NBIS": {"id": "tech", "name": "Tecnología & Cloud"},
    "NEC1": {"id": "tech", "name": "Tecnología & Cloud"},
    "NFLX": {"id": "tech", "name": "Tecnología & Cloud"},
    "NOKA": {"id": "tech", "name": "Tecnología & Cloud"},
    "NOW": {"id": "tech", "name": "Tecnología & Cloud"},
    "NTES": {"id": "tech", "name": "Tecnología & Cloud"},
    "ORAN": {"id": "tech", "name": "Tecnología & Telecom"},
    "ORCL": {"id": "tech", "name": "Tecnología & Cloud"},
    "PANW": {"id": "tech", "name": "Tecnología & Cloud"},
    "PBI": {"id": "tech", "name": "Tecnología & Cloud"},
    "PCRF": {"id": "tech", "name": "Tecnología & Cloud"},
    "PLTR": {"id": "tech", "name": "Tecnología & Cloud"},
    "RGTI": {"id": "tech", "name": "Tecnología & Cloud"},
    "SAP": {"id": "tech", "name": "Tecnología & Cloud"},
    "SHOP": {"id": "tech", "name": "Tecnología & Cloud"},
    "SMSN": {"id": "tech", "name": "Tecnología & Hardware"},
    "SNAP": {"id": "tech", "name": "Tecnología & Cloud"},
    "SNOW": {"id": "tech", "name": "Tecnología & Cloud"},
    "SONY": {"id": "tech", "name": "Tecnología & Cloud"},
    "SPOT": {"id": "tech", "name": "Tecnología & Cloud"},
    "T": {"id": "tech", "name": "Tecnología & Telecom"},
    "TEFO": {"id": "tech", "name": "Tecnología & Telecom"},
    "TIIAY": {"id": "tech", "name": "Tecnología & Telecom"},
    "TV": {"id": "tech", "name": "Tecnología & Medios"},
    "TWTR": {"id": "tech", "name": "Tecnología & Redes"},
    "VIV": {"id": "tech", "name": "Tecnología & Telecom"},
    "VOD": {"id": "tech", "name": "Tecnología & Telecom"},
    "VRSN": {"id": "tech", "name": "Tecnología & Cloud"},
    "VZ": {"id": "tech", "name": "Tecnología & Telecom"},
    "WBO": {"id": "tech", "name": "Tecnología & Cloud"},
    "X": {"id": "tech", "name": "Tecnología & Cloud"},
    "XROX": {"id": "tech", "name": "Tecnología & Cloud"},
    "YELP": {"id": "tech", "name": "Tecnología & Cloud"},
    "YY": {"id": "tech", "name": "Tecnología & Social"},
    "ZM": {"id": "tech", "name": "Tecnología & Cloud"},

    # Semiconductores & Hardware
    "ADI": {"id": "semis", "name": "Semiconductores"},
    "AMAT": {"id": "semis", "name": "Semiconductores"},
    "AMD": {"id": "semis", "name": "Semiconductores"},
    "ARM": {"id": "semis", "name": "Semiconductores"},
    "ASML": {"id": "semis", "name": "Semiconductores"},
    "AVGO": {"id": "semis", "name": "Semiconductores"},
    "FSLR": {"id": "semis", "name": "Semiconductores"},
    "INTC": {"id": "semis", "name": "Semiconductores"},
    "KLAC": {"id": "semis", "name": "Semiconductores"},
    "LRCX": {"id": "semis", "name": "Semiconductores"},
    "MU": {"id": "semis", "name": "Semiconductores"},
    "NVDA": {"id": "semis", "name": "Semiconductores"},
    "QCOM": {"id": "semis", "name": "Semiconductores"},
    "SNDK": {"id": "semis", "name": "Semiconductores"},
    "TSM": {"id": "semis", "name": "Semiconductores"},
    "TXN": {"id": "semis", "name": "Semiconductores"},

    # Pagos, Retail & Consumo Discrecional
    "ANF": {"id": "payments_retail", "name": "Pagos & Retail"},
    "ARCO": {"id": "payments_retail", "name": "Pagos & Retail"},
    "BABA": {"id": "payments_retail", "name": "Pagos & Retail"},
    "COST": {"id": "payments_retail", "name": "Pagos & Retail"},
    "DESP": {"id": "payments_retail", "name": "Pagos & Retail"},
    "DIS": {"id": "payments_retail", "name": "Pagos & Retail"},
    "DISN": {"id": "payments_retail", "name": "Pagos & Retail"},
    "EBAY": {"id": "payments_retail", "name": "Pagos & Retail"},
    "ETSY": {"id": "payments_retail", "name": "Pagos & Retail"},
    "HD": {"id": "payments_retail", "name": "Pagos & Retail"},
    "HMC": {"id": "payments_retail", "name": "Pagos & Retail"},
    "HOG": {"id": "payments_retail", "name": "Pagos & Retail"},
    "JD": {"id": "payments_retail", "name": "Pagos & Retail"},
    "LVS": {"id": "payments_retail", "name": "Pagos & Retail"},
    "MA": {"id": "payments_retail", "name": "Pagos & Retail"},
    "MCD": {"id": "payments_retail", "name": "Pagos & Retail"},
    "NKE": {"id": "payments_retail", "name": "Pagos & Retail"},
    "NSAN": {"id": "payments_retail", "name": "Pagos & Retail"},
    "PSO": {"id": "payments_retail", "name": "Pagos & Retail"},
    "PYPL": {"id": "payments_retail", "name": "Pagos & Retail"},
    "ROST": {"id": "payments_retail", "name": "Pagos & Retail"},
    "SBUX": {"id": "payments_retail", "name": "Pagos & Retail"},
    "SNA": {"id": "payments_retail", "name": "Pagos & Retail"},
    "TCOM": {"id": "payments_retail", "name": "Pagos & Retail"},
    "TGT": {"id": "payments_retail", "name": "Pagos & Retail"},
    "TM": {"id": "payments_retail", "name": "Pagos & Retail"},
    "TRIP": {"id": "payments_retail", "name": "Pagos & Retail"},
    "TSLA": {"id": "payments_retail", "name": "Pagos & Retail"},
    "UGP": {"id": "payments_retail", "name": "Pagos & Retail"},
    "URBN": {"id": "payments_retail", "name": "Pagos & Retail"},
    "V": {"id": "payments_retail", "name": "Pagos & Retail"},
    "WBA": {"id": "payments_retail", "name": "Pagos & Retail"},
    "WMT": {"id": "payments_retail", "name": "Pagos & Retail"},

    # Salud & Farmacéutica
    "ABBV": {"id": "health", "name": "Salud & Farma"},
    "ABT": {"id": "health", "name": "Salud & Farma"},
    "ACH": {"id": "health", "name": "Salud & Farma"},
    "AMGN": {"id": "health", "name": "Salud & Farma"},
    "AZN": {"id": "health", "name": "Salud & Farma"},
    "BAYN": {"id": "health", "name": "Salud & Farma"},
    "BIIB": {"id": "health", "name": "Salud & Farma"},
    "BMY": {"id": "health", "name": "Salud & Farma"},
    "CAH": {"id": "health", "name": "Salud & Farma"},
    "EBR": {"id": "health", "name": "Salud & Farma"},
    "GILD": {"id": "health", "name": "Salud & Farma"},
    "GSK": {"id": "health", "name": "Salud & Farma"},
    "JNJ": {"id": "health", "name": "Salud & Farma"},
    "LLY": {"id": "health", "name": "Salud & Farma"},
    "MDT": {"id": "health", "name": "Salud & Farma"},
    "MRK": {"id": "health", "name": "Salud & Farma"},
    "NVO": {"id": "health", "name": "Salud & Farma"},
    "NVS": {"id": "health", "name": "Salud & Farma"},
    "PFE": {"id": "health", "name": "Salud & Farma"},
    "PHG": {"id": "health", "name": "Salud & Farma"},
    "TMO": {"id": "health", "name": "Salud & Farma"},
    "UNH": {"id": "health", "name": "Salud & Farma"},

    # Consumo Masivo (Staples)
    "ABEV": {"id": "staples", "name": "Consumo Masivo"},
    "ADGO": {"id": "staples", "name": "Consumo Masivo & Agro"},
    "BNG": {"id": "staples", "name": "Consumo Masivo & Agro"},
    "BRFS": {"id": "staples", "name": "Consumo Masivo"},
    "BSN": {"id": "staples", "name": "Consumo Masivo"},
    "CHA": {"id": "staples", "name": "Consumo Masivo"},
    "CL": {"id": "staples", "name": "Consumo Masivo"},
    "DEO": {"id": "staples", "name": "Consumo Masivo"},
    "DTEA": {"id": "staples", "name": "Consumo Masivo"},
    "FMX": {"id": "staples", "name": "Consumo Masivo"},
    "HSY": {"id": "staples", "name": "Consumo Masivo"},
    "IFF": {"id": "staples", "name": "Consumo Masivo"},
    "KMB": {"id": "staples", "name": "Consumo Masivo"},
    "KO": {"id": "staples", "name": "Consumo Masivo"},
    "KOFM": {"id": "staples", "name": "Consumo Masivo"},
    "MO": {"id": "staples", "name": "Consumo Masivo"},
    "NTCO": {"id": "staples", "name": "Consumo Masivo"},
    "PEP": {"id": "staples", "name": "Consumo Masivo"},
    "PG": {"id": "staples", "name": "Consumo Masivo"},
    "PM": {"id": "staples", "name": "Consumo Masivo"},
    "SYY": {"id": "staples", "name": "Consumo Masivo"},
    "UL": {"id": "staples", "name": "Consumo Masivo"},

    # Finanzas, Banca & Fintech
    "AEG": {"id": "financials", "name": "Finanzas & Fintech"},
    "AIG": {"id": "financials", "name": "Finanzas & Fintech"},
    "AXP": {"id": "financials", "name": "Finanzas & Fintech"},
    "BA.C": {"id": "financials", "name": "Finanzas & Fintech"},
    "BAC": {"id": "financials", "name": "Finanzas & Fintech"},
    "BBD": {"id": "financials", "name": "Finanzas & Fintech"},
    "BBV": {"id": "financials", "name": "Finanzas & Fintech"},
    "BCS": {"id": "financials", "name": "Finanzas & Fintech"},
    "BK": {"id": "financials", "name": "Finanzas & Fintech"},
    "BLK": {"id": "financials", "name": "Finanzas & Fintech"},
    "BRK-B": {"id": "financials", "name": "Finanzas & Fintech"},
    "BRK.B": {"id": "financials", "name": "Finanzas & Fintech"},
    "BRKB": {"id": "financials", "name": "Finanzas & Fintech"},
    "BSBR": {"id": "financials", "name": "Finanzas & Fintech"},
    "C": {"id": "financials", "name": "Finanzas & Fintech"},
    "CAR": {"id": "financials", "name": "Finanzas & Fintech"},
    "CBRD": {"id": "financials", "name": "Finanzas & Fintech"},
    "CEO": {"id": "financials", "name": "Finanzas & Fintech"},
    "CHL": {"id": "financials", "name": "Finanzas & Fintech"},
    "CS": {"id": "financials", "name": "Finanzas & Fintech"},
    "EFX": {"id": "financials", "name": "Finanzas & Datos"},
    "FB": {"id": "financials", "name": "Finanzas & Fintech"},
    "FMCC": {"id": "financials", "name": "Finanzas & Fintech"},
    "FNMA": {"id": "financials", "name": "Finanzas & Fintech"},
    "GS": {"id": "financials", "name": "Finanzas & Fintech"},
    "HDB": {"id": "financials", "name": "Finanzas & Fintech"},
    "HSBC": {"id": "financials", "name": "Finanzas & Fintech"},
    "IBN": {"id": "financials", "name": "Finanzas & Fintech"},
    "ING": {"id": "financials", "name": "Finanzas & Fintech"},
    "ITUB": {"id": "financials", "name": "Finanzas & Fintech"},
    "IVE": {"id": "financials", "name": "Finanzas & Fintech"},
    "JPM": {"id": "financials", "name": "Finanzas & Fintech"},
    "KB": {"id": "financials", "name": "Finanzas & Fintech"},
    "LFC": {"id": "financials", "name": "Finanzas & Seguros"},
    "LYG": {"id": "financials", "name": "Finanzas & Fintech"},
    "MFG": {"id": "financials", "name": "Finanzas & Fintech"},
    "MMC": {"id": "financials", "name": "Finanzas & Seguros"},
    "MS": {"id": "financials", "name": "Finanzas & Fintech"},
    "MUFG": {"id": "financials", "name": "Finanzas & Fintech"},
    "NMR": {"id": "financials", "name": "Finanzas & Fintech"},
    "NU": {"id": "financials", "name": "Finanzas & Fintech"},
    "RDS": {"id": "financials", "name": "Finanzas & Fintech"},
    "SAN": {"id": "financials", "name": "Finanzas & Fintech"},
    "SQ": {"id": "financials", "name": "Finanzas & Fintech"},
    "TRVV": {"id": "financials", "name": "Finanzas & Fintech"},
    "USB": {"id": "financials", "name": "Finanzas & Fintech"},
    "WBK": {"id": "financials", "name": "Finanzas & Fintech"},
    "WFC": {"id": "financials", "name": "Finanzas & Fintech"},

    # Industria, Maquinaria & Aeroespacial
    "ASR": {"id": "industrials", "name": "Industria & Maquinaria"},
    "BA": {"id": "industrials", "name": "Industria & Maquinaria"},
    "CAAP": {"id": "industrials", "name": "Industria & Maquinaria"},
    "CAT": {"id": "industrials", "name": "Industria & Maquinaria"},
    "DAI": {"id": "industrials", "name": "Industria & Automotriz"},
    "DE": {"id": "industrials", "name": "Industria & Maquinaria"},
    "ERJ": {"id": "industrials", "name": "Industria & Aeroespacial"},
    "FDX": {"id": "industrials", "name": "Industria & Maquinaria"},
    "GE": {"id": "industrials", "name": "Industria & Maquinaria"},
    "HON": {"id": "industrials", "name": "Industria & Maquinaria"},
    "JCI": {"id": "industrials", "name": "Industria & Maquinaria"},
    "LMT": {"id": "industrials", "name": "Industria & Maquinaria"},
    "MMM": {"id": "industrials", "name": "Industria & Maquinaria"},
    "PAC": {"id": "industrials", "name": "Industria & Maquinaria"},
    "PCAR": {"id": "industrials", "name": "Industria & Maquinaria"},
    "RTX": {"id": "industrials", "name": "Industria & Maquinaria"},
    "SIEGY": {"id": "industrials", "name": "Industria & Maquinaria"},
    "UNP": {"id": "industrials", "name": "Industria & Maquinaria"},

    # Energía, Petróleo & Utilities
    "AEM": {"id": "energy", "name": "Energía & Utilities"},
    "BP": {"id": "energy", "name": "Energía & Utilities"},
    "CCJ": {"id": "energy", "name": "Energía & Materiales", "industry": "Minería y combustible nuclear"},
    "CDE": {"id": "energy", "name": "Energía & Utilities"},
    "CEG": {"id": "energy", "name": "Energía & Utilities"},
    "CVX": {"id": "energy", "name": "Energía & Petróleo"},
    "CX": {"id": "energy", "name": "Energía & Utilities"},
    "E": {"id": "energy", "name": "Energía & Utilities"},
    "ELP": {"id": "energy", "name": "Energía & Utilities"},
    "EOAN": {"id": "energy", "name": "Energía & Utilities"},
    "GFI": {"id": "energy", "name": "Energía & Utilities"},
    "GGB": {"id": "energy", "name": "Energía & Utilities"},
    "GPRK": {"id": "energy", "name": "Energía & Utilities"},
    "HAL": {"id": "energy", "name": "Energía & Utilities"},
    "HL": {"id": "energy", "name": "Energía & Utilities"},
    "HMY": {"id": "energy", "name": "Energía & Utilities"},
    "HNP": {"id": "energy", "name": "Energía & Utilities"},
    "KEP": {"id": "energy", "name": "Energía & Utilities"},
    "KGC": {"id": "energy", "name": "Energía & Utilities"},
    "LKOD": {"id": "energy", "name": "Energía & Petróleo"},
    "NG": {"id": "energy", "name": "Energía & Utilities"},
    "NGG": {"id": "energy", "name": "Energía & Utilities"},
    "NEE": {"id": "energy", "name": "Energía & Utilities", "industry": "Energía limpia, renovable y eléctrica"},
    "NNE": {"id": "energy", "name": "Energía & Industrial", "industry": "Tecnología nuclear avanzada y microreactores"},
    "NUE": {"id": "energy", "name": "Energía & Utilities"},
    "OGZD": {"id": "energy", "name": "Energía & Petróleo"},
    "PAAS": {"id": "energy", "name": "Energía & Utilities"},
    "PAM": {"id": "energy", "name": "Energía & Utilities"},
    "PBR": {"id": "energy", "name": "Energía & Petróleo"},
    "PKS": {"id": "energy", "name": "Energía & Utilities"},
    "PSX": {"id": "energy", "name": "Energía & Utilities"},
    "PTR": {"id": "energy", "name": "Energía & Utilities"},
    "SBS": {"id": "energy", "name": "Energía & Utilities"},
    "SID": {"id": "energy", "name": "Energía & Utilities"},
    "SLB": {"id": "energy", "name": "Energía & Petróleo"},
    "SNP": {"id": "energy", "name": "Energía & Utilities"},
    "TEN": {"id": "energy", "name": "Energía & Utilities"},
    "TTE": {"id": "energy", "name": "Energía & Utilities"},
    "TTM": {"id": "energy", "name": "Energía & Utilities"},
    "TX": {"id": "energy", "name": "Energía & Utilities"},
    "TXR": {"id": "energy", "name": "Energía & Utilities"},
    "VEDL": {"id": "energy", "name": "Energía & Utilities"},
    "VIST": {"id": "energy", "name": "Energía & Petróleo"},
    "VST": {"id": "energy", "name": "Energía & Utilities"},
    "XOM": {"id": "energy", "name": "Energía & Petróleo"},
    "YPF": {"id": "energy", "name": "Energía & Petróleo"},
    "YZCA": {"id": "energy", "name": "Energía & Utilities"},

    # Minería & Materiales
    "ATAD": {"id": "materials", "name": "Minería & Materiales"},
    "AUY": {"id": "materials", "name": "Minería & Materiales"},
    "AVY": {"id": "materials", "name": "Minería & Materiales"},
    "BAS": {"id": "materials", "name": "Minería & Materiales"},
    "BHP": {"id": "materials", "name": "Minería & Materiales"},
    "BIOX": {"id": "materials", "name": "Minería & Materiales"},
    "DD": {"id": "materials", "name": "Minería & Materiales"},
    "FCX": {"id": "materials", "name": "Minería & Materiales"},
    "GOLD": {"id": "materials", "name": "Minería & Materiales"},
    "HHPD": {"id": "materials", "name": "Minería & Materiales"},
    "IP": {"id": "materials", "name": "Minería & Materiales"},
    "NEM": {"id": "materials", "name": "Minería & Materiales"},
    "NLM": {"id": "materials", "name": "Minería & Materiales"},
    "RIO": {"id": "materials", "name": "Minería & Materiales"},
    "SCCO": {"id": "materials", "name": "Minería & Materiales"},
    "SUZ": {"id": "materials", "name": "Minería & Materiales"},
    "TSU": {"id": "materials", "name": "Minería & Materiales"},
    "VALE": {"id": "materials", "name": "Minería & Materiales"},

    # ETFs Indexados & Globales
    "ARGT": {"id": "etfs", "name": "ETFs Indexados (Argentina)", "subsector": "Latinoamérica", "is_etf": True},
    "ARKK": {"id": "etfs", "name": "ETFs Indexados (Innovación ARK)", "subsector": "Tecnología Disruptiva", "is_etf": True},
    "DIA": {"id": "etfs", "name": "ETFs Indexados (Dow Jones)", "subsector": "Blue Chips USA", "is_etf": True},
    "EEM": {"id": "etfs", "name": "ETFs Indexados (Emergentes)", "subsector": "Mercados Emergentes", "is_etf": True},
    "EWJ": {"id": "etfs", "name": "ETFs Indexados (Japón)", "subsector": "Asia Desarrollada", "is_etf": True},
    "EWZ": {"id": "etfs", "name": "ETFs Indexados (Brasil)", "subsector": "Latinoamérica", "is_etf": True},
    "FXI": {"id": "etfs", "name": "ETFs Indexados (China Large-Cap)", "subsector": "China", "is_etf": True},
    "GDX": {"id": "etfs", "name": "ETFs Indexados (Minería de Oro)", "subsector": "Metales Preciosos", "is_etf": True},
    "GLD": {"id": "etfs", "name": "ETFs Indexados (Oro Físico)", "subsector": "Metales Preciosos", "is_etf": True},
    "ILF": {"id": "etfs", "name": "ETFs Indexados (Latinoamérica 40)", "subsector": "Latinoamérica", "is_etf": True},
    "IVW": {"id": "etfs", "name": "ETFs Indexados (S&P 500 Growth)", "subsector": "Crecimiento USA", "is_etf": True},
    "IWM": {"id": "etfs", "name": "ETFs Indexados (Russell 2000)", "subsector": "Small Caps USA", "is_etf": True},
    "QQQ": {"id": "etfs", "name": "ETFs Indexados (Nasdaq 100)", "subsector": "Tecnología & Crecimiento", "is_etf": True},
    "SLV": {"id": "etfs", "name": "ETFs Indexados (Plata)", "subsector": "Metales Preciosos", "is_etf": True},
    "SMH": {"id": "etfs", "name": "ETFs Indexados (Semiconductores)", "subsector": "Semiconductores", "is_etf": True},
    "SPY": {"id": "etfs", "name": "ETFs Indexados (S&P 500)", "subsector": "Mercado Amplio USA", "is_etf": True},
    "URA": {"id": "etfs", "name": "ETFs Indexados (Uranio)", "subsector": "Energía Nuclear", "is_etf": True},
    "USO": {"id": "etfs", "name": "ETFs Indexados (Petróleo WTI)", "subsector": "Commodities Energía", "is_etf": True},
    "VEA": {"id": "etfs", "name": "ETFs Indexados (Mercados Desarrollados)", "subsector": "Global Ex-USA", "is_etf": True},
    "XLB": {"id": "etfs", "name": "ETFs Indexados (Materiales)", "subsector": "Materiales", "is_etf": True},
    "XLC": {"id": "etfs", "name": "ETFs Indexados (Comunicaciones)", "subsector": "Comunicaciones", "is_etf": True},
    "XLE": {"id": "etfs", "name": "ETFs Indexados (Energía)", "subsector": "Energía & Petróleo", "is_etf": True},
    "XLF": {"id": "etfs", "name": "ETFs Indexados (Finanzas)", "subsector": "Finanzas & Fintech", "is_etf": True},
    "XLI": {"id": "etfs", "name": "ETFs Indexados (Industria)", "subsector": "Industria & Maquinaria", "is_etf": True},
    "XLK": {"id": "etfs", "name": "ETFs Indexados (Tecnología)", "subsector": "Tecnología", "is_etf": True},
    "XLP": {"id": "etfs", "name": "ETFs Indexados (Consumo Básico)", "subsector": "Consumo Masivo", "is_etf": True},
    "XLRE": {"id": "etfs", "name": "ETFs Indexados (Real Estate)", "subsector": "Bienes Raíces", "is_etf": True},
    "XLU": {"id": "etfs", "name": "ETFs Indexados (Utilities)", "subsector": "Energía & Utilities", "is_etf": True},
    "XLV": {"id": "etfs", "name": "ETFs Indexados (Salud)", "subsector": "Salud & Farma", "is_etf": True},
    "XLY": {"id": "etfs", "name": "ETFs Indexados (Consumo Discrecional)", "subsector": "Consumo Discrecional", "is_etf": True},

    # Criptoactivos
    "COIN": {"id": "crypto", "name": "Criptoactivos"},
    "IBIT": {"id": "crypto", "name": "Criptoactivos"},
    "MSTR": {"id": "crypto", "name": "Criptoactivos"},

}

DEFAULT_SECTOR = {"id": "other", "name": "Otros Activos"}

def get_ticker_sector(ticker: str) -> dict[str, Any]:
    if not ticker:
        return DEFAULT_SECTOR
    clean = ticker.strip().upper().replace(".", "-")
    sec = SECTOR_MAP.get(clean, SECTOR_MAP.get(ticker.strip().upper(), DEFAULT_SECTOR))
    res = dict(sec)
    if "is_etf" not in res:
        res["is_etf"] = (res.get("id") == "etfs")
    return res

def calculate_sector_breakdown(result: list[dict]) -> list[dict]:
    """
    Agrupa los activos de la cartera por macro-sector y calcula los pesos objetivos,
    valores agregados y pesos relativos de cada activo dentro de su respectivo sector.
    """
    if not result:
        return []

    total_value = sum(item.get("value", 0.0) for item in result)

    sectors: dict[str, dict] = {}
    
    for item in result:
        tk = item.get("ticker", "")
        sec_info = get_ticker_sector(tk)
        sec_id = sec_info["id"]
        sec_name = sec_info["name"]
        
        target_w = item.get("target_pct", item.get("weight", 0.0)) or 0.0
        val = item.get("value", 0.0) or 0.0
        
        item["sector_id"] = sec_id
        item["sector_name"] = sec_name
        item["is_etf"] = sec_info.get("is_etf", False)
        
        if sec_id not in sectors:
            sectors[sec_id] = {
                "sector_id": sec_id,
                "sector_name": sec_name,
                "total_target_weight": 0.0,
                "total_value": 0.0,
                "assets": []
            }
            
        sectors[sec_id]["total_target_weight"] += target_w
        sectors[sec_id]["total_value"] += val
        sectors[sec_id]["assets"].append({
            "ticker": tk,
            "target_weight": round(target_w, 2),
            "value": round(val, 2),
            "qty": item.get("qty", 0),
            "price": item.get("price", 0.0)
        })

    breakdown = list(sectors.values())
    
    for s in breakdown:
        s["total_target_weight"] = round(s["total_target_weight"], 2)
        s["total_value"] = round(s["total_value"], 2)
        s["weight_pct"] = round((s["total_value"] / total_value * 100.0), 2) if total_value > 0 else s["total_target_weight"]
        sec_weight = s["total_target_weight"] if s["total_target_weight"] > 0 else 1.0
        
        for a in s["assets"]:
            a["relative_weight_in_sector"] = round((a["target_weight"] / sec_weight * 100.0), 1)
            
        # Ordenar activos del sector por peso descendente
        s["assets"].sort(key=lambda x: x["target_weight"], reverse=True)
        
    # Ordenar sectores por peso total descendente
    breakdown.sort(key=lambda x: x["total_target_weight"], reverse=True)
    return breakdown


def _sma_dist(close, sma):
    if close and sma:
        pct = (close - sma) / sma * 100
        return f"{'▲' if pct >= 0 else '▼'} {abs(pct):.1f}%"
    return "—"


def _portfolio_agg(weights, lookup, field):
    total_w = sum(weights.values())
    if total_w == 0:
        return None
    num = denom = 0.0
    for t, w in weights.items():
        r = lookup.get(t.upper())
        if r and isinstance(r.get(field), (int, float)):
            nw = w / total_w
            num += nw * r[field]
            denom += nw
    return num / denom if denom else None


def _portfolio_sma(weights, lookup, sma_field):
    total_w = sum(weights.values())
    if total_w == 0:
        return None
    num = denom = 0.0
    for t, w in weights.items():
        r = lookup.get(t.upper())
        if r:
            c, s = r.get("close"), r.get(sma_field)
            if c and s:
                pct = (c - s) / s * 100
                nw = w / total_w
                num += nw * pct
                denom += nw
    if denom == 0:
        return None
    avg = num / denom
    return f"{'▲' if avg >= 0 else '▼'} {abs(avg):.1f}%"


def get_effective_weights(pf_data: dict, lookup_prices: dict) -> dict:
    mode = pf_data.get("mode", "weights")
    assets = pf_data.get("assets", {})
    if mode == "nominals":
        vals = {}
        for t, qty in assets.items():
            r = lookup_prices.get(t.upper())
            price = r.get("close") if r else None
            if price is not None:
                vals[t] = qty * price
            else:
                vals[t] = 0.0
        total_v = sum(vals.values())
        if total_v == 0:
            return {t: 1.0 / len(assets) for t in assets}
        return {t: v / total_v for t, v in vals.items()}
    else:
        total_w = sum(assets.values())
        if total_w == 0:
            return {t: 1.0 / len(assets) for t in assets}
        return {t: w / total_w for t, w in assets.items()}


def get_portfolio_fixed_income_summary(pf_name: str) -> dict:
    """
    Calcula el resumen financiero, métricas spot de mercado BYMA/MAE y flujos proyectados
    para los activos de renta fija (LECAPs y BONCAPs) pertenecientes a pf_name.
    """
    pfs = load_portfolios()
    pf = pfs.get(pf_name, {})
    fi_assets = pf.get("fixed_income_assets", {})
    asset_alloc = pf.get("asset_allocation")
    
    from services.rotation_service import load_user_holdings
    from services.fixed_income_service import fetch_lecaps, LECAP_BONCAP_SPECS
    from datetime import datetime

    user_data = load_user_holdings(pf_name)
    user_fi = user_data.get("fixed_income_holdings", {})

    if not fi_assets and not user_fi:
        return {
            "has_fixed_income": False,
            "asset_allocation": asset_alloc,
            "items": [],
            "total_invested": 0.0,
            "total_market_value": 0.0,
            "total_pnl_ars": 0.0,
            "total_pnl_pct": 0.0,
            "total_projected_maturity_payoff": 0.0,
            "total_projected_profit_ars": 0.0,
            "total_projected_profit_pct": 0.0,
            "nearest_maturity_days": None,
            "nearest_maturity_ticker": None,
            "has_imminent_maturity": False
        }

    df_lecaps = None
    try:
        df_lecaps = fetch_lecaps()
    except (ValueError, ConnectionError, RuntimeError, KeyError, TypeError) as e:
        logger.warning("Error en portfolio_service: %s", e)

    market_lookup = {}
    if df_lecaps is not None and not df_lecaps.empty:
        for _, r in df_lecaps.iterrows():
            tk = str(r["ticker"]).strip().upper()
            market_lookup[tk] = r.to_dict()

    all_fi_tickers = sorted(list(set(list(fi_assets.keys()) + list(user_fi.keys()))))
    hoy = datetime.now().date()
    items = []

    for tk in all_fi_tickers:
        spec = LECAP_BONCAP_SPECS.get(tk, {})
        mkt = market_lookup.get(tk, {})
        holding = user_fi.get(tk, {})
        nominals = max(0, int(holding.get("nominals", 0)))
        ppc_raw = holding.get("ppc")

        nombre = mkt.get("nombre") or spec.get("nombre") or tk
        tipo = mkt.get("tipo") or spec.get("tipo") or "LECAP"
        vence_str = mkt.get("vence")
        if not vence_str and spec.get("vencimiento"):
            try:
                dt_v = datetime.strptime(spec["vencimiento"], "%Y-%m-%d").date()
                vence_str = dt_v.strftime("%d/%m/%Y")
            except Exception:
                vence_str = spec.get("vencimiento")

        dias_val = safe_float(mkt.get("dias"))
        dias = int(dias_val) if dias_val is not None else None
        if dias is None and spec.get("vencimiento"):
            try:
                dt_v = datetime.strptime(spec["vencimiento"], "%Y-%m-%d").date()
                dias = max(0, (dt_v - hoy).days)
            except Exception:
                pass

        vf_base_100 = safe_float(mkt.get("vf"))
        if vf_base_100 is None and spec.get("emision") and spec.get("vencimiento") and spec.get("tem_emision"):
            try:
                d_emis = datetime.strptime(spec["emision"], "%Y-%m-%d").date()
                d_vto = datetime.strptime(spec["vencimiento"], "%Y-%m-%d").date()
                dias_tot = (d_vto - d_emis).days
                tem_emis = spec["tem_emision"]
                vf_base_100 = round(100.0 * ((1.0 + tem_emis) ** (dias_tot / 30.0)), 2)
            except Exception:
                vf_base_100 = 100.0
        if vf_base_100 is None:
            vf_base_100 = 100.0

        ppc_val = safe_float(ppc_raw)
        precio_spot_base_100 = safe_float(mkt.get("precio"))
        if precio_spot_base_100 is None or precio_spot_base_100 <= 0:
            if ppc_val is not None and ppc_val > 0:
                precio_spot_base_100 = normalize_quote_to_base_100(ppc_val, ticker=tk)
            elif vf_base_100:
                precio_spot_base_100 = vf_base_100
            else:
                precio_spot_base_100 = 100.0

        tem_mkt = safe_float(mkt.get("tem_mkt"))
        tea = safe_float(mkt.get("tea"))
        tna = safe_float(mkt.get("tna"))
        md = safe_float(mkt.get("md"))

        # Si el feed en tiempo real no reportó tasas (mercado cerrado o ilíquido),
        # calcular analíticamente a partir del precio spot, valor final a finish y días
        if (tem_mkt is None or tna is None or tea is None) and precio_spot_base_100 and precio_spot_base_100 > 0 and vf_base_100 and vf_base_100 > 0:
            if dias and dias > 0:
                r_spot = (vf_base_100 - precio_spot_base_100) / precio_spot_base_100
                if -0.5 < r_spot < 5.0:
                    if tna is None:
                        tna = round(r_spot * (365.0 / dias) * 100.0, 2)
                    if tea is None:
                        try:
                            tea = round((((1.0 + r_spot) ** (365.0 / dias)) - 1.0) * 100.0, 2)
                        except Exception:
                            pass
                    if tem_mkt is None:
                        try:
                            if tea is not None:
                                tem_mkt = round((((1.0 + tea / 100.0) ** (30.0 / 365.0)) - 1.0) * 100.0, 2)
                            else:
                                tem_mkt = round((((1.0 + r_spot) ** (30.0 / dias)) - 1.0) * 100.0, 2)
                        except Exception:
                            pass
                    if md is None and tea is not None:
                        md = round((dias / 365.0) / (1.0 + (tea / 100.0)), 2)

        # Fallback a tasa de referencia promedio de mercado de las ALyCs argentinas si persiste nulo
        if tem_mkt is None:
            active_tems: list[float] = [
                float(val) for v in market_lookup.values() 
                if (val := safe_float(v.get("tem_mkt"))) is not None and val > 0
            ]
            if active_tems:
                tem_mkt = round(sum(active_tems) / len(active_tems), 2)
            else:
                tem_mkt = 3.70  # Tasa representativa promedio de mercado ALyC
            if tna is None:
                tna = round(tem_mkt * 12.0, 2)
            if tea is None:
                tea = round((((1.0 + tem_mkt / 100.0) ** (365.0 / 30.0)) - 1.0) * 100.0, 2)


        if ppc_val is not None and ppc_val > 0:
            ppc_unit = normalize_fixed_income_price(ppc_val, ticker=tk)
            ppc_base_100 = to_base_100(ppc_unit, ticker=tk)
        else:
            ppc_base_100 = precio_spot_base_100
            ppc_unit = normalize_fixed_income_price(precio_spot_base_100, ticker=tk) if precio_spot_base_100 else 1.0

        spot_unit = normalize_fixed_income_price(precio_spot_base_100, ticker=tk) if precio_spot_base_100 else ppc_unit
        vf_unit = normalize_fixed_income_price(vf_base_100, ticker=tk) if vf_base_100 else spot_unit

        invested_capital = round(nominals * ppc_unit, 2)
        current_market_value = round(nominals * spot_unit, 2)
        pnl_ars = round(current_market_value - invested_capital, 2)
        pnl_pct = round((pnl_ars / invested_capital * 100.0), 2) if invested_capital > 0 else 0.0

        projected_payoff = round(nominals * vf_unit, 2)
        projected_profit_ars = round(projected_payoff - invested_capital, 2)
        projected_profit_pct = round((projected_profit_ars / invested_capital * 100.0), 2) if invested_capital > 0 else 0.0

        # TNA / TEA de compra calculada a partir del PPC y el Valor Final a Finish
        # MATEMÁTICAMENTE IMPOSIBLE sin conocer la fecha de compra exacta.
        # Usar los días remanentes al vencimiento (dias) genera una TNA irreal y astronómica (ej. 158%).
        tna_compra = None
        tea_compra = None

        # Días transcurridos y porcentaje de ciclo cumplido
        dias_transcurridos = None
        dias_totales = None
        pct_ciclo = None
        if spec.get("emision") and spec.get("vencimiento"):
            try:
                d_emis = datetime.strptime(spec["emision"], "%Y-%m-%d").date()
                d_vto = datetime.strptime(spec["vencimiento"], "%Y-%m-%d").date()
                dias_totales = max(1, (d_vto - d_emis).days)
                dias_transcurridos = max(0, (hoy - d_emis).days)
                pct_ciclo = round(min(100.0, max(0.0, (dias_transcurridos / dias_totales) * 100.0)), 1)
            except Exception:
                pass

        target_pf_weight = fi_assets.get(tk, {}).get("target_weight_portfolio", 0.0)
        target_rf_weight = fi_assets.get(tk, {}).get("target_weight_rf", 0.0)

        items.append({
            "ticker": tk,
            "nombre": nombre,
            "tipo": tipo,
            "vence": vence_str,
            "dias": dias,
            "dias_transcurridos": dias_transcurridos,
            "dias_totales": dias_totales,
            "pct_ciclo": pct_ciclo,
            "is_imminent": dias is not None and dias <= 30,
            "nominals": nominals,
            "ppc_unit": ppc_unit,
            "ppc_base_100": ppc_base_100,
            "precio_spot_unit": spot_unit,
            "precio_spot_base_100": precio_spot_base_100,
            "tem_mkt": tem_mkt,
            "tea": tea,
            "tna": tna,
            "tna_compra": tna_compra,
            "tea_compra": tea_compra,
            "md": md,
            "vf_base_100": vf_base_100,
            "invested_capital": invested_capital,
            "current_market_value": current_market_value,
            "pnl_ars": pnl_ars,
            "pnl_pct": pnl_pct,
            "projected_payoff": projected_payoff,
            "projected_profit_ars": projected_profit_ars,
            "projected_profit_pct": projected_profit_pct,
            "target_weight_portfolio": target_pf_weight,
            "target_weight_rf": target_rf_weight,
            "real_weight_rf": 0.0
        })

    total_invested = sum(it["invested_capital"] for it in items)
    total_market_val = sum(it["current_market_value"] for it in items)
    for it in items:
        it["real_weight_rf"] = round((it["current_market_value"] / total_market_val * 100.0), 2) if total_market_val > 0 else 0.0

    total_pnl = total_market_val - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100.0) if total_invested > 0 else 0.0

    total_payoff = sum(it["projected_payoff"] for it in items)
    total_proj_profit = total_payoff - total_invested
    total_proj_profit_pct = (total_proj_profit / total_invested * 100.0) if total_invested > 0 else 0.0

    # TNA promedio ponderada de compra
    weighted_tna_compra = None
    invested_with_tna = sum(it["invested_capital"] for it in items if it.get("tna_compra") is not None)
    if invested_with_tna > 0:
        weighted_sum = sum(it["invested_capital"] * it["tna_compra"] for it in items if it.get("tna_compra") is not None)
        weighted_tna_compra = round(weighted_sum / invested_with_tna, 2)

    valid_days = [it["dias"] for it in items if it.get("dias") is not None]
    nearest_days = min(valid_days) if valid_days else None
    nearest_tk = next((it["ticker"] for it in items if it.get("dias") == nearest_days), None) if nearest_days is not None else None

    return {
        "has_fixed_income": True,
        "asset_allocation": asset_alloc,
        "items": items,
        "total_invested": round(total_invested, 2),
        "total_market_value": round(total_market_val, 2),
        "total_pnl_ars": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "total_projected_maturity_payoff": round(total_payoff, 2),
        "total_projected_profit_ars": round(total_proj_profit, 2),
        "total_projected_profit_pct": round(total_proj_profit_pct, 2),
        "weighted_tna_compra": weighted_tna_compra,
        "nearest_maturity_days": nearest_days,
        "nearest_maturity_ticker": nearest_tk,
        "has_imminent_maturity": nearest_days is not None and nearest_days <= 30
    }


def calculate_portfolio_alpha(weights: dict) -> dict:
    """
    Calcula el Alpha del portfolio respecto a SPY comparando retornos
    a 3M, 6M, YTD y 1A. Ordena los tickers para maximizar el hit en cache.
    """
    if not weights:
        return {}

    alpha_metrics = {}
    try:
        from services.tv_service import fetch_performance
        sorted_tickers = sorted(list(weights.keys()))
        all_tickers = sorted_tickers + ["SPY"]
        perf_data = fetch_performance(all_tickers)
        if perf_data:
            lookup = {r.get("name", "").upper(): r for r in perf_data}
            spy_data = lookup.get("SPY", {})
            periods_map = {"Perf.3M": "3M", "Perf.6M": "6M", "Perf.YTD": "YTD", "Perf.Y": "1A"}
            summary_perf = {}
            for col, label in periods_map.items():
                portfolio_perf = _portfolio_agg(weights, lookup, col)
                spy_perf = spy_data.get(col)
                if portfolio_perf is not None and spy_perf is not None:
                    diff = portfolio_perf - spy_perf
                    summary_perf[label] = {
                        "portfolio": round(portfolio_perf, 2),
                        "spy": round(spy_perf, 2),
                        "alpha": round(diff, 2),
                        "formatted": f"{'+' if diff > 0 else ''}{diff:.1f}%",
                        "class": "txt-success" if diff > 0 else "txt-danger"
                    }
            alpha_metrics = summary_perf
    except (ValueError, ConnectionError, RuntimeError, KeyError, TypeError) as e:
        logger.warning("Error en portfolio_service: %s", e)
    return alpha_metrics




