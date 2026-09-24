import json
import threading
from pathlib import Path
import pytest

import services.atomic_persistence as ap
import services.portfolio_service as ps
from services.rotation_service import save_user_holdings, load_user_holdings


# Bug 6: load() que falla no debe tumbar __init__/_bootstrap_if_needed
def test_bootstrap_no_revienta_si_load_falla(tmp_path):
    class BoomStore:
        lock = threading.RLock()
        def load(self): raise RuntimeError("simulated read failure")
        def save(self, d): pass

    p = tmp_path / "foo.json"
    p.write_text('{"a": 1}', encoding="utf-8")
    db = ap.AtomicJsonDatabase(p)
    db._store = BoomStore()
    # No debe levantar UnboundLocalError
    db._bootstrap_if_needed()


def test_bootstrap_no_sobrescribe_tabla_con_valores_falsy(tmp_path):
    p = tmp_path / "empty_vals.json"
    p.write_text('{"cartera_vacia": {}}', encoding="utf-8")
    example = tmp_path / "empty_vals.json.example"
    example.write_text('{"example": {"default": 1}}', encoding="utf-8")

    db = ap.AtomicJsonDatabase(p)
    # Si la tabla ya tiene {"cartera_vacia": {}}, no debe considerarse vacía para sobreescribir con example
    db._store.save({"cartera_vacia": {}})
    db._bootstrap_if_needed()
    assert db._store.load() == {"cartera_vacia": {}}


# Bug 4: migración preserva assets y asset_allocation
def test_migracion_portfolio_con_assets_sin_mode_no_anida(tmp_path):
    orig_db = ps._db
    try:
        ps._db = ap.AtomicJsonDatabase(tmp_path / "portfolios_test.json")
        ps._db.save({
            "conservador": {
                "assets": {"GGAL": 20.0, "YPF": 30.0},
                "asset_allocation": {"equity_weight": 100.0}
            }
        })
        loaded = ps.load_portfolios()
        assert "conservador" in loaded
        assert loaded["conservador"]["mode"] == "weights"
        assert loaded["conservador"]["assets"] == {"GGAL": 20.0, "YPF": 30.0}
        assert loaded["conservador"]["asset_allocation"] == {"equity_weight": 100.0}
    finally:
        ps._db = orig_db


def test_migracion_portfolio_plano_legacy_sigue_funcionando(tmp_path):
    orig_db = ps._db
    try:
        ps._db = ap.AtomicJsonDatabase(tmp_path / "portfolios_legacy.json")
        ps._db.save({
            "mi_cartera": {"GGAL": 50.0, "YPF": 50.0}
        })
        loaded = ps.load_portfolios()
        assert loaded["mi_cartera"]["mode"] == "weights"
        assert loaded["mi_cartera"]["assets"] == {"GGAL": 50.0, "YPF": 50.0}
    finally:
        ps._db = orig_db


# Bug 3: bulk_update sin cash_ars conserva el cash existente
def test_bulk_update_sin_cash_conserva_saldo():
    target = "test_cash_pf"
    # Inicializar cartera con cash
    save_user_holdings({"holdings": {"GGAL": {"nominals": 10, "ppc": 1000.0}}, "cash_ars": 50000.0}, portfolio_key=target)
    assert load_user_holdings(target)["cash_ars"] == 50000.0

    # Guardar tenencias sin cash_ars en payload
    save_user_holdings({"holdings": {"GGAL": {"nominals": 15, "ppc": 1100.0}}}, portfolio_key=target)
    updated = load_user_holdings(target)
    assert updated["cash_ars"] == 50000.0
    assert updated["holdings"]["GGAL"]["nominals"] == 15


def test_bulk_update_con_cash_0_explicito_pone_a_cero():
    target = "test_cash_zero_pf"
    save_user_holdings({"holdings": {}, "cash_ars": 50000.0}, portfolio_key=target)
    assert load_user_holdings(target)["cash_ars"] == 50000.0

    save_user_holdings({"holdings": {}, "cash_ars": 0.0}, portfolio_key=target)
    assert load_user_holdings(target)["cash_ars"] == 0.0


# Bug 15: load_portfolios siempre sembrar bmb si falta
def test_load_portfolios_siempre_sembrar_bmb_si_falta(tmp_path):
    orig_db = ps._db
    try:
        ps._db = ap.AtomicJsonDatabase(tmp_path / "portfolios_no_bmb.json")
        ps._db.save({"otra_cartera": {"mode": "weights", "assets": {"AAPL": 100.0}}})
        loaded = ps.load_portfolios()
        assert "bmb" in loaded
        assert "otra_cartera" in loaded
    finally:
        ps._db = orig_db
