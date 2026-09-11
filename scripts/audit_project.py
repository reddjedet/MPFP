#!/usr/bin/env python3
"""
Audit & Diagnostic Tool - Máquina de Planes, Finanzas y Portfolios (MPFP)
Ejecuta un diagnóstico integral de salud, ciberseguridad, datos y pruebas del proyecto.
"""

import os
import sys
import json
import time
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

def print_header(title: str):
    print("\n" + "=" * 60)
    print(f" 🔍 {title.upper()}")
    print("=" * 60)

def check_database():
    print_header("1. Verificación de Base de Datos Local")
    db_path = ROOT_DIR / "data" / "portfolios.json"
    if not db_path.exists():
        print(f"  ❌ Archivo {db_path} no encontrado.")
        return False
    try:
        with open(db_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            print("  ❌ Formato JSON inválido (no es un diccionario).")
            return False
        
        print(f"  ✅ Portfolios registrados: {len(data)}")
        for name, pf in data.items():
            mode = pf.get("mode", "weights")
            assets = pf.get("assets", {})
            print(f"     • [{name}] Modo: {mode} | Activos: {len(assets)} ({', '.join(list(assets.keys())[:5])}...)")
            
        # Verificar base de datos de calendario de reportes
        earn_path = ROOT_DIR / "data" / "earnings_calendar.json"
        if earn_path.exists():
            with open(earn_path, "r", encoding="utf-8") as f:
                earn_data = json.load(f)
            print(f"  ✅ Calendario de Reportes: {len(earn_data)} empresas configuradas.")
        else:
            print("  ⚠️ Archivo earnings_calendar.json no encontrado.")
            
        # Verificar base de datos de perfiles de valuación
        val_path = ROOT_DIR / "data" / "valuation_profiles.json"
        if val_path.exists():
            with open(val_path, "r", encoding="utf-8") as f:
                val_data = json.load(f)
            profiles_count = len(val_data.get("profiles", {}))
            sectors_count = len(val_data.get("sectors", []))
            print(f"  ✅ Valuación Fundamental: {profiles_count} empresas y {sectors_count} sectores configurados.")
        else:
            print("  ⚠️ Archivo valuation_profiles.json no encontrado.")
            
        # Verificar base de datos de Fair Values de GuruFocus
        fv_path = ROOT_DIR / "data" / "fair_values.json"
        if fv_path.exists():
            with open(fv_path, "r", encoding="utf-8") as f:
                fv_data = json.load(f)
            print(f"  ✅ GuruFocus Fair Values: {len(fv_data)} activos registrados con persistencia global.")
        else:
            print("  ⚠️ Archivo fair_values.json no encontrado.")
            
        # Verificar base de datos de inputs recordados de valuación
        user_val_path = ROOT_DIR / "data" / "user_valuation_inputs.json"
        if user_val_path.exists():
            with open(user_val_path, "r", encoding="utf-8") as f:
                user_val_data = json.load(f)
            print(f"  ✅ Memoria de Valuación Fundamental: {len(user_val_data)} activos con inputs personalizados recordados.")
        else:
            print("  ⚠️ Archivo user_valuation_inputs.json no encontrado.")
            
        # Verificar base de datos de Precio Promedio de Compra (PPC)
        ppc_path = ROOT_DIR / "data" / "ppc_values.json"
        if ppc_path.exists():
            with open(ppc_path, "r", encoding="utf-8") as f:
                ppc_data = json.load(f)
            print(f"  ✅ Precios Promedio de Compra (PPC): {len(ppc_data)} activos registrados con persistencia global.")
        else:
            print("  ⚠️ Archivo ppc_values.json no encontrado.")

        # Verificar base de datos de P/Normalized FCF (P/FCF)
        pfcf_path = ROOT_DIR / "data" / "pfcf_values.json"
        if pfcf_path.exists():
            with open(pfcf_path, "r", encoding="utf-8") as f:
                pfcf_data = json.load(f)
            print(f"  ✅ Múltiplos P/Normalized FCF: {len(pfcf_data)} activos configurados.")
        else:
            print("  ⚠️ Archivo pfcf_values.json no encontrado.")

        # Verificar base de datos de Tenencias Reales de Usuario (Rotation Multi-Cuenta)
        holdings_path = ROOT_DIR / "data" / "user_holdings.json"
        if holdings_path.exists():
            with open(holdings_path, "r", encoding="utf-8") as f:
                holdings_data = json.load(f)
            if isinstance(holdings_data, dict):
                total_holdings = sum(len(p.get("holdings", {})) for p in holdings_data.values() if isinstance(p, dict))
                print(f"  ✅ Tenencias Reales de Usuario: {len(holdings_data)} carteras multi-cuenta ({total_holdings} activos físicos).")
            else:
                print("  ✅ Tenencias Reales de Usuario: archivo cargado correctamente.")
        else:
            print("  ⚠️ Archivo user_holdings.json no encontrado.")

        # Verificar base de datos de Ratios de Conversión de CEDEARs
        ratios_path = ROOT_DIR / "data" / "cedear_ratios.json"
        if ratios_path.exists():
            with open(ratios_path, "r", encoding="utf-8") as f:
                ratios_data = json.load(f)
            print(f"  ✅ Ratios de Conversión CEDEAR: {len(ratios_data)} activos parametrizados.")
        else:
            print("  ⚠️ Archivo cedear_ratios.json no encontrado.")

        return True
    except Exception as e:
        print(f"  ❌ Error al leer la base de datos: {e}")
        return False

def check_security():
    print_header("2. Verificación de Ciberseguridad & Validaciones")
    from services.security_service import sanitize_ticker, sanitize_portfolio_name, parse_weights_string
    
    # 1. Test injection prevention
    xss_ticker = sanitize_ticker("<script>alert(1)</script>")
    if xss_ticker is None:
        print("  ✅ Filtro XSS en Tickers: Activo y bloqueando cargas maliciosas.")
    else:
        print("  ❌ Falló el filtro XSS en Tickers.")

    # 2. Test portfolio name validation
    sql_name = sanitize_portfolio_name("portfolio'; DROP TABLE;")
    if sql_name != "portfolio'; DROP TABLE;" and len(sql_name) < 30:
        print(f"  ✅ Sanitización de nombres de cartera: Activa ('{sql_name}').")
    else:
        print("  ❌ Falló la sanitización de nombres.")

    # 3. Test weights validation
    res, err = parse_weights_string("AAPL:50, MSFT:50")
    if res and not err:
        print("  ✅ Parser de ponderaciones: Operativo y validando sintaxis.")
    else:
        print(f"  ❌ Error en parser de ponderaciones: {err}")

def run_test_suite():
    print_header("3. Ejecución de la Suite de Pruebas Automatizadas")
    loader = unittest.TestLoader()
    suite = loader.discover(str(ROOT_DIR / "tests"), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=1)
    result = runner.run(suite)
    
    if result.wasSuccessful():
        print(f"\n  ✅ Todos los {result.testsRun} tests pasaron satisfactoriamente.")
        return True
    else:
        print(f"\n  ❌ Fallaron {len(result.failures)} tests y hubo {len(result.errors)} errores.")
        return False

def main():
    print("\n" + "🚀" * 30)
    print("      INICIANDO AUDITORÍA INTEGRAL DE MPFP")
    print("   (Máquina de Planes, Finanzas y Portfolios)")
    print("🚀" * 30)
    
    t0 = time.time()
    db_ok = check_database()
    check_security()
    tests_ok = run_test_suite()
    elapsed = time.time() - t0
    
    print_header("Resumen del Diagnóstico")
    if db_ok and tests_ok:
        print(f"  🏆 ESTADO GENERAL: 100% SALUDABLE (Completado en {elapsed:.2f}s)")
    else:
        print(f"  ⚠️ ESTADO GENERAL: REQUIERE ATENCIÓN (Completado en {elapsed:.2f}s)")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
