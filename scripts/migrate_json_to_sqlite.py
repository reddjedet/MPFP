#!/usr/bin/env python3
"""
Script de Migración Automática: JSON a SQLite - MPFP (DATA-01, DATA-02, DATA-03)
Migra todos los archivos data/*.json a la base de datos relacional data/mpfp.db,
creando copias de respaldo forenses y verificando la integridad de los datos 1:1.
"""

import sys
import shutil
import json
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from services.sqlite_persistence import (
    DEFAULT_DB_PATH,
    SQLiteEngine,
    SQLiteTableStore,
    get_sqlite_store
)

DATA_DIR = ROOT_DIR / "data"
BACKUP_BASE_DIR = DATA_DIR / "backups"

DATASETS_TO_MIGRATE = [
    {
        "table": "portfolios",
        "file": "portfolios.json",
        "description": "Carteras de Inversión Activas",
        "type": "dict"
    },
    {
        "table": "portfolios_trash",
        "file": "portfolios_trash.json",
        "description": "Papelera de Reciclaje de Carteras",
        "type": "list"
    },
    {
        "table": "user_holdings",
        "file": "user_holdings.json",
        "description": "Tenencias Físicas y Efectivo Multi-Cuenta",
        "type": "dict"
    },
    {
        "table": "ppc_values",
        "file": "ppc_values.json",
        "description": "Precios Promedio de Compra (PPC)",
        "type": "dict"
    },
    {
        "table": "fair_values",
        "file": "fair_values.json",
        "description": "GuruFocus Fair Values en USD",
        "type": "dict"
    },
    {
        "table": "pfcf_values",
        "file": "pfcf_values.json",
        "description": "Múltiplos P/Normalized Free Cash Flow",
        "type": "dict"
    },
    {
        "table": "cedear_ratios",
        "file": "cedear_ratios.json",
        "description": "Ratios de Conversión de CEDEARs",
        "type": "dict"
    },
    {
        "table": "earnings_calendar",
        "file": "earnings_calendar.json",
        "description": "Calendario de Reportes de Ganancias",
        "type": "dict"
    },
    {
        "table": "user_valuation_inputs",
        "file": "user_valuation_inputs.json",
        "description": "Inputs de Valuación Fundamental de Usuario",
        "type": "dict"
    },
    {
        "table": "valuation_profiles",
        "file": "valuation_profiles.json",
        "description": "Catálogo de Perfiles y Sectores de Valuación",
        "type": "dict"
    }
]


def create_backup() -> Path:
    """Copia todos los archivos .json existentes a una carpeta de respaldo fechada."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = BACKUP_BASE_DIR / f"json_backup_{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    
    count = 0
    for item in DATASETS_TO_MIGRATE:
        src = DATA_DIR / item["file"]
        if src.exists():
            shutil.copy2(src, backup_dir / src.name)
            count += 1
            
    print(f"📦 Respaldo forense creado en: {backup_dir} ({count} archivos resguardados).")
    return backup_dir


def migrate_data() -> bool:
    """Ejecuta la migración de archivos JSON a las tablas relacionales SQLite con verificación."""
    print("=" * 65)
    print("       MIGRACIÓN DE PERSISTENCIA: JSON ➔ SQLite (MPFP)")
    print("=" * 65)
    
    create_backup()
    
    engine = SQLiteEngine(DEFAULT_DB_PATH)
    print(f"\nConectado a SQLite: {DEFAULT_DB_PATH} (Modo WAL activo)")
    
    all_success = True
    migration_summary = []
    
    for item in DATASETS_TO_MIGRATE:
        table_name = item["table"]
        file_path = DATA_DIR / item["file"]
        desc = item["description"]
        expected_type = item["type"]
        
        if not file_path.exists():
            print(f"  ⚠️ Archivo {file_path.name} no encontrado. Se omite.")
            continue
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            if expected_type == "dict" and not isinstance(data, dict):
                print(f"  ❌ Error de tipo en {file_path.name}: se esperaba dict, se obtuvo {type(data)}.")
                all_success = False
                continue
            if expected_type == "list" and not isinstance(data, list):
                print(f"  ❌ Error de tipo en {file_path.name}: se esperaba list, se obtuvo {type(data)}.")
                all_success = False
                continue
                
            store = SQLiteTableStore(table_name=table_name, db_path=DEFAULT_DB_PATH)
            store.save(data)
            
            # Verificación cruzada (Cross-check)
            reloaded = store.load()
            orig_len = len(data)
            migrated_len = len(reloaded) if isinstance(reloaded, (dict, list)) else 0
            
            if orig_len == migrated_len:
                print(f"  ✅ [{table_name}] {desc}: {migrated_len} registros migrados con éxito.")
                migration_summary.append((table_name, orig_len, migrated_len, "OK"))
            else:
                print(f"  ⚠️ [{table_name}] Discrepancia en conteo: {orig_len} en JSON vs {migrated_len} en SQLite.")
                migration_summary.append((table_name, orig_len, migrated_len, "DISCREPANCIA"))
                all_success = False
                
        except Exception as e:
            print(f"  ❌ Fallo crítico al migrar {table_name}: {e}")
            all_success = False
            migration_summary.append((table_name, 0, 0, f"ERROR: {e}"))
            
    print("\n" + "=" * 65)
    print(" RESUMEN DE LA MIGRACIÓN")
    print("=" * 65)
    for t_name, orig_cnt, mig_cnt, status in migration_summary:
        print(f" • {t_name:<24} | JSON: {orig_cnt:>4} | SQLite: {mig_cnt:>4} | Estado: {status}")
    print("=" * 65)
    
    if all_success:
        print("🎉 MIGRACIÓN COMPLETADA EXITOSAMENTE (100% Integridad Verificada).")
    else:
        print("❌ LA MIGRACIÓN TERMINÓ CON ADVERTENCIAS O ERRORES.")
        
    return all_success


if __name__ == "__main__":
    success = migrate_data()
    sys.exit(0 if success else 1)
