#!/usr/bin/env python3
import json
import os
import sys

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({
                "decision": "deny",
                "reason": "[TOKEN GUARD ERROR] Payload vacío en llamada a view_file."
            }))
            return
        data = json.loads(raw)
    except Exception as e:
        # FAIL-CLOSED ante JSON malformado
        print(json.dumps({
            "decision": "deny",
            "reason": f"[TOKEN GUARD ERROR] Payload JSON corrupto o ilegible en view_file: {e}"
        }))
        return

    tool_call = data.get("toolCall", {})
    args = tool_call.get("args", {})
    file_path = args.get("AbsolutePath", "")

    start_line = args.get("StartLine")
    end_line = args.get("EndLine")
    THRESHOLD = 350

    if not file_path:
        print(json.dumps({
            "decision": "deny",
            "reason": "[TOKEN GUARD ERROR] AbsolutePath no fue provisto en la llamada a view_file."
        }))
        return

    # Si se especificó rango de líneas
    if start_line is not None and end_line is not None:
        if (end_line - start_line) <= THRESHOLD:
            print(json.dumps({"decision": "allow"}))
            return
        else:
            print(json.dumps({
                "decision": "deny",
                "reason": (
                    f"[TOKEN GUARD] El rango solicitado ({end_line - start_line} líneas) supera el límite de {THRESHOLD}.\n"
                    f"Acota el rango StartLine-EndLine o delega a un subagente de research."
                )
            }))
            return

    if not os.path.exists(file_path):
        print(json.dumps({"decision": "allow"}))
        return

    if not os.path.isfile(file_path):
        print(json.dumps({"decision": "allow"}))
        return

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            line_count = sum(1 for _ in f)
    except Exception:
        line_count = 0

    if line_count > THRESHOLD:
        file_name = os.path.basename(file_path)
        print(json.dumps({
            "decision": "deny",
            "reason": (
                f"[TOKEN GUARD - SPOTIFY PATTERN ACTIVADO]\n"
                f"El archivo \"{file_name}\" tiene {line_count} líneas (supera el límite de {THRESHOLD} líneas).\n"
                f"Para ahorrar tokens y evitar saturación del contexto:\n"
                f"1. DELEGA esta lectura a un subagente de tipo research con Model=flash_lite o Model=flash\n"
                f"2. O vuelve a llamar a view_file especificando StartLine y EndLine (rango <= {THRESHOLD} líneas)."
            )
        }))
        return

    print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
