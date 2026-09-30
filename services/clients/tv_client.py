"""
TradingView Data Fetcher — APIs publicas internas sin auth.

TradingView no tiene API publica oficial, pero sus apps web exponen varias APIs
internas accesibles SIN auth y SIN API key. Este script las consolida en una
CLI con ~15 modos.

Endpoints disponibles:

  QUOTE / SCANNER (POST scanner.tradingview.com/{market}/scan):
    - quote SYM            Quote basico (15 columnas)
    - quote-extended SYM   Quote con indicadores + valuacion (~30 columnas)
    - technicals SYM       Solo indicadores tecnicos (RSI, MACD, EMAs, ratings)
    - pivots SYM           Pivots mensuales (Classic, Fibonacci, Camarilla, Woodie, DeMark)
    - financials SYM       Balance + income + cashflow + ratios (~35 columnas)
    - earnings SYM         Earnings pasados + forecast proximo
    - targets SYM          Price targets + analyst recommendations
    - performance SYM      Performance returns (W/1M/3M/6M/Y/YTD/5Y/All)
    - dividends SYM        Historico + yield + payout ratio
    - ownership SYM        Float + institutional + insiders + short interest

  SCANNING / SCREENING (POST scanner.tradingview.com/{market}/scan):
    - screen               Screener con filtros + sort + pagination
    - country COUNTRY      Stocks de un pais especifico (e.g. Argentina)
    - sector SECTOR        Stocks de un sector (Finance, Technology, etc.)
    - market MARKET        Listar stocks de un mercado completo

  SYMBOL SEARCH (GET symbol-search.tradingview.com/symbol_search/v3/):
    - search QUERY         Busqueda con ISIN/CUSIP/CIK/logoid/etc

  NEWS (GET news-headlines.tradingview.com/v2/headlines):
    - news SYM             Headlines por simbolo
    - news-global          Headlines globales del mercado
    - story STORY_PATH     Fetch body completo de una noticia (HTML)

  HTML SCRAPING (GET es.tradingview.com/symbols/{ex}-{sym}/{path}/):
    - subpage SYM PATH     Fetch HTML de cualquier subpage + extrae prs.init-data JSON

  CATALOGOS LOCALES (sin HTTP):
    - columns [grupo]      Listar columnas disponibles (o un grupo concreto)
    - groups               Listar grupos de columnas pre-armados
    - markets              Listar mercados validos

  COMBINADO:
    - all SYM              Combina quote + technicals + financials + earnings +
                           targets + news en 1 dict (6 requests)

Uso:
    py fetch_tradingview.py quote NASDAQ:GGAL
    py fetch_tradingview.py quote-extended NASDAQ:AAPL
    py fetch_tradingview.py technicals NASDAQ:GGAL
    py fetch_tradingview.py pivots NASDAQ:AAPL
    py fetch_tradingview.py financials NASDAQ:GGAL
    py fetch_tradingview.py earnings NYSE:JPM
    py fetch_tradingview.py targets NASDAQ:NVDA
    py fetch_tradingview.py performance NYSE:JPM
    py fetch_tradingview.py dividends NYSE:KO
    py fetch_tradingview.py ownership NASDAQ:NVDA

    py fetch_tradingview.py screen --filter '[["sector","equal","Finance"],["market_cap_basic","greater",100000000000]]' --sort market_cap_basic:desc --limit 10
    py fetch_tradingview.py country Argentina --limit 30
    py fetch_tradingview.py sector Finance --market global --limit 20
    py fetch_tradingview.py market crypto --limit 20

    py fetch_tradingview.py search "GGAL"
    py fetch_tradingview.py search "Apple" --type stocks --exchange NASDAQ
    py fetch_tradingview.py search "BTC" --type crypto

    py fetch_tradingview.py news NASDAQ:GGAL
    py fetch_tradingview.py news NASDAQ:AAPL --lang en
    py fetch_tradingview.py news-global
    py fetch_tradingview.py story /news/DJN_DN20260604009289:0/

    py fetch_tradingview.py subpage NASDAQ:GGAL technicals
    py fetch_tradingview.py subpage NASDAQ:GGAL financials-income-statement

    py fetch_tradingview.py columns                      # todas
    py fetch_tradingview.py columns technicals           # grupo concreto
    py fetch_tradingview.py groups
    py fetch_tradingview.py markets

    py fetch_tradingview.py all NASDAQ:GGAL              # 6 requests combinadas
    py fetch_tradingview.py all NASDAQ:GGAL -o ggal_full.json

    py fetch_tradingview.py quote NASDAQ:GGAL --columns "name,close,RSI,MACD.macd"  # custom
    py fetch_tradingview.py quote NASDAQ:GGAL --market global                       # cambiar market
    py fetch_tradingview.py quote BCBA:GGAL --market argentina                      # arg local
"""
from __future__ import annotations
import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
import requests
log = logging.getLogger('tradingview')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S')
try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, Exception):
    pass
SCANNER_HOST = 'https://scanner.tradingview.com'
SYMBOL_SEARCH_HOST = 'https://symbol-search.tradingview.com'
NEWS_HOST = 'https://news-headlines.tradingview.com'
WEB_HOST = 'https://es.tradingview.com'
LOGO_HOST = 'https://s3-symbol-logo.tradingview.com'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': '*/*', 'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8', 'Origin': 'https://es.tradingview.com', 'Referer': 'https://es.tradingview.com/'}
SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = SCRIPT_DIR.parent / 'assets'

def load_asset(name: str) -> Any:
    """Carga un JSON del directorio assets/."""
    fp = ASSETS_DIR / name
    if not fp.exists():
        log.warning(f'Asset no encontrado: {fp}')
        return None
    with open(fp, 'r', encoding='utf-8') as f:
        return json.load(f)
_column_groups: dict | None = None
_markets: dict | None = None
_scanner_columns: dict | None = None
_recommend_ratings: dict | None = None

def column_groups() -> dict:
    global _column_groups
    if _column_groups is None:
        _column_groups = load_asset('column_groups.json') or {}
    return _column_groups

def markets() -> dict:
    global _markets
    if _markets is None:
        _markets = load_asset('markets.json') or {}
    return _markets

def scanner_columns() -> dict:
    global _scanner_columns
    if _scanner_columns is None:
        _scanner_columns = load_asset('scanner_columns.json') or {}
    return _scanner_columns

def recommend_ratings() -> dict:
    global _recommend_ratings
    if _recommend_ratings is None:
        _recommend_ratings = load_asset('recommend_ratings.json') or {}
    return _recommend_ratings

def _post(url: str, payload: dict, timeout: int=30) -> Any:
    """POST con error handling. La API del Scanner siempre devuelve JSON."""
    r = requests.post(url, json=payload, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()

def _get(url: str, params: dict | None=None, timeout: int=30, as_json: bool=True) -> Any:
    """GET con error handling."""
    r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json() if as_json else r.text

def _normalize_scanner_response(raw: dict, columns: list[str]) -> dict:
    """Convierte el response columnar del Scanner a dicts por simbolo.

    Input:  {"totalCount": 1, "data": [{"s": "NASDAQ:GGAL", "d": [val0, val1, ...]}]}
    Output: {"totalCount": 1, "data": [{"symbol": "NASDAQ:GGAL", "name": val0, ...}]}
    """
    if not isinstance(raw, dict):
        return raw
    if 'data' not in raw:
        return raw
    out_data = []
    for row in raw.get('data', []):
        record: dict[str, Any] = {'symbol': row.get('s')}
        d = row.get('d', []) or []
        for col, val in zip(columns, d):
            record[col] = val
        out_data.append(record)
    return {'totalCount': raw.get('totalCount'), 'data': out_data}

def scanner_scan(symbols: list[str] | None=None, columns: list[str] | None=None, filter_: list[dict] | None=None, market: str='global', range_: tuple[int, int]=(0, 100), sort: dict | None=None, options: dict | None=None) -> dict:
    """POST /{market}/scan — el endpoint mas potente de TradingView.

    Args:
        symbols: lista de tickers tipo "NASDAQ:AAPL". Si esta dado, se ignora filter_.
        columns: lista de nombres de columnas. Ver assets/scanner_columns.json.
        filter_: filtros tipo [{"left": "sector", "operation": "equal", "right": "Finance"}].
                 Ver references/SCANNER_FILTERS.md.
        market: mercado (global, america, argentina, brazil, spain, etc).
                Ver assets/markets.json.
        range_: tuple (offset, limit_offset_from). Default (0, 100) = primeros 100.
        sort: {"sortBy": "market_cap_basic", "sortOrder": "desc"}.
        options: {"lang": "en"} u otros opcionales.

    Returns:
        dict {"totalCount": N, "data": [...]} con data normalizada a dicts
        por simbolo (no columnar).
    """
    if columns is None:
        columns = column_groups().get('quote_basic', ['name', 'close'])
    payload: dict[str, Any] = {'columns': columns, 'range': list(range_)}
    if symbols:
        payload['symbols'] = {'tickers': symbols}
    if filter_:
        payload['filter'] = filter_
    elif 'symbols' not in payload:
        payload['filter'] = []
    if sort:
        payload['sort'] = sort
    if options:
        payload['options'] = options
    url = f'{SCANNER_HOST}/{market}/scan'
    log.info(f'POST {url} (cols={len(columns)}, market={market}, range={range_})')
    raw = _post(url, payload)
    return _normalize_scanner_response(raw, columns)
SYMBOL_SEARCH_TYPES = ['stocks', 'funds', 'futures', 'forex', 'crypto', 'indices', 'bonds', 'economic', 'options']
MODES = ['quote', 'quote-extended', 'technicals', 'pivots', 'financials', 'earnings', 'targets', 'performance', 'dividends', 'ownership', 'screen', 'country', 'sector', 'market', 'search', 'news', 'news-global', 'story', 'subpage', 'columns', 'groups', 'markets', 'all']

def _need(args_list: list, n: int, mode: str, msg: str):
    if len(args_list) < n:
        log.error(f"Modo '{mode}' requiere: {msg}")
        sys.exit(1)
if __name__ == '__main__':
    main()