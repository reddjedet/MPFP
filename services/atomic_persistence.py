"""
Módulo de Persistencia Atómica y Concurrencia Segura - MPFP
Provee compatibilidad retroactiva con AtomicJsonDatabase sobre el motor robusto SQLite (DATA-01, DATA-02, DATA-03).
Garantiza transacciones ACID, modo WAL y protección multi-proceso.
"""

import copy
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Union

from services.sqlite_persistence import (
    DEFAULT_DB_PATH,
    SQLiteTableStore,
    get_sqlite_store,
    PersistenceError,
    DatabaseCorruptionError
)

logger = logging.getLogger("AtomicPersistence")


class AtomicJsonDatabase:
    """
    Fachada retrocompatible para la capa de persistencia.
    Conecta de forma transparente con SQLiteTableStore y asegura modo WAL,
    transacciones inmediatas y prevención de sobrescritura destructiva.
    """

    def __init__(self, file_path: Union[str, Path], default_data: Optional[Any] = None):
        self._orig_file_path = Path(file_path).resolve()
        self.table_name = self._orig_file_path.stem
        self.default_data = default_data if default_data is not None else ({} if self.table_name != "portfolios_trash" else [])
        
        # Si se pasa una ruta fuera del directorio estándar de datos (ej. tests con snapshot isolation), usar esa base .db
        is_custom_dir = self._orig_file_path.parent != DEFAULT_DB_PATH.parent
        target_db = (self._orig_file_path.with_suffix(".db") if self._orig_file_path.suffix == ".json" else self._orig_file_path) if is_custom_dir else DEFAULT_DB_PATH
        
        self._store = get_sqlite_store(
            name_or_file=self.table_name,
            db_path=target_db,
            default_data=self.default_data
        )
        self.lock = self._store.lock
        self._bootstrap_if_needed()

    def _bootstrap_if_needed(self) -> None:
        """Si la tabla SQLite está vacía pero existe un archivo JSON local o .example, inicializar datos."""
        is_empty = False
        try:
            current_data = self._store.load()
            is_empty = (current_data is None or current_data == {} or current_data == [])
            if is_empty and self._orig_file_path.exists() and self._orig_file_path.suffix == ".json":
                with open(self._orig_file_path, "r", encoding="utf-8") as f:
                    file_data = json.load(f)
                if file_data:
                    self._store.save(file_data)
                    return
        except Exception as e:
            logger.warning("Bootstrap desde JSON legado falló para %s: %s", self.table_name, e)

        # Check for .example file
        if not self._orig_file_path.exists() or is_empty:
            example_file = self._orig_file_path.with_name(f"{self._orig_file_path.name}.example")
            if example_file.exists():
                try:
                    with open(example_file, "r", encoding="utf-8") as f_ex:
                        ex_data = json.load(f_ex)
                    self._store.save(ex_data)
                except Exception:
                    pass

    @property
    def file_path(self) -> Path:
        """Devuelve la ruta referenciada (para compatibilidad con tests)."""
        return self._orig_file_path

    @file_path.setter
    def file_path(self, new_path: Union[str, Path]) -> None:
        """Permite a las suites de test redirigir dinámicamente la persistencia (Snapshot Isolation)."""
        with self.lock:
            self._orig_file_path = Path(new_path).resolve()
            self.table_name = self._orig_file_path.stem
            is_custom_dir = self._orig_file_path.parent != DEFAULT_DB_PATH.parent
            target_db = (self._orig_file_path.with_suffix(".db") if self._orig_file_path.suffix == ".json" else self._orig_file_path) if is_custom_dir else DEFAULT_DB_PATH
            self._store = get_sqlite_store(
                name_or_file=self.table_name,
                db_path=target_db,
                default_data=self.default_data
            )
            self._bootstrap_if_needed()

    @property
    def _cache(self) -> Any:
        return self._store._cache

    @_cache.setter
    def _cache(self, val: Any) -> None:
        self._store._cache = val

    @property
    def _cache_valid(self) -> bool:
        return self._store._cache_valid

    @_cache_valid.setter
    def _cache_valid(self, val: bool) -> None:
        self._store._cache_valid = val

    def invalidate(self) -> None:
        """Invalida la memoria caché forzando lectura desde la base de datos."""
        self._store.invalidate()

    def load(self) -> Any:
        """Carga datos de forma segura sin riesgo de sobrescritura destructiva."""
        return self._store.load()

    def save(self, data: Any) -> None:
        """Guarda datos de forma atómica en SQLite con bloqueo inmediato."""
        self._store.save(data)

    def set_item(self, key: str, value: Any) -> None:
        """Inserta o actualiza un registro individual de forma 100% atómica."""
        self._store.set_item(key, value)

    def get_item(self, key: str, default: Any = None) -> Any:
        """Consulta un elemento específico sin cargar toda la tabla."""
        return self._store.get_item(key, default)

    def delete_item(self, key: str) -> None:
        """Elimina un registro individual de forma atómica."""
        self._store.delete_item(key)