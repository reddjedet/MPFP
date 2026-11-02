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
MAX_Z = 3.0
# Al cambiar la forma del payload o la composición del universo se sube esta
# versión para invalidar la caché.
RRG_SCHEMA_VERSION = 3

QUADRANT_LABELS = {
    "LEADING": "Líder Sostenido",
    "WEAKENING": "Enfriándose",
    "IMPROVING": "Rotación Entrante",
    "LAGGING": "Rezagado",
}


def classify_rrg_quadrant(x: float, y: float) -> str:
    """Clasifica un punto (RS-Ratio, RS-Momentum) en su cuadrante RRG.

    Convención estándar (ejes centrados en 100):
    - Leading:    x >= 100, y >= 100 (arriba-derecha)
    - Weakening:  x >= 100, y <  100 (abajo-derecha)
    - Improving:  x <  100, y >= 100 (arriba-izquierda)
    - Lagging:    x <  100, y <  100 (abajo-izquierda)
    """
    if x >= 100.0 and y >= 100.0:
        return "LEADING"
    if x >= 100.0 and y < 100.0:
        return "WEAKENING"
    if x < 100.0 and y >= 100.0:
        return "IMPROVING"
    return "LAGGING"


def _resolve_universe(universe: str) -> dict[str, dict[str, Any]]:
    if universe == "thematic":
        return dict(THEMATIC_ETFS)
    if universe == "all":
        return {**SECTOR_ETFS, **THEMATIC_ETFS}
    return dict(SECTOR_ETFS)


def _method_meta(weeks: int) -> dict[str, Any]:
    """Metadatos del cálculo para que la UI pueda explicarlo sin hardcodear."""
    return {
        "name": "rolling_zscore",
        "scale": "100+10z",
        "clip": [-MAX_Z, MAX_Z],
        "smoothing": f"EMA{SMOOTH_SPAN}",
        "window_weeks": weeks,
        "momentum": "delta_rs_ratio",
        "complete_weeks_only": True,
    }


def _empty_response(
    weeks: int,
    tail: int,
    error: str | None = None,
    skipped: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "benchmark": BENCHMARK,
        "as_of": None,
        "weeks": weeks,
        "tail": tail,
        "spy_rsi": None,
        "points": [],
        "skipped": skipped or [],
        "method": _method_meta(weeks),
        "error": error,
    }


def _reference_date() -> pd.Timestamp:
    """Fecha de hoy, aislada para poder testear el cierre semanal."""
    return pd.Timestamp.now().normalize()


def _last_complete_week_label(reference: pd.Timestamp) -> pd.Timestamp:
    """Viernes de la última semana cerrada respecto de `reference`.

    Una semana se considera cerrada cuando su viernes ya quedó atrás. Si hoy
    es sábado o domingo, la semana que acaba de terminar ya está cerrada.
    """
    previous_day = reference.normalize() - pd.Timedelta(days=1)
    return previous_day - pd.Timedelta(days=(previous_day.weekday() - 4) % 7)


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
    zscore = (series - mean) / std
    zscore = zscore.replace([np.inf, -np.inf], np.nan)
    # Ventana sin dispersión: no hay desvío que medir, el z-score es 0.
    zscore = zscore.mask(std.eq(0.0) & mean.notna(), 0.0)
    return zscore


def _scale_and_clip(scaled: pd.Series) -> pd.Series:
    """Recorta la escala final a 100 ± 10·MAX_Z (70–130)."""
    return scaled.clip(100.0 - 10.0 * MAX_Z, 100.0 + 10.0 * MAX_Z)


def _rrg_axes(relative_strength: pd.Series, weeks: int) -> pd.DataFrame:
    """Calcula Fuerza relativa y Momentum relativo a partir del RS vs SPY.

    - Fuerza: z-score de la fuerza relativa, escalado a 100 + 10z.
    - Momentum: z-score del **cambio** semanal de esa fuerza (Δ), escalado
      igual. Usar Δ en lugar del cambio porcentual evita que un sector débil
      reaccione distinto a un sector fuerte ante el mismo movimiento.
    - El suavizado EMA se aplica antes del recorte final para no perder
      amplitud, y el recorte garantiza que la escala visible sea 70–130.
    """
    z_level = _rolling_zscore(relative_strength, weeks)
    rs_ratio = _scale_and_clip(
        (100.0 + 10.0 * z_level).ewm(span=SMOOTH_SPAN, adjust=False).mean()
    )

    z_momentum = _rolling_zscore(rs_ratio.diff(), weeks)
    rs_momentum = _scale_and_clip(
        (100.0 + 10.0 * z_momentum).ewm(span=SMOOTH_SPAN, adjust=False).mean()
    )

    frame = pd.DataFrame({"x": rs_ratio, "y": rs_momentum})
    return frame.replace([np.inf, -np.inf], np.nan).dropna()


def _quadrant_streak(
    xs: pd.Series, ys: pd.Series
) -> tuple[str, int, pd.Timestamp]:
    """Cuadrante actual, semanas consecutivas en él y fecha de entrada."""
    quadrants = [
        classify_rrg_quadrant(float(x), float(y)) for x, y in zip(xs, ys)
    ]
    current = quadrants[-1]
    streak = 0
    for quadrant in reversed(quadrants):
        if quadrant != current:
            break
        streak += 1
    return current, streak, xs.index[-streak]


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

    frame = _rrg_axes(relative_strength, weeks)
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
    _schema_version: int = RRG_SCHEMA_VERSION,
) -> dict[str, Any]:
    """
    Construye el Relative Rotation Graph de los ETFs seguidos contra SPY.

    Args:
        universe: "sectors" (11 SPDR), "thematic" o "all".
        weeks: ventana de normalización en semanas.
        tail: cantidad de puntos semanales de la cola.
        _schema_version: versión interna del payload; invalida la caché.
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
    # Solo semanas cerradas: la etiqueta W-FRI puede ser la semana en curso.
    # Se descarta hasta que su viernes haya quedado atrás (ver helper).
    last_complete_week = _last_complete_week_label(_reference_date())
    if weekly.index.tz is not None:
        last_complete_week = last_complete_week.tz_localize(weekly.index.tz)
    weekly = weekly[weekly.index <= last_complete_week]
    if weekly.empty:
        return _empty_response(
            weeks, tail, "Sin semanas cerradas disponibles."
        )
    spy_weekly = weekly[BENCHMARK]
    spy_rsi = _compute_rsi(close[BENCHMARK])

    points: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for ticker, meta in selected_meta.items():
        if ticker not in weekly.columns:
            skipped.append({"ticker": ticker, "reason": "sin datos semanales"})
            continue

        frame = _compute_rrg_series(weekly[ticker], spy_weekly, weeks)
        if frame is None:
            skipped.append({"ticker": ticker, "reason": "historial insuficiente"})
            continue

        trail_frame = frame.tail(tail)
        if trail_frame.empty:
            skipped.append({"ticker": ticker, "reason": "historial insuficiente"})
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

        # La racha se cuenta sobre toda la serie, no sobre la cola visible.
        quadrant, weeks_in_quadrant, since = _quadrant_streak(
            frame["x"], frame["y"]
        )

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
                "quadrant_since": since.strftime("%Y-%m-%d"),
                "rsi": _compute_rsi(close[ticker]) if ticker in close.columns else None,
                "rsi_spy": spy_rsi,
                "trail": trail,
            }
        )

    if not points:
        return _empty_response(
            weeks, tail, "Historial insuficiente para calcular el RRG.", skipped
        )

    as_of = max(point["trail"][-1]["week"] for point in points)
    return {
        "benchmark": BENCHMARK,
        "as_of": as_of,
        "weeks": weeks,
        "tail": tail,
        "spy_rsi": spy_rsi,
        "points": points,
        "skipped": skipped,
        "method": _method_meta(weeks),
        "error": None,
    }
