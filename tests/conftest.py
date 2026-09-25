"""
Configuración global de la suite pytest - MPFP.

El aislamiento de persistencia vive en `tests/_isolation.py` y se activa desde
`tests/__init__.py` para que aplique en TODOS los runners (pytest, unittest
discover y el runner interno de scripts/audit_project.py). Este conftest lo
garantiza también para pytest, que importa los conftest antes del paquete.
"""

from tests._isolation import ensure_isolated_data_dir

ensure_isolated_data_dir()
