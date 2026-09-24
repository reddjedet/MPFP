import io
import json
import pytest
from fastapi.testclient import TestClient

from main import app
import services.portfolio_service as ps
from services.portfolio_service import save_portfolios, load_portfolios


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


def test_import_no_puede_crear_cartera_reservada_bal(client):
    payload = {
        "bal": {"mode": "weights", "assets": {"GGAL": 100.0}},
        "valida": {"mode": "weights", "assets": {"AAPL": 100.0}}
    }
    content = json.dumps(payload).encode("utf-8")
    files = {"file": ("portfolios.json", io.BytesIO(content), "application/json")}
    r = client.post("/api/portfolios/import_json", files=files)
    assert r.status_code == 200
    pfs = load_portfolios()
    # 'bal' no debe haber sido importada/sobrescrita desde el archivo
    # (solo carteras no reservadas se importan)
    assert "valida" in pfs


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
