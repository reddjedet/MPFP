import unittest
from unittest.mock import patch
from services.clients.tv_client import quote, technicals, news_by_symbol, screen

class TestTvClient(unittest.TestCase):
    
    @patch("services.clients.tv_client.column_groups")
    @patch("services.clients.tv_client._post")
    def test_quote(self, mock_post, mock_cg):
        mock_cg.return_value = {"quote_basic": ["name", "close"]}
        mock_post.return_value = {"totalCount": 1, "data": [{"s": "NASDAQ:AAPL", "d": ["Apple Inc.", 150.0]}]}
        res = quote("NASDAQ:AAPL")
        self.assertIn("data", res)
        self.assertEqual(res["data"][0]["symbol"], "NASDAQ:AAPL")
        
    @patch("services.clients.tv_client.column_groups")
    @patch("services.clients.tv_client._post")
    def test_technicals(self, mock_post, mock_cg):
        mock_cg.return_value = {"technicals": ["RSI"]}
        mock_post.return_value = {"totalCount": 1, "data": [{"s": "NASDAQ:AAPL", "d": [60.5]}]}
        res = technicals("NASDAQ:AAPL")
        self.assertIn("data", res)
        
    @patch("services.clients.tv_client._get")
    def test_news_by_symbol(self, mock_get):
        mock_get.return_value = {"items": [{"title": "AAPL surges"}]}
        res = news_by_symbol("NASDAQ:AAPL")
        self.assertEqual(res["items"][0]["title"], "AAPL surges")

    @patch("services.clients.tv_client.column_groups")
    @patch("services.clients.tv_client._post")
    def test_screen(self, mock_post, mock_cg):
        mock_cg.return_value = {"quote_basic": ["name", "close"]}
        mock_post.return_value = {"totalCount": 1, "data": [{"s": "NASDAQ:AAPL", "d": ["Apple Inc.", 150.0]}]}
        res = screen(filter_=[{"left": "sector", "operation": "equal", "right": "Technology"}])
        self.assertIn("data", res)

if __name__ == "__main__":
    unittest.main()
