"""
Test Suite: Persistencia SQLite, Concurrencia y Resiliencia (DATA-01, DATA-02, DATA-03)
MPFP (Máquina de Planes, Finanzas y Portfolios)
"""

import copy
import multiprocessing
import os
import sqlite3
import tempfile
import time
import unittest
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from services.sqlite_persistence import (
    DEFAULT_DB_PATH,
    DatabaseCorruptionError,
    PersistenceError,
    SQLiteEngine,
    SQLiteTableStore,
    get_sqlite_store,
)
from services.atomic_persistence import AtomicJsonDatabase


def _concurrency_worker(db_path_str: str, worker_id: int, iterations: int):
    """Función independiente para ejecutar escrituras y lecturas concurrentes entre procesos."""
    store = SQLiteTableStore(table_name="ppc_values", db_path=db_path_str)
    for i in range(iterations):
        ticker = f"TICKER_{worker_id}_{i}"
        price = 100.0 + (worker_id * 10) + i
        # Inserción atómica individual concurrente sin condiciones de carrera
        store.set_item(ticker, price)
        # Verificar lectura individual inmediata
        val = store.get_item(ticker)
        if val != price:
            return False
    return True


class TestSQLitePersistence(unittest.TestCase):
    def setUp(self):
        self._tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp_dir.name)
        self.db_path = self.tmp_path / "test_mpfp.db"
        self.engine = SQLiteEngine(self.db_path)

    def tearDown(self):
        self._tmp_dir.cleanup()

    # --------------------------------------------------------------------------
    # DATA-01: Concurrencia Multiproceso y WAL Mode
    # --------------------------------------------------------------------------

    def test_data_01_wal_mode_and_pragmas(self):
        """Verifica que SQLite active el modo WAL y los PRAGMAs de protección."""
        with self.engine.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode;")
            journal_mode = cur.fetchone()[0]
            self.assertEqual(journal_mode.lower(), "wal")

            cur.execute("PRAGMA foreign_keys;")
            fk = cur.fetchone()[0]
            self.assertEqual(fk, 1)

            cur.execute("PRAGMA busy_timeout;")
            timeout = cur.fetchone()[0]
            self.assertGreaterEqual(timeout, 5000)

    def test_data_01_multiprocess_concurrent_writes(self):
        """
        DATA-01: Comprueba que múltiples procesos del sistema operativo puedan escribir
        y leer simultáneamente sin bloqueos fatales ni pérdida de transacciones.
        """
        num_workers = 3
        iterations = 5

        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            futures = [
                executor.submit(_concurrency_worker, str(self.db_path), wid, iterations)
                for wid in range(num_workers)
            ]
            for future in as_completed(futures):
                result = future.result()
                self.assertTrue(result, "Un proceso worker falló en concurrencia multi-proceso.")

        # Verificar que todos los registros de todos los workers estén presentes
        store = SQLiteTableStore(table_name="ppc_values", db_path=self.db_path)
        final_data = store.load()
        for wid in range(num_workers):
            for i in range(iterations):
                expected_tk = f"TICKER_{wid}_{i}"
                expected_price = 100.0 + (wid * 10) + i
                self.assertIn(expected_tk, final_data)
                self.assertEqual(final_data[expected_tk], expected_price)

    # --------------------------------------------------------------------------
    # DATA-02: Prevención de Recuperación Destructiva
    # --------------------------------------------------------------------------

    def test_data_02_no_destructive_reset_on_corruption(self):
        """
        DATA-02: Garantiza que un error o corrupción no sobreescriba silenciosamente
        los datos de usuario con estados vacíos o defaults.
        """
        store = SQLiteTableStore(table_name="portfolios", db_path=self.db_path)
        valid_pf = {
            "bmb": {
                "mode": "weights",
                "assets": {"AAPL": 50.0, "GOOGL": 50.0}
            }
        }
        store.save(valid_pf)
        self.assertEqual(store.load(), valid_pf)

        # Simular base de datos inaccesible o archivo con bytes inválidos
        corrupt_db_path = self.tmp_path / "corrupt.db"
        with open(corrupt_db_path, "wb") as f:
            f.write(b"NOT_A_VALID_SQLITE_DATABASE_HEADER_000000000000")

        # Debe fallar con DatabaseCorruptionError / PersistenceError y NO resetear a defaults vacíos
        with self.assertRaises((PersistenceError, DatabaseCorruptionError, sqlite3.DatabaseError)):
            SQLiteTableStore(table_name="portfolios", db_path=corrupt_db_path)


    # --------------------------------------------------------------------------
    # DATA-03: Atomicidad Transaccional, Durabilidad y Rollback
    # --------------------------------------------------------------------------

    def test_data_03_transactional_rollback(self):
        """
        DATA-03: Demuestra que ante una excepción no controlada dentro de una transacción,
        se ejecuta ROLLBACK completo y la base queda idéntica a su estado previo.
        """
        store = SQLiteTableStore(table_name="fair_values", db_path=self.db_path)
        store.save({"AAPL": 220.0, "NVDA": 130.0})

        # Intentar una transacción multi-instrucción fallida
        try:
            with self.engine.transaction() as conn:
                conn.execute("INSERT INTO fair_values (ticker, value_usd, updated_at) VALUES ('MSFT', 450.0, '2026-09-23');")
                # Provocar un error forzado
                raise ValueError("Interrupción simulada a mitad de la operación")
        except PersistenceError:
            pass

        # Verificar que MSFT no fue persistido
        data_after = store.load()
        self.assertNotIn("MSFT", data_after)
        self.assertIn("AAPL", data_after)
        self.assertIn("NVDA", data_after)

    def test_data_03_schema_migrations_version(self):
        """Verifica que la tabla schema_migrations y PRAGMA user_version estén en v1."""
        with self.engine.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA user_version;")
            v = cur.fetchone()[0]
            self.assertGreaterEqual(v, 1)

            cur.execute("SELECT version, name FROM schema_migrations WHERE version = 1;")
            row = cur.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["name"], "initial_sqlite_schema")

    # --------------------------------------------------------------------------
    # CRUD de Entidades Estructuradas
    # --------------------------------------------------------------------------

    def test_portfolios_crud(self):
        store = SQLiteTableStore(table_name="portfolios", db_path=self.db_path)
        test_pf = {
            "p1": {"mode": "weights", "assets": {"CAT": 60.0, "DE": 40.0}},
            "p2": {"mode": "shares", "assets": {"AAPL": 10, "MSFT": 5}}
        }
        store.save(test_pf)
        loaded = store.load()
        self.assertEqual(loaded, test_pf)

        # Actualizar eliminando p2 y agregando p3
        updated_pf = {
            "p1": {"mode": "weights", "assets": {"CAT": 100.0}},
            "p3": {"mode": "weights", "assets": {"VIST": 100.0}}
        }
        store.save(updated_pf)
        reloaded = store.load()
        self.assertEqual(reloaded, updated_pf)
        self.assertNotIn("p2", reloaded)

    def test_portfolios_trash_crud(self):
        store = SQLiteTableStore(table_name="portfolios_trash", db_path=self.db_path)
        trash_data = [
            {"id": "del_1", "name": "del_1", "data": {}, "deleted_at": "2026-09-23T01:00:00", "asset_count": 2, "mode": "weights"},
            {"id": "del_2", "name": "del_2", "data": {}, "deleted_at": "2026-09-23T02:00:00", "asset_count": 1, "mode": "weights"}
        ]
        store.save(trash_data)
        loaded = store.load()
        self.assertEqual(len(loaded), 2)
        self.assertEqual(loaded[0]["id"], "del_1")
        self.assertEqual(loaded[1]["id"], "del_2")

    def test_user_holdings_and_cash_crud(self):
        store = SQLiteTableStore(table_name="user_holdings", db_path=self.db_path)
        holdings_data = {
            "bmb": {
                "holdings": {"CAT": {"nominals": 2, "ppc": 45000.0}},
                "fixed_income_holdings": {"S30S6": {"nominals": 300000, "ppc": 112.5}},
                "cash_ars": 15000.5
            }
        }
        store.save(holdings_data)
        loaded = store.load()
        self.assertIn("bmb", loaded)
        self.assertEqual(loaded["bmb"]["cash_ars"], 15000.5)
        self.assertEqual(loaded["bmb"]["holdings"]["CAT"]["nominals"], 2)
        self.assertEqual(loaded["bmb"]["holdings"]["CAT"]["ppc"], 45000.0)
        self.assertEqual(loaded["bmb"]["fixed_income_holdings"]["S30S6"]["nominals"], 300000)

    def test_cedear_ratios_and_earnings(self):
        ratios_store = SQLiteTableStore(table_name="cedear_ratios", db_path=self.db_path)
        ratios_store.save({"AAPL": 10.0, "SPY": 20.0})
        self.assertEqual(ratios_store.load(), {"AAPL": 10.0, "SPY": 20.0})

        earn_store = SQLiteTableStore(table_name="earnings_calendar", db_path=self.db_path)
        earn_data = {
            "NVDA": {"company": "NVIDIA", "confirmed_date": "2026-08-20", "confirmed": True}
        }
        earn_store.save(earn_data)
        loaded_earn = earn_store.load()
        self.assertIn("NVDA", loaded_earn)
        self.assertEqual(loaded_earn["NVDA"]["confirmed_date"], "2026-08-20")

    def test_key_value_store_and_atomic_json_facade(self):
        """Prueba la fachada AtomicJsonDatabase conectada a SQLite."""
        db_file = self.tmp_path / "custom_data.json"
        facade = AtomicJsonDatabase(db_file, default_data={"initial": True})
        
        # Carga por defecto
        self.assertEqual(facade.load(), {"initial": True})

        # Guardar y recuperar
        facade.save({"foo": "bar", "val": 123})
        self.assertEqual(facade.load(), {"foo": "bar", "val": 123})

        # Redirigir dinámicamente file_path (Snapshot Isolation)
        new_db_file = self.tmp_path / "isolated.json"
        facade.file_path = new_db_file
        self.assertEqual(facade.load(), {"initial": True})
        facade.save({"isolated": 42})
        self.assertEqual(facade.load(), {"isolated": 42})


if __name__ == "__main__":
    unittest.main()
