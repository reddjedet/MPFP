"""Tests package."""

# Aislamiento de persistencia para todo runner de tests (pytest, unittest
# discover y el runner interno de scripts/audit_project.py). Ver
# tests/_isolation.py y regla R6 (Snapshot Isolation).
from tests._isolation import ensure_isolated_data_dir

ensure_isolated_data_dir()
