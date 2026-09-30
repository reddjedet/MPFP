import re
import sys
import os

def fix_excepts(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    def repl(m):
        indent = m.group(1)
        return f"{indent}except Exception as e:\n{indent}    logger.error('Exception caught', exc_info=True)"

    new_content = re.sub(r'(?m)^([ \t]+)except Exception:', repl, content)
    new_content = re.sub(r'(?m)^([ \t]+)except\s*:', repl, new_content)
    
    with open(filepath, 'w') as f:
        f.write(new_content)

def add_safe_div():
    utils_path = 'services/utils.py'
    if not os.path.exists(utils_path):
        with open(utils_path, 'w') as f:
            f.write("def safe_div(a, b, default=0.0):\n    return a / b if b else default\n")
    else:
        with open(utils_path, 'r') as f:
            content = f.read()
        if 'def safe_div' not in content:
            with open(utils_path, 'a') as f:
                f.write("\n\ndef safe_div(a, b, default=0.0):\n    return a / b if b else default\n")

# To replace scalar division, we can use ast or a regex?
# Using regex for a / b is very hard and error prone. 
# Better to use sed or manual replace for safe_div?
# Wait, replacing all `/` is dangerous if there are paths (e.g., 'a/b.txt').
