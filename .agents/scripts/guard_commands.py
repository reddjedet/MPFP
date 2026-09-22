#!/usr/bin/env python3
import json
import re
import sys

# Comandos y patrones estrictamente bloqueados según las reglas canónicas
FORBIDDEN_PATTERNS = [
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(/|/\*|~|\$HOME)", "Intento de borrado recursivo destructivo de raíz o home."),
    (r"contenido\s+agentico.*(rm|truncate|mv|cp.*>|>|chmod|chown)", "Violación de Regla 1: Modificación no autorizada de la librería central."),
    (r"\bmkfs\b", "Comando de formateo de disco no permitido."),
    (r"\bdd\b.*if=", "Comando dd de bajo nivel peligroso no permitido."),
    (r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;", "Fork bomb no permitida."),
    (r"\bshutdown\b|\breboot\b|\binit\s+0\b", "Comandos de apagado/reinicio del sistema no permitidos.")
]

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({
                "decision": "deny",
                "reason": "[COMMAND GUARD ERROR] Payload vacío en llamada a run_command."
            }))
            return
        data = json.loads(raw)
    except Exception as e:
        # FAIL-CLOSED para ejecución de comandos con JSON corrupto o malformado
        print(json.dumps({
            "decision": "deny",
            "reason": f"[COMMAND GUARD - HARNESS ERROR] Payload de herramienta corrupto o ilegible: {e}"
        }))
        return

    tool_call = data.get("toolCall", {})
    args = tool_call.get("args", {})
    if "CommandLine" not in args:
        print(json.dumps({
            "decision": "deny",
            "reason": "[COMMAND GUARD ERROR] CommandLine ausente en llamada a run_command."
        }))
        return

    command_line = args.get("CommandLine", "")
    if not command_line.strip():
        print(json.dumps({
            "decision": "deny",
            "reason": "[COMMAND GUARD ERROR] CommandLine vacío en llamada a run_command."
        }))
        return

    # Si se detecta mención a contenido agéntico con comandos de escritura/borrado
    if "contenido agentico" in command_line:
        write_indicators = ["rm ", "truncate ", ">", "mv ", "sed -i", "cp "]
        if any(w in command_line for w in write_indicators):
            print(json.dumps({
                "decision": "deny",
                "reason": (
                    "[COMMAND GUARD - HARNESS BLOCK] Violación de Regla 1:\n"
                    "La librería central 'contenido agentico' es estrictamente de SOLO LECTURA.\n"
                    f"Comando bloqueado: {command_line}"
                )
            }))
            return

    for pattern, reason in FORBIDDEN_PATTERNS:
        if re.search(pattern, command_line, re.IGNORECASE):
            print(json.dumps({
                "decision": "deny",
                "reason": f"[COMMAND GUARD - HARNESS BLOCK] Acción denegada por seguridad:\n{reason}\nComando bloqueado: {command_line}"
            }))
            return

    print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
