from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
import logging

from services.portfolio_service import load_portfolios
from services.security_service import sanitize_portfolio_name, sanitize_ticker, parse_weights_string
from services.markowitz_service import calculate_markowitz_model

router = APIRouter()
logger = logging.getLogger(__name__)

def _resolve_tickers_and_weights(
    selected_pf: str,
    custom_tickers: str,
    portfolios_data: dict
) -> tuple[str, list[str], dict[str, float] | None, str]:
    selected_pf_clean = sanitize_portfolio_name(selected_pf) if selected_pf else ""
    tickers_list = []
    current_weights = None
    
    # Si el usuario ingresó tickers con ponderaciones explícitas (e.g. AAPL:40, MSFT:60)
    if custom_tickers and ":" in custom_tickers:
        parsed_w, err = parse_weights_string(custom_tickers)
        if parsed_w and len(parsed_w) >= 2:
            selected_pf_clean = "custom"
            tickers_list = list(parsed_w.keys())
            current_weights = parsed_w
            custom_tickers_str = ", ".join(tickers_list)
            return selected_pf_clean, tickers_list, current_weights, custom_tickers_str

    if selected_pf_clean and selected_pf_clean != "custom" and selected_pf_clean in portfolios_data:
        pf_info = portfolios_data[selected_pf_clean]
        assets = pf_info.get("assets", {})
        if custom_tickers and custom_tickers.strip():
            raw_parts = [t.strip() for t in custom_tickers.replace(";", ",").split(",") if t.strip()]
            custom_list = [sanitize_ticker(t) for t in raw_parts if sanitize_ticker(t)]
            if set(custom_list) != set(assets.keys()):
                selected_pf_clean = "custom"
                tickers_list = custom_list
                current_weights = None
            else:
                tickers_list = list(assets.keys())
                current_weights = {sanitize_ticker(k): float(v) for k, v in assets.items() if sanitize_ticker(k)}
        else:
            tickers_list = list(assets.keys())
            current_weights = {sanitize_ticker(k): float(v) for k, v in assets.items() if sanitize_ticker(k)}
    elif custom_tickers and custom_tickers.strip():
        raw_parts = [t.strip() for t in custom_tickers.replace(";", ",").split(",") if t.strip()]
        tickers_list = [sanitize_ticker(t) for t in raw_parts if sanitize_ticker(t)]
        selected_pf_clean = "custom"
        current_weights = None
    else:
        if "bmb" in portfolios_data:
            selected_pf_clean = "bmb"
            assets = portfolios_data["bmb"].get("assets", {})
            tickers_list = list(assets.keys())
            current_weights = {sanitize_ticker(k): float(v) for k, v in assets.items() if sanitize_ticker(k)}
        elif portfolios_data:
            selected_pf_clean = list(portfolios_data.keys())[0]
            assets = portfolios_data[selected_pf_clean].get("assets", {})
            tickers_list = list(assets.keys())
            current_weights = {sanitize_ticker(k): float(v) for k, v in assets.items() if sanitize_ticker(k)}
        else:
            selected_pf_clean = "custom"
            tickers_list = ["AMZN", "BRKB", "GOOGL", "JPM", "MCD", "MELI", "META", "MSFT", "NU", "QQQ", "SPY"]

    tickers_list = list(dict.fromkeys(tickers_list))
    if len(tickers_list) < 2:
        tickers_list = ["AMZN", "BRKB", "GOOGL", "JPM", "MCD", "MELI", "META", "MSFT", "NU", "QQQ", "SPY"]
        
    custom_tickers_str = ", ".join(tickers_list)
    return selected_pf_clean, tickers_list, current_weights, custom_tickers_str

@router.get("/markowitz_json", response_class=JSONResponse)
@router.post("/markowitz_json", response_class=JSONResponse)
async def markowitz_json_api(
    request: Request,
    selected_pf: str = "bmb",
    custom_tickers: str = "",
    period: str = "2y",
    rf_rate: float = 4.0,
    rebalance_regime: str = "annual"
):
    req_pf = selected_pf
    req_custom = custom_tickers
    req_period = period
    req_rf = rf_rate
    req_regime = rebalance_regime

    if request.method == "POST":
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                body = await request.json()
                req_pf = body.get("selected_pf", req_pf)
                req_custom = body.get("custom_tickers", req_custom)
                req_period = body.get("period", req_period)
                req_rf = float(body.get("rf_rate", req_rf))
                req_regime = body.get("rebalance_regime", req_regime)
            except Exception:
                pass
        else:
            try:
                form = await request.form()
                if "selected_pf" in form:
                    req_pf = str(form["selected_pf"])
                if "custom_tickers" in form:
                    req_custom = str(form["custom_tickers"])
                if "period" in form:
                    req_period = str(form["period"])
                if "rf_rate" in form:
                    req_rf = float(form["rf_rate"])
                if "rebalance_regime" in form:
                    req_regime = str(form["rebalance_regime"])
            except Exception:
                pass

    def _calc():
        portfolios_data = load_portfolios()
        selected_pf_clean, tickers_list, current_weights, _ = _resolve_tickers_and_weights(
            req_pf, req_custom, portfolios_data
        )
            
        res = calculate_markowitz_model(
            tickers=tickers_list,
            current_weights=current_weights,
            period=req_period or "2y",
            rf_rate=(req_rf / 100.0) if req_rf and req_rf > 0 else 0.04,
            num_simulations=4000,
            include_plot=False,
            rebalance_regime=req_regime or "annual"
        )
        available_pfs = []
        for k, v in portfolios_data.items():
            available_pfs.append({
                "id": k,
                "name": k.replace("_", " ").upper(),
                "asset_count": len(v.get("assets", {}))
            })

        return {
            "selected_pf": selected_pf_clean,
            "available_portfolios": available_pfs,
            "tickers": tickers_list,
            "period": req_period,
            "rf_rate": req_rf,
            "rebalance_regime": res.get("rebalance_regime", req_regime or "annual"),
            "max_sharpe": res.get("max_sharpe"),
            "min_volatility": res.get("min_volatility"),
            "current_portfolio": res.get("current_portfolio"),
            "optimal_candidates": res.get("optimal_candidates"),
            "weights_table": res.get("weights_table"),
            "corr_matrix": res.get("corr_matrix"),
            "frontier_data": res.get("frontier_data"),
            "time_series": res.get("time_series"),
            "global_stats": res.get("global_stats"),
            "annual_returns_table": res.get("annual_returns_table")
        }

    data = await run_in_threadpool(_calc)
    return JSONResponse(content=data)
