"""
Aislamiento de persistencia para TODOS los runners de tests (INC-09 / DEC-01).

Se ejecuta desde `tests/__init__.py`, por lo que aplica sin importar si la suite
corre con pytest, unittest discover o el runner interno de `scripts/audit_project.py`:
NUNCA se debe escribir en `data/` de producción.

Reglas:
- Si `MPFP_DATA_DIR` ya está definido, se acepta sólo fuera de `data/` de
  producción (la ruta de producción y sus descendientes se rechazan).
- Si no, se redirige a un snapshot temporal de los archivos rastreados de
  `data/`, excluyendo estado local ignorado y sidecars.
"""

import atexit
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROD_DATA_DIR = REPO_ROOT / "data"
SCRATCH_DIR = REPO_ROOT / "scratch"

_EXCLUDE_NAMES = {"backups"}
_EXCLUDE_SUFFIXES = ("-wal", "-shm")

_snapshot_tmp = None


def _copy_tracked_data(target: Path) -> None:
    """Seed tests from repository data only, never from ignored user state."""
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "ls-files", "-z", "--", "data"],
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError("No se pudieron resolver los archivos de data/ rastreados") from error

    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        tracked_path = Path(os.fsdecode(raw_path))
        if not tracked_path.parts or tracked_path.parts[0] != "data":
            continue
        relative_path = tracked_path.relative_to("data")
        if any(part in _EXCLUDE_NAMES or part.endswith(_EXCLUDE_SUFFIXES) for part in relative_path.parts):
            continue

        source = REPO_ROOT / tracked_path
        if not source.is_file():
            continue
        if not source.resolve().is_relative_to(REPO_ROOT):
            raise RuntimeError(f"Archivo rastreado fuera de la raíz del proyecto: {tracked_path}")

        destination = target / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def ensure_isolated_data_dir() -> Path:
    """Garantiza que los tests usen un directorio de datos aislado. Idempotente."""
    global _snapshot_tmp
    override = os.environ.get("MPFP_DATA_DIR", "").strip()
    if override:
        target = Path(override).expanduser().resolve()
        prod = PROD_DATA_DIR.resolve()
        if target == prod or prod in target.parents:
            raise RuntimeError("MPFP_DATA_DIR no puede apuntar a data/ de producción")
        target.mkdir(parents=True, exist_ok=True)
        return target

    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    _snapshot_tmp = tempfile.TemporaryDirectory(prefix="mpfp_test_data_", dir=SCRATCH_DIR)
    target = Path(_snapshot_tmp.name)
    try:
        _copy_tracked_data(target)
    except Exception:
        _snapshot_tmp.cleanup()
        _snapshot_tmp = None
        raise
    os.environ["MPFP_DATA_DIR"] = str(target)
    atexit.register(_snapshot_tmp.cleanup)
    return target
