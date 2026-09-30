import unittest
import asyncio
from unittest.mock import patch, MagicMock
from services.prewarm_service import prewarm_portfolio_cache

class TestPrewarmService(unittest.IsolatedAsyncioTestCase):
    
    @patch("services.prewarm_service.os.getenv")
    async def test_prewarm_disabled(self, mock_getenv):
        mock_getenv.return_value = "false"
        result = await prewarm_portfolio_cache()
        self.assertFalse(result)

    @patch("services.prewarm_service.get_multiple_tickers_data")
    @patch("services.prewarm_service.fetch_performance")
    @patch("services.prewarm_service.os.getenv")
    async def test_prewarm_success(self, mock_getenv, mock_fetch_perf, mock_get_tickers):
        mock_getenv.return_value = "true"
        mock_get_tickers.return_value = {}
        mock_fetch_perf.return_value = {}
        
        result = await prewarm_portfolio_cache(timeout_seconds=2.0)
        self.assertTrue(result)

if __name__ == "__main__":
    unittest.main()
