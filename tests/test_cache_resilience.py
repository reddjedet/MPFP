import sqlite3
from pathlib import Path
import pytest
import services.cache_service as cs


def test_cache_no_propaga_error_de_sqlite(monkeypatch, tmp_path):
    store = cs.MarketCacheStore(tmp_path / "x.db")
    def boom(*a, **k):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(store, "get", boom)
    monkeypatch.setattr(store, "get_stale", boom)
    monkeypatch.setattr(cs, "_default_market_store", store)

    @cs.smart_cache("realtime")
    def f(x):
        return {"v": x}

    # Debe funcionar sin propagar error
    assert f(1) == {"v": 1}


def test_cache_degrada_a_stale_si_el_proveedor_falla(tmp_path, monkeypatch):
    store = cs.MarketCacheStore(tmp_path / "stale.db")
    monkeypatch.setattr(cs, "_default_market_store", store)

    calls = 0

    @cs.smart_cache("realtime")
    def unreliable_feed(x):
        nonlocal calls
        calls += 1
        if calls > 1:
            raise RuntimeError("Upstream provider offline")
        return {"val": x}

    # Primera llamada exitosa puebla el caché
    assert unreliable_feed("foo") == {"val": "foo"}

    # Invalida L1 para forzar búsqueda L2
    unreliable_feed.invalidate_l1()

    # Segunda llamada falla upstream pero rescata stale de L2
    assert unreliable_feed("foo") == {"val": "foo"}


def test_cache_devuelve_none_si_no_hay_stale(tmp_path, monkeypatch):
    store = cs.MarketCacheStore(tmp_path / "none.db")
    monkeypatch.setattr(cs, "_default_market_store", store)

    @cs.smart_cache("realtime")
    def always_fails(x):
        raise RuntimeError("Always fails")

    assert always_fails("bar") is None
