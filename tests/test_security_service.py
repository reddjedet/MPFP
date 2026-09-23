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
        """Verifica que el middleware de FastAPI inyecta la cabecera Content-Security-Policy estricta y moderna."""
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Content-Security-Policy", response.headers)
        csp = response.headers["Content-Security-Policy"]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("base-uri 'self'", csp)
        self.assertIn("form-action 'self'", csp)
        # SEC-03: Nunca permitir 'unsafe-eval'
        self.assertNotIn("'unsafe-eval'", csp)
        self.assertIn("X-Frame-Options", response.headers)
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        # SEC-03: Modern OWASP estándar 0 para X-XSS-Protection
        self.assertEqual(response.headers.get("X-XSS-Protection"), "0")

    def test_localhost_and_render_binding_declarations(self):
        """Verifica que start.sh declara bind exclusivo a 127.0.0.1 y render.yaml a 0.0.0.0 para PaaS."""
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        start_sh = (root / "start.sh").read_text(encoding="utf-8")
        self.assertIn("--host 127.0.0.1", start_sh)
        self.assertNotIn("--host 0.0.0.0", start_sh)
        
        render_yaml = (root / "render.yaml").read_text(encoding="utf-8")
        self.assertIn("--host 0.0.0.0", render_yaml)
        self.assertIn("--port $PORT", render_yaml)

    def test_cors_configuration_development(self):
        """Verifica que en desarrollo CORS solo admita localhost/127.0.0.1 con allow_credentials=False."""
        import os
        from services.security_service import get_cors_configuration
        old_env = os.environ.get("APP_ENV")
        try:
            os.environ["APP_ENV"] = "development"
            origins, regex, credentials = get_cors_configuration()
            self.assertFalse(credentials)
            self.assertIn("http://127.0.0.1:8000", origins)
            self.assertIn("http://localhost:5173", origins)
            self.assertIsNotNone(regex)
            self.assertNotIn("onrender", regex)
        finally:
            if old_env is not None:
                os.environ["APP_ENV"] = old_env
            else:
                os.environ.pop("APP_ENV", None)

    def test_cors_configuration_production_strict(self):
        """Verifica que en producción CORS solo admita orígenes explícitos y sin comodines ni credenciales."""
        import os
        from services.security_service import get_cors_configuration
        old_env = os.environ.get("APP_ENV")
        old_origins = os.environ.get("ALLOWED_ORIGINS")
        old_render = os.environ.get("RENDER_EXTERNAL_URL")
        try:
            os.environ["APP_ENV"] = "production"
            os.environ["ALLOWED_ORIGINS"] = "https://mpfp.midominio.com, https://otro.dominio.com"
            os.environ["RENDER_EXTERNAL_URL"] = "https://mpfp-custom.onrender.com"
            
            origins, regex, credentials = get_cors_configuration()
            self.assertFalse(credentials)
            self.assertIsNone(regex)  # Sin comodines regex en producción
            self.assertIn("https://mpfp.midominio.com", origins)
            self.assertIn("https://otro.dominio.com", origins)
            self.assertIn("https://mpfp-custom.onrender.com", origins)
            # Asegura que cualquier otro origen o comodín no esté
            self.assertNotIn(".*", str(origins))
        finally:
            if old_env is not None:
                os.environ["APP_ENV"] = old_env
            else:
                os.environ.pop("APP_ENV", None)
            if old_origins is not None:
                os.environ["ALLOWED_ORIGINS"] = old_origins
            else:
                os.environ.pop("ALLOWED_ORIGINS", None)
            if old_render is not None:
                os.environ["RENDER_EXTERNAL_URL"] = old_render
            else:
                os.environ.pop("RENDER_EXTERNAL_URL", None)

    def test_python_version_canonical_sync(self):
        """Verifica que .python-version exista y coincida con la versión de render.yaml (DEP-02)."""
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        python_ver_file = root / ".python-version"
        self.assertTrue(python_ver_file.exists())
        version_str = python_ver_file.read_text(encoding="utf-8").strip()
        
        render_yaml = (root / "render.yaml").read_text(encoding="utf-8")
        self.assertIn(f"value: {version_str}", render_yaml)

    def test_stop_script_graceful_shutdown(self):
        """Verifica que stop.sh implemente envío previo de SIGTERM (kill -15) para cierre limpio (DEP-03)."""
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        stop_sh = (root / "stop.sh").read_text(encoding="utf-8")
        self.assertIn("kill -15", stop_sh)
        self.assertIn("graceful_stop_pid", stop_sh)

if __name__ == "__main__":
    unittest.main()

