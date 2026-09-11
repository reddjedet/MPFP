#!/bin/bash
# ==============================================================================
# Suite de Pruebas Automatizadas y Diagnóstico (test.sh) - MPFP
# Máquina de Planes, Finanzas y Portfolios
# ==============================================================================

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================="
echo "       Suite de Pruebas & Verificación Integral        "
echo "======================================================="

# 1. Frontend React 19 & TypeScript Verification
echo ""
echo "[1/3] Verificando tipado TypeScript y compilación de React 19..."
if [ -d "$DIR/frontend" ]; then
    (cd "$DIR/frontend" && npx tsc --noEmit && npm run build >/dev/null 2>&1)
    echo "✓ Frontend React 19 verificado y compilado sin errores!"
fi

# 2. Backend Unittest Suite
echo ""
echo "[2/3] Ejecutando suite de pruebas unitarias e integración..."
if [ -d "$DIR/venv" ]; then
    PYTHON_BIN="$DIR/venv/bin/python"
else
    PYTHON_BIN="python3"
fi

"$PYTHON_BIN" -m unittest discover -s tests -p "test_*.py" -v
echo "✓ Pruebas unitarias aprobadas con éxito!"

# 3. Auditoría Integral de Base de Datos y Ciberseguridad
echo ""
echo "[3/3] Ejecutando diagnóstico de ciberseguridad y base de datos..."
"$PYTHON_BIN" scripts/audit_project.py
"$PYTHON_BIN" scripts/audit_security_privacy.py

echo ""
echo "======================================================="
echo "  [✓] TODAS LAS PRUEBAS Y DIAGNÓSTICOS APROBADOS (100%)"
echo "======================================================="
