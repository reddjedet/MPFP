from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.portfolio_service import get_all_portfolio_tickers, get_ticker_sector
from services.cedear_service import get_ticker_data, get_multiple_tickers_data, CEDEAR_RATIOS, load_cedear_ratios
from services.security_service import sanitize_ticker
from services.earnings_service import get_ticker_earnings_badge, load_earnings_calendar, calculate_earnings_status
from services.fair_value_service import load_fair_values, evaluate_fair_value_signal
from services.ppc_service import load_ppc_values, evaluate_ppc_return
from services.pfcf_service import evaluate_fcf_rsi_state, load_pfcf_values
from services.rotation_service import load_user_holdings

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
                "sector_id": sec_info.get("id", "other"),
                "sector_name": sec_info.get("name", "Otros Activos"),
                "subsector": sec_info.get("subsector"),
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
            "sector_id": sec_info.get("id", "other"),
            "sector_name": sec_info.get("name", "Otros Activos"),
            "subsector": sec_info.get("subsector"),
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
def get_single_cedear_json(ticker: str, portfolio: Optional[str] = Query(None)):
    ticker_clean = sanitize_ticker(ticker)
    if not ticker_clean:
        from services.exceptions import InvalidTickerError
        raise InvalidTickerError(f"Ticker inválido: '{ticker}'")
        
    data = get_ticker_data(ticker_clean)
    if not data:
        from services.exceptions import AssetNotFoundError
        raise AssetNotFoundError(f"No se encontraron datos para {ticker_clean}")
        
    earnings_cal = load_earnings_calendar()
    fair_values_map = load_fair_values()
    ppc_map = load_ppc_values()
    pfcf_map = load_pfcf_values()

    adr_p = data.get("adr")
    loc_p = data.get("local")
    rsi_val = data.get("rsi")
    ppc_val = ppc_map.get(ticker_clean)

    # Sector, Compañía y metadatos de activo
    sec_info = get_ticker_sector(ticker_clean)
    company_name = sec_info.get("name") or ticker_clean
    sector_name = sec_info.get("name", "Otros Activos")
    sector_id = sec_info.get("id", "other")
    is_etf = sec_info.get("is_etf", False)

    # Detalle de balance
    cal_item = earnings_cal.get(ticker_clean)
    earnings_detail = None
    if not cal_item and ticker_clean == "BRKB":
        cal_item = earnings_cal.get("BRK.B")
    if cal_item:
        st = calculate_earnings_status(ticker_clean, cal_item)
        if st.get("company"):
            company_name = st.get("company")
        delta_d = st.get("delta_days")
        earnings_detail = {
            "company": st.get("company", company_name),
            "fiscal_close": st.get("fiscal_close", "—"),
            "typical_window": st.get("typical_window", "—"),
            "confirmed_date": st.get("confirmed_date_formatted", "—"),
            "delta_days": delta_d,
            "target_month_name": st.get("target_month_name", ""),
            "status_text": st.get("status_text", ""),
            "status_tier": st.get("status_tier", ""),
            "badge_class": st.get("badge_class", ""),
            "is_urgent": delta_d is not None and 0 <= delta_d < 14
        }

    # Tenencia en cartera activa
    user_holdings = load_user_holdings(portfolio)
    holding_data = user_holdings.get("holdings", {}).get(ticker_clean, 0)
    nominals = holding_data.get("nominals", 0) if isinstance(holding_data, dict) else (holding_data or 0)
    pos_val_ars = round(nominals * loc_p, 2) if (loc_p and nominals) else 0.0

    # Margen de seguridad vs GuruFocus Fair Value
    gf_val = fair_values_map.get(ticker_clean)
    discount_pct = None
    if gf_val and adr_p and gf_val > 0:
        discount_pct = round(((gf_val - adr_p) / gf_val) * 100, 1)

    quote = {
        "symbol": ticker_clean,
        "company_name": company_name,
        "sector_id": sector_id,
        "sector_name": sector_name,
        "is_etf": is_etf,
        "adr": adr_p,
        "local": loc_p,
        "ratio": data.get("ratio", CEDEAR_RATIOS.get(ticker_clean, 1.0)),
        "rsi": rsi_val,
        "alert": data.get("alert", False),
        "earnings_badge": get_ticker_earnings_badge(ticker_clean, cal=earnings_cal),
        "earnings_detail": earnings_detail,
        "gf_value": gf_val,
        "discount_pct": discount_pct,
        "gf_signal": evaluate_fair_value_signal(ticker_clean, adr_p, gf_val_map=fair_values_map) if adr_p else None,
        "ppc": ppc_val,
        "ppc_return": evaluate_ppc_return(ticker_clean, loc_p, ppc_val) if (loc_p and ppc_val) else None,
        "pfcf": pfcf_map.get(ticker_clean),
        "pfcf_signal": evaluate_fcf_rsi_state(ticker_clean, pfcf_map.get(ticker_clean), rsi_val),
        "portfolio": portfolio or "bmb",
        "nominals": nominals,
        "position_value_ars": pos_val_ars
    }
    return JSONResponse(quote)


from services.etf_service import fetch_sector_etf_thermometer, fetch_etf_rotation_analysis

@router.get("/etf_thermometer", response_class=JSONResponse)
def get_etf_thermometer_endpoint():
    data = fetch_sector_etf_thermometer()
    return JSONResponse(data)

@router.get("/etf_rotation_analysis", response_class=JSONResponse)
def get_etf_rotation_analysis_endpoint(universe: str = "sectors"):
    data = fetch_etf_rotation_analysis(universe=universe)
    return JSONResponse(data)
