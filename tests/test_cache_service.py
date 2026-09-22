import unittest
import os
from services.cache_service import get_market_ttl, smart_cache, DISK_CACHE_FILE

class TestCacheService(unittest.TestCase):
    
    def setUp(self):
        if DISK_CACHE_FILE.exists():
            try:
                os.remove(DISK_CACHE_FILE)
            except Exception:
                pass

    def test_static_ttl(self):
        self.assertEqual(get_market_ttl("static"), 86400)

    def test_historical_ttl(self):
        self.assertEqual(get_market_ttl("historical"), 14400)

    def test_realtime_ttl_positive(self):
        ttl = get_market_ttl("realtime")
        self.assertIn(ttl, [180, 43200])

    def test_smart_cache_decorator(self):
        calls = 0
        @smart_cache("static")
        def sample_function(x):
            nonlocal calls
            calls += 1
            return x * 2
            
        res1 = sample_function(5)
        res2 = sample_function(5)
        self.assertEqual(res1, 10)
        self.assertEqual(res2, 10)
        self.assertEqual(calls, 1)  # Solo debe haberse ejecutado una vez gracias al caché

if __name__ == "__main__":
    unittest.main()
