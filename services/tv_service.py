from typing import Any
from services.clients.tv_client import scanner_scan

PERFORMANCE_COLS = [
    "name", "close",
    "Perf.3M", "Perf.6M", "Perf.Y", "Perf.YTD", "Perf.5Y",
    "SMA50", "SMA200",
    "beta_1_year",
]

TICKER_EXCHANGE = {
    # ETFs
    "SPY": "AMEX:SPY", "DIA": "AMEX:DIA", "QQQ": "NASDAQ:QQQ", "IWM": "AMEX:IWM",
    "EEM": "AMEX:EEM", "EWZ": "AMEX:EWZ", "FXI": "AMEX:FXI", "GLD": "AMEX:GLD",
    "IBIT": "NASDAQ:IBIT", "URA": "AMEX:URA", "XLE": "AMEX:XLE", "XLF": "AMEX:XLF",
    "XLK": "AMEX:XLK", "XLV": "AMEX:XLV", "XLI": "AMEX:XLI", "XLP": "AMEX:XLP",
    "XLU": "AMEX:XLU", "XLY": "AMEX:XLY", "XLB": "AMEX:XLB",
    # NYSE
    "CCJ": "NYSE:CCJ",
    "PAM": "NYSE:PAM", "BRKB": "NYSE:BRK-B", "DE": "NYSE:DE", "CAT": "NYSE:CAT",
    "MRK": "NYSE:MRK", "MA": "NYSE:MA", "PM": "NYSE:PM", "VST": "NYSE:VST",
    "VIST": "NYSE:VIST", "NEM": "NYSE:NEM", "LLY": "NYSE:LLY", "PG": "NYSE:PG",
    "HD": "NYSE:HD", "WMT": "NYSE:WMT", "GE": "NYSE:GE", "KO": "NYSE:KO",
    "JPM": "NYSE:JPM", "BA": "NYSE:BA", "XOM": "NYSE:XOM", "CVX": "NYSE:CVX",
    "DIS": "NYSE:DIS", "NKE": "NYSE:NKE", "V": "NYSE:V", "NU": "NYSE:NU",
    "BBD": "NYSE:BBD", "PBR": "NYSE:PBR", "PFE": "NYSE:PFE", "WFC": "NYSE:WFC",
    "UNH": "NYSE:UNH", "RTX": "NYSE:RTX", "T": "NYSE:T", "VZ": "NYSE:VZ",
    "ABBV": "NYSE:ABBV", "IBM": "NYSE:IBM", "JNJ": "NYSE:JNJ", "MCD": "NYSE:MCD",
    "CRM": "NYSE:CRM", "SAP": "NYSE:SAP", "SONY": "NYSE:SONY", "TSM": "NYSE:TSM",
    "TX": "NYSE:TX", "VALE": "NYSE:VALE", "GLW": "NYSE:GLW", "VST": "NYSE:VST",
    # NASDAQ
    "NNE": "NASDAQ:NNE",
    "COST": "NASDAQ:COST", "MSTR": "NASDAQ:MSTR", "INTC": "NASDAQ:INTC",
    "AMD": "NASDAQ:AMD", "NVDA": "NASDAQ:NVDA", "META": "NASDAQ:META",
    "AAPL": "NASDAQ:AAPL", "MSFT": "NASDAQ:MSFT", "AMZN": "NASDAQ:AMZN",
    "GOOGL": "NASDAQ:GOOGL", "MELI": "NASDAQ:MELI", "TSLA": "NASDAQ:TSLA",
    "AMAT": "NASDAQ:AMAT", "ANET": "NASDAQ:ANET", "QCOM": "NASDAQ:QCOM",
    "PLTR": "NASDAQ:PLTR", "NFLX": "NASDAQ:NFLX", "MU": "NASDAQ:MU",
    "CEG": "NASDAQ:CEG", "CRWV": "NASDAQ:CRWV", "NBIS": "NASDAQ:NBIS",
    "RGTI": "NASDAQ:RGTI", "SNDK": "NASDAQ:SNDK", "ASML": "NASDAQ:ASML",
    # AMEX
    "XLU": "AMEX:XLU"
}

def to_tv_ticker(symbol: str) -> str:
    s = symbol.upper().strip()
    if ":" in s:
        return s
    return TICKER_EXCHANGE.get(s, f"NASDAQ:{s}")

from services.cache_service import smart_cache

@smart_cache("historical")
def fetch_performance(tickers: list[str], market: str = "global") -> list[dict[str, Any]] | None:
    """Fetch performance data + SMA position for tickers + SPY benchmark."""
    all_tv = [to_tv_ticker(t) for t in tickers]
    benchmark = to_tv_ticker("SPY")
    if benchmark not in all_tv:
        all_tv.append(benchmark)

    try:
        result = scanner_scan(
            symbols=all_tv,
            columns=PERFORMANCE_COLS,
            market=market,
            range_=(0, len(all_tv)),
        )
        return result.get("data", [])
    except Exception:
        return None
