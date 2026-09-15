"""
Script de Expansión Masiva de CEDEARs y Mapeo Sectorial GICS.
Fuentes: Banco Comafi (Ratios oficiales) + BYMA (ETFs) + TradingView Scanner (Sectores).
"""
import re
import sys
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from services.atomic_persistence import AtomicJsonDatabase

RATIOS_FILE = ROOT_DIR / "data" / "cedear_ratios.json"
PORTFOLIO_SERVICE_FILE = ROOT_DIR / "services" / "portfolio_service.py"

# Ratios conocidos de ETFs de BYMA
ETF_RATIOS = {
    "SPY": 20.0, "QQQ": 20.0, "DIA": 20.0, "IWM": 10.0,
    "EEM": 5.0,  "EWZ": 2.0,  "XLF": 2.0,  "XLE": 2.0,
    "XLK": 2.0,  "XLV": 2.0,  "XLU": 2.0,  "ARKK": 10.0,
    "IBIT": 1.0, "SMH": 1.0,  "URA": 1.0,  "VEA": 1.0,
    "EWJ": 1.0,  "FXI": 1.0,  "ILF": 1.0,  "IVW": 1.0,
    "XLI": 2.0,  "XLB": 2.0,  "XLP": 2.0,  "XLRE": 2.0,
    "GDX": 1.0,  "GLD": 1.0,  "SLV": 1.0,  "USO": 1.0,
    "CCJ": 23.0, "NNE": 1.0
}

KNOWN_TICKER_SECTORS = {
    "CCJ": {"id": "energy", "name": "Energía & Materiales", "industry": "Minería y combustible nuclear"},
    "NEE": {"id": "energy", "name": "Energía & Utilities", "industry": "Energía limpia, renovable y eléctrica"},
    "NNE": {"id": "energy", "name": "Energía & Industrial", "industry": "Tecnología nuclear avanzada y microreactores"},
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

# Reglas de traducción de TradingView GICS a Macro-Sectores MPFP
def map_tv_sector(ticker: str, tv_sector: str, tv_industry: str, asset_type: str, existing_mapping: dict | None = None) -> dict[str, str]:
    t = ticker.upper().strip()
    
    if t in KNOWN_TICKER_SECTORS:
        return KNOWN_TICKER_SECTORS[t]

    # 1. Preservar mapeos manuales y verificados existentes en el sistema
    if existing_mapping and existing_mapping.get("id") != "other":
        return existing_mapping

    if t in ["CCJ"]:
        return {"id": "energy", "name": "Energía & Materiales", "industry": "Minería y combustible nuclear"}
    if t in ["NNE"]:
        return {"id": "energy", "name": "Energía & Industrial", "industry": "Tecnología nuclear avanzada y microreactores"}
    if t in ETF_RATIOS or asset_type == "etf" or t in ["SPY", "QQQ", "DIA", "IWM", "EEM", "EWZ", "XLF", "XLE", "XLK", "XLV", "XLU", "XLI", "XLB", "XLP", "XLRE", "ARKK", "SMH", "URA", "VEA", "EWJ", "FXI", "ILF", "IVW", "GDX", "GLD", "SLV", "USO"]:
        return {"id": "etfs", "name": "ETFs Indexados"}
    if t in ["IBIT", "MSTR", "COIN"]:
        return {"id": "crypto", "name": "Criptoactivos"}
    
    sec = (tv_sector or "").lower()
    ind = (tv_industry or "").lower()

    if "semiconductor" in ind or "semiconductor" in sec:
        return {"id": "semis", "name": "Semiconductores"}
    if any(k in sec for k in ["electronic technology", "technology services", "information technology"]):
        return {"id": "tech", "name": "Tecnología & Cloud"}
    if any(k in sec for k in ["finance", "financial"]) or any(k in ind for k in ["banking", "investment", "insurance", "bank"]):
        return {"id": "financials", "name": "Finanzas & Fintech"}
    if any(k in sec for k in ["health technology", "health services", "healthcare", "pharmaceutical"]):
        return {"id": "health", "name": "Salud & Farma"}
    if any(k in sec for k in ["consumer non-durables", "consumer defensive"]) or any(k in ind for k in ["food", "tobacco", "beverages", "household"]):
        return {"id": "staples", "name": "Consumo Masivo"}
    if any(k in sec for k in ["retail trade", "consumer services", "consumer durables", "internet retail", "consumer cyclical"]):
        return {"id": "payments_retail", "name": "Pagos & Retail"}
    if any(k in sec for k in ["energy minerals", "energy", "utilities"]) or any(k in ind for k in ["oil", "gas", "electric", "refining"]):
        return {"id": "energy", "name": "Energía & Utilities"}
    if any(k in sec for k in ["non-energy minerals", "basic materials"]) or any(k in ind for k in ["mining", "steel", "metals", "chemicals", "gold"]):
        return {"id": "materials", "name": "Minería & Materiales"}
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

def main():
    ratios_db = AtomicJsonDatabase(RATIOS_FILE)
    existing_ratios = ratios_db.load()
    print(f"Ratios existentes en base local: {len(existing_ratios)}")

    # 1. Obtener ratios de Comafi
    comafi_ratios, byma_to_us = fetch_comafi_ratios()
    
    # 2. Consolidar ratios: Comafi + ETFs + Existing (Existing tiene máxima prioridad para ratios auditados)
    merged_ratios = {**comafi_ratios, **ETF_RATIOS, **existing_ratios}
    sorted_ratios = {k: merged_ratios[k] for k in sorted(merged_ratios.keys())}
    ratios_db.save(sorted_ratios)
    print(f"Total consolidado guardado en {RATIOS_FILE.name}: {len(sorted_ratios)} CEDEARs.")

    # 3. Importar SECTOR_MAP actual de portfolio_service.py
    from services.portfolio_service import SECTOR_MAP as CURRENT_SECTOR_MAP

    # 4. Consultar sectores en TradingView Scanner
    from services.clients.tv_client import scanner_scan
    all_tickers = sorted(list(sorted_ratios.keys()))
    
    # Mapear símbolos a consultar en TradingView (usar underlying US symbol si existe)
    us_symbols_map = {t: byma_to_us.get(t, t) for t in all_tickers}
    # Ajustes comunes de tickers de TradingView / US
    for k, v in us_symbols_map.items():
        if v == "BRKB":
            us_symbols_map[k] = "BRK.B"
        elif v == "BFB":
            us_symbols_map[k] = "BF.B"

    reverse_us_map = {}
    for k, v in us_symbols_map.items():
        reverse_us_map[v] = k

    unique_us_symbols = sorted(list(set(us_symbols_map.values())))
    print(f"Consultando TradingView Scanner para {len(unique_us_symbols)} tickers subyacentes...")

    tv_data = {}
    # Lotes en mercado 'america'
    for i in range(0, len(unique_us_symbols), 100):
        chunk = unique_us_symbols[i:i+100]
        try:
            res = scanner_scan(
                filter_=[{"left": "name", "operation": "in_range", "right": chunk}],
                columns=["name", "sector", "industry", "type", "description"],
                market="america",
                range_=(0, 200)
            )
            for item in res.get("data", []):
                sym = item.get("name", "").upper().strip()
                if sym:
                    tv_data[sym] = item
        except Exception as err:
            print(f"Aviso TV Scanner america lote {i}: {err}")

    # Lotes en mercado 'global' para tickers no encontrados
    missing = [s for s in unique_us_symbols if s not in tv_data]
    if missing:
        for i in range(0, len(missing), 100):
            chunk = missing[i:i+100]
            try:
                res = scanner_scan(
                    filter_=[{"left": "name", "operation": "in_range", "right": chunk}],
                    columns=["name", "sector", "industry", "type", "description"],
                    market="global",
                    range_=(0, 200)
                )
                for item in res.get("data", []):
                    sym = item.get("name", "").upper().strip()
                    if sym:
                        tv_data[sym] = item
            except Exception as err:
                print(f"Aviso TV Scanner global lote {i}: {err}")

    print(f"TradingView Scanner: {len(tv_data)} tickers catalogados con éxito.")

    # 5. Fallback con yfinance para los activos que aún no tengan sector
    import yfinance as yf
    still_missing = [t for t in all_tickers if us_symbols_map.get(t) not in tv_data and t not in ETF_RATIOS and t not in CURRENT_SECTOR_MAP]
    if still_missing:
        print(f"Consultando yfinance para {len(still_missing)} activos restantes...")
        def fetch_yf_info(t):
            us_sym = us_symbols_map.get(t, t).replace(".", "-")
            try:
                info = yf.Ticker(us_sym).info
                sec = info.get("sector")
                ind = info.get("industry")
                typ = "etf" if info.get("quoteType") == "ETF" else "stock"
                if sec or ind:
                    return t, {"sector": sec, "industry": ind, "type": typ}
            except Exception:
                pass
            return t, None

        with ThreadPoolExecutor(max_workers=8) as ex:
            yf_results = ex.map(fetch_yf_info, still_missing)
            for t, res in yf_results:
                if res:
                    tv_data[us_symbols_map.get(t, t)] = res

    # 6. Construir nuevo SECTOR_MAP enriquecido
    new_sector_map = {}
    for sym in all_tickers:
        us_sym = us_symbols_map.get(sym, sym)
        item = tv_data.get(us_sym, tv_data.get(sym, {}))
        existing = CURRENT_SECTOR_MAP.get(sym)
        mapped = map_tv_sector(
            ticker=sym,
            tv_sector=item.get("sector", ""),
            tv_industry=item.get("industry", ""),
            asset_type=item.get("type", ""),
            existing_mapping=existing
        )
        new_sector_map[sym] = mapped

    # Preservar tickers locales o especiales que estaban en CURRENT_SECTOR_MAP y KNOWN_TICKER_SECTORS
    for sym, val in CURRENT_SECTOR_MAP.items():
        if sym not in new_sector_map:
            new_sector_map[sym] = val

    for sym, val in KNOWN_TICKER_SECTORS.items():
        new_sector_map[sym] = val

    print(f"Mapeo de sectores finalizado: {len(new_sector_map)} activos.")

    # 7. Escribir SECTOR_MAP actualizado en portfolio_service.py
    with open(PORTFOLIO_SERVICE_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    lines = ["SECTOR_MAP: dict[str, dict[str, str]] = {"]
    sectors_order = [
        ("tech", "Tecnología & Cloud / Software"),
        ("semis", "Semiconductores & Hardware"),
        ("payments_retail", "Pagos, Retail & Consumo Discrecional"),
        ("health", "Salud & Farmacéutica"),
        ("staples", "Consumo Masivo (Staples)"),
        ("financials", "Finanzas, Banca & Fintech"),
        ("industrials", "Industria, Maquinaria & Aeroespacial"),
        ("energy", "Energía, Petróleo & Utilities"),
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
            if "industry" in v:
                lines.append(f'    "{k}": {{"id": "{v["id"]}", "name": "{v["name"]}", "industry": "{v["industry"]}"}},')
            else:
                lines.append(f'    "{k}": {{"id": "{v["id"]}", "name": "{v["name"]}"}},')
        lines.append("")

    lines.append("}")
    new_map_str = "\n".join(lines)

    pattern = r"SECTOR_MAP: dict\[str, dict\[str, str\]\] = \{.*?\n\}"
    new_content = re.sub(pattern, new_map_str, content, flags=re.DOTALL)
    
    with open(PORTFOLIO_SERVICE_FILE, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"portfolio_service.py actualizado exitosamente con {len(new_sector_map)} activos.")

if __name__ == "__main__":
    main()
