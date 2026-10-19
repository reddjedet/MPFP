"""
Mapeo Sectorial GICS de los CEDEARs.
Fuentes: lista oficial de BYMA (universo y ratios) + TradingView Scanner (sectores).

Este script ya NO escribe ratios: el catálogo `data/cedear_ratios.json` se
refresca con `scripts/update_cedear_ratios.py`, que usa la lista oficial de BYMA
y valida cada ratio contra el precio de mercado antes de escribir.
"""
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

RATIOS_FILE = ROOT_DIR / "data" / "cedear_ratios.json"
PORTFOLIO_SERVICE_FILE = ROOT_DIR / "services" / "portfolio_service.py"

# Ratios de ETFs de BYMA, alineados con la lista oficial. Antes vivían como
# fallback de la tabla de Comafi y many estaban en 1 o 2 sin informar (VEA 1
# cuando es 10, EWJ 1 cuando es 14, USO 1 cuando es 15...). NNE se cae porque
# BYMA ya no lo publica.
ETF_RATIOS = {
    "SPY": 60.0, "QQQ": 20.0, "DIA": 20.0, "IWM": 10.0,
    "EEM": 5.0,  "EWZ": 2.0,  "XLF": 2.0,  "XLE": 2.0,
    "XLK": 46.0, "XLV": 29.0, "XLU": 15.0, "ARKK": 10.0,
    "IBIT": 10.0, "SMH": 50.0, "URA": 5.0, "VEA": 10.0,
    "EWJ": 14.0, "FXI": 5.0,  "ILF": 6.0,  "IVW": 20.0,
    "XLI": 28.0, "XLB": 18.0, "XLP": 16.0, "XLRE": 9.0,
    "GDX": 10.0, "GLD": 50.0, "SLV": 6.0,  "USO": 15.0,
    "CCJ": 23.0,
}

KNOWN_TICKER_SECTORS = {
    "CCJ": {"id": "energy", "name": "Energía & Materiales", "industry": "Minería y combustible nuclear"},
    "NEE": {"id": "energy", "name": "Energía & Utilities", "industry": "Energía limpia, renovable y eléctrica"},
    "NNE": {"id": "energy", "name": "Energía & Industrial", "industry": "Tecnología nuclear avanzada y microreactores"},
    "GEV": {"id": "industrials", "name": "Industria & Maquinaria", "industry": "Equipos de generación eléctrica y electrificación"},
    "ISRG": {"id": "health", "name": "Salud & Farma", "industry": "Equipos médicos y cirugía robótica"},
    "RTX": {"id": "industrials", "name": "Industria & Maquinaria", "industry": "Aeroespacial y Defensa"},
    "AMZN": {"id": "consumer_discretionary", "name": "Consumo Discrecional", "industry": "Retail y comercio electrónico"},
    "MCD": {"id": "consumer_discretionary", "name": "Consumo Discrecional", "industry": "Restaurantes y comida rápida"},
    "SMH": {"id": "semis", "name": "Semiconductores", "subsector": "Semiconductores", "is_etf": True},
    "URA": {"id": "energy", "name": "Energía & Utilities", "subsector": "Energía Nuclear", "is_etf": True},
    "XLB": {"id": "materials", "name": "Minería & Materiales", "subsector": "Materiales", "is_etf": True},
    "XLC": {"id": "communications", "name": "Comunicaciones", "subsector": "Servicios de comunicación", "is_etf": True},
    "XLE": {"id": "energy", "name": "Energía & Utilities", "subsector": "Energía & Petróleo", "is_etf": True},
    "XLF": {"id": "financials", "name": "Finanzas & Fintech", "subsector": "Finanzas & Fintech", "is_etf": True},
    "XLI": {"id": "industrials", "name": "Industria & Maquinaria", "subsector": "Industria & Maquinaria", "is_etf": True},
    "XLK": {"id": "tech", "name": "Tecnología & Cloud", "subsector": "Tecnología", "is_etf": True},
    "XLP": {"id": "staples", "name": "Consumo Masivo", "subsector": "Consumo Masivo", "is_etf": True},
    "XLRE": {"id": "real_estate", "name": "Bienes Raíces", "subsector": "Bienes Raíces", "is_etf": True},
    "XLU": {"id": "utilities", "name": "Utilities", "subsector": "Servicios públicos", "is_etf": True},
    "XLV": {"id": "health", "name": "Salud & Farma", "subsector": "Salud & Farma", "is_etf": True},
    "XLY": {"id": "consumer_discretionary", "name": "Consumo Discrecional", "subsector": "Consumo Discrecional", "is_etf": True},
    "BRKB": {"id": "financials", "name": "Finanzas & Fintech"},
    "SHOP": {"id": "tech", "name": "Tecnología & Cloud"},
    "T": {"id": "tech", "name": "Tecnología & Telecom"},
    "VZ": {"id": "tech", "name": "Tecnología & Telecom"},
    "VOD": {"id": "tech", "name": "Tecnología & Telecom"},
    "AMX": {"id": "tech", "name": "Tecnología & Telecom"},
    "ORAN": {"id": "tech", "name": "Tecnología & Telecom"},
    "TV": {"id": "tech", "name": "Tecnología & Medios"},
    "TWTR": {"id": "tech", "name": "Tecnología & Redes"},
    "YY": {"id": "tech", "name": "Tecnología & Social"},
    "SMSN": {"id": "tech", "name": "Tecnología & Hardware"},
    "CAJ": {"id": "tech", "name": "Tecnología & Hardware"},
    "NEC1": {"id": "tech", "name": "Tecnología & Cloud"},
    "WBA": {"id": "payments_retail", "name": "Pagos & Retail"},
    "DESP": {"id": "payments_retail", "name": "Pagos & Retail"},
    "BAS": {"id": "materials", "name": "Minería & Materiales"},
    "BAYN": {"id": "health", "name": "Salud & Farma"},
    "CAH": {"id": "health", "name": "Salud & Farma"},
    "ERJ": {"id": "industrials", "name": "Industria & Aeroespacial"},
    "DAI": {"id": "industrials", "name": "Industria & Automotriz"},
    "MMC": {"id": "financials", "name": "Finanzas & Seguros"},
    "EFX": {"id": "financials", "name": "Finanzas & Datos"},
    "WBK": {"id": "financials", "name": "Finanzas & Fintech"},
    "LFC": {"id": "financials", "name": "Finanzas & Seguros"},
    "AUY": {"id": "materials", "name": "Minería & Materiales"},
    "AVY": {"id": "materials", "name": "Minería & Materiales"},
    "IP": {"id": "materials", "name": "Minería & Materiales"},
    "SUZ": {"id": "materials", "name": "Minería & Materiales"},
    "NLM": {"id": "materials", "name": "Minería & Materiales"},
    "BRFS": {"id": "staples", "name": "Consumo Masivo"},
    "NTCO": {"id": "staples", "name": "Consumo Masivo"},
    "BSN": {"id": "staples", "name": "Consumo Masivo"},
    "ADGO": {"id": "staples", "name": "Consumo Masivo & Agro"},
    "EOAN": {"id": "energy", "name": "Energía & Utilities"},
    "ELP": {"id": "energy", "name": "Energía & Utilities"},
    "HNP": {"id": "energy", "name": "Energía & Utilities"},
    "OGZD": {"id": "energy", "name": "Energía & Petróleo"},
    "LKOD": {"id": "energy", "name": "Energía & Petróleo"},
    "BNG": {"id": "staples", "name": "Consumo Masivo & Agro"},
    "DTEA": {"id": "staples", "name": "Consumo Masivo"},
    "VIV": {"id": "tech", "name": "Tecnología & Telecom"},
    "MBT": {"id": "tech", "name": "Tecnología & Telecom"},
    "TEFO": {"id": "tech", "name": "Tecnología & Telecom"},
    "TSU": {"id": "materials", "name": "Minería & Materiales"},
    "PCRF": {"id": "tech", "name": "Tecnología & Cloud"},
    "TIIAY": {"id": "tech", "name": "Tecnología & Telecom"},
    "HHPD": {"id": "materials", "name": "Minería & Materiales"},
    "AABA": {"id": "tech", "name": "Tecnología & Cloud"},
    "ATAD": {"id": "materials", "name": "Minería & Materiales"},
    "DCMYY": {"id": "tech", "name": "Tecnología & Telecom"},
}

# Tickers que ninguna fuente automática resuelve de forma confiable. Cada uno
# está identificado contra la lista oficial de BYMA (nombre + mercado de origen)
# y se fija a mano para que el catálogo no quede con activos sin sector.
SECTOR_OVERRIDES = {
    "ADS": {"id": "payments_retail", "name": "Pagos & Retail", "industry": "Adidas AG (XETRA) - indumentaria deportiva"},
    "AOCA": {"id": "materials", "name": "Minería & Materiales", "industry": "Aluminum Corp of China (NYSE) - aluminio"},
    "EA": {"id": "tech", "name": "Tecnología & Cloud", "industry": "Electronic Arts (NASDAQ) - videojuegos"},
    "HNPIY": {"id": "energy", "name": "Energía & Utilities", "industry": "Huaneng Power Intl (NYSE) - generación eléctrica"},
    "MBG": {"id": "consumer_discretionary", "name": "Consumo Discrecional", "industry": "Mercedes-Benz Group (FRANKFURT) - automotriz"},
    "RCTB4": {"id": "tech", "name": "Tecnología & Telecom", "industry": "Telebras PN (BOVESPA) - telecomunicaciones"},
    "SHPW": {"id": "industrials", "name": "Industria & Maquinaria", "industry": "Shapeways Holdings (NYSE) - manufactura 3D"},
    # TradingView resuelve 'UN' contra un ETF apalancado ajeno ("Corgi Unh 2x
    # Daily ETF"); el CEDEAR de BYMA es Nu Holdings, que cotiza como NU.
    "UN": {"id": "financials", "name": "Finanzas & Fintech", "industry": "Nu Holdings (NYSE) - banca digital"},
}

# Señales de que la descripción de TradingView corresponde a un ETF/fondo y no
# a una acción. El scanner devuelve type='fund', no 'etf'.
ETF_DESCRIPTION_MARKERS = re.compile(r"\bETF\b|\bFund\b|\bTrust\b|Index", re.I)

# Reglas de traducción de TradingView GICS a Macro-Sectores MPFP
def map_tv_sector(
    ticker: str,
    tv_sector: str,
    tv_industry: str,
    asset_type: str,
    existing_mapping: dict | None = None,
    description: str = "",
) -> dict[str, str | bool]:
    t = ticker.upper().strip()
    
    if t in KNOWN_TICKER_SECTORS:
        return KNOWN_TICKER_SECTORS[t]

    # 1. Preservar mapeos manuales y verificados existentes en el sistema
    if existing_mapping and existing_mapping.get("id") != "other":
        return existing_mapping

    # 2. Casos que ninguna fuente automática resuelve sin ambigüedad
    if t in SECTOR_OVERRIDES:
        return SECTOR_OVERRIDES[t]

    if t in ["CCJ"]:
        return {"id": "energy", "name": "Energía & Materiales", "industry": "Minería y combustible nuclear"}
    if t in ["NNE"]:
        return {"id": "energy", "name": "Energía & Industrial", "industry": "Tecnología nuclear avanzada y microreactores"}
    if (
        t in ETF_RATIOS
        or asset_type in ("etf", "fund")
        or (description and ETF_DESCRIPTION_MARKERS.search(description))
        or t in ["SPY", "QQQ", "DIA", "IWM", "EEM", "EWZ", "XLF", "XLE", "XLK", "XLV", "XLU", "XLI", "XLB", "XLP", "XLRE", "ARKK", "SMH", "URA", "VEA", "EWJ", "FXI", "ILF", "IVW", "GDX", "GLD", "SLV", "USO"]
    ):
        return {"id": "etfs", "name": "ETFs Indexados", "is_etf": True}
    if t in ["IBIT", "MSTR", "COIN"]:
        return {"id": "crypto", "name": "Criptoactivos"}
    
    sec = (tv_sector or "").lower()
    ind = (tv_industry or "").lower()

    if "semiconductor" in ind or "semiconductor" in sec:
        return {"id": "semis", "name": "Semiconductores"}
    if any(k in sec for k in ["electronic technology", "technology services", "information technology"]):
        return {"id": "tech", "name": "Tecnología & Cloud"}
    # Los REIT cotizan bajo sector "Finance" con industria "Real Estate
    # Investment Trusts", así que esta regla tiene que ir antes que financials.
    if "real estate" in sec or "real estate" in ind:
        return {"id": "real_estate", "name": "Bienes Raíces"}
    if any(k in sec for k in ["finance", "financial"]) or any(k in ind for k in ["banking", "investment", "insurance", "bank"]):
        return {"id": "financials", "name": "Finanzas & Fintech"}
    if "commercial services" in sec:
        # GICS agrupa acá a procesadores de pagos y servicios de datos
        # financieros (Fiserv, PagSeguro, StoneCo, S&P Global, Block).
        return {"id": "financials", "name": "Finanzas & Fintech"}
    if any(k in sec for k in ["health technology", "health services", "healthcare", "pharmaceutical"]):
        return {"id": "health", "name": "Salud & Farma"}
    if any(k in sec for k in ["consumer non-durables", "consumer defensive"]) or any(k in ind for k in ["food", "tobacco", "beverages", "household"]):
        return {"id": "staples", "name": "Consumo Masivo"}
    if any(k in sec for k in ["retail trade", "consumer services", "consumer durables", "internet retail", "consumer cyclical", "consumer discretionary"]):
        return {"id": "consumer_discretionary", "name": "Consumo Discrecional"}
    if any(k in sec for k in ["communication services", "communications"]):
        return {"id": "communications", "name": "Comunicaciones"}
    # Materiales va antes que energía a propósito: "energy minerals" es substring
    # de "non-energy minerals", así que el orden inverso mandaba Barrick, Vale y
    # CSN a Energía. Además "electric" matcheaba "Electrical Products" (WEG).
    if any(k in sec for k in ["non-energy minerals", "basic materials"]) or any(k in ind for k in ["mining", "steel", "metals", "chemicals", "gold"]):
        return {"id": "materials", "name": "Minería & Materiales"}
    if "process industries" in sec:
        # Químicos, papeleras y materiales de construcción (Sherwin-Williams,
        # Suzano). GICS no los mete en "Basic Materials".
        return {"id": "materials", "name": "Minería & Materiales"}
    if any(k in sec for k in ["energy minerals", "energy", "utilities"]) or any(k in ind for k in ["oil", "gas", "electric utilities", "refining"]):
        return {"id": "energy", "name": "Energía & Utilities"}
    if any(k in sec for k in ["producer manufacturing", "industrial services", "transportation", "industrials"]) or any(k in ind for k in ["aerospace", "machinery", "railroads"]):
        return {"id": "industrials", "name": "Industria & Maquinaria"}

    if existing_mapping and existing_mapping.get("id") != "other":
        return existing_mapping

    return {"id": "other", "name": "Otros Activos"}

def fetch_comafi_ratios() -> tuple[dict[str, float], dict[str, str]]:
    """Descarga y parsea la tabla de CEDEARs oficial de Banco Comafi."""
    url = "https://www.comafi.com.ar/2254-CE.note.aspx"
    print("Conectando con Banco Comafi...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    ratios: dict[str, float] = {}
    byma_to_us: dict[str, str] = {}
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)
        for row in rows:
            cols = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)]
            if len(cols) >= 8:
                ticker_byma = cols[2].upper().strip()
                ticker_us = cols[3].upper().strip()
                ratio_str = cols[7].strip()
                
                # Ignorar encabezados o textos que no sean tickers
                if not re.match(r"^[A-Z0-9\.\-]+$", ticker_byma) or len(ticker_byma) > 8:
                    continue
                
                m = re.match(r"^(\d+)(?::(\d+))?$", ratio_str)
                if m and ticker_byma:
                    n1 = float(m.group(1))
                    n2 = float(m.group(2)) if m.group(2) else 1.0
                    ratio_val = n1 / n2 if n2 > 0 else n1
                    if ratio_val > 0:
                        ratios[ticker_byma] = ratio_val
                        byma_to_us[ticker_byma] = ticker_us if ticker_us else ticker_byma

        print(f"Banco Comafi: {len(ratios)} ratios oficiales obtenidos con éxito.")
    except Exception as e:
        print(f"Aviso Comafi ({e}). Se utilizarán ratios precargados.")
    return ratios, byma_to_us

SECURITY_MARKER = re.compile(
    r"\b(ADR|GDR|CEDEAR|DR|SHS|SHARES)\b|Cert Deposito|Sponsored|Repr", re.I
)


def _scan_tv(symbols: list[str], market: str) -> dict[str, list[dict]]:
    """Consulta TradingView por lotes y agrupa todas las filas por símbolo.

    Se conservan todas las coincidencias porque en el mercado `global` un mismo
    ticker identifica instrumentos de empresas distintas y hay que desambiguar
    antes de asignar un sector.
    """
    from services.clients.tv_client import scanner_scan

    found: dict[str, list[dict]] = {}
    for start in range(0, len(symbols), 100):
        chunk = symbols[start:start + 100]
        try:
            res = scanner_scan(
                filter_=[{"left": "name", "operation": "in_range", "right": chunk}],
                columns=["name", "sector", "industry", "type", "description"],
                market=market,
                range_=(0, 200),
            )
        except Exception as err:
            print(f"Aviso TV Scanner {market} lote {start}: {err}")
            continue
        for item in res.get("data", []):
            sym = (item.get("name") or "").upper().strip()
            if sym and (item.get("sector") or item.get("industry")):
                found.setdefault(sym, []).append(item)
    return found


def _pick_tv_item(candidates: list[dict] | None) -> dict | None:
    """Devuelve una fila de TradingView, o None si el ticker es ambiguo.

    En `global` el mismo símbolo puede apuntar a empresas distintas ('EA' es
    Electronic Arts en NASDAQ y Energy Absolute en Tailandia). Se acepta solo
    cuando hay una única descripción o cuando exactamente una fila está marcada
    como ADR/CEDEAR/depositary receipt.
    """
    if not candidates:
        return None
    descriptions = {(c.get("description") or "").strip() for c in candidates}
    if len(descriptions) == 1:
        return candidates[0]
    marked = [c for c in candidates if SECURITY_MARKER.search(c.get("description") or "")]
    if len(marked) == 1:
        return marked[0]
    return None


def main(apply: bool = False, show_added: bool = False):
    # 1. El catálogo de ratios es de otra responsabilidad: lo publica la lista
    #    oficial de BYMA y lo refresca scripts/update_cedear_ratios.py (con
    #    control empirico contra precios). Este script ya no escribe ratios:
    #    la tabla de Comafi quedó 182 CEDEARs atrasada y era la causa de que el
    #    armador rechazara 161 CEDEARs negociables.
    with RATIOS_FILE.open("r", encoding="utf-8") as ratios_handle:
        sorted_ratios = json.loads(ratios_handle.read())
    print(f"Catálogo de ratios (versiónado, fuente BYMA): {len(sorted_ratios)} CEDEARs.")
    print("  (para refrescarlo: ./venv/bin/python scripts/update_cedear_ratios.py --apply)")

    # 2. Comafi queda solo como mapa BYMA -> símbolo US para consultar TradingView.
    _, byma_to_us = fetch_comafi_ratios()

    # 3. Importar SECTOR_MAP actual de portfolio_service.py
    from services.portfolio_service import SECTOR_MAP as CURRENT_SECTOR_MAP

    # 4. Consultar sectores en TradingView Scanner.
    #    Cada CEDEAR se busca por su propio símbolo y por el subyacente que
    #    informa Comafi. El símbolo propio va primero: la tabla de Comafi está
    #    ~182 CEDEARs atrás y no cubre las altas nuevas.
    all_tickers = sorted(sorted_ratios)
    candidates_by_ticker: dict[str, list[str]] = {}
    for ticker in all_tickers:
        candidates = [ticker]
        mapped = byma_to_us.get(ticker)
        if mapped:
            mapped_clean = mapped.upper().strip()
            if mapped_clean and mapped_clean not in candidates:
                candidates.append(mapped_clean)
        candidates_by_ticker[ticker] = candidates

    all_symbols = sorted({sym for cands in candidates_by_ticker.values() for sym in cands})
    print(f"Consultando TradingView Scanner para {len(all_symbols)} símbolos...")

    tv_america = _scan_tv(all_symbols, "america")
    pending = [sym for sym in all_symbols if sym not in tv_america]
    tv_global = _scan_tv(pending, "global") if pending else {}
    print(
        f"TradingView: {len(tv_america)} símbolos en america, "
        f"{len(tv_global)} en global."
    )

    # 5. Resolver cada ticker en orden de confianza decreciente.
    tv_data: dict[str, dict] = {}
    unresolved: list[str] = []
    for ticker, candidates in candidates_by_ticker.items():
        item = None
        for sym in candidates:
            item = _pick_tv_item(tv_america.get(sym))
            if item:
                break
        if not item:
            for sym in candidates:
                item = _pick_tv_item(tv_global.get(sym))
                if item:
                    break
        if item:
            tv_data[ticker] = item
        else:
            unresolved.append(ticker)

    # Fallback con yfinance para los activos que TradingView no expone.
    still_missing = [
        ticker
        for ticker in unresolved
        if ticker not in ETF_RATIOS
        and ticker not in SECTOR_OVERRIDES
        and ticker not in KNOWN_TICKER_SECTORS
        and (CURRENT_SECTOR_MAP.get(ticker) or {}).get("id") in (None, "other")
    ]
    if still_missing:
        import yfinance as yf

        print(f"Consultando yfinance para {len(still_missing)} activos restantes...")

        def fetch_yf_info(ticker: str):
            symbol = (byma_to_us.get(ticker) or ticker).replace(".", "-")
            try:
                info = yf.Ticker(symbol).info
            except Exception:
                return ticker, None
            sector = info.get("sector")
            industry = info.get("industry")
            if not sector and not industry:
                return ticker, None
            return ticker, {
                "sector": sector,
                "industry": industry,
                "type": "etf" if info.get("quoteType") == "ETF" else "stock",
                "description": info.get("longName") or "",
            }

        with ThreadPoolExecutor(max_workers=8) as pool:
            for ticker, result in pool.map(fetch_yf_info, still_missing):
                if result:
                    tv_data[ticker] = result

    # 6. Construir SECTOR_MAP sólo con los tickers vigentes del catálogo.
    #    No se arrastran entradas viejas: si BYMA retira un CEDEAR, sale del mapa.
    new_sector_map = {}
    for ticker in all_tickers:
        item = tv_data.get(ticker, {})
        new_sector_map[ticker] = map_tv_sector(
            ticker=ticker,
            tv_sector=item.get("sector", ""),
            tv_industry=item.get("industry", ""),
            asset_type=item.get("type", ""),
            existing_mapping=CURRENT_SECTOR_MAP.get(ticker),
            description=item.get("description", ""),
        )

    # Los mapeos curados a mano se conservan aunque el CEDEAR ya no se negocie:
    # hay carteras históricas que todavía los tienen (NNE, TEFO, AABA...).
    for ticker, mapping in KNOWN_TICKER_SECTORS.items():
        new_sector_map.setdefault(ticker, mapping)

    orphans = sorted(t for t, v in new_sector_map.items() if v.get("id") == "other")
    added = sorted(set(new_sector_map) - set(CURRENT_SECTOR_MAP))
    removed = sorted(set(CURRENT_SECTOR_MAP) - set(new_sector_map))
    changed = sorted(
        t
        for t in set(new_sector_map) & set(CURRENT_SECTOR_MAP)
        if (new_sector_map[t].get("id"), new_sector_map[t].get("name"))
        != (CURRENT_SECTOR_MAP[t].get("id"), CURRENT_SECTOR_MAP[t].get("name"))
    )

    print(f"Mapeo de sectores: {len(new_sector_map)} activos vigentes.")
    print(
        f"  nuevos: {len(added)} | reclasificados: {len(changed)} "
        f"| fuera del catálogo: {len(removed)}"
    )
    print(f"  sin sector: {len(orphans)}" + (f" -> {', '.join(orphans)}" if orphans else ""))

    if orphans:
        print("  Completalos en SECTOR_OVERRIDES: el catálogo no debe quedar con activos sin sector.")

    if show_added:
        print("\n  Altas por sector:")
        by_sector: dict[str, list[str]] = {}
        for ticker in added:
            by_sector.setdefault(new_sector_map[ticker].get("name", "?"), []).append(ticker)
        for sector_name in sorted(by_sector):
            print(f"    {sector_name}: {', '.join(by_sector[sector_name])}")

    if not apply:
        print("\nSimulación: no se escribió ningún archivo. Usá --apply para persistir.")
        return

    if orphans:
        raise SystemExit("Abortado: quedan activos sin sector. Completá SECTOR_OVERRIDES y reintentá.")

    # 7. Escribir SECTOR_MAP actualizado en portfolio_service.py
    with open(PORTFOLIO_SERVICE_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    lines = ["SECTOR_MAP: dict[str, dict[str, str | bool]] = {"]
    sectors_order = [
        ("tech", "Tecnología & Cloud / Software"),
        ("semis", "Semiconductores & Hardware"),
        ("payments_retail", "Pagos, Retail & Consumo Discrecional"),
        ("consumer_discretionary", "Consumo Discrecional"),
        ("health", "Salud & Farmacéutica"),
        ("staples", "Consumo Masivo (Staples)"),
        ("financials", "Finanzas, Banca & Fintech"),
        ("industrials", "Industria, Maquinaria & Aeroespacial"),
        ("energy", "Energía, Petróleo & Utilities"),
        ("utilities", "Utilities"),
        ("communications", "Comunicaciones"),
        ("real_estate", "Bienes Raíces"),
        ("materials", "Minería & Materiales"),
        ("etfs", "ETFs Indexados & Globales"),
        ("crypto", "Criptoactivos"),
        ("other", "Otros Activos")
    ]
    
    for sec_id, sec_label in sectors_order:
        sec_tickers = [k for k, v in new_sector_map.items() if v["id"] == sec_id]
        if not sec_tickers:
            continue
        lines.append(f"    # {sec_label}")
        for k in sorted(sec_tickers):
            v = new_sector_map[k]
            lines.append(f"    {k!r}: {v!r},")
        lines.append("")

    lines.append("}")
    new_map_str = "\n".join(lines)

    pattern = r"SECTOR_MAP: dict\[str, dict\[str, str \| bool\]\] = \{.*?\n\}"
    new_content, substitutions = re.subn(pattern, new_map_str, content, flags=re.DOTALL)
    if substitutions != 1:
        if substitutions == 0:
            raise RuntimeError("No se encontró el bloque SECTOR_MAP tipado en portfolio_service.py")
        raise RuntimeError(
            f"Se encontraron {substitutions} bloques SECTOR_MAP tipados; se esperaba exactamente uno"
        )
    
    with open(PORTFOLIO_SERVICE_FILE, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"portfolio_service.py actualizado exitosamente con {len(new_sector_map)} activos.")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Regenera el SECTOR_MAP de portfolio_service.py desde TradingView."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribe services/portfolio_service.py (por defecto sólo simula).",
    )
    parser.add_argument(
        "--show-added",
        action="store_true",
        help="Lista las altas agrupadas por sector para auditarlas.",
    )
    args = parser.parse_args()
    main(apply=args.apply, show_added=args.show_added)
