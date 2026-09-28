import re

with open("tests/test_financial_math.py", "r") as f:
    content = f.read()

# Replace the decorator
content = content.replace('@patch("services.rotation_service.get_ticker_data")', '@patch("services.rotation_service.get_multiple_tickers_data")')

# Replace the function arguments mock_ticker_data -> mock_multiple_data
content = content.replace("mock_ticker_data", "mock_multiple_data")

# Replace the side effect lambda to handle lists of tickers
# Old: lambda tk: { ... }.get(tk, { ... })
# New: lambda tks: { tk: { ... }.get(tk, { ... }) for tk in tks }

def replacer(match):
    # Match group 1 is the dict body
    dict_body = match.group(1)
    default_body = match.group(2)
    return f"lambda tks: {{tk: {{{dict_body}}}.get(tk, {{{default_body}}}) for tk in tks}}"

content = re.sub(r'lambda\s+tk\s*:\s*\{([\s\S]*?)\}\.get\(\s*tk\s*,\s*\{([\s\S]*?)\}\s*\)', replacer, content)

with open("tests/test_financial_math.py", "w") as f:
    f.write(content)

