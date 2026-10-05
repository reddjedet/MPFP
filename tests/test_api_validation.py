import io
import json
import pytest
from fastapi.testclient import TestClient

from main import app
import services.portfolio_service as ps
from services.portfolio_service import (
    load_portfolios,
    save_portfolios,
    save_portfolios_trash,
)


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def test_bulk_update_con_nominals_no_numerico_devuelve_422(client):
    r = client.post("/api/rotation/holdings/bulk_update", json={
        "portfolio": "bmb",
        "holdings": {"GGAL": {"nominals": "abc", "ppc": 100}}
    })
    assert r.status_code == 422


def test_bulk_update_con_ppc_no_numerico_devuelve_422(client):
    r = client.post("/api/rotation/holdings/bulk_update", json={
        "portfolio": "bmb",
        "holdings": {"GGAL": {"nominals": 10, "ppc": "xyz"}}
    })
    assert r.status_code == 422


def test_bulk_update_con_nominals_fraccional_devuelve_422(client):
    r = client.post("/api/rotation/holdings/bulk_update", json={
        "portfolio": "bmb",
        "holdings": {"GGAL": {"nominals": 10.7, "ppc": 100}}
    })
    assert r.status_code == 422


def test_bulk_update_valido_devuelve_200(client):
    r = client.post("/api/rotation/holdings/bulk_update", json={
        "portfolio": "bmb",
        "holdings": {"GGAL": {"nominals": 10, "ppc": 100.0}},
        "cash_ars": 1500.0
    })
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["data"]["cash_ars"] == 1500.0
    assert data["data"]["holdings"]["GGAL"]["nominals"] == 10


def test_import_crea_bal_porque_ya_no_esta_reservada(client):
    """
    `bal` ya no es un nombre protegido: lo único que bloquea es que exista una
    cartera viva o una entrada en la papelera con ese nombre.
    """
    payload = {
        "bal": {"mode": "weights", "assets": {"AAPL": 100.0}},
        "valida": {"mode": "weights", "assets": {"AAPL": 100.0}}
    }
    content = json.dumps(payload).encode("utf-8")
    files = {"file": ("portfolios.json", io.BytesIO(content), "application/json")}

    # El estado de la papelera debe ser parte del escenario del test y no
    # depender de que exista en el snapshot de datos del entorno.
    save_portfolios_trash([{"id": "valida", "name": "valida"}])

    r = client.post("/api/portfolios/import_json", files=files)
    assert r.status_code == 200
    body = r.json()
    pfs = load_portfolios()
    # `bal` ya no está reservada: se importa.
    assert "bal" in pfs
    # `valida` sigue en la papelera, así que su nombre está reservado y se omite,
    # pero el endpoint lo informa en vez de descartarlo en silencio.
    assert "valida" not in pfs
    assert "valida" in body["skipped"]


def test_create_json_no_sobrescribe_cartera_existente(client):
    # Guardar una cartera previa
    pfs = load_portfolios()
    pfs["mi_cartera_test"] = {"mode": "weights", "assets": {"GGAL": 50.0, "YPF": 50.0}}
    save_portfolios(pfs)

    r = client.post("/api/portfolios/create_json", json={
        "name": "mi_cartera_test",
        "mode": "weights",
        "weights_str": "AAPL: 100"
    })
    assert r.status_code == 409
    assert "Ya existe un portfolio" in r.json()["error"]
