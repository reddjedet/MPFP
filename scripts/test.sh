#!/usr/bin/env bash
# ==============================================================================
# Unified Automated Test & Verification Pipeline (test.sh)
# Adapts dynamically based on detected components in the project.
# ==============================================================================

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIR}"

echo "======================================================="
echo "       Unified Automated Verification Pipeline"
echo "======================================================="

FAILED=0

# 1. Frontend / TypeScript Verification (if present)
if [ -d "${DIR}/frontend" ] && [ -f "${DIR}/frontend/package.json" ]; then
    echo ""
    echo "[Step 1] Verifying frontend static types..."
    if (cd "${DIR}/frontend" && (./node_modules/.bin/tsc --noEmit 2>/dev/null || npx tsc --noEmit)); then
        echo "PASS: Frontend static typing verified."
    else
        echo "FAIL: Frontend static typing errors detected."
        FAILED=1
    fi
fi

# 2. Automated Test Suite (Python, Go, Rust, or custom)
echo ""
echo "[Step 2] Running automated test suite..."

# Test Isolation invariant: tests must never mutate production data/
# La comparación corre SIEMPRE (incluso si el suite falla) y con baseline vacío
# si data/ no existía al inicio: todo archivo posterior cuenta como mutación.
snapshot_data() {
    if [ -d "${DIR}/data" ]; then
        find "${DIR}/data" -type f -exec md5sum {} + | sort -k2
    fi
}
DATA_SNAPSHOT="$(mktemp)"
trap 'rm -f "${DATA_SNAPSHOT}"' EXIT
snapshot_data > "${DATA_SNAPSHOT}"

if [ -d "${DIR}/tests" ]; then
    if [ -x "${DIR}/venv/bin/pytest" ]; then
        if "${DIR}/venv/bin/pytest" tests/ -v; then
            echo "PASS: Automated test suite passed."
        else
            echo "FAIL: Automated test suite failed."
            FAILED=1
        fi
    else
        if "${DIR}/venv/bin/python" -m unittest discover -s tests -p "test_*.py" -v; then
            echo "PASS: Automated test suite passed."
        else
            echo "FAIL: Automated test suite failed."
            FAILED=1
        fi
    fi
elif [ -f "${DIR}/Cargo.toml" ]; then
    if cargo test; then
        echo "PASS: Cargo test suite passed."
    else
        echo "FAIL: Cargo test suite failed."
        FAILED=1
    fi
else
    echo "INFO: No tests/ directory detected; skipping unit test discovery."
fi

if snapshot_data | diff -q "${DATA_SNAPSHOT}" - > /dev/null; then
    echo "PASS: Test isolation verified (data/ untouched)."
else
    echo "FAIL: Test suite mutated production data/ (Test Isolation violation)."
    FAILED=1
fi

# 3. Security and Privacy Hygiene Audit (if scripts exist)
echo ""
echo "[Step 3] Running security & hygiene checks..."
if [ -x "${DIR}/venv/bin/python" ]; then
    PYTHON_BIN="${DIR}/venv/bin/python"
else
    PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

if [ -f "${DIR}/scripts/audit_security_privacy.py" ]; then
    if "${PYTHON_BIN}" "${DIR}/scripts/audit_security_privacy.py"; then
        echo "PASS: Security & privacy audit clean."
    else
        echo "FAIL: Security & privacy audit flagged issues."
        FAILED=1
    fi
fi

# 4. Project Full Diagnostic & Database Integrity
echo ""
echo "[Step 4] Running project health & database diagnostic..."
if [ -f "${DIR}/scripts/audit_project.py" ]; then
    if "${PYTHON_BIN}" "${DIR}/scripts/audit_project.py"; then
        echo "PASS: Project diagnostic & database audit healthy."
    else
        echo "FAIL: Project diagnostic flagged errors."
        FAILED=1
    fi
fi

echo ""
echo "======================================================="
if [ "${FAILED}" -eq 0 ]; then
    echo "RESULT: ALL TESTS AND VERIFICATIONS PASSED (100%)"
    echo "======================================================="
    exit 0
else
    echo "RESULT: ONE OR MORE CHECKS FAILED."
    echo "======================================================="
    exit 1
fi
