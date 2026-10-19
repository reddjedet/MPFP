#!/usr/bin/env bash
# ==============================================================================
# Backup consistente de data/ (SQLite + JSON) - MPFP
#
# Usa la API sqlite3.Connection.backup() para generar copias consistentes de
# cada base SQLite, sin depender de copiar .db + -wal + -shm a mano.
# Empaqueta todo en un .tar.gz con manifiesto y checksums.
#
# Uso:
#   ./scripts/backup_data.sh                 # crea backup y aplica retención
#   ./scripts/backup_data.sh --dry-run       # muestra qué haría
#   ./scripts/backup_data.sh --keep 3        # conserva los 3 backups más nuevos
# ==============================================================================

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${MPFP_DATA_DIR:-${DIR}/data}"
BACKUP_DIR="${MPFP_BACKUP_DIR:-${DATA_DIR}/backups}"
KEEP="${MPFP_BACKUP_KEEP:-5}"
PYTHON_BIN="${PYTHON_BIN:-${DIR}/venv/bin/python}"
DRY_RUN=0

if [ ! -x "${PYTHON_BIN}" ]; then
    PYTHON_BIN="python3"
fi

while [ "$#" -gt 0 ]; do
    case "$1" in
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --keep)
            if [ "$#" -lt 2 ] || ! [[ "$2" =~ ^[0-9]+$ ]] || [ "$2" -lt 1 ]; then
                echo "ERROR: --keep requiere un entero >= 1" >&2
                exit 2
            fi
            KEEP="$2"
            shift 2
            ;;
        -h|--help)
            sed -n '2,20p' "$0"
            exit 0
            ;;
        *)
            echo "ERROR: opción desconocida: $1" >&2
            exit 2
            ;;
    esac
done

if [ ! -d "${DATA_DIR}" ]; then
    echo "ERROR: no existe el directorio de datos: ${DATA_DIR}" >&2
    exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="${BACKUP_DIR}/mpfp_backup_${STAMP}.tar.gz"
WORK_DIR=""

cleanup() {
    [ -z "${WORK_DIR}" ] || rm -rf -- "${WORK_DIR}"
}
trap cleanup EXIT

echo "======================================================="
echo " Backup consistente de MPFP"
echo "======================================================="
echo "Origen:  ${DATA_DIR}"
echo "Destino: ${ARCHIVE}"
echo "Retención: ${KEEP} backups mpfp_backup_*.tar.gz"

if [ "${DRY_RUN}" -eq 1 ]; then
    echo ""
    echo "[dry-run] Se crearían copias SQLite consistentes de:"
    find "${DATA_DIR}" -maxdepth 1 -type f -name '*.db' -printf '  - %f\n' | sort
    echo "[dry-run] Se incluirían también los JSON/archivos no SQLite de data/."
    echo "[dry-run] No se escribió nada."
    exit 0
fi

mkdir -p "${BACKUP_DIR}"
WORK_DIR="$(mktemp -d "${BACKUP_DIR}/.backup_tmp.XXXXXX")"
mkdir -p "${WORK_DIR}/data"

"${PYTHON_BIN}" - "${DATA_DIR}" "${WORK_DIR}/data" "${WORK_DIR}/manifest.txt" <<'PY'
import hashlib
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
manifest_path = Path(sys.argv[3]).resolve()

target.mkdir(parents=True, exist_ok=True)
manifest_lines = [
    f"created_at={datetime.now(timezone.utc).isoformat()}",
    f"source={source}",
    "",
]

for db_path in sorted(source.glob("*.db")):
    dst_path = target / db_path.name
    src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        integrity = src.execute("PRAGMA integrity_check;").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"Integridad inválida en {db_path.name}: {integrity}")
        dst = sqlite3.connect(dst_path)
        try:
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE;")
        finally:
            dst.close()
    finally:
        src.close()
    manifest_lines.append(f"sqlite={db_path.name} integrity=ok")
    print(f"  ✓ SQLite consistente: {db_path.name}")

for root, dirs, files in os.walk(source):
    root_path = Path(root)
    dirs[:] = [
        d for d in dirs
        if d != "backups" and not d.startswith(".backup_tmp.")
    ]
    for name in files:
        path = root_path / name
        if path.suffix in (".db", ".db-wal", ".db-shm", ".sqlite", ".sqlite-wal", ".sqlite-shm"):
            continue
        rel = path.relative_to(source)
        dst = target / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dst)
        manifest_lines.append(f"file={rel.as_posix()}")

print("", file=sys.stderr)
for path in sorted(target.rglob("*")):
    if not path.is_file():
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest_lines.append(f"sha256={digest} {path.relative_to(target).as_posix()}")

manifest_path.write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
PY

tar -czf "${ARCHIVE}" -C "${WORK_DIR}" data manifest.txt
tar -tzf "${ARCHIVE}" >/dev/null

echo ""
echo "✓ Backup creado y verificado: ${ARCHIVE}"
echo "  Tamaño: $(du -h "${ARCHIVE}" | cut -f1)"

mapfile -t OLD_ARCHIVES < <(
    find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'mpfp_backup_*.tar.gz' -printf '%T@ %p\n' \
        | sort -nr \
        | tail -n +"$((KEEP + 1))" \
        | cut -d' ' -f2-
)

if [ "${#OLD_ARCHIVES[@]}" -gt 0 ]; then
    echo ""
    echo "Aplicando retención (conservando ${KEEP}):"
    for old in "${OLD_ARCHIVES[@]}"; do
        echo "  - eliminando ${old}"
        rm -f -- "${old}"
    done
else
    echo "Retención: no hay backups excedentes."
fi
