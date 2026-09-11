#!/usr/bin/env python3
import json
import os
import sys

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool_call = data.get("toolCall", {})
    args = tool_call.get("args", {})
    file_path = args.get("AbsolutePath", "")

    start_line = args.get("StartLine")
    end_line = args.get("EndLine")
    THRESHOLD = 350

    if start_line is not None and end_line is not None:
        if (end_line - start_line) <= THRESHOLD:
            print(json.dumps({"decision": "allow"}))
            return

    if not file_path or not os.path.exists(file_path) or not os.path.isfile(file_path):
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
                f"El archivo '{file_name}' tiene {line_count} líneas (supera el límite de {THRESHOLD} líneas).\n"
                f"Para ahorrar tokens y evitar saturación del contexto:\n"
                f"1. DELEGA esta lectura a un subagente de tipo 'research' con Model='flash_lite' o Model='flash' "
                f"pidiéndole que extraiga/resuma solo la sección requerida.\n"
                f"2. O si sabes qué parte necesitas, vuelve a llamar a 'view_file' especificando StartLine y EndLine "
                f"(rango <= {THRESHOLD} líneas)."
            )
        }))
        return

    print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
