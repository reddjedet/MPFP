"""
Módulo de Persistencia SQLite y Concurrencia Robusta - MPFP
Implementa persistencia atómica, ACID, modo WAL y protección multi-proceso (DATA-01, DATA-02, DATA-03).
"""

import copy
import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger("SQLitePersistence")

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "mpfp.db"


class PersistenceError(Exception):
    """Excepción base para fallas en la capa de persistencia."""
    pass


class DatabaseCorruptionError(PersistenceError):
    """Excepción fatal cuando la base de datos detecta inconsistencias o fallas graves."""
    pass


class SQLiteEngine:
    """
    Motor central de conexión y gestión de base de datos SQLite.
    Garantiza modo WAL, PRAGMAs de durabilidad y aislamiento seguro de transacciones.
    """
    _instances: Dict[str, "SQLiteEngine"] = {}
    _instance_lock = threading.Lock()

    def __new__(cls, db_path: Optional[Union[str, Path]] = None):
        target_path = Path(db_path or DEFAULT_DB_PATH).resolve()
        key = str(target_path)
        with cls._instance_lock:
            if key not in cls._instances:
                instance = super(SQLiteEngine, cls).__new__(cls)
                cls._instances[key] = instance
            return cls._instances[key]

    def __init__(self, db_path: Optional[Union[str, Path]] = None):
        target_path = Path(db_path or DEFAULT_DB_PATH).resolve()
        if hasattr(self, "_initialized") and self._initialized and self.db_path == target_path:
            return
        self.db_path = target_path
        self._local = threading.local()
        self._init_lock = threading.RLock()
        try:
            self._ensure_database()
            self._initialized = True
        except Exception:
            key = str(target_path)
            with SQLiteEngine._instance_lock:
                SQLiteEngine._instances.pop(key, None)
            raise

    def _ensure_database(self) -> None:
        """Crea el directorio de almacenamiento y ejecuta las migraciones iniciales."""
        with self._init_lock:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                conn = self.get_connection()
                self._apply_pragmas(conn)
                self._run_migrations(conn)
            except sqlite3.DatabaseError as e:
                logger.critical(f"FATAL: Error al inicializar/abrir base de datos en {self.db_path}: {e}")
                raise DatabaseCorruptionError(f"Base de datos corrupta o inválida en {self.db_path}: {e}") from e

    def _apply_pragmas(self, conn: sqlite3.Connection) -> None:
        """Aplica directivas PRAGMA para concurrencia WAL, integridad y durabilidad."""
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")

    def get_connection(self) -> sqlite3.Connection:
        """Obtiene o crea una conexión aislada para el hilo actual."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(
                str(self.db_path),
                timeout=10.0,
                check_same_thread=False,
                isolation_level=None  # Modo autocommit administrado explícitamente con transacciones
            )
            conn.row_factory = sqlite3.Row
            self._apply_pragmas(conn)
            self._local.conn = conn
        return self._local.conn

    @contextmanager
    def transaction(self):
        """
        Context manager para transacciones atómicas con 'BEGIN IMMEDIATE'.
        Garantiza que ningún otro proceso o hilo pueda escribir simultáneamente (DATA-01/03).
        """
        conn = self.get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE;")
            yield conn
            conn.execute("COMMIT;")
        except Exception as e:
            try:
                conn.execute("ROLLBACK;")
            except Exception:
                pass
            if isinstance(e, sqlite3.DatabaseError) and "corrupt" in str(e).lower():
                logger.critical(f"FATAL: Base de datos dañada en {self.db_path}: {e}")
                raise DatabaseCorruptionError(f"Corrupción detectada en base de datos: {e}") from e
            raise PersistenceError(f"Error en transacción SQLite: {e}") from e

    def _run_migrations(self, conn: sqlite3.Connection) -> None:
        """Crea las tablas maestras y aplica las versiones de esquema."""
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );
        """)

        cur = conn.execute("SELECT MAX(version) FROM schema_migrations;")
        current_version = cur.fetchone()[0] or 0

        if current_version < 1:
            conn.execute("BEGIN IMMEDIATE;")
            try:
                # 1. Portfolios activos
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS portfolios (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        mode TEXT NOT NULL DEFAULT 'weights',
                        data_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 2. Papelera de reciclaje FIFO
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS portfolios_trash (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        data_json TEXT NOT NULL,
                        deleted_at TEXT NOT NULL,
                        asset_count INTEGER NOT NULL DEFAULT 0,
                        mode TEXT NOT NULL DEFAULT 'weights'
                    );
                """)

                # 3. Tenencias físicas de usuario
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_holdings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        portfolio_id TEXT NOT NULL,
                        ticker TEXT NOT NULL,
                        asset_type TEXT NOT NULL DEFAULT 'cedear',
                        quantity REAL NOT NULL,
                        ppc REAL NOT NULL,
                        currency TEXT NOT NULL DEFAULT 'ARS',
                        updated_at TEXT NOT NULL,
                        UNIQUE(portfolio_id, ticker, asset_type)
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_user_holdings_pf ON user_holdings(portfolio_id);")

                # 4. Saldo en efectivo por cartera
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_portfolio_cash (
                        portfolio_id TEXT PRIMARY KEY,
                        cash_ars REAL NOT NULL DEFAULT 0.0,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 5. Precios promedio de compra (PPC)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS ppc_values (
                        ticker TEXT PRIMARY KEY,
                        ppc_ars REAL NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 6. Fair Values globales (GuruFocus)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS fair_values (
                        ticker TEXT PRIMARY KEY,
                        value_usd REAL NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 7. Múltiplos P/Normalized FCF
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS pfcf_values (
                        ticker TEXT PRIMARY KEY,
                        value REAL NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 8. Ratios de conversión de CEDEARs
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cedear_ratios (
                        ticker TEXT PRIMARY KEY,
                        ratio REAL NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 9. Calendario de reportes de ganancias
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS earnings_calendar (
                        ticker TEXT PRIMARY KEY,
                        date_str TEXT,
                        confirmed INTEGER NOT NULL DEFAULT 0,
                        data_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 10. Inputs de valuación fundamental del usuario
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_valuation_inputs (
                        ticker TEXT PRIMARY KEY,
                        inputs_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """)

                # 11. Key-Value Store semiestructurado general y perfiles
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS key_value_store (
                        namespace TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        PRIMARY KEY(namespace, key)
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_kv_namespace ON key_value_store(namespace);")

                # Registrar migración 1
                now = datetime.now().isoformat()
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'initial_sqlite_schema', ?);",
                    (now,)
                )
                conn.execute("PRAGMA user_version = 1;")
                conn.execute("COMMIT;")
                logger.info(f"Migración de esquema v1 aplicada con éxito en {self.db_path}.")
                current_version = 1
            except Exception as e:
                conn.execute("ROLLBACK;")
                logger.error(f"Error al aplicar migración v1: {e}")
                raise

        if current_version < 2:
            conn.execute("BEGIN IMMEDIATE;")
            try:
                # 12. Tabla de caché de mercado (CACHE-01, CACHE-02)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS market_cache (
                        cache_key TEXT PRIMARY KEY,
                        func_name TEXT NOT NULL,
                        category TEXT NOT NULL,
                        data_json TEXT NOT NULL,
                        created_at REAL NOT NULL,
                        expires_at REAL NOT NULL,
                        last_accessed_at REAL NOT NULL
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_market_cache_expires ON market_cache(expires_at);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_market_cache_func ON market_cache(func_name);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_market_cache_category ON market_cache(category);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_market_cache_lru ON market_cache(last_accessed_at);")

                now = datetime.now().isoformat()
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'market_cache_schema', ?);",
                    (now,)
                )
                conn.execute("PRAGMA user_version = 2;")
                conn.execute("COMMIT;")
                logger.info(f"Migración de esquema v2 (market_cache) aplicada con éxito en {self.db_path}.")
                current_version = 2
            except Exception as e:
                conn.execute("ROLLBACK;")
                logger.error(f"Error al aplicar migración v2: {e}")
                raise


class SQLiteTableStore:
    """
    Adaptador de alta compatibilidad que implementa la interfaz (load, save, invalidate, file_path)
    para conectar servicios existentes con el motor relacional SQLite sin roturas de contrato.
    """

    def __init__(
        self,
        table_name: str,
        db_path: Optional[Union[str, Path]] = None,
        default_data: Optional[Any] = None
    ):
        self.table_name = table_name
        self._custom_path: Optional[Path] = None
        if db_path is not None:
            p = Path(db_path).resolve()
            if p.suffix == ".json":
                p = p.with_suffix(".db")
            self._custom_path = p
        
        self.default_data = default_data if default_data is not None else ({} if table_name != "portfolios_trash" else [])
        self._engine = SQLiteEngine(self._custom_path)
        self.lock = threading.RLock()
        self._cache = None
        self._cache_valid = False

    @property
    def file_path(self) -> Path:
        """Devuelve la ruta física del archivo de base de datos SQLite activo."""
        return self._engine.db_path

    @file_path.setter
    def file_path(self, new_path: Union[str, Path]) -> None:
        """Permite a las suites de test redirigir a una base temporal aislada (Snapshot Isolation)."""
        with self.lock:
            p = Path(new_path).resolve()
            if p.suffix == ".json":
                p = p.with_suffix(".db")
            self._custom_path = p
            self._engine = SQLiteEngine(p)
            self.invalidate()

    def invalidate(self) -> None:
        """Invalida la caché local en memoria forzando consulta física."""
        with self.lock:
            self._cache = None
            self._cache_valid = False

    def load(self) -> Any:
        """Lee y mapea los registros estructurados de la base de datos a estructuras Python."""
        with self.lock:
            try:
                data = self._read_from_sqlite()
                if (data == {} or data == []) and self.default_data:
                    return copy.deepcopy(self.default_data)
                self._cache = data
                self._cache_valid = True
                return copy.deepcopy(data)
            except Exception as e:
                if isinstance(e, (DatabaseCorruptionError, PersistenceError)):
                    raise
                logger.error(f"Error al leer tabla '{self.table_name}' desde SQLite: {e}")
                if not self.file_path.exists():
                    return copy.deepcopy(self.default_data)
                raise PersistenceError(f"Falla de lectura en persistencia: {e}") from e

    def save(self, data: Any) -> None:
        """Persiste los datos de manera atómica con transacción 'BEGIN IMMEDIATE'."""
        with self.lock:
            try:
                self._write_to_sqlite(data)
                self._cache = copy.deepcopy(data)
                self._cache_valid = True
            except Exception as e:
                logger.error(f"Error al guardar en tabla '{self.table_name}': {e}")
                raise PersistenceError(f"Fallo al guardar en tabla '{self.table_name}': {e}") from e

    def set_item(self, key: str, value: Any) -> None:
        """
        Inserta o actualiza un registro individual de forma 100% atómica.
        Evita condiciones de carrera entre procesos concurrentes sin requerir lectura-modificación-escritura masiva.
        """
        now = datetime.now().isoformat()
        t = self.table_name
        with self._engine.transaction() as conn:
            if t == "ppc_values":
                val = float(value)
                conn.execute("""
                    INSERT INTO ppc_values (ticker, ppc_ars, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        ppc_ars = excluded.ppc_ars,
                        updated_at = excluded.updated_at;
                """, (key.upper(), val, now))

            elif t == "fair_values":
                val = float(value)
                conn.execute("""
                    INSERT INTO fair_values (ticker, value_usd, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        value_usd = excluded.value_usd,
                        updated_at = excluded.updated_at;
                """, (key.upper(), val, now))

            elif t == "pfcf_values":
                val = float(value)
                conn.execute("""
                    INSERT INTO pfcf_values (ticker, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        value = excluded.value,
                        updated_at = excluded.updated_at;
                """, (key.upper(), val, now))

            elif t == "cedear_ratios":
                val = float(value)
                conn.execute("""
                    INSERT INTO cedear_ratios (ticker, ratio, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        ratio = excluded.ratio,
                        updated_at = excluded.updated_at;
                """, (key.upper(), val, now))

            elif t == "user_valuation_inputs":
                payload = json.dumps(value if isinstance(value, dict) else {}, ensure_ascii=False)
                conn.execute("""
                    INSERT INTO user_valuation_inputs (ticker, inputs_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(ticker) DO UPDATE SET
                        inputs_json = excluded.inputs_json,
                        updated_at = excluded.updated_at;
                """, (key.upper(), payload, now))

            elif t == "portfolios":
                p_data = value if isinstance(value, dict) else {}
                name = p_data.get("name", key)
                mode = p_data.get("mode", "weights")
                payload = json.dumps(p_data, ensure_ascii=False)
                conn.execute("""
                    INSERT INTO portfolios (id, name, mode, data_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        mode = excluded.mode,
                        data_json = excluded.data_json,
                        updated_at = excluded.updated_at;
                """, (key, name, mode, payload, now, now))

            else:
                payload = json.dumps(value, ensure_ascii=False)
                conn.execute("""
                    INSERT INTO key_value_store (namespace, key, value_json, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(namespace, key) DO UPDATE SET
                        value_json = excluded.value_json,
                        updated_at = excluded.updated_at;
                """, (t, key, payload, now))
        self.invalidate()

    def delete_item(self, key: str) -> None:
        """Elimina un registro individual de forma atómica."""
        t = self.table_name
        with self._engine.transaction() as conn:
            if t == "ppc_values":
                conn.execute("DELETE FROM ppc_values WHERE ticker = ?;", (key.upper(),))
            elif t == "fair_values":
                conn.execute("DELETE FROM fair_values WHERE ticker = ?;", (key.upper(),))
            elif t == "pfcf_values":
                conn.execute("DELETE FROM pfcf_values WHERE ticker = ?;", (key.upper(),))
            elif t == "cedear_ratios":
                conn.execute("DELETE FROM cedear_ratios WHERE ticker = ?;", (key.upper(),))
            elif t == "user_valuation_inputs":
                conn.execute("DELETE FROM user_valuation_inputs WHERE ticker = ?;", (key.upper(),))
            elif t == "portfolios":
                conn.execute("DELETE FROM portfolios WHERE id = ?;", (key,))
            else:
                conn.execute("DELETE FROM key_value_store WHERE namespace = ? AND key = ?;", (t, key))
        self.invalidate()

    def get_item(self, key: str, default: Any = None) -> Any:
        """Consulta un elemento específico sin cargar toda la tabla."""
        conn = self._engine.get_connection()
        t = self.table_name
        if t == "ppc_values":
            row = conn.execute("SELECT ppc_ars FROM ppc_values WHERE ticker = ?;", (key.upper(),)).fetchone()
            return float(row["ppc_ars"]) if row else default
        elif t == "fair_values":
            row = conn.execute("SELECT value_usd FROM fair_values WHERE ticker = ?;", (key.upper(),)).fetchone()
            return float(row["value_usd"]) if row else default
        elif t == "pfcf_values":
            row = conn.execute("SELECT value FROM pfcf_values WHERE ticker = ?;", (key.upper(),)).fetchone()
            return float(row["value"]) if row else default
        elif t == "cedear_ratios":
            row = conn.execute("SELECT ratio FROM cedear_ratios WHERE ticker = ?;", (key.upper(),)).fetchone()
            return float(row["ratio"]) if row else default
        elif t == "user_valuation_inputs":
            row = conn.execute("SELECT inputs_json FROM user_valuation_inputs WHERE ticker = ?;", (key.upper(),)).fetchone()
            return json.loads(row["inputs_json"]) if row else default
        elif t == "portfolios":
            row = conn.execute("SELECT data_json FROM portfolios WHERE id = ?;", (key,)).fetchone()
            return json.loads(row["data_json"]) if row else default
        else:
            row = conn.execute("SELECT value_json FROM key_value_store WHERE namespace = ? AND key = ?;", (t, key)).fetchone()
            return json.loads(row["value_json"]) if row else default

    # --------------------------------------------------------------------------
    # Mapeo Específico por Entidad
    # --------------------------------------------------------------------------

    def _read_from_sqlite(self) -> Any:
        conn = self._engine.get_connection()
        t = self.table_name

        if t == "portfolios":
            rows = conn.execute("SELECT id, name, mode, data_json FROM portfolios;").fetchall()
            if not rows:
                return {}
            result = {}
            for r in rows:
                try:
                    p_data = json.loads(r["data_json"])
                except Exception:
                    p_data = {"mode": r["mode"], "assets": {}}
                result[r["id"]] = p_data
            return result

        elif t == "portfolios_trash":
            rows = conn.execute("SELECT id, name, data_json, deleted_at, asset_count, mode FROM portfolios_trash ORDER BY deleted_at ASC;").fetchall()
            result = []
            for r in rows:
                try:
                    entry = json.loads(r["data_json"])
                except Exception:
                    entry = {
                        "id": r["id"],
                        "name": r["name"],
                        "deleted_at": r["deleted_at"],
                        "asset_count": r["asset_count"],
                        "mode": r["mode"],
                        "data": {}
                    }
                result.append(entry)
            return result

        elif t == "user_holdings":
            h_rows = conn.execute("SELECT portfolio_id, ticker, asset_type, quantity, ppc FROM user_holdings;").fetchall()
            c_rows = conn.execute("SELECT portfolio_id, cash_ars FROM user_portfolio_cash;").fetchall()
            
            result: Dict[str, Any] = {}
            for c in c_rows:
                result[c["portfolio_id"]] = {
                    "holdings": {},
                    "fixed_income_holdings": {},
                    "cash_ars": float(c["cash_ars"])
                }

            for h in h_rows:
                pf_id = h["portfolio_id"]
                if pf_id not in result:
                    result[pf_id] = {"holdings": {}, "fixed_income_holdings": {}, "cash_ars": 0.0}
                tk = h["ticker"]
                val = {"nominals": int(h["quantity"]) if h["quantity"].is_integer() else float(h["quantity"]), "ppc": float(h["ppc"])}
                if h["asset_type"] == "fixed_income":
                    result[pf_id]["fixed_income_holdings"][tk] = val
                else:
                    result[pf_id]["holdings"][tk] = val
            return result

        elif t == "ppc_values":
            rows = conn.execute("SELECT ticker, ppc_ars FROM ppc_values;").fetchall()
            return {r["ticker"]: float(r["ppc_ars"]) for r in rows}

        elif t == "fair_values":
            rows = conn.execute("SELECT ticker, value_usd FROM fair_values;").fetchall()
            return {r["ticker"]: float(r["value_usd"]) for r in rows}

        elif t == "pfcf_values":
            rows = conn.execute("SELECT ticker, value FROM pfcf_values;").fetchall()
            return {r["ticker"]: float(r["value"]) for r in rows}

        elif t == "cedear_ratios":
            rows = conn.execute("SELECT ticker, ratio FROM cedear_ratios;").fetchall()
            return {r["ticker"]: float(r["ratio"]) for r in rows}

        elif t == "earnings_calendar":
            rows = conn.execute("SELECT ticker, data_json FROM earnings_calendar;").fetchall()
            result = {}
            for r in rows:
                try:
                    result[r["ticker"]] = json.loads(r["data_json"])
                except Exception:
                    result[r["ticker"]] = {}
            return result

        elif t == "user_valuation_inputs":
            rows = conn.execute("SELECT ticker, inputs_json FROM user_valuation_inputs;").fetchall()
            result = {}
            for r in rows:
                try:
                    result[r["ticker"]] = json.loads(r["inputs_json"])
                except Exception:
                    result[r["ticker"]] = {}
            return result

        elif t == "valuation_profiles":
            row = conn.execute("SELECT value_json FROM key_value_store WHERE namespace = 'valuation_profiles' AND key = 'catalog';").fetchone()
            if row:
                try:
                    return json.loads(row["value_json"])
                except Exception:
                    return copy.deepcopy(self.default_data)
            return copy.deepcopy(self.default_data)

        else:
            rows = conn.execute("SELECT key, value_json FROM key_value_store WHERE namespace = ?;", (t,)).fetchall()
            if not rows:
                return {}
            if len(rows) == 1 and rows[0]["key"] == "__root__":
                try:
                    return json.loads(rows[0]["value_json"])
                except Exception:
                    return {}
            result = {}
            for r in rows:
                try:
                    result[r["key"]] = json.loads(r["value_json"])
                except Exception:
                    result[r["key"]] = r["value_json"]
            return result

    def _write_to_sqlite(self, data: Any) -> None:
        t = self.table_name
        now = datetime.now().isoformat()

        with self._engine.transaction() as conn:
            if t == "portfolios":
                if not isinstance(data, dict):
                    data = {}
                active_ids = set(data.keys())
                if active_ids:
                    placeholders = ",".join("?" for _ in active_ids)
                    conn.execute(f"DELETE FROM portfolios WHERE id NOT IN ({placeholders});", tuple(active_ids))
                else:
                    conn.execute("DELETE FROM portfolios;")

                for pf_id, pf_data in data.items():
                    name = pf_data.get("name", pf_id) if isinstance(pf_data, dict) else pf_id
                    mode = pf_data.get("mode", "weights") if isinstance(pf_data, dict) else "weights"
                    payload = json.dumps(pf_data, ensure_ascii=False)
                    conn.execute("""
                        INSERT INTO portfolios (id, name, mode, data_json, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            mode = excluded.mode,
                            data_json = excluded.data_json,
                            updated_at = excluded.updated_at;
                    """, (pf_id, name, mode, payload, now, now))

            elif t == "portfolios_trash":
                if not isinstance(data, list):
                    data = []
                conn.execute("DELETE FROM portfolios_trash;")
                for item in data:
                    item_id = item.get("id", str(item.get("name", "unknown")))
                    name = item.get("name", item_id)
                    deleted_at = item.get("deleted_at", now)
                    asset_count = item.get("asset_count", len(item.get("data", {}).get("assets", {})))
                    mode = item.get("mode", "weights")
                    payload = json.dumps(item, ensure_ascii=False)
                    conn.execute("""
                        INSERT INTO portfolios_trash (id, name, data_json, deleted_at, asset_count, mode)
                        VALUES (?, ?, ?, ?, ?, ?);
                    """, (item_id, name, payload, deleted_at, asset_count, mode))

            elif t == "user_holdings":
                if not isinstance(data, dict):
                    data = {}
                conn.execute("DELETE FROM user_holdings;")
                conn.execute("DELETE FROM user_portfolio_cash;")
                for pf_id, pf_data in data.items():
                    if not isinstance(pf_data, dict):
                        continue
                    cash = float(pf_data.get("cash_ars", 0.0))
                    conn.execute("""
                        INSERT INTO user_portfolio_cash (portfolio_id, cash_ars, updated_at)
                        VALUES (?, ?, ?);
                    """, (pf_id, cash, now))

                    for tk, h_info in pf_data.get("holdings", {}).items():
                        qty = float(h_info.get("nominals", 0)) if isinstance(h_info, dict) else 0.0
                        # Nunca float(None): un ppc ausente o nulo se persiste como 0.0 (columna NOT NULL)
                        ppc = float(h_info.get("ppc") or 0.0) if isinstance(h_info, dict) else 0.0
                        conn.execute("""
                            INSERT INTO user_holdings (portfolio_id, ticker, asset_type, quantity, ppc, currency, updated_at)
                            VALUES (?, ?, 'cedear', ?, ?, 'ARS', ?);
                        """, (pf_id, tk.upper(), qty, ppc, now))

                    for tk, fi_info in pf_data.get("fixed_income_holdings", {}).items():
                        qty = float(fi_info.get("nominals", 0)) if isinstance(fi_info, dict) else 0.0
                        # Nunca float(None): un ppc ausente o nulo se persiste como 0.0 (columna NOT NULL)
                        ppc = float(fi_info.get("ppc") or 0.0) if isinstance(fi_info, dict) else 0.0
                        conn.execute("""
                            INSERT INTO user_holdings (portfolio_id, ticker, asset_type, quantity, ppc, currency, updated_at)
                            VALUES (?, ?, 'fixed_income', ?, ?, 'ARS', ?);
                        """, (pf_id, tk.upper(), qty, ppc, now))

            elif t == "ppc_values":
                if not isinstance(data, dict):
                    data = {}
                active_tickers = {k.upper(): float(v) for k, v in data.items() if v is not None and isinstance(v, (int, float)) and v > 0}
                if active_tickers:
                    placeholders = ",".join("?" for _ in active_tickers)
                    conn.execute(f"DELETE FROM ppc_values WHERE ticker NOT IN ({placeholders});", tuple(active_tickers.keys()))
                else:
                    conn.execute("DELETE FROM ppc_values;")

                for tk, val in active_tickers.items():
                    conn.execute("""
                        INSERT INTO ppc_values (ticker, ppc_ars, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                            ppc_ars = excluded.ppc_ars,
                            updated_at = excluded.updated_at;
                    """, (tk, val, now))

            elif t == "fair_values":
                if not isinstance(data, dict):
                    data = {}
                active_tickers = {k.upper(): float(v) for k, v in data.items() if v is not None and isinstance(v, (int, float)) and v > 0}
                if active_tickers:
                    placeholders = ",".join("?" for _ in active_tickers)
                    conn.execute(f"DELETE FROM fair_values WHERE ticker NOT IN ({placeholders});", tuple(active_tickers.keys()))
                else:
                    conn.execute("DELETE FROM fair_values;")

                for tk, val in active_tickers.items():
                    conn.execute("""
                        INSERT INTO fair_values (ticker, value_usd, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                            value_usd = excluded.value_usd,
                            updated_at = excluded.updated_at;
                    """, (tk, val, now))

            elif t == "pfcf_values":
                if not isinstance(data, dict):
                    data = {}
                active_tickers = {k.upper(): float(v) for k, v in data.items() if v is not None and isinstance(v, (int, float)) and v > 0}
                if active_tickers:
                    placeholders = ",".join("?" for _ in active_tickers)
                    conn.execute(f"DELETE FROM pfcf_values WHERE ticker NOT IN ({placeholders});", tuple(active_tickers.keys()))
                else:
                    conn.execute("DELETE FROM pfcf_values;")

                for tk, val in active_tickers.items():
                    conn.execute("""
                        INSERT INTO pfcf_values (ticker, value, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                            value = excluded.value,
                            updated_at = excluded.updated_at;
                    """, (tk, val, now))

            elif t == "cedear_ratios":
                if not isinstance(data, dict):
                    data = {}
                active_tickers = {k.upper(): float(v) for k, v in data.items() if v is not None and isinstance(v, (int, float)) and v > 0}
                if active_tickers:
                    placeholders = ",".join("?" for _ in active_tickers)
                    conn.execute(f"DELETE FROM cedear_ratios WHERE ticker NOT IN ({placeholders});", tuple(active_tickers.keys()))
                else:
                    conn.execute("DELETE FROM cedear_ratios;")

                for tk, val in active_tickers.items():
                    conn.execute("""
                        INSERT INTO cedear_ratios (ticker, ratio, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                            ratio = excluded.ratio,
                            updated_at = excluded.updated_at;
                    """, (tk, val, now))

            elif t == "earnings_calendar":
                if not isinstance(data, dict):
                    data = {}
                active_tickers = {k.upper(): v for k, v in data.items() if isinstance(v, dict)}
                if active_tickers:
                    placeholders = ",".join("?" for _ in active_tickers)
                    conn.execute(f"DELETE FROM earnings_calendar WHERE ticker NOT IN ({placeholders});", tuple(active_tickers.keys()))
                else:
                    conn.execute("DELETE FROM earnings_calendar;")

                for tk, info in active_tickers.items():
                    date_str = info.get("confirmed_date") or info.get("date")
                    confirmed = 1 if info.get("confirmed") else 0
                    payload = json.dumps(info, ensure_ascii=False)
                    conn.execute("""
                        INSERT INTO earnings_calendar (ticker, date_str, confirmed, data_json, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                            date_str = excluded.date_str,
                            confirmed = excluded.confirmed,
                            data_json = excluded.data_json,
                            updated_at = excluded.updated_at;
                    """, (tk, date_str, confirmed, payload, now))

            elif t == "user_valuation_inputs":
                if not isinstance(data, dict):
                    data = {}
                active_tickers = {k.upper(): v for k, v in data.items() if isinstance(v, dict)}
                if active_tickers:
                    placeholders = ",".join("?" for _ in active_tickers)
                    conn.execute(f"DELETE FROM user_valuation_inputs WHERE ticker NOT IN ({placeholders});", tuple(active_tickers.keys()))
                else:
                    conn.execute("DELETE FROM user_valuation_inputs;")

                for tk, info in active_tickers.items():
                    payload = json.dumps(info, ensure_ascii=False)
                    conn.execute("""
                        INSERT INTO user_valuation_inputs (ticker, inputs_json, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(ticker) DO UPDATE SET
                            inputs_json = excluded.inputs_json,
                            updated_at = excluded.updated_at;
                    """, (tk, payload, now))

            elif t == "valuation_profiles":
                payload = json.dumps(data if isinstance(data, dict) else {}, ensure_ascii=False)
                conn.execute("""
                    INSERT INTO key_value_store (namespace, key, value_json, updated_at)
                    VALUES ('valuation_profiles', 'catalog', ?, ?)
                    ON CONFLICT(namespace, key) DO UPDATE SET
                        value_json = excluded.value_json,
                        updated_at = excluded.updated_at;
                """, (payload, now))

            else:
                payload = json.dumps(data, ensure_ascii=False)
                conn.execute("""
                    INSERT INTO key_value_store (namespace, key, value_json, updated_at)
                    VALUES (?, '__root__', ?, ?)
                    ON CONFLICT(namespace, key) DO UPDATE SET
                        value_json = excluded.value_json,
                        updated_at = excluded.updated_at;
                """, (t, payload, now))


def get_sqlite_store(
    name_or_file: Union[str, Path],
    db_path: Optional[Union[str, Path]] = None,
    default_data: Optional[Any] = None
) -> SQLiteTableStore:
    """Factoría para instanciar adaptadores de tabla SQLite a partir de nombres o rutas."""
    if isinstance(name_or_file, Path) or ("/" in str(name_or_file) or "\\" in str(name_or_file)):
        table_name = Path(name_or_file).stem
    else:
        table_name = str(name_or_file)
    return SQLiteTableStore(table_name=table_name, db_path=db_path, default_data=default_data)
