#!/usr/bin/env python3
"""
Tests de contrato de configuración para .agents/hooks.json.
Verifica:
1. hooks.json es un JSON sintácticamente válido.
2. Cada bloque de hook contiene estructuras soportadas (PreToolUse, PostToolUse, etc.).
3. Los scripts referenciados en los comandos existen en el disco y son analizables.
4. Los matchers son válidos y coinciden con las herramientas esperadas.
5. Presencia explícita de los 3 guards del harness: token-guard, command-guard, syntax-guard.
"""

import json
import re
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
HOOKS_JSON_PATH = ROOT_DIR / ".agents" / "hooks.json"

class TestHooksContract(unittest.TestCase):

    def test_hooks_json_exists_and_is_valid_json(self):
        self.assertTrue(HOOKS_JSON_PATH.exists(), f"No se encontró {HOOKS_JSON_PATH}")
        content = HOOKS_JSON_PATH.read_text(encoding="utf-8")
        data = json.loads(content)
        self.assertIsInstance(data, dict, "hooks.json debe ser un objeto raíz")

    def test_all_three_guards_present(self):
        content = HOOKS_JSON_PATH.read_text(encoding="utf-8")
        data = json.loads(content)
        expected_guards = {"token-guard", "command-guard", "syntax-guard"}
        actual_guards = set(data.keys())
        self.assertTrue(
            expected_guards.issubset(actual_guards),
            f"Faltan guards en hooks.json. Esperados: {expected_guards}, Encontrados: {actual_guards}"
        )

    def test_expected_events_and_matchers(self):
        content = HOOKS_JSON_PATH.read_text(encoding="utf-8")
        data = json.loads(content)
        
        # 1. token-guard debe estar en PreToolUse sobre view_file
        self.assertIn("PreToolUse", data["token-guard"])
        token_matchers = [h.get("matcher") for h in data["token-guard"]["PreToolUse"]]
        self.assertIn("view_file", token_matchers)

        # 2. command-guard debe estar en PreToolUse sobre run_command
        self.assertIn("PreToolUse", data["command-guard"])
        cmd_matchers = [h.get("matcher") for h in data["command-guard"]["PreToolUse"]]
        self.assertIn("run_command", cmd_matchers)

        # 3. syntax-guard debe estar en PostToolUse sobre herramientas de escritura
        self.assertIn("PostToolUse", data["syntax-guard"])
        syntax_matchers = [h.get("matcher", "") for h in data["syntax-guard"]["PostToolUse"]]
        matched_any = any("replace_file_content" in m or "write_to_file" in m for m in syntax_matchers)
        self.assertTrue(matched_any, f"syntax-guard debe interceptar replace_file_content o write_to_file: {syntax_matchers}")

    def test_hook_structure_and_scripts_existence(self):
        content = HOOKS_JSON_PATH.read_text(encoding="utf-8")
        data = json.loads(content)
        
        valid_events = {"PreToolUse", "PostToolUse", "PreInvocation", "PostInvocation", "Stop"}
        
        for hook_name, hook_config in data.items():
            self.assertIsInstance(hook_config, dict, f"Hook '{hook_name}' debe ser un diccionario")
            self.assertTrue(hook_config.get("enabled", True), f"Hook '{hook_name}' debe estar habilitado")
            
            # Buscar eventos definidos
            found_events = [ev for ev in valid_events if ev in hook_config]
            self.assertTrue(len(found_events) > 0, f"Hook '{hook_name}' no define ningún evento válido")
            
            for ev in found_events:
                handlers = hook_config[ev]
                self.assertIsInstance(handlers, list, f"Evento {ev} en '{hook_name}' debe ser una lista")
                
                for item in handlers:
                    if ev in ("PreToolUse", "PostToolUse"):
                        self.assertIn("matcher", item, f"Falta 'matcher' en {ev} de '{hook_name}'")
                        self.assertTrue(len(item["matcher"].strip()) > 0, "El matcher no puede estar vacío")
                        hook_list = item.get("hooks", [])
                    else:
                        hook_list = [item]
                        
                    for h in hook_list:
                        cmd = h.get("command", "")
                        self.assertTrue(len(cmd) > 0, f"Comando vacío en hook '{hook_name}'")
                        
                        # Extraer rutas de scripts .py mencionados en el comando
                        script_matches = re.findall(r"([a-zA-Z0-9_\-./]+\.py)", cmd)
                        for sm in script_matches:
                            # Puede ser relativo a la raíz o a .agents
                            p_root = ROOT_DIR / sm
                            p_agents = ROOT_DIR / ".agents" / sm
                            p_agents_scripts = ROOT_DIR / ".agents" / "scripts" / Path(sm).name
                            exists = p_root.exists() or p_agents.exists() or p_agents_scripts.exists()
                            self.assertTrue(exists, f"El script {sm} referenciado en '{hook_name}' no existe en el sistema de archivos")

if __name__ == "__main__":
    unittest.main()
