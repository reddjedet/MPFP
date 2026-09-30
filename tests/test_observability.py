import unittest
import logging
from services.observability import get_current_request_id, request_id_ctx, RequestIdFilter, SENSITIVE_PATTERNS

class TestObservability(unittest.TestCase):

    def test_get_current_request_id_fallback(self):
        token = request_id_ctx.set("")
        try:
            self.assertEqual(get_current_request_id(), "system")
        finally:
            request_id_ctx.reset(token)

    def test_get_current_request_id_set(self):
        token = request_id_ctx.set("req_123")
        try:
            self.assertEqual(get_current_request_id(), "req_123")
        finally:
            request_id_ctx.reset(token)

    def test_request_id_filter_sanitization(self):
        filter_ = RequestIdFilter()
        record = logging.LogRecord("test", logging.INFO, "path", 1, "User 'token': 'secret123'", (), None)
        filter_.filter(record)
        self.assertEqual(record.msg, "User 'token': '***'")
        self.assertEqual(getattr(record, "request_id", ""), "system")

if __name__ == "__main__":
    unittest.main()
