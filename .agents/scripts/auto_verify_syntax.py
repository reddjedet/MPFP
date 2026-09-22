#!/usr/bin/env python3
import json
import os
import py_compile
import subprocess
import sys

def main():
    error = None
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            error = "Payload vacío"
            data = {}
        else:
            data = json.loads(raw)
    except Exception as exc:
        error = f"Payload JSON inválido: {exc}"
        data = {}

    args = data.get("toolCall", {}).get("args", {}) if isinstance(data, dict) else {}
    target_file = args.get("TargetFile", "")
    if not target_file:
        error = error or "TargetFile ausente"
    elif os.path.isfile(target_file):
        if target_file.endswith(".py"):
            try:
                py_compile.compile(target_file, doraise=True)
            except py_compile.PyCompileError as exc:
                error = f"Sintaxis Python inválida en {target_file}: {exc}"
        elif target_file.endswith((".ts", ".tsx")) and "frontend" in target_file:
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            frontend_dir = os.path.join(project_root, "frontend")
            tsc_bin = os.path.join(frontend_dir, "node_modules", ".bin", "tsc")
            if os.path.exists(tsc_bin):
                result = subprocess.run([tsc_bin, "--noEmit"], cwd=frontend_dir, capture_output=True, text=True)
                if result.returncode != 0:
                    error = f"TypeScript inválido tras editar {target_file}: {result.stdout[:500]}{result.stderr[:500]}"

    # PostToolUse exige stdout JSON vacío; los fallos quedan visibles en stderr.
    if error:
        print(f"[SYNTAX GUARD] {error}", file=sys.stderr)
    print("{}")

if __name__ == "__main__":
    main()
