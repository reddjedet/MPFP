"""
Integridad del histórico de índices (INC: serie sintética en `historical_indices.json`).

Contexto: el archivo llegó a contener tramos lineales perfectos (interpolación)
que inflaban niveles y retornos. Por ejemplo, el EWZ mostraba +8.33% en 1 año
cuando el valor real de precio era +4.14%.

Estos tests fijan dos invariantes:
1. El archivo publicado contiene mercado real, no una recta.
2. El script de refresco rechaza payloads sintéticos antes de escribirlos.
"""

import importlib.util
import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

from services import market_indices_service as svc

REPO_ROOT = Path(__file__).resolve().parent.parent
INDICES_FILE = REPO_ROOT / "data" / "historical_indices.json"

# Cierres históricos inmutables: si el refresco trae otra cosa, la fuente cambió.
KNOWN_CLOSES = {
    "EWZ": ("2025-08-29", 29.50),
    "SP500": ("2025-08-29", 6460.26),
    "IBOVESPA_BRL": ("2025-08-29", 141422.0),
}


def _refresh_module():
    """Importa `scripts/refresh_historical_indices.py` sin depender de sys.path."""
    path = REPO_ROOT / "scripts" / "refresh_historical_indices.py"
    spec = importlib.util.spec_from_file_location("refresh_historical_indices", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def raw_data():
    with open(INDICES_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def test_series_are_aligned_with_dates(raw_data):
    series = raw_data["data_series"]
    dates = series["dates"]
    assert len(dates) >= 500
    for name, values in series.items():
        if name == "dates":
            continue
        assert len(values) == len(dates), f"{name} desalineada con el eje de fechas"


def test_dates_are_strictly_increasing(raw_data):
    dates = [datetime.strptime(d, "%Y-%m-%d") for d in raw_data["data_series"]["dates"]]
    assert all(b > a for a, b in zip(dates, dates[1:]))


def test_no_synthetic_stretches(raw_data):
    """Una serie de mercado no puede tener 6+ segundas diferencias idénticas seguidas."""
    refresh = _refresh_module()
    series = raw_data["data_series"]
    for name, values in series.items():
        if name == "dates":
            continue
        assert refresh._find_synthetic_run(values) is None, f"{name} contiene un tramo interpolado"


@pytest.mark.parametrize("ticker,expected", KNOWN_CLOSES.items())
def test_known_historical_closes(raw_data, ticker, expected):
    date_str, expected_close = expected
    series = raw_data["data_series"]
    index = series["dates"].index(date_str)
    assert series[ticker][index] == pytest.approx(expected_close, rel=0.01)


def test_published_data_is_not_older_than_the_last_refresh(raw_data):
    last_date = datetime.strptime(raw_data["data_series"]["dates"][-1], "%Y-%m-%d").date()
    last_updated = datetime.strptime(raw_data["last_updated"], "%Y-%m-%d").date()
    assert last_updated >= last_date


def test_validate_rejects_synthetic_payload():
    """El validador debe bloquear exactamente el bug original (recta perfecta)."""
    refresh = _refresh_module()
    start = datetime(2024, 1, 5)
    dates = [(start + timedelta(weeks=i)).strftime("%Y-%m-%d") for i in range(600)]
    synthetic = [round(100.0 + i * 0.25, 2) for i in range(600)]

    errors = refresh.validate_payload(dates, {"EWZ": synthetic}, datetime(2026, 11, 2).date())

    assert any("sintética" in error for error in errors)


def test_history_exposes_data_as_of():
    response = svc.get_indices_history(region="br", period="1y", currency="usd")
    assert response["data_as_of"] is not None
    assert isinstance(response["stale_days"], int)
    assert response["stale_days"] >= 0


def test_volatility_annualization_uses_real_sampling_frequency():
    """
    Con muestreo semanal el factor debe ser sqrt(52), no sqrt(252).

    Retornos ±1% alternados => desvío semanal ≈ 1%; anualizado ≈ 7.2%.
    El factor viejo (sqrt(252)) habría dado ≈ 15.9%.
    """
    index = pd.date_range("2024-01-05", periods=120, freq="W-FRI")
    prices = [100.0]
    for i in range(1, len(index)):
        prices.append(prices[-1] * (1.01 if i % 2 else 0.99))

    metrics = svc.calculate_series_metrics(pd.Series(prices, index=index))

    assert metrics["annualized_volatility_pct"] == pytest.approx(7.2, abs=0.4)
