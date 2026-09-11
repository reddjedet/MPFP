from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.portfolio_service import (
    load_portfolios,
    _sma_dist,
    _portfolio_agg,
    _portfolio_sma,
)
from services.tv_service import fetch_performance

router = APIRouter()

def get_effective_weights(pf_data: dict, lookup_prices: dict) -> dict:
    mode = pf_data.get("mode", "weights")
    assets = pf_data.get("assets", {})
    if mode == "nominals":
        vals = {}
        for t, qty in assets.items():
            r = lookup_prices.get(t.upper())
            price = r.get("close") if r else None
            if price is not None:
                vals[t] = qty * price
            else:
                vals[t] = 0.0
        total_v = sum(vals.values())
        if total_v == 0:
            return {t: 1.0 / len(assets) for t in assets}
        return {t: val / total_v * 100 for t, val in vals.items()}
    else:
        return assets

@router.get("/data_json", response_class=JSONResponse)
def get_performance_data_json():
    portfolios = load_portfolios()
    
    all_tickers_set = {"SPY", "QQQ", "DIA"}
    for pf_data in portfolios.values():
        assets = pf_data.get("assets", {})
        all_tickers_set.update(assets.keys())
    all_tickers = sorted(list(all_tickers_set))
    
    data = fetch_performance(all_tickers)
    if not data:
        data = []
        
    lookup = {r.get("name", "").upper(): r for r in data}
    
    portfolio_summaries = []
    for name, pf_data in portfolios.items():
        eff_weights = get_effective_weights(pf_data, lookup)
        p3m = _portfolio_agg(eff_weights, lookup, 'Perf.3M')
        p6m = _portfolio_agg(eff_weights, lookup, 'Perf.6M')
        pytd = _portfolio_agg(eff_weights, lookup, 'Perf.YTD')
        py = _portfolio_agg(eff_weights, lookup, 'Perf.Y')
        p_beta = _portfolio_agg(eff_weights, lookup, 'beta_1_year')
        portfolio_summaries.append({
            "name": name.upper(),
            "type": "portfolio",
            "perf_3m": round(p3m, 2) if p3m is not None else 0.0,
            "perf_6m": round(p6m, 2) if p6m is not None else 0.0,
            "perf_ytd": round(pytd, 2) if pytd is not None else 0.0,
            "perf_1y": round(py, 2) if py is not None else 0.0,
            "beta": round(p_beta, 2) if p_beta is not None else None,
            "sma50_dist": _portfolio_sma(eff_weights, lookup, 'SMA50') or '—',
            "sma200_dist": _portfolio_sma(eff_weights, lookup, 'SMA200') or '—'
        })
        
    benchmarks = []
    for b_tk in ["SPY", "QQQ", "DIA"]:
        b_data = lookup.get(b_tk)
        if b_data:
            c = b_data.get("close")
            s50 = b_data.get("SMA50")
            s200 = b_data.get("SMA200")
            b_beta = b_data.get("beta_1_year")
            benchmarks.append({
                "ticker": b_tk,
                "close": c,
                "perf_3m": b_data.get("Perf.3M"),
                "perf_6m": b_data.get("Perf.6M"),
                "perf_ytd": b_data.get("Perf.YTD"),
                "perf_1y": b_data.get("Perf.Y"),
                "beta": round(b_beta, 2) if isinstance(b_beta, (int, float)) else None,
                "sma50_dist": _sma_dist(c, s50),
                "sma200_dist": _sma_dist(c, s200),
                "rsi": b_data.get("RSI")
            })

    assets_detail = []
    for pf_name, pf_data in portfolios.items():
        assets = pf_data.get("assets", {})
        for ticker in sorted(assets.keys()):
            r = lookup.get(ticker.upper())
            if not r: continue
            c = r.get("close")
            s50 = r.get("SMA50")
            s200 = r.get("SMA200")
            beta_val = r.get("beta_1_year")
            assets_detail.append({
                "ticker": ticker.upper(),
                "portfolio": pf_name.upper(),
                "weight": assets.get(ticker, 0.0),
                "close": c,
                "perf_3m": r.get("Perf.3M"),
                "perf_6m": r.get("Perf.6M"),
                "perf_ytd": r.get("Perf.YTD"),
                "perf_1y": r.get("Perf.Y"),
                "beta": round(beta_val, 2) if isinstance(beta_val, (int, float)) else None,
                "sma50_dist": _sma_dist(c, s50),
                "sma200_dist": _sma_dist(c, s200),
                "rsi": r.get("RSI")
            })

    return JSONResponse({
        "portfolio_summaries": portfolio_summaries,
        "benchmarks": benchmarks,
        "assets_detail": assets_detail,
        "periods": ["3M", "6M", "YTD", "1A"]
    })
