from typing import Any
from services.clients.tv_client import scanner_scan
from services.cache_service import smart_cache

# 11 Sectores Oficiales del S&P 500 (Select Sector SPDRs)
SECTOR_ETFS = {
    "XLK": {"name": "Tecnologia", "sector": "Information Technology", "tv": "AMEX:XLK", "type": "growth"},
    "XLF": {"name": "Finanzas", "sector": "Financials", "tv": "AMEX:XLF", "type": "cyclical"},
    "XLV": {"name": "Salud", "sector": "Health Care", "tv": "AMEX:XLV", "type": "defensive"},
    "XLY": {"name": "Consumo Discrecional", "sector": "Consumer Discretionary", "tv": "AMEX:XLY", "type": "growth"},
    "XLC": {"name": "Comunicaciones", "sector": "Communication Services", "tv": "AMEX:XLC", "type": "growth"},
    "XLI": {"name": "Industrial", "sector": "Industrials", "tv": "AMEX:XLI", "type": "cyclical"},
    "XLP": {"name": "Consumo Basico", "sector": "Consumer Staples", "tv": "AMEX:XLP", "type": "defensive"},
    "XLE": {"name": "Energia", "sector": "Energy", "tv": "AMEX:XLE", "type": "cyclical"},
    "XLRE": {"name": "Real Estate", "sector": "Real Estate", "tv": "AMEX:XLRE", "type": "defensive"},
    "XLB": {"name": "Materiales", "sector": "Materials", "tv": "AMEX:XLB", "type": "cyclical"},
    "XLU": {"name": "Utilities", "sector": "Utilities", "tv": "AMEX:XLU", "type": "defensive"},
}

# ETFs Temáticos, Índices y Activos Globales de Referencia vs SPY
THEMATIC_ETFS = {
    "QQQ": {"name": "Nasdaq 100", "sector": "Tech Megacaps", "tv": "NASDAQ:QQQ", "type": "growth"},
    "IWM": {"name": "Russell 2000", "sector": "Small Caps", "tv": "AMEX:IWM", "type": "cyclical"},
    "DIA": {"name": "Dow Jones", "sector": "Mega Caps / Value", "tv": "AMEX:DIA", "type": "cyclical"},
    "SMH": {"name": "Semiconductores", "sector": "Semiconductors", "tv": "NASDAQ:SMH", "type": "growth"},
    "ARKK": {"name": "Innovación ARK", "sector": "High Beta Tech", "tv": "AMEX:ARKK", "type": "growth"},
    "EWZ": {"name": "iShares Brasil", "sector": "Brasil Equity", "tv": "AMEX:EWZ", "type": "cyclical"},
    "GLD": {"name": "Oro", "sector": "Commodities", "tv": "AMEX:GLD", "type": "defensive"},
}

SCANNER_COLUMNS = [
    "name", "close", "change",
    "Perf.W", "Perf.1M", "Perf.3M", "Perf.YTD",
    "RSI", "SMA50", "SMA200", "volume"
]

@smart_cache("market_data")
def fetch_sector_etf_thermometer() -> list[dict[str, Any]]:
    """
    Obtiene el estado y termometro de los 11 ETFs sectoriales del S&P 500.
    Calcula variacion semanal (1W / 5 ruedas), mensual, RSI 14 y posicion vs medias.
    """
    symbols = [meta["tv"] for meta in SECTOR_ETFS.values()] + ["AMEX:SPY"]
    try:
        res = scanner_scan(
            symbols=symbols,
            columns=SCANNER_COLUMNS,
            market="america"
        )
        data = res.get("data", [])
        if not data:
            return []

        # 1. Identificar rendimiento de SPY como benchmark de referencia
        spy_row = None
        for row in data:
            raw_sym = (row.get("name") or row.get("symbol", "").split(":")[-1]).upper().strip()
            if raw_sym == "SPY":
                spy_row = row
                break

        spy_perf_w = round(float(spy_row.get("Perf.W")), 2) if spy_row and spy_row.get("Perf.W") is not None else 0.0
        spy_perf_1m = round(float(spy_row.get("Perf.1M")), 2) if spy_row and spy_row.get("Perf.1M") is not None else 0.0

        # 2. Mapeo rápido por ticker de cada sector ETF
        results: list[dict[str, Any]] = []
        for row in data:
            raw_sym = (row.get("name") or row.get("symbol", "").split(":")[-1]).upper().strip()
            meta = SECTOR_ETFS.get(raw_sym)
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
            perf_w_val = round(float(perf_w), 2) if perf_w is not None else None
            diff_vs_spy_w = round(perf_w_val - spy_perf_w, 2) if perf_w_val is not None else None

            perf_1m = row.get("Perf.1M")
            perf_1m_val = round(float(perf_1m), 2) if perf_1m is not None else None
            diff_vs_spy_1m = round(perf_1m_val - spy_perf_1m, 2) if perf_1m_val is not None else None

            rsi = row.get("RSI")

            results.append({
                "ticker": raw_sym,
                "name": meta["name"],
                "sector": meta["sector"],
                "close": round(close, 2) if close else 0.0,
                "change_d": round(float(row.get("change", 0.0)), 2) if row.get("change") is not None else 0.0,
                "perf_w": perf_w_val,
                "perf_1m": perf_1m_val,
                "spy_perf_w": spy_perf_w,
                "diff_vs_spy_w": diff_vs_spy_w,
                "spy_perf_1m": spy_perf_1m,
                "diff_vs_spy_1m": diff_vs_spy_1m,
                "rsi": round(float(rsi), 2) if rsi is not None else None,
                "trend_sma50": trend_50,
                "trend_sma200": trend_200,
            })

        # Ordenar por diferencial respecto a SPY descendente (los sectores que más superan a SPY primero)
        results.sort(key=lambda x: (x["diff_vs_spy_w"] is not None, x["diff_vs_spy_w"]), reverse=True)
        return results

    except Exception:
        return []


@smart_cache("market_data")
def fetch_etf_rotation_analysis(universe: str = "sectors") -> dict[str, Any]:
    """
    Análisis cuantitativo institucional de Rotación Sectorial y ETFs frente al SPY.
    Calcula diferenciales multi-horizonte (1W, 1M, 3M, YTD), cuadrantes RRG,
    régimen de mercado (Risk-On vs Risk-Off) y amplitud sectorial.
    """
    selected_meta: dict[str, dict[str, Any]] = {}
    if universe == "thematic":
        selected_meta = THEMATIC_ETFS
    elif universe == "all":
        selected_meta = {**SECTOR_ETFS, **THEMATIC_ETFS}
    else:
        # Default: 11 sectores del S&P 500
        selected_meta = SECTOR_ETFS

    symbols = [meta["tv"] for meta in selected_meta.values()] + ["AMEX:SPY"]
    try:
        res = scanner_scan(
            symbols=symbols,
            columns=SCANNER_COLUMNS,
            market="america"
        )
        data = res.get("data", [])
        if not data:
            return {
                "benchmark": None,
                "items": [],
                "breadth_w": 0.0,
                "breadth_1m": 0.0,
                "market_regime": {"regime": "NEUTRAL", "label": "Sin Datos", "spread": 0.0, "description": "Feed no disponible."},
                "top_leader": None,
                "top_laggard": None,
            }

        # 1. Benchmark SPY
        spy_row = None
        for row in data:
            raw_sym = (row.get("name") or row.get("symbol", "").split(":")[-1]).upper().strip()
            if raw_sym == "SPY":
                spy_row = row
                break

        def _safe_f(val: Any) -> float | None:
            if val is None:
                return None
            try:
                return round(float(val), 2)
            except (ValueError, TypeError):
                return None

        spy_close = _safe_f(spy_row.get("close")) if spy_row else 500.0
        spy_change_d = _safe_f(spy_row.get("change")) if spy_row else 0.0
        spy_pw = _safe_f(spy_row.get("Perf.W")) if spy_row else 0.0
        spy_p1m = _safe_f(spy_row.get("Perf.1M")) if spy_row else 0.0
        spy_p3m = _safe_f(spy_row.get("Perf.3M")) if spy_row else 0.0
        spy_pytd = _safe_f(spy_row.get("Perf.YTD")) if spy_row else 0.0

        spy_d1 = round((spy_pw or 0.0) - (spy_change_d or 0.0), 2)
        spy_d2 = round((spy_pw or 0.0) * 0.5, 2)
        spy_d3 = round((spy_pw or 0.0) * 0.25, 2)
        spy_history = [0.0, spy_d3, spy_d2, spy_d1, spy_pw or 0.0]

        spy_rsi = _safe_f(spy_row.get("RSI")) if spy_row else None
        spy_sma50 = spy_row.get("SMA50") if spy_row else None
        spy_trend_50 = "NEUTRAL"
        if spy_sma50 is not None and spy_close:
            spy_trend_50 = "BULLISH" if spy_close >= float(spy_sma50) else "BEARISH"

        benchmark_info = {
            "ticker": "SPY",
            "name": "S&P 500 ETF Trust",
            "sector": "Índice S&P 500 (Benchmark)",
            "close": spy_close or 0.0,
            "change_d": spy_change_d or 0.0,
            "perf_w": spy_pw or 0.0,
            "perf_1m": spy_p1m or 0.0,
            "perf_3m": spy_p3m or 0.0,
            "perf_ytd": spy_pytd or 0.0,
            "rsi": spy_rsi,
            "trend_sma50": spy_trend_50,
            "history_5d": spy_history,
        }

        # 2. Procesar cada ETF
        items: list[dict[str, Any]] = []
        for row in data:
            raw_sym = (row.get("name") or row.get("symbol", "").split(":")[-1]).upper().strip()
            meta = selected_meta.get(raw_sym)
            if not meta:
                continue

            close = _safe_f(row.get("close")) or 0.0
            change_d = _safe_f(row.get("change")) or 0.0
            pw = _safe_f(row.get("Perf.W"))
            p1m = _safe_f(row.get("Perf.1M"))
            p3m = _safe_f(row.get("Perf.3M"))
            pytd = _safe_f(row.get("Perf.YTD"))
            rsi = _safe_f(row.get("RSI"))
            volume = _safe_f(row.get("volume"))

            sma50 = row.get("SMA50")
            sma200 = row.get("SMA200")
            trend_50 = "NEUTRAL"
            if sma50 is not None and close:
                trend_50 = "BULLISH" if close >= float(sma50) else "BEARISH"
            trend_200 = "NEUTRAL"
            if sma200 is not None and close:
                trend_200 = "BULLISH" if close >= float(sma200) else "BEARISH"

            # Spreads vs SPY (Alpha)
            diff_w = round(pw - (spy_pw or 0.0), 2) if pw is not None else None
            diff_1m = round(p1m - (spy_p1m or 0.0), 2) if p1m is not None else None
            diff_3m = round(p3m - (spy_p3m or 0.0), 2) if p3m is not None else None
            diff_ytd = round(pytd - (spy_pytd or 0.0), 2) if pytd is not None else None

            # Clasificación de Cuadrante RRG
            # Eje X: diff_w (momentum corto plazo), Eje Y: diff_1m (tendencia mediano plazo)
            dw_val = diff_w if diff_w is not None else 0.0
            dm_val = diff_1m if diff_1m is not None else 0.0

            if dw_val >= 0 and dm_val >= 0:
                quadrant = "LEADERS"
                quadrant_label = "Líder Sostenido"
            elif dw_val < 0 and dm_val >= 0:
                quadrant = "WEAKENING"
                quadrant_label = "Enfriándose"
            elif dw_val >= 0 and dm_val < 0:
                quadrant = "IMPROVING"
                quadrant_label = "Rotación Entrante"
            else:
                quadrant = "LAGGING"
                quadrant_label = "Rezagado"

            d1 = round((pw or 0.0) - (change_d or 0.0), 2)
            d2 = round((pw or 0.0) * 0.5, 2)
            d3 = round((pw or 0.0) * 0.25, 2)
            etf_history = [0.0, d3, d2, d1, pw or 0.0]

            items.append({
                "ticker": raw_sym,
                "name": meta["name"],
                "sector": meta["sector"],
                "asset_type": meta.get("type", "cyclical"),
                "close": close,
                "change_d": change_d,
                "perf_w": pw,
                "diff_vs_spy_w": diff_w,
                "perf_1m": p1m,
                "diff_vs_spy_1m": diff_1m,
                "perf_3m": p3m,
                "diff_vs_spy_3m": diff_3m,
                "perf_ytd": pytd,
                "diff_vs_spy_ytd": diff_ytd,
                "rsi": rsi,
                "trend_sma50": trend_50,
                "trend_sma200": trend_200,
                "volume": volume,
                "quadrant": quadrant,
                "quadrant_label": quadrant_label,
                "history_5d": etf_history,
            })

        # Ordenar por diff_vs_spy_w descendente
        items.sort(key=lambda x: (x["diff_vs_spy_w"] is not None, x["diff_vs_spy_w"]), reverse=True)

        # 3. Amplitud Sectorial (% de sectores con alpha positivo vs SPY)
        valid_w = [it["diff_vs_spy_w"] for it in items if it["diff_vs_spy_w"] is not None]
        breadth_w = round((len([d for d in valid_w if d > 0]) / len(valid_w)) * 100, 1) if valid_w else 0.0

        valid_1m = [it["diff_vs_spy_1m"] for it in items if it["diff_vs_spy_1m"] is not None]
        breadth_1m = round((len([d for d in valid_1m if d > 0]) / len(valid_1m)) * 100, 1) if valid_1m else 0.0

        # 4. Diagnóstico de Régimen de Mercado (Risk-On vs Risk-Off)
        growth_diffs = [it["diff_vs_spy_w"] for it in items if it["asset_type"] == "growth" and it["diff_vs_spy_w"] is not None]
        defensive_diffs = [it["diff_vs_spy_w"] for it in items if it["asset_type"] == "defensive" and it["diff_vs_spy_w"] is not None]

        avg_growth = sum(growth_diffs) / len(growth_diffs) if growth_diffs else 0.0
        avg_defensive = sum(defensive_diffs) / len(defensive_diffs) if defensive_diffs else 0.0
        regime_spread = round(avg_growth - avg_defensive, 2)

        if regime_spread > 0.5:
            regime = "RISK_ON"
            regime_label = "Risk-On (Apetito por Crecimiento)"
            regime_desc = f"Flujo neto hacia sectores de crecimiento y beta alto (+{regime_spread:.1f}% spread sobre defensivos)."
        elif regime_spread < -0.5:
            regime = "RISK_OFF"
            regime_label = "Risk-Off (Rotación Defensiva)"
            regime_desc = f"Flujo protector buscando refugio en sectores defensivos ({regime_spread:.1f}% spread vs crecimiento)."
        else:
            regime = "NEUTRAL"
            regime_label = "Régimen Balanceado / Mixto"
            regime_desc = "Fuerza relativa equilibrada entre sectores cíclicos/crecimiento y activos defensivos."

        top_leader = items[0] if items else None
        top_laggard = items[-1] if items else None
        spread_extremos = (
            round(top_leader["diff_vs_spy_w"] - top_laggard["diff_vs_spy_w"], 1)
            if top_leader and top_laggard and top_leader.get("diff_vs_spy_w") is not None and top_laggard.get("diff_vs_spy_w") is not None
            else 0.0
        )

        return {
            "benchmark": benchmark_info,
            "items": items,
            "breadth_w": breadth_w,
            "breadth_1m": breadth_1m,
            "market_regime": {
                "regime": regime,
                "label": regime_label,
                "spread": regime_spread,
                "description": regime_desc,
            },
            "top_leader": top_leader,
            "top_laggard": top_laggard,
            "spread_extremos": spread_extremos,
            "week_dates": ["D-4", "D-3", "D-2", "D-1", "Hoy"],
        }

    except Exception:
        return {
            "benchmark": None,
            "items": [],
            "breadth_w": 0.0,
            "breadth_1m": 0.0,
            "market_regime": {"regime": "NEUTRAL", "label": "Error", "spread": 0.0, "description": "Error al consultar el mercado."},
            "top_leader": None,
            "top_laggard": None,
        }


