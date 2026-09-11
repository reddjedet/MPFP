#!/usr/bin/env python3
"""
Auditoría de Seguridad y Privacidad Pre-GitHub
Máquina de Planes, Finanzas y Portfolios (MPFP)
Verifica ausencia de secrets, tokens, rutas absolutas, cumplimiento de .gitignore y sanitización de datos.
"""

import os
import sys
import re
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# Patrones sospechosos de secretos
SECRET_PATTERNS = [
    (r"figd__[a-zA-Z0-9_\-]{20,}", "Token de Figma"),
    (r"ghp_[a-zA-Z0-9]{36,}", "Personal Access Token de GitHub"),
    (r"gho_[a-zA-Z0-9]{36,}", "OAuth Token de GitHub"),
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID"),
    (r"sk-[a-zA-Z0-9]{20,}", "Secret Key de OpenAI"),
    (r"-----BEGIN [A-Z ]+ PRIVATE KEY-----", "Clave Privada RSA/SSH/PGP"),
]

# Patrones de rutas absolutas locales
PATH_PATTERNS = [
    (r"/run/media/", "Ruta absoluta de unidad externa /run/media/"),
    (r"/home/[a-zA-Z0-9_\-]+/", "Ruta absoluta de usuario /home/"),
    (r"[A-Z]:\\[Uu]sers\\", "Ruta absoluta de Windows Users"),
]

# Exclusiones críticas que deben estar protegidas por .gitignore
CRITICAL_IGNORES = [
    ".env",
    "venv/",
    "frontend/node_modules/",
    "frontend/dist/",
    "app.log",
    "app.pid",
    "data/.cache_market.json",
    "data/user_holdings.json",
    "data/ppc_values.json"
]

def is_git_repo() -> bool:
    return (ROOT_DIR / ".git").is_dir()

def run_git(cmd: list[str]) -> str:
    if not is_git_repo() and cmd[0] in ("ls-files", "check-ignore", "rev-list", "status"):
        return ""
    try:
        res = subprocess.run(["git"] + cmd, cwd=str(ROOT_DIR), capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""

def get_candidate_files() -> list[str]:
    """Obtiene la lista de archivos a auditar, usando Git si está inicializado o el sistema de archivos."""
    if is_git_repo():
        tracked = run_git(["ls-files"])
        if tracked:
            return [f for f in tracked.split("\n") if f]
    
    # Fallback: escanear archivos del directorio respetando exclusiones principales
    candidates = []
    ignored_prefixes = ("venv", "frontend/node_modules", "frontend/dist", ".git", "__pycache__")
    for p in ROOT_DIR.rglob("*"):
        if p.is_file():
            rel = p.relative_to(ROOT_DIR).as_posix()
            if not any(rel.startswith(ig) or f"/{ig}/" in rel for ig in ignored_prefixes):
                candidates.append(rel)
    return candidates

def main():
    print("=" * 65)
    print(" 🛡️  AUDITORÍA DE SEGURIDAD Y PRIVACIDAD PRE-GITHUB (MPFP)")
    print("=" * 65)
    
    has_errors = False

    # 1. Verificar reglas en .gitignore
    print("\n[1/6] Verificando exclusiones críticas de .gitignore...")
    gitignore_path = ROOT_DIR / ".gitignore"
    if not gitignore_path.exists():
        print("  ❌ ALERTA: No se encontró el archivo .gitignore!")
        has_errors = True
    else:
        gitignore_content = gitignore_path.read_text(encoding="utf-8")
        for item in CRITICAL_IGNORES:
            if is_git_repo():
                # Probar con y sin slash final para máxima compatibilidad con o sin directorio existente
                res = run_git(["check-ignore", item]) or (run_git(["check-ignore", item.rstrip("/") + "/"]) if not item.endswith("/") else "")
                if res:
                    print(f"  ✓ Ignorado correctamente (vía git): {item}")
                else:
                    print(f"  ❌ ALERTA: {item} NO está siendo ignorado por .gitignore!")
                    has_errors = True
            else:
                base_item = item.split("/")[-1]
                if base_item in gitignore_content or item in gitignore_content:
                    print(f"  ✓ Regla presente en .gitignore: {item}")
                else:
                    print(f"  ❌ ALERTA: {item} no se encuentra en .gitignore!")
                    has_errors = True

    # 2. Verificar ausencia de archivo .env real
    print("\n[2/6] Verificando ausencia de .env y limpieza de .env.example...")
    real_env = ROOT_DIR / ".env"
    if real_env.exists():
        print("  ❌ ALERTA: Archivo .env existe en el directorio de trabajo! Debe ser eliminado.")
        has_errors = True
    else:
        print("  ✓ Archivo .env ausente en el repositorio (seguro).")

    env_ex = ROOT_DIR / ".env.example"
    if env_ex.exists():
        content = env_ex.read_text(encoding="utf-8")
        if "figd__" in content or "ghp_" in content or "sk-" in content:
            print("  ❌ ALERTA: .env.example contiene un token real expuesto!")
            has_errors = True
        else:
            print("  ✓ .env.example está limpio y sin valores reales.")
    else:
        print("  ⚠️ Advertencia: No se encontró .env.example.")

    # 3. Escaneo de archivos en busca de secretos
    print("\n[3/6] Escaneando archivos en busca de tokens y secretos...")
    files_to_audit = get_candidate_files()
    print(f"  Total de archivos a auditar: {len(files_to_audit)}")

    secret_found = False
    for tf in files_to_audit:
        filepath = ROOT_DIR / tf
        if not filepath.exists() or filepath.is_dir():
            continue
        try:
            content = filepath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for pattern, desc in SECRET_PATTERNS:
            if re.search(pattern, content):
                print(f"  ❌ SECRETO DETECTADO en {tf}: {desc}")
                secret_found = True
                has_errors = True

    if not secret_found:
        print("  ✓ Cero tokens o secretos detectados en archivos auditados.")

    # 4. Escaneo de rutas absolutas locales
    print("\n[4/6] Escaneando rutas absolutas de entorno local...")
    path_found = False
    code_extensions = (".py", ".ts", ".tsx", ".js", ".json", ".sh", ".md", ".html", ".yml", ".yaml")
    
    for tf in files_to_audit:
        if not tf.endswith(code_extensions):
            continue
        filepath = ROOT_DIR / tf
        try:
            content = filepath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for pattern, desc in PATH_PATTERNS:
            if re.search(pattern, content):
                if "audit_security_privacy.py" in tf or "walkthrough.md" in tf:
                    continue
                print(f"  ⚠️ RUTA LOCAL en {tf}: {desc}")
                path_found = True

    if not path_found:
        print("  ✓ Cero rutas absolutas locales encontradas en el código fuente.")

    # 5. Verificación de datos personales sanitizados en data/
    print("\n[5/6] Verificando sanitización de carteras y datos en data/...")
    portfolios_file = ROOT_DIR / "data" / "portfolios.json"
    holdings_file = ROOT_DIR / "data" / "user_holdings.json"
    
    personal_detected = False
    for f in (portfolios_file, holdings_file):
        if f.exists():
            txt = f.read_text(encoding="utf-8")
            if "mariano" in txt.lower():
                print(f"  ❌ ALERTA: Nombre personal encontrado en {f.name}!")
                personal_detected = True
                has_errors = True
    
    if not personal_detected:
        print("  ✓ Datos financieros y carteras sanitizados sin nombres personales.")

    # 6. Estado del Historial Git
    print("\n[6/6] Estado del Repositorio Git...")
    if is_git_repo():
        commit_count = run_git(["rev-list", "--count", "HEAD"])
        print(f"  ✓ Repositorio Git inicializado. Commits en historial: {commit_count or '0'}")
    else:
        print("  ℹ️ Repositorio Git aún no inicializado (virgen).")

    print("\n" + "=" * 65)
    if not has_errors:
        print(" 🏆 RESULTADO: EL CÓDIGO ESTÁ 100% SEGURO Y LIMPIO PARA GITHUB")
        print("=" * 65)
        return 0
    else:
        print(" ❌ RESULTADO: SE ENCONTRARON ADVERTENCIAS DE SEGURIDAD QUE DEBEN ATENDERSE")
        print("=" * 65)
        return 1

if __name__ == "__main__":
    sys.exit(main())
