"""Relative Rotation Graph (RRG) de ETFs vs SPY.

Calcula fuerza relativa (RS-Ratio) y momentum relativo (RS-Momentum) semanales
usando SPY como benchmark. La normalización es una ventana móvil de `weeks`
semanas con suavizado EMA de 13 períodos, sin lookahead.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

from services.cache_service import smart_cache
from services.etf_service import SECTOR_ETFS, THEMATIC_ETFS

logger = logging.getLogger(__name__)

BENCHMARK = "SPY"
DOWNLOAD_PERIOD = "5y"
SMOOTH_SPAN = 13
RSI_PERIOD = 14
DEFAULT_WEEKS = 52
DEFAULT_TAIL = 8
VALID_UNIVERSES = {"sectors", "thematic", "all"}

QUADRANT_LABELS = {
    "LEADING": "Líder Sostenido",
    "WEAKENING": "Enfriándose",
    "IMPROVING": "Rotación Entrante",
    "LAGGING": "Rezagado",
}


def classify_rrg_quadrant(x: float, y: float) -> str:
    """Clasifica un punto (RS-Ratio, RS-Momentum) en su cuadrante RRG."""
    if x >= 100.0 and y >= 100.0:
        return "LEADING"
    if x < 100.0 and y >= 100.0:
        return "WEAKENING"
    if x < 100.0 and y < 100.0:
        return "LAGGING"
    return "IMPROVING"


def _resolve_universe(universe: str) -> dict[str, dict[str, Any]]:
    if universe == "thematic":
        return dict(THEMATIC_ETFS)
    if universe == "all":
        return {**SECTOR_ETFS, **THEMATIC_ETFS}
    return dict(SECTOR_ETFS)


def _empty_response(weeks: int, tail: int, error: str | None = None) -> dict[str, Any]:
    return {
        "benchmark": BENCHMARK,
        "as_of": None,
        "weeks": weeks,
        "tail": tail,
        "spy_rsi": None,
        "points": [],
        "error": error,
    }


def _extract_close_frame(raw: Any) -> pd.DataFrame:
    """Extrae el bloque de cierres de la respuesta de yfinance."""
    if raw is None or not isinstance(raw, pd.DataFrame) or raw.empty:
        return pd.DataFrame()

    if isinstance(raw.columns, pd.MultiIndex):
        levels = raw.columns.get_level_values(0)
        if "Close" in levels:
            close = raw["Close"]
        elif "Close" in raw.columns.get_level_values(-1):
            close = raw.xs("Close", axis=1, level=-1)
        else:
            return pd.DataFrame()
    elif "Close" in raw.columns:
        close = raw["Close"]
    else:
        return pd.DataFrame()

    if isinstance(close, pd.Series):
        close = close.to_frame(name=BENCHMARK)
    return close


def _rolling_zscore(series: pd.Series, window: int) -> pd.Series:
    rolling = series.rolling(window=window, min_periods=window)
    mean = rolling.mean()
    std = rolling.std(ddof=0)
    zscore = (series - mean) / std.replace(0.0, np.nan)
    return zscore.replace([np.inf, -np.inf], np.nan).clip(-3.0, 3.0)


def _compute_rrg_series(
    etf_weekly: pd.Series,
    spy_weekly: pd.Series,
    weeks: int,
) -> pd.DataFrame | None:
    """Calcula RS-Ratio y RS-Momentum semanales para un ETF vs SPY."""
    aligned = pd.concat(
        [etf_weekly.rename("etf"), spy_weekly.rename("spy")],
        axis=1,
    ).dropna()
    if len(aligned) < weeks * 2 + 10:
        return None

    relative_strength = (aligned["etf"] / aligned["spy"]).replace(
        [np.inf, -np.inf], np.nan
    ).dropna()

    rs_ratio = (
        100.0 + 10.0 * _rolling_zscore(relative_strength, weeks)
    ).ewm(span=SMOOTH_SPAN, adjust=False).mean()
    rs_momentum = (
        100.0 + 10.0 * _rolling_zscore(rs_ratio.pct_change(fill_method=None), weeks)
    ).ewm(span=SMOOTH_SPAN, adjust=False).mean()

    frame = pd.DataFrame({"x": rs_ratio, "y": rs_momentum})
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna()
    return frame if not frame.empty else None


def _compute_rsi(close: pd.Series, period: int = RSI_PERIOD) -> float | None:
    """RSI de Wilder sobre la última observación disponible."""
    series = close.dropna()
    if len(series) < period + 1:
        return None

    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()

    last_gain = float(avg_gain.iloc[-1])
    last_loss = float(avg_loss.iloc[-1])
    if not np.isfinite(last_gain) or not np.isfinite(last_loss):
        return None
    if last_loss == 0.0:
        return 100.0 if last_gain > 0.0 else 50.0

    rs = last_gain / last_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 2)


@smart_cache("historical")
def fetch_etf_rrg(
    universe: str = "sectors",
    weeks: int = DEFAULT_WEEKS,
    tail: int = DEFAULT_TAIL,
) -> dict[str, Any]:
    """
    Construye el Relative Rotation Graph de los ETFs seguidos contra SPY.

    Args:
        universe: "sectors" (11 SPDR), "thematic" o "all".
        weeks: ventana de normalización en semanas.
        tail: cantidad de puntos semanales de la cola.
    """
    weeks = int(max(26, min(int(weeks), 104)))
    tail = int(max(3, min(int(tail), 12)))
    universe_key = universe if universe in VALID_UNIVERSES else "sectors"
    selected_meta = _resolve_universe(universe_key)

    fetch_tickers = [ticker for ticker in selected_meta if ticker != BENCHMARK]
    fetch_tickers.append(BENCHMARK)

    try:
        raw = yf.download(
            fetch_tickers,
            period=DOWNLOAD_PERIOD,
            interval="1d",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as exc:
        logger.warning("No se pudo descargar historial para el RRG: %s", exc)
        return _empty_response(
            weeks, tail, "No se pudo descargar el historial de precios."
        )

    close = _extract_close_frame(raw)
    if close.empty:
        return _empty_response(weeks, tail, "Sin datos históricos disponibles.")
    if BENCHMARK not in close.columns:
        return _empty_response(
            weeks, tail, "Sin datos históricos del benchmark SPY."
        )

    close = close.sort_index()
    weekly = close.resample("W-FRI").last()
    # Descartar la semana en curso: su etiqueta W-FRI sería una fecha futura.
    weekly = weekly[weekly.index <= close.index.max()]
    spy_weekly = weekly[BENCHMARK]
    spy_rsi = _compute_rsi(close[BENCHMARK])

    points: list[dict[str, Any]] = []
    for ticker, meta in selected_meta.items():
        if ticker not in weekly.columns:
            continue

        frame = _compute_rrg_series(weekly[ticker], spy_weekly, weeks)
        if frame is None:
            continue

        trail_frame = frame.tail(tail)
        if trail_frame.empty:
            continue

        trail = [
            {
                "week": index.strftime("%Y-%m-%d"),
                "x": round(float(row["x"]), 2),
                "y": round(float(row["y"]), 2),
            }
            for index, row in trail_frame.iterrows()
        ]
        current = trail[-1]
        quadrant = classify_rrg_quadrant(current["x"], current["y"])

        weeks_in_quadrant = 0
        for point in reversed(trail):
            if classify_rrg_quadrant(point["x"], point["y"]) == quadrant:
                weeks_in_quadrant += 1
            else:
                break

        points.append(
            {
                "ticker": ticker,
                "name": meta.get("name", ticker),
                "sector": meta.get("sector", ""),
                "x": current["x"],
                "y": current["y"],
                "quadrant": quadrant,
                "quadrant_label": QUADRANT_LABELS[quadrant],
                "weeks_in_quadrant": weeks_in_quadrant,
                "rsi": _compute_rsi(close[ticker]) if ticker in close.columns else None,
                "rsi_spy": spy_rsi,
                "trail": trail,
            }
        )

    if not points:
        return _empty_response(
            weeks, tail, "Historial insuficiente para calcular el RRG."
        )

    as_of = max(point["trail"][-1]["week"] for point in points)
    return {
        "benchmark": BENCHMARK,
        "as_of": as_of,
        "weeks": weeks,
        "tail": tail,
        "spy_rsi": spy_rsi,
        "points": points,
        "error": None,
    }
