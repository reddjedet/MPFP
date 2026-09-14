from typing import Any
from services.clients.tv_client import scanner_scan
from services.cache_service import smart_cache

# 11 Sectores Oficiales del S&P 500 (Select Sector SPDRs)
SECTOR_ETFS = {
    "XLK": {"name": "Tecnologia", "sector": "Information Technology", "tv": "AMEX:XLK"},
    "XLF": {"name": "Finanzas", "sector": "Financials", "tv": "AMEX:XLF"},
    "XLV": {"name": "Salud", "sector": "Health Care", "tv": "AMEX:XLV"},
    "XLY": {"name": "Consumo Discrecional", "sector": "Consumer Discretionary", "tv": "AMEX:XLY"},
    "XLC": {"name": "Comunicaciones", "sector": "Communication Services", "tv": "AMEX:XLC"},
    "XLI": {"name": "Industrial", "sector": "Industrials", "tv": "AMEX:XLI"},
    "XLP": {"name": "Consumo Basico", "sector": "Consumer Staples", "tv": "AMEX:XLP"},
    "XLE": {"name": "Energia", "sector": "Energy", "tv": "AMEX:XLE"},
    "XLRE": {"name": "Real Estate", "sector": "Real Estate", "tv": "AMEX:XLRE"},
    "XLB": {"name": "Materiales", "sector": "Materials", "tv": "AMEX:XLB"},
    "XLU": {"name": "Utilities", "sector": "Utilities", "tv": "AMEX:XLU"},
}

SCANNER_COLUMNS = [
    "name", "close", "change",
    "Perf.W", "Perf.1M",
    "RSI", "SMA50", "SMA200"
]

@smart_cache("market_data")
def fetch_sector_etf_thermometer() -> list[dict[str, Any]]:
    """
    Obtiene el estado y termometro de los 11 ETFs sectoriales del S&P 500.
    Calcula variacion semanal (1W / 5 ruedas), mensual, RSI 14 y posicion vs medias.
    """
    symbols = [meta["tv"] for meta in SECTOR_ETFS.values()]
    try:
        res = scanner_scan(
            symbols=symbols,
            columns=SCANNER_COLUMNS,
            market="america"
        )
        data = res.get("data", [])
        if not data:
            return []

        # Mapeo rapido por ticker
        results: list[dict[str, Any]] = []
        for row in data:
            # El ticker puede venir como XLK o AMEX:XLK
            raw_sym = row.get("name") or row.get("symbol", "").split(":")[-1]
            ticker = raw_sym.upper().strip()
            meta = SECTOR_ETFS.get(ticker)
            if not meta:
                continue

            close = row.get("close") or 0.0
            sma50 = row.get("SMA50")
            sma200 = row.get("SMA200")

            trend_50 = "NEUTRAL"
            if sma50 is not None and close:
                trend_50 = "BULLISH" if close >= sma50 else "BEARISH"

            trend_200 = "NEUTRAL"
            if sma200 is not None and close:
                trend_200 = "BULLISH" if close >= sma200 else "BEARISH"

            perf_w = row.get("Perf.W")
            perf_1m = row.get("Perf.1M")
            rsi = row.get("RSI")

            results.append({
                "ticker": ticker,
                "name": meta["name"],
                "sector": meta["sector"],
                "close": round(close, 2) if close else 0.0,
                "change_d": round(row.get("change", 0.0), 2) if row.get("change") is not None else 0.0,
                "perf_w": round(perf_w, 2) if perf_w is not None else None,
                "perf_1m": round(perf_1m, 2) if perf_1m is not None else None,
                "rsi": round(rsi, 2) if rsi is not None else None,
                "trend_sma50": trend_50,
                "trend_sma200": trend_200,
            })

        # Ordenar por rendimiento semanal descendente
        results.sort(key=lambda x: (x["perf_w"] is not None, x["perf_w"]), reverse=True)
        return results

    except Exception:
        return []
