"""
Refresco del histórico de índices y ciclos (`data/historical_indices.json`).

Motivo: el archivo original contenía una serie sintética (tramos lineales
perfectos, sin volatilidad) que inflaba niveles y retornos. Este script
reconstruye `data_series` con precios reales de mercado y deja intactos los
metadatos curados (`mandates`, `elections`).

Fuentes:
    - Precios de ETFs e índices: Yahoo Finance (yfinance), cierre sin ajustar
      por dividendos (coherente con la etiqueta "Evolución Histórica").
    - Tipo de cambio implícito (CCL) para Merval USD: histórico de Ámbito
      Financiero. Antes de 2002-04-09 no hay serie pública; esos puntos quedan
      en `null` en lugar de fabricarse.
    - MERVAL_USD = ^MERV (ARS) / CCL.

Muestreo: semanal (último día hábil de cada semana ISO). Reduce el tamaño del
archivo sin perder la forma de la serie.

Uso:
    ./venv/bin/python scripts/refresh_historical_indices.py                  # simulación
    ./venv/bin/python scripts/refresh_historical_indices.py --apply          # escribe
    ./venv/bin/python scripts/refresh_historical_indices.py --apply --if-stale 7
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "historical_indices.json"

# Ticker interno -> símbolo de Yahoo Finance.
YF_TICKERS: dict[str, str] = {
    "MERVAL_ARS": "^MERV",
    "ARGT": "ARGT",
    "EWZ": "EWZ",
    "IBOVESPA_BRL": "^BVSP",
    "SP500": "^GSPC",
    "NASDAQ": "^NDX",
    "DOW": "^DJI",
}

# Series con cotización diaria confiable: si quedan viejas, el archivo está mal.
CORE_SERIES = ("EWZ", "IBOVESPA_BRL", "SP500")

FX_URL = (
    "https://mercados.ambito.com/dolar/contadoconliqui/"
    "historico-general/{desde}/{hasta}"
)

DEFAULT_START = "2000-01-01"
MIN_OBSERVATIONS = 500
MAX_STALE_DAYS = 10
# Un tramo de 6+ segundas diferencias consecutivas iguales es un artefacto de
# interpolación lineal, no un mercado real.
SYNTHETIC_RUN_LIMIT = 6
MAX_ABS_1Y_RETURN_PCT = 400.0


def _parse_ambito_number(raw: str) -> float | None:
    """Convierte '1.509,25' (formato es-AR) a float."""
    text = str(raw).strip().replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def fetch_fx_series(start: str, end: str) -> pd.Series:
    """Descarga el histórico diario del dólar CCL (Ámbito) y devuelve una Serie float."""
    url = FX_URL.format(desde=start, hasta=end)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)

    rows = payload[1:] if payload and isinstance(payload[0], list) else payload
    values: dict[pd.Timestamp, float] = {}
    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue
        try:
            value = _parse_ambito_number(row[2])
            stamp = pd.Timestamp(datetime.strptime(row[0], "%d/%m/%Y"))
        except (ValueError, TypeError):
            continue
        if value and value > 0:
            values[stamp] = value

    series = pd.Series(values, dtype="float64").sort_index()
    return series[~series.index.duplicated(keep="last")]


def fetch_price_series(start: str) -> pd.DataFrame:
    """Descarga el cierre diario sin ajustar de todos los tickers en un solo batch."""
    import yfinance as yf

    raw = yf.download(
        list(YF_TICKERS.values()),
        start=start,
        interval="1d",
        auto_adjust=False,
        actions=False,
        group_by="ticker",
        progress=False,
        threads=True,
    )
    if raw is None or raw.empty:
        raise RuntimeError("Yahoo Finance no devolvió datos de precios.")

    frames: dict[str, pd.Series] = {}
    for key, symbol in YF_TICKERS.items():
        try:
            block = raw[symbol] if isinstance(raw.columns, pd.MultiIndex) else raw
            close = block["Close"].dropna()
        except KeyError:
            continue
        if close.empty:
            continue
        close.index = pd.to_datetime(close.index).tz_localize(None).normalize()
        frames[key] = close[~close.index.duplicated(keep="last")]
    return pd.DataFrame(frames)


def build_weekly_frame(prices: pd.DataFrame, fx: pd.Series) -> pd.DataFrame:
    """Une precios y FX, calcula Merval USD y muestrea el último día hábil de cada semana."""
    daily = prices.sort_index().copy()

    fx_daily = fx.reindex(daily.index.union(fx.index)).ffill(limit=5)
    fx_daily = fx_daily.reindex(daily.index)

    if "MERVAL_ARS" in daily.columns:
        daily["MERVAL_USD"] = daily["MERVAL_ARS"] / fx_daily
        # Sin tipo de cambio no hay Merval USD: no se inventa el dato.
        daily.loc[fx_daily.isna(), "MERVAL_USD"] = float("nan")

    daily = daily.ffill(limit=5)
    if daily.empty:
        return daily

    weeks = daily.index.to_period("W-FRI")
    weekly = daily.groupby(weeks).last()
    week_end_dates = pd.Series(daily.index, index=daily.index).groupby(weeks).max()
    weekly.index = pd.DatetimeIndex(week_end_dates.to_numpy())
    return weekly.sort_index()


def _round_value(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), 2)


def _find_synthetic_run(values: list[float | None], limit: int = SYNTHETIC_RUN_LIMIT) -> str | None:
    """
    Detecta tramos de interpolación lineal (segunda diferencia constante ~0).

    Devuelve una descripción del tramo sospechoso o None si la serie parece real.
    """
    clean = [v for v in values if v is not None]
    if len(clean) < limit + 2:
        return None
    run = 1
    for idx in range(2, len(clean)):
        d_prev = clean[idx - 1] - clean[idx - 2]
        d_curr = clean[idx] - clean[idx - 1]
        if abs(d_curr - d_prev) <= max(1e-6, abs(d_prev) * 1e-4):
            run += 1
            if run >= limit:
                return f"{run} pasos consecutivos con segunda diferencia nula (desde el valor {clean[idx - run]})"
        else:
            run = 1
    return None


def validate_payload(dates: list[str], series: dict[str, list[float | None]], today: date) -> list[str]:
    """Aplica los controles de integridad previos a la escritura. Devuelve la lista de errores."""
    errors: list[str] = []
    if len(dates) < MIN_OBSERVATIONS:
        errors.append(f"Serie demasiado corta: {len(dates)} observaciones (< {MIN_OBSERVATIONS}).")

    parsed: list[date] = []
    for raw in dates:
        try:
            parsed.append(datetime.strptime(raw, "%Y-%m-%d").date())
        except ValueError:
            errors.append(f"Fecha inválida: {raw!r}.")
            break
    if parsed and any(b <= a for a, b in zip(parsed, parsed[1:])):
        errors.append("Las fechas no están estrictamente ordenadas.")

    for name, values in series.items():
        if len(values) != len(dates):
            errors.append(f"{name}: {len(values)} valores para {len(dates)} fechas.")
            continue
        valid = [v for v in values if v is not None]
        if not valid:
            errors.append(f"{name}: sin datos válidos.")
            continue
        if any(v <= 0 for v in valid):
            errors.append(f"{name}: contiene precios no positivos.")
        suspect = _find_synthetic_run(values)
        if suspect:
            errors.append(f"{name}: posible serie sintética ({suspect}).")

        last_valid_idx = max(i for i, v in enumerate(values) if v is not None)
        if parsed and (parsed[last_valid_idx] - parsed[0]).days > 365:
            one_year_ago = parsed[last_valid_idx] - timedelta(days=365)
            base_idx = min(
                (i for i, d in enumerate(parsed) if d >= one_year_ago and values[i] is not None),
                default=None,
            )
            if base_idx is not None and base_idx < last_valid_idx:
                base_value = values[base_idx]
                if base_value:
                    ret_pct = (values[last_valid_idx] / base_value - 1.0) * 100.0
                    if abs(ret_pct) > MAX_ABS_1Y_RETURN_PCT:
                        errors.append(f"{name}: retorno 1A implausible ({ret_pct:+.1f}%).")

    for name in CORE_SERIES:
        values = series.get(name) or []
        last_valid = None
        for day, value in zip(parsed, values):
            if value is not None:
                last_valid = day
        if last_valid is not None and (today - last_valid).days > MAX_STALE_DAYS:
            errors.append(
                f"{name}: última observación {last_valid.isoformat()} "
                f"({(today - last_valid).days} días de antigüedad)."
            )

    return errors


def build_payload(existing: dict, weekly: pd.DataFrame, today: date) -> dict:
    """Construye el JSON final preservando los metadatos curados."""
    dates = [idx.strftime("%Y-%m-%d") for idx in weekly.index]
    series: dict[str, list[float | None]] = {}
    for column in weekly.columns:
        series[str(column)] = [_round_value(v) for v in weekly[column].tolist()]

    payload = dict(existing)
    payload["version"] = existing.get("version", "1.0")
    payload["last_updated"] = today.isoformat()
    payload["data_source"] = "Yahoo Finance (close, sin ajuste) + CCL Ámbito"
    payload["sampling"] = "weekly (último día hábil de cada semana ISO)"
    payload["data_series"] = {"dates": dates, **series}
    return payload


def write_atomic(path: Path, payload: dict) -> None:
    """Escribe el JSON de forma atómica (tmp + fsync + os.replace)."""
    tmp_path = path.with_suffix(f"{path.suffix}.tmp_{os.getpid()}")
    try:
        with open(tmp_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=1)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def summarize(weekly: pd.DataFrame, series_names: list[str]) -> str:
    lines = [f"{'Serie':<14}{'Puntos':>8}{'Último':>12}{'1A %':>10}"]
    for name in series_names:
        if name not in weekly.columns:
            continue
        column = weekly[name].dropna()
        if column.empty:
            continue
        one_year_ago = column.index[-1] - timedelta(days=365)
        base = column[column.index >= one_year_ago]
        ret = (column.iloc[-1] / base.iloc[0] - 1.0) * 100.0 if len(base) > 1 else float("nan")
        lines.append(
            f"{name:<14}{len(column):>8}{column.index[-1].date().isoformat():>12}{ret:>9.1f}%"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresca data/historical_indices.json con precios reales.")
    parser.add_argument("--apply", action="store_true", help="Escribe el archivo (por defecto solo simula).")
    parser.add_argument("--start", default=DEFAULT_START, help=f"Fecha inicial (default {DEFAULT_START}).")
    parser.add_argument(
        "--if-stale",
        type=int,
        default=0,
        metavar="DIAS",
        help="No hace nada si el archivo ya tiene datos de los últimos DIAS días.",
    )
    args = parser.parse_args(argv)

    today = datetime.now(timezone.utc).date()
    existing: dict = {}
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as handle:
            existing = json.load(handle)

    existing_dates = existing.get("data_series", {}).get("dates", [])
    if args.if_stale > 0 and existing_dates:
        try:
            age = (today - datetime.strptime(existing_dates[-1], "%Y-%m-%d").date()).days
        except ValueError:
            age = args.if_stale + 1
        if age < args.if_stale:
            print(f"Histórico al día (última observación hace {age} días). Sin cambios.")
            return 0

    print("Descargando precios de Yahoo Finance...")
    prices = fetch_price_series(args.start)
    if prices.empty:
        print("ERROR: no se obtuvieron precios.", file=sys.stderr)
        return 1

    print("Descargando tipo de cambio CCL (Ámbito)...")
    try:
        fx = fetch_fx_series(args.start, today.isoformat())
    except Exception as exc:  # red caída: sin FX no hay Merval USD, pero el resto sirve
        print(f"ADVERTENCIA: no se pudo obtener el CCL ({exc}). Merval USD quedará vacío.", file=sys.stderr)
        fx = pd.Series(dtype="float64")

    weekly = build_weekly_frame(prices, fx)
    if weekly.empty:
        print("ERROR: la serie semanal quedó vacía.", file=sys.stderr)
        return 1

    payload = build_payload(existing, weekly, today)
    series_data = payload["data_series"]
    errors = validate_payload(series_data["dates"], {k: v for k, v in series_data.items() if k != "dates"}, today)

    print()
    print(summarize(weekly, list(series_data.keys())[1:]))
    print()

    if errors:
        print("VALIDACIÓN FALLIDA: no se escribió nada.", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"Validación OK: {len(series_data['dates'])} semanas, última {series_data['dates'][-1]}.")
    if not args.apply:
        print("Simulación: usá --apply para escribir el archivo.")
        return 0

    write_atomic(DATA_FILE, payload)
    print(f"Escrito: {DATA_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
