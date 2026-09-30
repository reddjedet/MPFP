import sys

def fix_import(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    if lines[0].startswith('from services.utils import safe_div'):
        # Find the last __future__ import
        future_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('from __future__'):
                future_idx = i
                
        if future_idx != -1:
            # Move the safe_div import after the last __future__ import
            safe_div_line = lines.pop(0)
            lines.insert(future_idx, safe_div_line)
            
            with open(filepath, 'w') as f:
                f.writelines(lines)

for fp in sys.argv[1:]:
    fix_import(fp)
