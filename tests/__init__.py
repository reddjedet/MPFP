"""Tests package."""

# Aislamiento de persistencia para todo runner de tests (pytest, unittest
# discover y el runner interno de scripts/audit_project.py). Ver
# tests/_isolation.py y docs/aprendizaje_de_errores.md (INC-02, DEC-01, INC-09).
from tests._isolation import ensure_isolated_data_dir

ensure_isolated_data_dir()
