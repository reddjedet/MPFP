#!/usr/bin/env bash
# ==============================================================================
# Bootstrap Determinista del Harness Agéntico (MPFP)
# Inicializa permisos, valida el entorno y certifica contratos de hooks.
# ==============================================================================

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIR}"

echo "======================================================="
echo "       MPFP Agent Harness - Deterministic Bootstrap    "
echo "======================================================="

# 1. Determinar ejecutable de Python
if [ -d "${DIR}/venv" ]; then
    PYTHON_BIN="${DIR}/venv/bin/python"
else
    PYTHON_BIN="python3"
fi

echo "[1/4] Verificando entorno Python (${PYTHON_BIN})..."
"${PYTHON_BIN}" --version

# 2. Asegurar permisos de ejecución en scripts de guardrails y herramientas
echo "[2/4] Configurando permisos de ejecución en scripts..."
chmod +x .agents/scripts/*.py 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

# 3. Validar existencia del contrato de hooks
echo "[3/4] Validando contrato de configuración (.agents/hooks.json)..."
if [ ! -f "${DIR}/.agents/hooks.json" ]; then
    echo "ERROR CRÍTICO: .agents/hooks.json no encontrado."
    exit 1
fi
"${PYTHON_BIN}" -m unittest tests/test_hooks_contract.py

# 4. Validar comportamiento de guardrails (Token Guard, Command Guard, Syntax Guard)
echo "[4/4] Validando tests unitarios de guardrails..."
"${PYTHON_BIN}" -m unittest tests/test_agent_guards.py

echo ""
echo "======================================================="
echo "RESULTADO: HARNESS AGÉNTICO INICIALIZADO Y VERIFICADO (100%)"
echo "======================================================="
exit 0
