"""
Módulo de Persistencia Atómica y Concurrencia Segura - MPFP (Máquina de Planes, Finanzas y Portfolios)
Garantiza que ningún archivo JSON en disco sufra corrupción por cortes abruptos
o condiciones de carrera entre hilos y procesos.
"""

import os
import json
import uuid
import logging
import threading
import copy
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger("AtomicPersistence")

class AtomicJsonDatabase:
    def __init__(self, file_path: Path, default_data: Optional[Dict[str, Any]] = None):
        self.file_path = Path(file_path).resolve()
        self.default_data = default_data or {}
        self.lock = threading.RLock()
        self._cache = None
        self._cache_valid = False
        self._last_mtime = None
        self._ensure_init()

    def invalidate(self) -> None:
        """Invalida la memoria caché forzando lectura desde el disco físico."""
        with self.lock:
            self._cache = None
            self._cache_valid = False
            self._last_mtime = None

    def _ensure_init(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists():
            example_file = self.file_path.with_name(f"{self.file_path.name}.example")
            if example_file.exists():
                try:
                    with open(example_file, "r", encoding="utf-8") as f_ex:
                        ex_data = json.load(f_ex)
                    self.save(ex_data)
                    return
                except Exception:
                    pass
            self.save(self.default_data)

    def load(self) -> Dict[str, Any]:
        """Carga datos con verificación de mtime y respaldo forense automático si el archivo está corrupto."""
        with self.lock:
            current_mtime = self.file_path.stat().st_mtime if self.file_path.exists() else None
            if self._cache is not None and self._cache_valid and self._last_mtime == current_mtime:
                return copy.deepcopy(self._cache)
            if not self.file_path.exists():
                return copy.deepcopy(self.default_data)
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._cache = data
                    self._cache_valid = True
                    self._last_mtime = current_mtime
                    return copy.deepcopy(data)
            except (json.JSONDecodeError, OSError) as e:
                # Respaldo forense del archivo dañado
                corrupt_backup = self.file_path.parent / f"{self.file_path.stem}.corrupted_{uuid.uuid4().hex[:8]}.bak"
                try:
                    self.file_path.rename(corrupt_backup)
                    logger.critical(f"Base de datos corrupta. Respaldo creado en: {corrupt_backup}. Error: {e}")
                except Exception as rename_err:
                    logger.error(f"Error al renombrar archivo corrupto: {rename_err}")
                
                # Restauración con estado inicial por defecto
                self.save(self.default_data)
                return copy.deepcopy(self.default_data)

    def save(self, data: Dict[str, Any]) -> None:
        """Guarda los datos de forma 100% atómica usando POSIX atomic replace y fsync."""
        with self.lock:
            self._cache = copy.deepcopy(data)
            self._cache_valid = True
            temp_file = self.file_path.parent / f".tmp_{os.getpid()}_{uuid.uuid4().hex}"
            try:
                with open(temp_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                temp_file.replace(self.file_path)
                self._last_mtime = self.file_path.stat().st_mtime if self.file_path.exists() else None
            except Exception as e:
                if temp_file.exists():
                    try:
                        temp_file.unlink()
                    except Exception:
                        pass
                logger.error(f"Error en persistencia atómica: {e}")
                raise RuntimeError(f"Fallo al guardar datos atómicamente: {e}")