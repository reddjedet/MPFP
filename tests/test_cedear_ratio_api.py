import json
from unittest.mock import patch

from routers.cedears import get_cedears_quotes_json


def test_unknown_ratio_is_not_reported_as_one_to_one_or_used_for_usd_price():
    mock_data = {
        "ZZZZ": {
            "symbol": "ZZZZ",
            "adr": 120.0,
            "local": 15000.0,
            "ratio": "N/A",
            "rsi": 50.0,
        }
    }
    with patch("routers.cedears.get_multiple_tickers_data", return_value=mock_data):
        response = get_cedears_quotes_json(tickers="ZZZZ")

    assert response.status_code == 200
    quote = json.loads(response.body)["quotes"][0]
    assert quote["ratio"] is None
    assert quote["cedear_usd"] is None
