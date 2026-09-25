"""
Aislamiento de persistencia para TODOS los runners de tests (INC-09 / DEC-01).

Se ejecuta desde `tests/__init__.py`, por lo que aplica sin importar si la suite
corre con pytest, `python -m unittest discover` o el runner interno de
`scripts/audit_project.py`: NUNCA se debe escribir en `data/` de producción.

Reglas:
- Si `MPFP_DATA_DIR` ya está definido (p. ej. simulación de clean-checkout en
  `scripts/test.sh`), se respeta tal cual.
- Si no, se redirige a un snapshot temporal copiado desde `data/`
  (excluye `backups/`, `*-wal`, `*-shm`).
"""

import atexit
import os
import shutil
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROD_DATA_DIR = REPO_ROOT / "data"

_EXCLUDE_NAMES = {"backups"}
_EXCLUDE_SUFFIXES = ("-wal", "-shm")

_snapshot_tmp = None


def ensure_isolated_data_dir() -> Path:
    """Garantiza que los tests usen un directorio de datos aislado. Idempotente."""
    global _snapshot_tmp
    override = os.environ.get("MPFP_DATA_DIR", "").strip()
    if override:
        target = Path(override).expanduser().resolve()
        target.mkdir(parents=True, exist_ok=True)
        return target

    _snapshot_tmp = tempfile.TemporaryDirectory(prefix="mpfp_test_data_")
    target = Path(_snapshot_tmp.name)
    if PROD_DATA_DIR.is_dir():
        for item in sorted(PROD_DATA_DIR.iterdir()):
            if item.name in _EXCLUDE_NAMES or item.name.endswith(_EXCLUDE_SUFFIXES):
                continue
            dest = target / item.name
            if item.is_dir():
                shutil.copytree(item, dest)
            elif item.is_file():
                shutil.copy2(item, dest)
    os.environ["MPFP_DATA_DIR"] = str(target)
    atexit.register(_snapshot_tmp.cleanup)
    return target
