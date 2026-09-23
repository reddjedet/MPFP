"""
Suite de Pruebas Automatizadas para el Subsistema de Caché de Mercado (CACHE-01, CACHE-02).
Verifica persistencia L1/L2 en SQLite, claves canónicas SHA-256, TTL granular, desalojo y resiliencia.
"""

import os
import shutil
import tempfile
import threading
import time
import unittest
from datetime import datetime
from pathlib import Path

import pandas as pd

from services.cache_service import (
    DISK_CACHE_FILE,
    MarketCacheStore,
    _deserialize_value,
    _load_disk_cache,
    _save_disk_cache,
    _serialize_value,
    clear_market_cache,
    generate_canonical_cache_key,
    get_market_cache_store,
    get_market_ttl,
    purge_market_cache,
    set_cache_db_path,
    smart_cache,
)


class TestCacheService(unittest.TestCase):
    """Pruebas unitarias y de integración para el servicio de caché."""

    def setUp(self):
        # Aislamiento de base de datos para pruebas
        self.temp_dir = tempfile.mkdtemp()
        self.test_db_path = Path(self.temp_dir) / "test_cache.db"
        self.store = set_cache_db_path(self.test_db_path)

    def tearDown(self):
        # Restaurar singleton por defecto y limpiar directorio temporal
        set_cache_db_path(None)
        try:
            shutil.rmtree(self.temp_dir)
        except Exception:
            pass

    # =========================================================================
    # 1. Pruebas de TTL Granular (CACHE-01)
    # =========================================================================

    def test_static_ttl(self):
        """Verifica que fichas técnicas y calendarios tengan 24h de TTL."""
        self.assertEqual(get_market_ttl("static"), 86400)
        self.assertEqual(get_market_ttl("calendar"), 86400)
        self.assertEqual(get_market_ttl("calendars"), 86400)

    def test_historical_ttl(self):
        """Verifica que series históricas tengan 4h de TTL."""
        self.assertEqual(get_market_ttl("historical"), 14400)

    def test_slow_metrics_ttl(self):
        """Verifica que métricas fundamentales lentas tengan 1h de TTL."""
        self.assertEqual(get_market_ttl("slow_metrics"), 3600)
        self.assertEqual(get_market_ttl("metrics"), 3600)

    def test_market_dependent_ttls(self):
        """Verifica que intraday, realtime y market_data devuelvan valores válidos según horario."""
        ttl_intraday = get_market_ttl("intraday")
        self.assertIn(ttl_intraday, [60, 43200])

        ttl_realtime = get_market_ttl("realtime")
        self.assertIn(ttl_realtime, [180, 43200])

        ttl_market_data = get_market_ttl("market_data")
        self.assertIn(ttl_market_data, [300, 43200])

    def test_explicit_numeric_ttl(self):
        """Verifica el soporte para TTL numérico en segundos."""
        self.assertEqual(get_market_ttl(45), 45)
        self.assertEqual(get_market_ttl(120.5), 120)
        self.assertEqual(get_market_ttl(0), 1)  # Mínimo 1 segundo

    # =========================================================================
    # 2. Pruebas de Claves Canónicas SHA-256 (CACHE-02)
    # =========================================================================

    def test_canonical_key_pos_and_kwarg_invariance(self):
        """Verifica que f(1, 2) y f(a=1, b=2) generen exactamente la misma clave SHA-256."""
        def dummy_func(a, b):
            return a + b

        key1 = generate_canonical_cache_key(dummy_func, (1, 2), {})
        key2 = generate_canonical_cache_key(dummy_func, (), {"a": 1, "b": 2})
        key3 = generate_canonical_cache_key(dummy_func, (), {"b": 2, "a": 1})
        key4 = generate_canonical_cache_key(dummy_func, (1,), {"b": 2})

        self.assertEqual(key1, key2)
        self.assertEqual(key2, key3)
        self.assertEqual(key1, key4)
        self.assertTrue(key1.startswith("dummy_func:"))
        self.assertEqual(len(key1.split(":")[1]), 64)  # SHA-256 hex digest

    def test_canonical_key_defaults_invariance(self):
        """Verifica que invocar omitiendo un parámetro con valor por defecto genere la misma clave."""
        def sample_def(x, mode="fast", retry=3):
            return x

        key_omitted = generate_canonical_cache_key(sample_def, (10,), {})
        key_explicit = generate_canonical_cache_key(sample_def, (10,), {"mode": "fast", "retry": 3})
        key_mixed = generate_canonical_cache_key(sample_def, (10, "fast"), {"retry": 3})

        self.assertEqual(key_omitted, key_explicit)
        self.assertEqual(key_explicit, key_mixed)

    def test_canonical_key_nested_dict_ordering(self):
        """Verifica que diccionarios con claves en distinto orden generen la misma clave."""
        def dict_receiver(config):
            return config

        d1 = {"z": 100, "a": 1, "nested": {"y": 2, "x": 1}}
        d2 = {"a": 1, "z": 100, "nested": {"x": 1, "y": 2}}

        k1 = generate_canonical_cache_key(dict_receiver, (d1,), {})
        k2 = generate_canonical_cache_key(dict_receiver, (d2,), {})

        self.assertEqual(k1, k2)

    def test_canonical_key_different_inputs(self):
        """Verifica que argumentos diferentes generen claves distintas (inmunes a colisiones)."""
        def math_op(x, y):
            return x * y

        k1 = generate_canonical_cache_key(math_op, (2, 3), {})
        k2 = generate_canonical_cache_key(math_op, (3, 2), {})
        k3 = generate_canonical_cache_key(math_op, (2, 4), {})

        self.assertNotEqual(k1, k2)
        self.assertNotEqual(k1, k3)

    # =========================================================================
    # 3. Pruebas de Persistencia L1/L2 y smart_cache (CACHE-01)
    # =========================================================================

    def test_smart_cache_decorator_l1_and_l2(self):
        """Verifica ciclo de vida de smart_cache: ejecución inicial, hit en L1 y recuperación desde SQLite L2."""
        calls = 0

        @smart_cache("static")
        def multiplier(x: int) -> int:
            nonlocal calls
            calls += 1
            return x * 3

        # Primera llamada: Miss -> Ejecución real
        res1 = multiplier(4)
        self.assertEqual(res1, 12)
        self.assertEqual(calls, 1)

        # Segunda llamada: Hit L1 -> No re-ejecuta
        res2 = multiplier(4)
        self.assertEqual(res2, 12)
        self.assertEqual(calls, 1)

        # Invalidar caché en memoria L1
        multiplier.invalidate_l1()
        self.assertEqual(len(multiplier._l1_cache), 0)

        # Tercera llamada: Hit L2 (SQLite) -> No re-ejecuta y rehidrata L1
        res3 = multiplier(4)
        self.assertEqual(res3, 12)
        self.assertEqual(calls, 1)
        self.assertEqual(len(multiplier._l1_cache), 1)

    def test_dataframe_caching_roundtrip(self):
        """Verifica serialización, persistencia en SQLite y reconstrucción exacta de DataFrames."""
        call_count = 0

        @smart_cache("historical")
        def fetch_dataframe(symbol: str) -> pd.DataFrame:
            nonlocal call_count
            call_count += 1
            return pd.DataFrame([
                {"symbol": symbol, "price": 105.5, "volume": 1000},
                {"symbol": symbol, "price": 107.0, "volume": 1500}
            ])

        df1 = fetch_dataframe("GGAL")
        self.assertIsInstance(df1, pd.DataFrame)
        self.assertEqual(len(df1), 2)
        self.assertEqual(df1.iloc[0]["price"], 105.5)
        self.assertEqual(call_count, 1)

        # Modificación local en el cliente no debe mutar la caché
        df1["price"] = 999.9

        # Segunda llamada desde caché
        df2 = fetch_dataframe("GGAL")
        self.assertEqual(call_count, 1)
        self.assertEqual(df2.iloc[0]["price"], 105.5)

        # Invalida L1 y recupera de SQLite L2
        fetch_dataframe.invalidate_l1()
        df3 = fetch_dataframe("GGAL")
        self.assertEqual(call_count, 1)
        self.assertEqual(df3.iloc[0]["price"], 105.5)

    def test_fallback_to_stale_value_on_none(self):
        """Verifica fallback al último valor conocido si el proveedor devuelve None o falla."""
        should_fail = False

        @smart_cache("realtime")
        def flaky_service(ticker: str):
            if should_fail:
                return None
            return {"ticker": ticker, "price": 250.0}

        # 1. Llamada exitosa inicial
        v1 = flaky_service("AAPL")
        self.assertEqual(v1["price"], 250.0)

        # 2. El proveedor ahora falla (devuelve None)
        should_fail = True
        v2 = flaky_service("AAPL")
        self.assertIsNotNone(v2)
        self.assertEqual(v2["price"], 250.0)

        # 3. Proveedor falla y L1 vaciado -> Recupera stale de L2
        flaky_service.invalidate_l1()
        v3 = flaky_service("AAPL")
        self.assertIsNotNone(v3)
        self.assertEqual(v3["price"], 250.0)

    # =========================================================================
    # 4. Pruebas de Desalojo y Mantenimiento SQLite (CACHE-01)
    # =========================================================================

    def test_purge_expired_records(self):
        """Verifica la purga automática de registros vencidos con WHERE expires_at < now."""
        now = time.time()
        # Insertar 2 registros vencidos y 1 activo
        self.store.set("key_old_1", "test_fn", "realtime", {"a": 1}, ttl=10, now=now - 100)
        self.store.set("key_old_2", "test_fn", "realtime", {"a": 2}, ttl=10, now=now - 50)
        self.store.set("key_active", "test_fn", "realtime", {"a": 3}, ttl=3600, now=now)

        purged = self.store.purge_expired(now=now)
        self.assertEqual(purged, 2)

        # Solo debe persistir el activo
        self.assertIsNone(self.store.get("key_old_1", now=now))
        self.assertIsNone(self.store.get("key_old_2", now=now))
        self.assertIsNotNone(self.store.get("key_active", now=now))

    def test_lru_eviction_policy(self):
        """Verifica la política de desalojo LRU por capacidad de filas."""
        now = time.time()
        for i in range(5):
            self.store.set(f"k_{i}", "fn", "static", i, ttl=3600, now=now + i)

        # Forzar límite de 3 filas
        evicted = self.store.enforce_lru(max_entries=3)
        self.assertEqual(evicted, 2)

        stats = self.store.stats(now=now)
        self.assertEqual(stats["total_entries"], 3)
        # Los registros más antiguos (k_0, k_1) deben haber sido eliminados
        self.assertIsNone(self.store.get("k_0", now=now))
        self.assertIsNone(self.store.get("k_1", now=now))
        self.assertIsNotNone(self.store.get("k_4", now=now))

    def test_clear_and_stats(self):
        """Verifica limpieza selectiva y diagnóstico de estadísticas de la caché."""
        self.store.set("k1", "fn_a", "static", 1, ttl=100)
        self.store.set("k2", "fn_b", "historical", 2, ttl=100)
        self.store.set("k3", "fn_a", "realtime", 3, ttl=100)

        stats_before = self.store.stats()
        self.assertEqual(stats_before["total_entries"], 3)
        self.assertEqual(stats_before["categories"]["static"], 1)

        # Limpiar solo categoría "historical"
        deleted = self.store.clear(category="historical")
        self.assertEqual(deleted, 1)

        stats_after = self.store.stats()
        self.assertEqual(stats_after["total_entries"], 2)
        self.assertNotIn("historical", stats_after["categories"])

    # =========================================================================
    # 5. Pruebas de Concurrencia y Retrocompatibilidad
    # =========================================================================

    def test_multithreaded_concurrency(self):
        """Verifica que múltiples hilos operen simultáneamente sin bloqueo o corrupción."""
        calls = 0
        lock = threading.Lock()

        @smart_cache("static")
        def heavy_calc(item_id: int):
            nonlocal calls
            with lock:
                calls += 1
            time.sleep(0.01)
            return item_id ** 2

        results = []

        def worker(num):
            res = heavy_calc(num)
            results.append(res)

        threads = [threading.Thread(target=worker, args=(5,)) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(results), 10)
        self.assertTrue(all(r == 25 for r in results))
        self.assertEqual(calls, 1)  # Solo una ejecución gracias al bloqueo de caché

    def test_backward_compatibility_shims(self):
        """Verifica que las constantes y funciones legacy sigan expuestas para no romper código previo."""
        self.assertIsInstance(DISK_CACHE_FILE, Path)
        self.assertIsInstance(_load_disk_cache(), dict)
        # Invocación sin excepciones
        _save_disk_cache({"test": {}})


if __name__ == "__main__":
    unittest.main()
