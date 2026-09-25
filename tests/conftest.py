"""
Configuración global de la suite pytest - MPFP.

Aísla la persistencia de los tests (AGENTS.md: Test Isolation) redirigiendo
`MPFP_DATA_DIR` a un directorio temporal sembrado con un snapshot de `data/`.
Los tests ven exactamente los mismos datos que en producción, pero toda
escritura cae en el snapshot temporal: `data/` real jamás se modifica.
"""

import os
import shutil
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROD_DATA_DIR = REPO_ROOT / "data"

# backups/ puede crecer mucho; -wal/-shm son transientes de SQLite.
_EXCLUDE_NAMES = {"backups"}
_EXCLUDE_SUFFIXES = ("-wal", "-shm")

_snapshot = tempfile.TemporaryDirectory(prefix="mpfp_test_data_")
TEST_DATA_DIR = Path(_snapshot.name)

if PROD_DATA_DIR.is_dir():
    for item in sorted(PROD_DATA_DIR.iterdir()):
        if item.name in _EXCLUDE_NAMES or item.name.endswith(_EXCLUDE_SUFFIXES):
            continue
        dest = TEST_DATA_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        elif item.is_file():
            shutil.copy2(item, dest)

# Debe definirse antes de que cualquier módulo de tests importe services.*.
os.environ["MPFP_DATA_DIR"] = str(TEST_DATA_DIR)


def pytest_sessionfinish(session, exitstatus):
    _snapshot.cleanup()
