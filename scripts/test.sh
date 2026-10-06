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
PYTHON_BIN="${PYTHON_BIN:-${DIR}/venv/bin/python}"
if [ ! -x "${PYTHON_BIN}" ]; then PYTHON_BIN="python3"; fi
SCRATCH_DIR="${DIR}/scratch"
mkdir -p "${SCRATCH_DIR}"
DATA_SNAPSHOT=""
CLEAN_DATA_DIR=""
AUDIT_DATA_DIR=""
cleanup() {
    [ -z "${DATA_SNAPSHOT}" ] || rm -f -- "${DATA_SNAPSHOT}"
    [ -z "${CLEAN_DATA_DIR}" ] || rm -rf -- "${CLEAN_DATA_DIR}"
    [ -z "${AUDIT_DATA_DIR}" ] || rm -rf -- "${AUDIT_DATA_DIR}"
}
trap cleanup EXIT
DATA_SNAPSHOT="$(mktemp "${SCRATCH_DIR}/.data-snapshot.XXXXXX")"
CLEAN_DATA_DIR="$(mktemp -d "${SCRATCH_DIR}/clean-data.XXXXXX")"
AUDIT_DATA_DIR="$(mktemp -d "${SCRATCH_DIR}/audit-data.XXXXXX")"

snapshot_data() {
    if [ -d "${DIR}/data" ]; then
        # SQLite DB/WAL/SHM son estado operativo volátil y pueden cambiar por
        # la app mientras corre el hook. Los tests se aíslan aparte; no atribuir
        # escrituras concurrentes de la app al proceso de verificación.
        find "${DIR}/data" -type f \
            ! -name '*.db' ! -name '*.db-wal' ! -name '*.db-shm' \
            ! -name '*.sqlite' ! -name '*.sqlite-wal' ! -name '*.sqlite-shm' \
            ! -name '*.sqlite3' ! -name '*.sqlite3-wal' ! -name '*.sqlite3-shm' \
            -print0 | sort -z | xargs -0 -r sha256sum
    fi
}

copy_tracked_data() {
    local destination="$1"
    local tracked_file relative_path
    while IFS= read -r -d '' tracked_file; do
        relative_path="${tracked_file#data/}"
        if [ "${relative_path}" = "${tracked_file}" ] || [ ! -f "${DIR}/${tracked_file}" ]; then
            echo "FAIL: Missing tracked data file: ${tracked_file}"
            return 1
        fi
        mkdir -p "${destination}/$(dirname "${relative_path}")"
        cp -- "${DIR}/${tracked_file}" "${destination}/${relative_path}"
    done < <(git -C "${DIR}" ls-files -z -- data)
}

snapshot_data > "${DATA_SNAPSHOT}"

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

if [ -d "${DIR}/tests" ]; then
    # No heredar overrides del shell: tests/__init__.py crea snapshot temporal
    # únicamente con archivos rastreados y rechaza rutas dentro de data/ real.
    if env -u MPFP_DATA_DIR "${PYTHON_BIN}" -m pytest tests/ -v; then
        echo "PASS: Automated test suite passed."
    else
        echo "FAIL: Automated test suite failed."
        FAILED=1
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

# 3. Clean-checkout simulation: only tracked data files are available.
echo ""
echo "[Step 3] Running clean-checkout simulation..."
if copy_tracked_data "${CLEAN_DATA_DIR}"; then
    if MPFP_DATA_DIR="${CLEAN_DATA_DIR}" "${PYTHON_BIN}" -m pytest tests/ -q; then
        echo "PASS: Clean-checkout simulation passed."
    else
        echo "FAIL: Clean-checkout simulation failed."
        FAILED=1
    fi
else
    FAILED=1
fi

# 4. Security and Hygiene Audits
echo ""
echo "[Step 4] Running security & hygiene checks..."

if [ -f "${DIR}/scripts/audit_react_hooks.py" ]; then
    if "${PYTHON_BIN}" "${DIR}/scripts/audit_react_hooks.py"; then
        echo "PASS: React Hooks hygiene audit clean."
    else
        echo "FAIL: React Hooks audit flagged issues (Hooks after early returns)."
        FAILED=1
    fi
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
    # Diagnosticar con el snapshot versionado; no copiar datos locales/ignorados.
    if copy_tracked_data "${AUDIT_DATA_DIR}"; then
        if MPFP_DATA_DIR="${AUDIT_DATA_DIR}" "${PYTHON_BIN}" "${DIR}/scripts/audit_project.py"; then
            echo "PASS: Project diagnostic & database audit healthy."
        else
            echo "FAIL: Project diagnostic flagged errors."
            FAILED=1
        fi
    else
        FAILED=1
    fi
fi

echo ""
echo "[Final] Verifying stable production data isolation..."
if snapshot_data | diff -u "${DATA_SNAPSHOT}" -; then
    echo "PASS: Stable production data unchanged; SQLite runtime files excluded from snapshot."
else
    echo "FAIL: Stable production data changed (hash diff above)."; FAILED=1
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
