from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch

with patch("services.fixed_income_service.fetch_cotizaciones_panel") as mock_panel, \
     patch("services.fixed_income_service.fetch_datos_macro") as mock_datos:
    mock_panel.return_value = {
        "data": [
            {"symbol": "S30S6 24HS", "trade": 112.08, "volumeAmount": 5000000},
            {"symbol": "T31Y7 24HS", "trade": 115.50, "volumeAmount": 3000000}
        ]
    }
    mock_datos.return_value = {"cer_estimado": 0.04}
    client = TestClient(app)
    resp = client.get("/api/fixed_income/curve_json?category=lecap&tipo_inst=Todos")
    print("STATUS:", resp.status_code)
    print("TEXT:", resp.text)
