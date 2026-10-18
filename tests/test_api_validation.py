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
    Los nombres originales archivados quedan libres, pero el identificador
    `nombre_borrada` de la papelera sigue reservado.
    """
    payload = {
        "bal": {"mode": "weights", "assets": {"AAPL": 100.0}},
        "valida": {"mode": "weights", "assets": {"AAPL": 100.0}},
        "valida_borrada": {"mode": "weights", "assets": {"AAPL": 100.0}},
    }
    content = json.dumps(payload).encode("utf-8")
    files = {"file": ("portfolios.json", io.BytesIO(content), "application/json")}

    previous_pfs = load_portfolios()
    previous_trash = ps.load_portfolios_trash()
    try:
        pfs_before = load_portfolios()
        pfs_before.pop("bal", None)
        pfs_before.pop("valida", None)
        pfs_before.pop("valida_borrada", None)
        save_portfolios(pfs_before)
        # El escenario no depende de entradas previas en la papelera.
        save_portfolios_trash([{
            "id": "valida_borrada",
            "name": "valida_borrada",
            "original_name": "valida",
        }])

        r = client.post("/api/portfolios/import_json", files=files)
        assert r.status_code == 200
        body = r.json()
        pfs = load_portfolios()
        # El nombre original y `bal` ya están libres; la clave archivada no.
        assert "bal" in pfs
        assert "valida" in pfs
        assert "valida_borrada" not in pfs
        assert "valida_borrada" in body["skipped"]
    finally:
        save_portfolios(previous_pfs)
        save_portfolios_trash(previous_trash)


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
