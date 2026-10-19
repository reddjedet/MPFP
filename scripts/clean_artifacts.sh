#!/usr/bin/env bash
# ==============================================================================
# Limpieza de artefactos regenerables - MPFP
#
# Por defecto SOLO muestra qué borraría (dry-run). Para ejecutar:
#   ./scripts/clean_artifacts.sh --yes
#
# No toca: data/*.db, data/*.json, venv/, node_modules/, frontend/dist/,
# static/, archivos trackeados ni backups.
# ==============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=1
TOTAL=0
COUNT=0

for arg in "$@"; do
    case "${arg}" in
        --yes)
            DRY_RUN=0
            ;;
        --dry-run)
            DRY_RUN=1
            ;;
        -h|--help)
            sed -n '2,12p' "$0"
            exit 0
            ;;
        *)
            echo "ERROR: opción desconocida: ${arg}" >&2
            exit 2
            ;;
    esac
done

if [ -f "${ROOT}/app.pid" ] && kill -0 "$(cat "${ROOT}/app.pid")" 2>/dev/null; then
    echo "ERROR: el backend sigue corriendo. Detené la app antes de limpiar." >&2
    echo "       Usá ./stop.sh o una parada dirigida por PID." >&2
    exit 1
fi

if [ -f "${ROOT}/frontend.pid" ] && kill -0 "$(cat "${ROOT}/frontend.pid")" 2>/dev/null; then
    echo "ERROR: el frontend sigue corriendo. Detené la app antes de limpiar." >&2
    exit 1
fi

delete_path() {
    local path="$1"
    if [ ! -e "${path}" ] && [ ! -L "${path}" ]; then
        return 0
    fi

    case "${path}" in
        "${ROOT}"/*) ;;
        *)
            echo "ERROR: ruta fuera del repositorio, se omite: ${path}" >&2
            return 1
            ;;
    esac

    local size
    size="$(du -sh -- "${path}" 2>/dev/null | cut -f1 || echo '?')"
    echo "  - ${path#${ROOT}/} (${size})"
    COUNT=$((COUNT + 1))
    TOTAL=$((TOTAL + $(du -sk -- "${path}" 2>/dev/null | cut -f1 || echo 0)))

    if [ "${DRY_RUN}" -eq 0 ]; then
        rm -rf -- "${path}"
    fi
}

echo "======================================================="
if [ "${DRY_RUN}" -eq 1 ]; then
    echo " Limpieza de artefactos (DRY-RUN, no borra nada)"
else
    echo " Limpieza de artefactos (EJECUTANDO)"
fi
echo "======================================================="

while IFS= read -r -d '' path; do
    delete_path "${path}"
done < <(
    find "${ROOT}" \
        \( -path "${ROOT}/.git" -o -path "${ROOT}/venv" -o -path "${ROOT}/frontend/node_modules" \) -prune -o \
        -type d \( -name '__pycache__' -o -name '.pytest_cache' \) -print0
)

for path in \
    "${ROOT}/frontend/tsconfig.tsbuildinfo" \
    "${ROOT}/out.log" \
    "${ROOT}/out2.log" \
    "${ROOT}/app.log" \
    "${ROOT}/frontend.log" \
    "${ROOT}/app.pid" \
    "${ROOT}/frontend.pid"
do
    delete_path "${path}"
done

if [ -d "${ROOT}/scratch" ]; then
    while IFS= read -r -d '' path; do
        delete_path "${path}"
    done < <(find "${ROOT}/scratch" -mindepth 1 -maxdepth 1 ! -name '.gitkeep' -print0)
fi

for path in "${ROOT}/ignorados/fixes.md" "${ROOT}/ignorados/problemas.md"; do
    if [ -f "${path}" ] && [ ! -s "${path}" ]; then
        delete_path "${path}"
    fi
done

if [ -L "${ROOT}/.pi/agents/rules_architect.md" ] && [ ! -e "${ROOT}/.pi/agents/rules_architect.md" ]; then
    delete_path "${ROOT}/.pi/agents/rules_architect.md"
fi

echo ""
if [ "${DRY_RUN}" -eq 1 ]; then
    echo "Total estimado: $((TOTAL / 1024)) MB en ${COUNT} rutas."
    echo "Para ejecutar: ./scripts/clean_artifacts.sh --yes"
else
    echo "Limpieza completada: ${COUNT} rutas, ~$((TOTAL / 1024)) MB liberados."
fi
