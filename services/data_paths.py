"""
Resolución centralizada del directorio de datos - MPFP.

Toda la persistencia debe resolver sus rutas mediante `data_file()` /
`get_data_dir()` en lugar de concatenar `Path(__file__)... / "data"`.

La variable de entorno `MPFP_DATA_DIR` permite redirigir el directorio de datos
(aislamiento de tests, sandboxes y CI). Si no está definida, se usa el
directorio `data/` del repositorio (comportamiento de producción).

Nota: las constantes de ruta a nivel de módulo se evalúan al importar, por lo
que `MPFP_DATA_DIR` debe definirse antes de importar `services.*`
(ver `tests/conftest.py`).
"""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = REPO_ROOT / "data"


def get_data_dir() -> Path:
    """Retorna el directorio de datos activo (MPFP_DATA_DIR si está definido, si no data/)."""
    override = os.environ.get("MPFP_DATA_DIR", "").strip()
    data_dir = Path(override).expanduser().resolve() if override else DEFAULT_DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def data_file(name: str) -> Path:
    """Retorna la ruta absoluta de un archivo dentro del directorio de datos activo."""
    return get_data_dir() / name
