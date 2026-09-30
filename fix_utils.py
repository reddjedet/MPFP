import os

utils_path = 'services/utils.py'
with open(utils_path, 'r') as f:
    content = f.read()

new_content = content.replace(
    "def safe_div(a, b, default=0.0):\n    return a / b if b else default",
    "import numpy as np\nimport pandas as pd\n\ndef safe_div(a, b, default=0.0):\n    if isinstance(b, (pd.Series, pd.DataFrame, np.ndarray)):\n        return a / b\n    return a / b if b else default"
)

with open(utils_path, 'w') as f:
    f.write(new_content)
