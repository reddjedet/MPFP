#!/usr/bin/env python3
"""
Unit and Integration tests for Agent Guardrails & Hooks.
Simulates tool call payloads via stdin to test allow and deny decisions.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
AGENTS_DIR = ROOT_DIR / ".agents" / "scripts"

class TestAgentGuards(unittest.TestCase):
    
    def _run_script(self, script_path: Path, stdin_data: dict) -> dict:
        """Helper to run a guard script with simulated JSON stdin and parse stdout."""
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            input=json.dumps(stdin_data),
            capture_output=True,
            text=True
        )
        self.assertEqual(proc.returncode, 0, f"Script failed with code {proc.returncode}: {proc.stderr}")
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError:
            self.fail(f"Script stdout was not valid JSON: {proc.stdout}")

    # -------------------------------------------------------------------------
    # 1. Tests para guard_large_files.py (Token Guard)
    # -------------------------------------------------------------------------
    def test_token_guard_allows_small_file(self):
        script = AGENTS_DIR / "guard_large_files.py"
        with tempfile.NamedTemporaryFile("w", delete=False) as f:
            for i in range(100):
                f.write(f"line {i}\n")
            temp_path = f.name
        
        try:
            payload = {
                "toolCall": {
                    "name": "view_file",
                    "args": {"AbsolutePath": temp_path}
                }
            }
            res = self._run_script(script, payload)
            self.assertEqual(res.get("decision"), "allow")
        finally:
            os.remove(temp_path)

    def test_token_guard_denies_large_file(self):
        script = AGENTS_DIR / "guard_large_files.py"
        with tempfile.NamedTemporaryFile("w", delete=False) as f:
            for i in range(400):
                f.write(f"line {i}\n")
            temp_path = f.name
        
        try:
            payload = {
                "toolCall": {
                    "name": "view_file",
                    "args": {"AbsolutePath": temp_path}
                }
            }
            res = self._run_script(script, payload)
            self.assertEqual(res.get("decision"), "deny")
            self.assertIn("supera el límite", res.get("reason", ""))
        finally:
            os.remove(temp_path)

    def test_token_guard_allows_ranged_inspection(self):
        script = AGENTS_DIR / "guard_large_files.py"
        with tempfile.NamedTemporaryFile("w", delete=False) as f:
            for i in range(500):
                f.write(f"line {i}\n")
            temp_path = f.name
        
        try:
            payload = {
                "toolCall": {
                    "name": "view_file",
                    "args": {
                        "AbsolutePath": temp_path,
                        "StartLine": 1,
                        "EndLine": 50
                    }
                }
            }
            res = self._run_script(script, payload)
            self.assertEqual(res.get("decision"), "allow")
        finally:
            os.remove(temp_path)

    # -------------------------------------------------------------------------
    # 2. Tests para guard_commands.py (Command Guard)
    # -------------------------------------------------------------------------
    def test_command_guard_allows_benign_commands(self):
        script = AGENTS_DIR / "guard_commands.py"
        benign_commands = [
            "python3 -m unittest discover",
            "git status",
            "ls -la",
            "npm test"
        ]
        for cmd in benign_commands:
            payload = {"toolCall": {"name": "run_command", "args": {"CommandLine": cmd}}}
            res = self._run_script(script, payload)
            self.assertEqual(res.get("decision"), "allow", f"Failed for cmd: {cmd}")

    def test_command_guard_denies_destructive_commands(self):
        script = AGENTS_DIR / "guard_commands.py"
        destructive_commands = [
            "rm -rf /",
            "rm -rf /*",
            "rm -rf ~",
            "rm -rf $HOME",
            "mkfs.ext4 /dev/sda1",
            ":(){ :|:& };:",
            "shutdown -h now"
        ]
        for cmd in destructive_commands:
            payload = {"toolCall": {"name": "run_command", "args": {"CommandLine": cmd}}}
            res = self._run_script(script, payload)
            self.assertEqual(res.get("decision"), "deny", f"Should have denied: {cmd}")
            self.assertIn("COMMAND GUARD", res.get("reason", ""))

    def test_command_guard_protects_central_library(self):
        script = AGENTS_DIR / "guard_commands.py"
        cmd = "rm -rf 'contenido agentico/rules'"
        payload = {"toolCall": {"name": "run_command", "args": {"CommandLine": cmd}}}
        res = self._run_script(script, payload)
        self.assertEqual(res.get("decision"), "deny")
        self.assertIn("Violación de Regla 1", res.get("reason", ""))

    def test_command_guard_fail_closed_on_corrupt_json(self):
        script = AGENTS_DIR / "guard_commands.py"
        proc = subprocess.run(
            [sys.executable, str(script)],
            input="{ corrupt json payload !!",
            capture_output=True,
            text=True
        )
        self.assertEqual(proc.returncode, 0)
        data = json.loads(proc.stdout)
        self.assertEqual(data.get("decision"), "deny")
        self.assertIn("HARNESS ERROR", data.get("reason", ""))

    # -------------------------------------------------------------------------
    # 3. Tests para auto_verify_syntax.py (Syntax Hook - Contrato PostToolUse)
    # -------------------------------------------------------------------------
    def test_syntax_guard_returns_empty_json_contract(self):
        """PostToolUse conserva stdout={} y valida Python válido."""
        script = AGENTS_DIR / "auto_verify_syntax.py"
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write("def foo():\n    return 42\n")
            temp_path = f.name
        try:
            payload = {"toolCall": {"name": "write_to_file", "args": {"TargetFile": temp_path}}}
            proc = subprocess.run([sys.executable, str(script)], input=json.dumps(payload), capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0)
            self.assertEqual(json.loads(proc.stdout), {})
            self.assertEqual(proc.stderr, "")
        finally:
            os.remove(temp_path)

    def test_syntax_guard_reports_invalid_python(self):
        script = AGENTS_DIR / "auto_verify_syntax.py"
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write("def broken(:\n")
            temp_path = f.name
        try:
            payload = {"toolCall": {"name": "write_to_file", "args": {"TargetFile": temp_path}}}
            proc = subprocess.run([sys.executable, str(script)], input=json.dumps(payload), capture_output=True, text=True)
            self.assertEqual(json.loads(proc.stdout), {})
            self.assertIn("Sintaxis Python inválida", proc.stderr)
        finally:
            os.remove(temp_path)

    def test_token_guard_fail_closed_on_corrupt_payload(self):
        script = AGENTS_DIR / "guard_large_files.py"
        res = self._run_script(script, {})
        self.assertEqual(res.get("decision"), "deny")
        self.assertIn("AbsolutePath no fue provisto", res.get("reason", ""))

    def test_command_guard_fail_closed_on_missing_command(self):
        script = AGENTS_DIR / "guard_commands.py"
        res = self._run_script(script, {"toolCall": {"name": "run_command", "args": {}}})
        self.assertEqual(res.get("decision"), "deny")
        self.assertIn("CommandLine ausente", res.get("reason", ""))

if __name__ == "__main__":
    unittest.main()
