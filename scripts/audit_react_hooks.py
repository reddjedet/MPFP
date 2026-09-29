#!/usr/bin/env python3
import os
import re
import sys

def audit_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    errors = []
    has_early_return = False
    
    # Heurística simple para detectar si un hook es llamado después de un return de carga/error común.
    for i, line in enumerate(lines):
        line_num = i + 1
        stripped = line.strip()
        
        # Resetear el flag en cada definición de componente nuevo
        if re.match(r'^(export )?(const|function) [A-Z]', stripped):
            has_early_return = False
            
        # Detectar retornos tempranos comunes en el nivel principal del componente
        if re.match(r'^if\s*\((loading|error|!data).*return', stripped):
            has_early_return = True
            
        # Detectar llamadas a hooks de React
        hook_match = re.search(r'\b(use(?:State|Effect|Memo|Callback|Context|Ref))\s*\(', stripped)
        if hook_match:
            # Si estamos dentro de un componente y ya hubo un return temprano, lanzar alerta.
            if has_early_return:
                errors.append(f"{filepath}:{line_num} -> Hook '{hook_match.group(1)}' llamado después de un return temprano.")

    return errors

def main():
    target_dirs = ['frontend/src/components', 'frontend/src/hooks']
    all_errors = []
    
    for d in target_dirs:
        if not os.path.isdir(d):
            continue
        for root, _, files in os.walk(d):
            for file in files:
                if file.endswith('.tsx') or file.endswith('.ts'):
                    filepath = os.path.join(root, file)
                    all_errors.extend(audit_file(filepath))
                    
    if all_errors:
        print("❌ FALLO: Regla de Hooks de React violada.")
        for e in all_errors:
            print(f"  - {e}")
        print("Por favor, mueve todos los Hooks por encima de los 'if (loading) return ...'")
        sys.exit(1)
    else:
        print("✅ OK: No se detectaron Hooks después de retornos tempranos comunes.")
        sys.exit(0)

if __name__ == '__main__':
    main()
