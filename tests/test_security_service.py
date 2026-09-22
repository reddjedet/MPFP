import unittest
from services.security_service import (
    sanitize_ticker,
    sanitize_portfolio_name,
    parse_weights_string
)

class TestSecurityService(unittest.TestCase):
    
    def test_sanitize_ticker_valid(self):
        self.assertEqual(sanitize_ticker("AAPL"), "AAPL")
        self.assertEqual(sanitize_ticker("brkb"), "BRKB")
        self.assertEqual(sanitize_ticker("  msft  "), "MSFT")
        self.assertEqual(sanitize_ticker("BRK.B"), "BRK.B")
        
    def test_sanitize_ticker_invalid(self):
        self.assertIsNone(sanitize_ticker(""))
        self.assertIsNone(sanitize_ticker(None))
        self.assertIsNone(sanitize_ticker("AAPL<script>"))
        self.assertIsNone(sanitize_ticker("VERYLONGTICKERNAME"))
        self.assertIsNone(sanitize_ticker("DROP TABLE;"))

    def test_sanitize_portfolio_name_valid(self):
        self.assertEqual(sanitize_portfolio_name("Mi_Cartera_1"), "mi_cartera_1")
        self.assertEqual(sanitize_portfolio_name("tech"), "tech")
        
    def test_sanitize_portfolio_name_invalid(self):
        self.assertIsNone(sanitize_portfolio_name(""))
        self.assertIsNone(sanitize_portfolio_name(None))
        self.assertIsNone(sanitize_portfolio_name("a" * 35))

    def test_parse_weights_string_valid(self):
        res, err = parse_weights_string("AAPL: 50, MSFT: 50")
        self.assertIsNone(err)
        self.assertEqual(res, {"AAPL": 50.0, "MSFT": 50.0})

    def test_parse_weights_string_invalid_format(self):
        res, err = parse_weights_string("AAPL-50")
        self.assertIsNone(res)
        self.assertIsNotNone(err)

    def test_parse_weights_string_negative_val(self):
        res, err = parse_weights_string("AAPL: -10, MSFT: 50")
        self.assertIsNone(res)
        self.assertIn("negativo", err)

    def test_csp_headers_in_fastapi(self):
        """Verifica que el middleware de FastAPI inyecta la cabecera Content-Security-Policy estricta."""
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Content-Security-Policy", response.headers)
        csp = response.headers["Content-Security-Policy"]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("X-Frame-Options", response.headers)
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")

    def test_localhost_binding_declaration(self):
        """Verifica que los scripts de arranque y despliegue declaran bind a 127.0.0.1 y no a 0.0.0.0."""
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        start_sh = (root / "start.sh").read_text(encoding="utf-8")
        self.assertIn("--host 127.0.0.1", start_sh)
        self.assertNotIn("--host 0.0.0.0", start_sh)

if __name__ == "__main__":
    unittest.main()
