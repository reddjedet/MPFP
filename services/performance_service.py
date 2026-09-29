import pandas as pd
from typing import Dict, Any

from services.portfolio_service import load_portfolios
from services.rotation_service import load_user_holdings
from services.markowitz_service import fetch_historical_returns_and_cov
from services.cedear_service import get_multiple_tickers_data

def calculate_backtest_performance(pf_type: str, chart_period: str = "ytd") -> Dict[str, Any]:
    portfolios = load_portfolios()
    if pf_type not in portfolios:
        return {"success": False, "error": f"Portfolio {pf_type} not found"}
        
    pf_data = portfolios[pf_type]
    benchmark = pf_data.get("benchmark", "SPY")
    
    holdings = load_user_holdings(pf_type).get("holdings", {})
    assets_target = pf_data.get("assets", {})
    
    use_target_weights = False
    if not holdings and assets_target:
        use_target_weights = True
        tickers = list(assets_target.keys())
    elif holdings:
        tickers = list(holdings.keys())
    else:
        return {"success": False, "error": "No holdings found"}
        
    fetch_tickers = tuple(list(set(tickers + [benchmark])))
    current_data = get_multiple_tickers_data(tickers)
    current_prices = {tk: current_data[tk].get("local", 1.0) if tk in current_data else 1.0 for tk in tickers}
    
    _, _, _, valid_tickers, daily_returns, spy_returns = fetch_historical_returns_and_cov(fetch_tickers, period="2y")
    
    prices_history = pd.DataFrame(index=daily_returns.index)
    for tk in valid_tickers:
        if tk in tickers:
            rets = daily_returns[tk]
            cum_rets = (1 + rets).cumprod()
            if len(cum_rets) > 0:
                P_0 = current_prices[tk] / cum_rets.iloc[-1]
                prices_history[tk] = P_0 * cum_rets
            
    if benchmark in daily_returns.columns:
        bench_rets = daily_returns[benchmark]
    else:
        bench_rets = spy_returns
        
    if bench_rets.empty:
        return {"success": False, "error": "No benchmark data"}
        
    cum_bench = (1 + bench_rets).cumprod()
    bench_series = cum_bench / cum_bench.iloc[0] * 100.0

    port_val = pd.Series(0.0, index=daily_returns.index)
    
    if use_target_weights:
        total_weight = sum([float(w) for w in assets_target.values()])
        if total_weight == 0:
            total_weight = 1.0
        initial_capital = 10000.0
        for tk in valid_tickers:
            if tk in tickers:
                w = float(assets_target[tk]) / total_weight
                if tk in prices_history and prices_history[tk].iloc[0] > 0:
                    fractional_nominals = (initial_capital * w) / prices_history[tk].iloc[0]
                    port_val += prices_history[tk] * fractional_nominals
    else:
        for tk in valid_tickers:
            if tk in tickers:
                nominals = float(holdings[tk].get("nominals", 1.0))
                if tk in prices_history:
                    port_val += prices_history[tk] * nominals
            
    if port_val.iloc[0] > 0:
        port_series = port_val / port_val.iloc[0] * 100.0
    else:
        port_series = pd.Series(100.0, index=daily_returns.index)

    port_rets = port_val.pct_change().dropna()
    
    def get_return(rets_series, days):
        if len(rets_series) < days:
            days = len(rets_series)
        if days == 0:
            return 0.0
        return float((1 + rets_series.iloc[-days:]).prod() - 1.0)
        
    def get_ytd_return(rets_series):
        if rets_series.empty:
            return 0.0
        current_year = rets_series.index[-1].year
        ytd_rets = rets_series[rets_series.index.year == current_year]
        if len(ytd_rets) == 0:
            return 0.0
        return float((1 + ytd_rets).prod() - 1.0)
        
    days_3m = 63
    days_12m = 252
    
    port_3m = get_return(port_rets, days_3m)
    port_12m = get_return(port_rets, days_12m)
    port_ytd = get_ytd_return(port_rets)
    port_inc = get_return(port_rets, len(port_rets))
    
    bench_3m = get_return(bench_rets, days_3m)
    bench_12m = get_return(bench_rets, days_12m)
    bench_ytd = get_ytd_return(bench_rets)
    bench_inc = get_return(bench_rets, len(bench_rets))
    
    if chart_period == "ytd":
        port_inc = port_ytd
        bench_inc = bench_ytd
    elif chart_period == "3m":
        port_inc = port_3m
        bench_inc = bench_3m
    elif chart_period == "1m":
        days_1m = 21
        port_inc = get_return(port_rets, days_1m)
        bench_inc = get_return(bench_rets, days_1m)
    else:
        port_inc = get_return(port_rets, len(port_rets))
        bench_inc = get_return(bench_rets, len(bench_rets))
        
    alpha = port_inc - bench_inc
    
    cov_val = port_rets.cov(bench_rets)
    var_val = bench_rets.var()
    beta = float(cov_val / var_val) if var_val > 0 else 1.0
    
    # Slice series for sparkline based on chart_period
    sparkline_port = port_series
    sparkline_bench = bench_series
    
    if chart_period == "ytd":
        current_year = port_series.index[-1].year
        sparkline_port = port_series[port_series.index.year == current_year]
        sparkline_bench = bench_series[bench_series.index.year == current_year]
    elif chart_period == "1y":
        sparkline_port = port_series.iloc[-days_12m:] if len(port_series) > days_12m else port_series
        sparkline_bench = bench_series.iloc[-days_12m:] if len(bench_series) > days_12m else bench_series
    elif chart_period == "3m":
        sparkline_port = port_series.iloc[-days_3m:] if len(port_series) > days_3m else port_series
        sparkline_bench = bench_series.iloc[-days_3m:] if len(bench_series) > days_3m else bench_series
    elif chart_period == "1m":
        days_1m = 21
        sparkline_port = port_series.iloc[-days_1m:] if len(port_series) > days_1m else port_series
        sparkline_bench = bench_series.iloc[-days_1m:] if len(bench_series) > days_1m else bench_series
    
    # Re-normalize sparkline so it starts at 100 for the selected period
    if not sparkline_port.empty:
        sparkline_port = sparkline_port / sparkline_port.iloc[0] * 100.0
    if not sparkline_bench.empty:
        sparkline_bench = sparkline_bench / sparkline_bench.iloc[0] * 100.0

    sparkline = []
    for date, p_val, b_val in zip(sparkline_port.index, sparkline_port, sparkline_bench):
        sparkline.append({
            "date": date.strftime("%Y-%m-%d"),
            "value": round(float(p_val), 2),
            "benchmark_value": round(float(b_val), 2)
        })
        
    return {
        "success": True,
        "benchmark": benchmark,
        "portfolio_return_inception": round(port_inc, 3),
        "benchmark_return_inception": round(bench_inc, 3),
        "alpha_inception": round(alpha, 3),
        "metrics": {
            "3m": round(port_3m, 3),
            "ytd": round(port_ytd, 3),
            "12m": round(port_12m, 3),
            "beta": round(beta, 2)
        },
        "sparkline": sparkline
    }
