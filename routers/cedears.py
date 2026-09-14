from fastapi import APIRouter, Form, Query
from fastapi.responses import JSONResponse
from services.portfolio_service import get_all_portfolio_tickers, get_ticker_sector
from services.cedear_service import get_ticker_data, get_multiple_tickers_data, CEDEAR_RATIOS, load_cedear_ratios
from services.security_service import sanitize_ticker
from services.earnings_service import get_ticker_earnings_badge, load_earnings_calendar
from services.fair_value_service import load_fair_values, evaluate_fair_value_signal
from services.ppc_service import load_ppc_values, evaluate_ppc_return
from services.pfcf_service import get_pfcf_value, evaluate_fcf_rsi_state, load_pfcf_values

router = APIRouter()

DEFAULT_WATCHLIST = ["AAPL", "NVDA", "MSFT", "MELI", "LLY", "GOOGL", "AMZN", "SPY", "QQQ", "VIST", "MSTR", "JPM", "PAM"]

@router.get("/tickers", response_class=JSONResponse)
def get_all_cedear_tickers():
    ratios = load_cedear_ratios()
    all_tickers = sorted(list(ratios.keys()))
    catalog = []
    for tk in all_tickers:
        sec = get_ticker_sector(tk)
        catalog.append({
            "ticker": tk,
            "name": sec.get("name", "Otros Activos"),
            "sector_id": sec.get("id", "other"),
            "subsector": sec.get("subsector"),
            "is_etf": sec.get("is_etf", False),
            "ratio": ratios.get(tk, 1.0)
        })
    return JSONResponse({
        "tickers": all_tickers,
        "catalog": catalog
    })

@router.get("/portfolio_tickers", response_class=JSONResponse)
def get_portfolio_tickers_endpoint():
    return JSONResponse({"portfolio_tickers": get_all_portfolio_tickers()})

@router.post("/card", response_class=JSONResponse)
def get_cedear_card(ticker: str = Form(...)):
    ticker = sanitize_ticker(ticker)
    if not ticker:
        return JSONResponse({"error": "Ticker inválido o no especificado."}, status_code=200)
    
    data = get_ticker_data(ticker)
    if not data:
        return JSONResponse({"error": f"Error cargando cotización para {ticker}"}, status_code=200)
    
    data["earnings_badge"] = get_ticker_earnings_badge(ticker)
    pfcf_val = get_pfcf_value(ticker)
    data["pfcf"] = pfcf_val
    data["pfcf_signal"] = evaluate_fcf_rsi_state(ticker, pfcf_val, data.get("rsi"))
    
    return JSONResponse(data)

@router.get("/quotes_json", response_class=JSONResponse)
def get_cedears_quotes_json(tickers: str = Query(None)):
    portfolio_tickers = get_all_portfolio_tickers()

    if tickers:
        raw_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
        clean_list = [sanitize_ticker(t) for t in raw_list if sanitize_ticker(t)]
    else:
        # Por defecto, unir todos los tickers de carteras con la watchlist recomendada
        clean_list = sorted(list(dict.fromkeys(portfolio_tickers + DEFAULT_WATCHLIST)))

    if not clean_list:
        clean_list = DEFAULT_WATCHLIST

    # Concurrent fetch of prices and RSI
    tickers_data = get_multiple_tickers_data(clean_list)
    earnings_cal = load_earnings_calendar()
    fair_values_map = load_fair_values()
    ppc_map = load_ppc_values()
    pfcf_map = load_pfcf_values()

    quotes = []
    for tk in clean_list:
        item = tickers_data.get(tk)
        ratio_raw = CEDEAR_RATIOS.get(tk, 1.0)
        ratio_val = float(ratio_raw) if isinstance(ratio_raw, (int, float)) and ratio_raw > 0 else 1.0
        in_pf = tk in portfolio_tickers
        sec_info = get_ticker_sector(tk)
        is_etf = bool(sec_info.get("is_etf", False))

        if not item:
            # Fallback placeholder if ticker not loaded yet
            quotes.append({
                "symbol": tk,
                "adr": None,
                "cedear_usd": None,
                "local": None,
                "ratio": ratio_val,
                "rsi": None,
                "alert": False,
                "in_portfolio": in_pf,
                "is_etf": is_etf,
                "earnings_badge": get_ticker_earnings_badge(tk, cal=earnings_cal),
                "gf_value": fair_values_map.get(tk),
                "gf_signal": None,
                "pfcf": pfcf_map.get(tk),
                "pfcf_signal": None
            })
            continue

        adr_p = item.get("adr_price") if item.get("adr_price") is not None else item.get("adr")
        loc_p = item.get("price") if item.get("price") is not None else item.get("local")
        rsi_val = item.get("rsi")
        
        item_ratio = item.get("ratio")
        if isinstance(item_ratio, (int, float)) and item_ratio > 0:
            ratio_val = float(item_ratio)

        cedear_usd_val = None
        if adr_p is not None and ratio_val > 0:
            cedear_usd_val = round(float(adr_p) / ratio_val, 2)

        quotes.append({
            "symbol": tk,
            "adr": round(float(adr_p), 2) if adr_p is not None else None,
            "cedear_usd": cedear_usd_val,
            "local": round(float(loc_p), 2) if loc_p is not None else None,
            "ratio": ratio_val,
            "rsi": round(float(rsi_val), 1) if rsi_val is not None else None,
            "alert": bool(rsi_val is not None and (rsi_val > 65.0 or rsi_val < 35.0)),
            "in_portfolio": in_pf,
            "is_etf": is_etf,
            "earnings_badge": get_ticker_earnings_badge(tk, cal=earnings_cal),
            "gf_value": fair_values_map.get(tk),
            "gf_signal": evaluate_fair_value_signal(tk, adr_p, gf_val_map=fair_values_map) if adr_p else None,
            "pfcf": pfcf_map.get(tk),
            "pfcf_signal": evaluate_fcf_rsi_state(tk, pfcf_map.get(tk), rsi_val)
        })

    return JSONResponse({
        "tickers": clean_list,
        "portfolio_tickers": portfolio_tickers,
        "quotes": quotes,
        "supported_ratios": CEDEAR_RATIOS
    })

@router.get("/quote_json/{ticker}", response_class=JSONResponse)
def get_single_cedear_json(ticker: str):
    ticker_clean = sanitize_ticker(ticker)
    if not ticker_clean:
        return JSONResponse({"error": "Ticker inválido"}, status_code=400)
        
    data = get_ticker_data(ticker_clean)
    if not data:
        return JSONResponse({"error": f"No se encontraron datos para {ticker_clean}"}, status_code=404)
        
    earnings_cal = load_earnings_calendar()
    fair_values_map = load_fair_values()
    ppc_map = load_ppc_values()
    pfcf_map = load_pfcf_values()

    adr_p = data.get("adr")
    loc_p = data.get("local")
    rsi_val = data.get("rsi")
    ppc_val = ppc_map.get(ticker_clean)

    quote = {
        "symbol": ticker_clean,
        "adr": adr_p,
        "local": loc_p,
        "ratio": data.get("ratio", CEDEAR_RATIOS.get(ticker_clean, 1.0)),
        "rsi": rsi_val,
        "alert": data.get("alert", False),
        "earnings_badge": get_ticker_earnings_badge(ticker_clean, cal=earnings_cal),
        "gf_value": fair_values_map.get(ticker_clean),
        "gf_signal": evaluate_fair_value_signal(ticker_clean, adr_p, gf_val_map=fair_values_map) if adr_p else None,
        "ppc": ppc_val,
        "ppc_return": evaluate_ppc_return(ticker_clean, loc_p, ppc_val) if (loc_p and ppc_val) else None,
        "pfcf": pfcf_map.get(ticker_clean),
        "pfcf_signal": evaluate_fcf_rsi_state(ticker_clean, pfcf_map.get(ticker_clean), rsi_val)
    }
    return JSONResponse(quote)


from services.etf_service import fetch_sector_etf_thermometer

@router.get("/etf_thermometer", response_class=JSONResponse)
def get_etf_thermometer_endpoint():
    data = fetch_sector_etf_thermometer()
    return JSONResponse(data)
