import ast
import sys

class DivTransformer(ast.NodeTransformer):
    def visit_BinOp(self, node):
        self.generic_visit(node)
        if isinstance(node.op, ast.Div):
            return ast.Call(
                func=ast.Name(id='safe_div', ctx=ast.Load()),
                args=[node.left, node.right],
                keywords=[]
            )
        return node

def process_file(filepath):
    with open(filepath, 'r') as f:
        source = f.read()

    tree = ast.parse(source)
    
    # We only want to replace nodes in the source that contain Divs.
    # To minimize disruption, we could find the highest-level expression nodes 
    # that contain at least one Div, transform them, and unparse them.
    # But finding the "highest-level" expression without grabbing the whole statement is tricky.
    # Let's just find ALL BinOp with Div.
    # Wait, if we process a node, it might contain other Divs. 
    # If we find the "outermost" Divs, we transform them and replace their text.
    
    def get_outermost_divs(node):
        divs = []
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.BinOp) and isinstance(child.op, ast.Div):
                divs.append(child)
            else:
                divs.extend(get_outermost_divs(child))
        return divs
        
    outer_divs = get_outermost_divs(tree)
    
    # Sort descending by position so replacements don't mess up earlier offsets
    outer_divs.sort(key=lambda n: (n.lineno, n.col_offset), reverse=True)
    
    lines = source.splitlines(True)
    
    for node in outer_divs:
        # Transform the node
        transformer = DivTransformer()
        new_node = transformer.visit(node)
        ast.fix_missing_locations(new_node)
        new_text = ast.unparse(new_node)
        
        # Replace in source
        if node.lineno == node.end_lineno:
            line_idx = node.lineno - 1
            line = lines[line_idx]
            lines[line_idx] = line[:node.col_offset] + new_text + line[node.end_col_offset:]
        else:
            # Multi-line: we replace from lineno to end_lineno
            start_idx = node.lineno - 1
            end_idx = node.end_lineno - 1
            
            lines[start_idx] = lines[start_idx][:node.col_offset] + new_text + "\n"
            for i in range(start_idx + 1, end_idx):
                lines[i] = ""
            lines[end_idx] = lines[end_idx][node.end_col_offset:]

    new_source = "".join(lines)
    if "safe_div" in new_source and "from services.utils import safe_div" not in new_source:
        # insert after first docstring or imports. Simple approach: put at top.
        new_source = "from services.utils import safe_div\n" + new_source
        
    with open(filepath, 'w') as f:
        f.write(new_source)

for fp in sys.argv[1:]:
    process_file(fp)
