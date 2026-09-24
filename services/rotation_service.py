from pathlib import Path
from typing import Dict, Any, Optional
import logging
import math

from services.atomic_persistence import AtomicJsonDatabase
from services.security_service import sanitize_ticker
from services.ppc_service import load_ppc_values, save_ppc_value, evaluate_ppc_return
from services.cedear_service import get_ticker_data, get_multiple_tickers_data, CEDEAR_RATIOS
from services.portfolio_service import load_portfolios
from services.fair_value_service import load_fair_values, evaluate_fair_value_signal
from services.pfcf_service import load_pfcf_values, evaluate_fcf_rsi_state
from services.financial_units import (
    normalize_fixed_income_price,
    to_base_100,
    is_fixed_income_ticker,
    to_unit_price,
    to_market_quote
)

logger = logging.getLogger("RotationService")

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "user_holdings.json"

DEFAULT_HOLDINGS = {
    "bmb": {
        "holdings": {
            "AMAT": {"nominals": 1, "ppc": 96563.40},
            "GOOGL": {"nominals": 14, "ppc": 7619.66},
            "PM": {"nominals": 3, "ppc": 14606.57}
        },
        "fixed_income_holdings": {
            "S30S6": {"nominals": 335457, "ppc": 112.08}
        },
        "cash_ars": 0.0
    },
    "min_drawdown_15": {
        "holdings": {
            "COST": {"nominals": 8, "ppc": 29959.90},
            "DE": {"nominals": 3, "ppc": 15971.31},
            "LLY": {"nominals": 6, "ppc": 22275.63},
            "NEM": {"nominals": 1, "ppc": 38946.68},
            "NU": {"nominals": 7, "ppc": 11840.00},
            "URA": {"nominals": 6, "ppc": 14176.67},
            "V": {"nominals": 12, "ppc": 33560.00},
            "VIST": {"nominals": 1, "ppc": 39940.00}
        },
        "fixed_income_holdings": {
            "S30S6": {"nominals": 369614, "ppc": 1.11},
            "T31Y7": {"nominals": 78030, "ppc": 1.15}
        },
        "cash_ars": 0.0
    }
}

_db = AtomicJsonDatabase(DB_PATH, default_data=DEFAULT_HOLDINGS)


def _migrate_legacy_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Migra estructura plana legacy {'holdings': ..., 'cash_ars': ...} a multi-cartera."""
    portfolios = load_portfolios()
    migrated: Dict[str, Any] = {k: {"holdings": {}, "cash_ars": 0.0} for k in portfolios.keys()}
    legacy_holdings = data.get("holdings", {})
    legacy_cash = float(data.get("cash_ars", 0.0))
    
    for tk, val in legacy_holdings.items():
        assigned = False
        for pf_k, pf_data in portfolios.items():
            if tk in pf_data.get("assets", {}):
                migrated[pf_k]["holdings"][tk] = val
                assigned = True
                break
        if not assigned:
            default_pf = list(portfolios.keys())[0] if portfolios else "bmb"
            if default_pf not in migrated:
                migrated[default_pf] = {"holdings": {}, "cash_ars": 0.0}
            migrated[default_pf]["holdings"][tk] = val
            
    first_pf = list(portfolios.keys())[0] if portfolios else "bmb"
    if first_pf in migrated:
        migrated[first_pf]["cash_ars"] = legacy_cash
    return migrated


def load_all_user_holdings() -> Dict[str, Any]:
    """Carga todas las tenencias por cartera con sanitización atómica y migración automática."""
    data = _db.load()
    if not isinstance(data, dict):
        return DEFAULT_HOLDINGS.copy()
    
    # Detección y migración de formato plano legacy
    if "holdings" in data and not any(isinstance(v, dict) and "holdings" in v for v in data.values()):
        data = _migrate_legacy_data(data)
        _db.save(data)
        
    ppc_map = load_ppc_values()
    result = {}
    
    known_portfolios = list(load_portfolios().keys())
    all_keys = sorted(list(set(list(data.keys()) + known_portfolios)))
    
    for pf_key in all_keys:
        pf_entry = data.get(pf_key, {})
        if not isinstance(pf_entry, dict):
            pf_entry = {}
        clean_holdings = {}
        for tk, val in pf_entry.get("holdings", {}).items():
            clean_tk = sanitize_ticker(tk)
            if not clean_tk:
                continue
            if isinstance(val, dict):
                nom = int(val.get("nominals", 0))
                p_ppc = val.get("ppc")
                if p_ppc is None or p_ppc <= 0:
                    p_ppc = ppc_map.get(clean_tk)
                clean_holdings[clean_tk] = {
                    "nominals": max(0, nom),
                    "ppc": float(p_ppc) if p_ppc and float(p_ppc) > 0 else None
                }
            elif isinstance(val, (int, float)):
                clean_holdings[clean_tk] = {
                    "nominals": max(0, int(val)),
                    "ppc": ppc_map.get(clean_tk)
                }
        clean_fi = {}
        for tk, val in pf_entry.get("fixed_income_holdings", {}).items():
            clean_tk = sanitize_ticker(tk)
            if not clean_tk:
                continue
            if isinstance(val, dict):
                nom = int(val.get("nominals", 0))
                p_ppc = val.get("ppc")
                if p_ppc is None or p_ppc <= 0:
                    p_ppc = ppc_map.get(clean_tk)
                clean_fi[clean_tk] = {
                    "nominals": max(0, nom),
                    "ppc": float(p_ppc) if p_ppc and float(p_ppc) > 0 else None
                }
            elif isinstance(val, (int, float)):
                clean_fi[clean_tk] = {
                    "nominals": max(0, int(val)),
                    "ppc": ppc_map.get(clean_tk)
                }

        cash = float(pf_entry.get("cash_ars", 0.0))
        result[pf_key] = {
            "holdings": clean_holdings,
            "fixed_income_holdings": clean_fi,
            "cash_ars": max(0.0, cash)
        }
    return result


def load_user_holdings(portfolio_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Carga el diccionario de tenencia real y caja en ARS para la cartera solicitada.
    Si portfolio_key es None, utiliza 'bmb' por defecto para máxima retrocompatibilidad.
    """
    all_holdings = load_all_user_holdings()
    target_key = portfolio_key or "bmb"
    res = all_holdings.get(target_key, {"holdings": {}, "fixed_income_holdings": {}, "cash_ars": 0.0})
    if "fixed_income_holdings" not in res:
        res["fixed_income_holdings"] = {}
    return res


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _safe_float(val: Any, default: Optional[float] = None) -> Optional[float]:
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


def save_user_holdings(data: Dict[str, Any], portfolio_key: Optional[str] = None) -> None:
    """
    Guarda la estructura de tenencia real.
    - Si portfolio_key está provisto o data tiene 'portfolio', actualiza esa cartera específica.
    - Si data tiene formato {'holdings': ..., 'cash_ars': ...}, actualiza 'bmb' por defecto.
    - Si data es un diccionario multi-cartera ({'bmb': ..., 'min_drawdown_15': ...}), actualiza todas las carteras.
    Sincroniza siempre los PPCs con ppc_service.
    """
    if not isinstance(data, dict):
        return

    all_data = load_all_user_holdings()
    target_pf = portfolio_key or data.get("portfolio")
    
    if target_pf or "holdings" in data or "fixed_income_holdings" in data:
        target_pf = target_pf or "bmb"
        holdings_dict = data.get("holdings", all_data.get(target_pf, {}).get("holdings", {}))
        clean_holdings = {}
        for tk, val in holdings_dict.items():
            clean_tk = sanitize_ticker(tk)
            if not clean_tk or not isinstance(val, dict):
                continue
            nom = max(0, _safe_int(val.get("nominals", 0)))
            ppc_val = val.get("ppc")
            ppc_f = _safe_float(ppc_val)
            if nom > 0 or ppc_f is not None:
                clean_holdings[clean_tk] = {
                    "nominals": nom,
                    "ppc": ppc_f if ppc_f and ppc_f > 0 else None
                }
                if ppc_f and ppc_f > 0:
                    save_ppc_value(clean_tk, ppc_f)

        existing_fi = all_data.get(target_pf, {}).get("fixed_income_holdings", {})
        fi_dict = data.get("fixed_income_holdings", existing_fi)
        clean_fi = {}
        for tk, val in fi_dict.items():
            clean_tk = sanitize_ticker(tk)
            if not clean_tk or not isinstance(val, dict):
                continue
            nom = max(0, _safe_int(val.get("nominals", 0)))
            ppc_val = val.get("ppc")
            ppc_f = _safe_float(ppc_val)
            if nom > 0 or ppc_f is not None:
                clean_fi[clean_tk] = {
                    "nominals": nom,
                    "ppc": ppc_f if ppc_f and ppc_f > 0 else None
                }
                if ppc_f and ppc_f > 0:
                    save_ppc_value(clean_tk, ppc_f)

        if "cash_ars" in data and data["cash_ars"] is not None:
            cash = max(0.0, _safe_float(data["cash_ars"], default=0.0) or 0.0)
        else:
            cash = float(all_data.get(target_pf, {}).get("cash_ars", 0.0))
        all_data[target_pf] = {
            "holdings": clean_holdings,
            "fixed_income_holdings": clean_fi,
            "cash_ars": round(cash, 2)
        }
    else:
        for pf_k, pf_v in data.items():
            if not isinstance(pf_v, dict):
                continue
            clean_holdings = {}
            for tk, val in pf_v.get("holdings", {}).items():
                clean_tk = sanitize_ticker(tk)
                if not clean_tk or not isinstance(val, dict):
                    continue
                nom = max(0, _safe_int(val.get("nominals", 0)))
                ppc_val = val.get("ppc")
                ppc_f = _safe_float(ppc_val)
                if nom > 0 or ppc_f is not None:
                    clean_holdings[clean_tk] = {
                        "nominals": nom,
                        "ppc": ppc_f if ppc_f and ppc_f > 0 else None
                    }
                    if ppc_f and ppc_f > 0:
                        save_ppc_value(clean_tk, ppc_f)

            existing_fi = all_data.get(pf_k, {}).get("fixed_income_holdings", {})
            fi_dict = pf_v.get("fixed_income_holdings", existing_fi)
            clean_fi = {}
            for tk, val in fi_dict.items():
                clean_tk = sanitize_ticker(tk)
                if not clean_tk or not isinstance(val, dict):
                    continue
                nom = max(0, _safe_int(val.get("nominals", 0)))
                ppc_val = val.get("ppc")
                ppc_f = _safe_float(ppc_val)
                if nom > 0 or ppc_f is not None:
                    clean_fi[clean_tk] = {
                        "nominals": nom,
                        "ppc": ppc_f if ppc_f and ppc_f > 0 else None
                    }
                    if ppc_f and ppc_f > 0:
                        save_ppc_value(clean_tk, ppc_f)

            if "cash_ars" in pf_v and pf_v["cash_ars"] is not None:
                cash = max(0.0, _safe_float(pf_v["cash_ars"], default=0.0) or 0.0)
            else:
                cash = float(all_data.get(pf_k, {}).get("cash_ars", 0.0))
            all_data[pf_k] = {
                "holdings": clean_holdings,
                "fixed_income_holdings": clean_fi,
                "cash_ars": round(cash, 2)
            }
            
    _db.save(all_data)


def update_holding(ticker: str, nominals: int, ppc: Optional[float] = None, portfolio_key: str = "bmb") -> Dict[str, Any]:
    """Actualiza o agrega un activo individual a la tenencia real de una cartera específica."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return load_user_holdings(portfolio_key)
    
    current = load_user_holdings(portfolio_key)
    if nominals <= 0 and (ppc is None or ppc <= 0):
        current["holdings"].pop(clean_tk, None)
    else:
        current["holdings"][clean_tk] = {
            "nominals": max(0, int(nominals)),
            "ppc": float(ppc) if ppc and float(ppc) > 0 else current["holdings"].get(clean_tk, {}).get("ppc")
        }
    save_user_holdings(current, portfolio_key=portfolio_key)
    return current


def delete_holding(ticker: str, portfolio_key: str = "bmb") -> Dict[str, Any]:
    """Elimina un activo de la tenencia real de una cartera específica."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return load_user_holdings(portfolio_key)
    current = load_user_holdings(portfolio_key)
    current["holdings"].pop(clean_tk, None)
    save_user_holdings(current, portfolio_key=portfolio_key)
    return current


def update_fixed_income_holding(ticker: str, nominals: int, ppc: Optional[float] = None, portfolio_key: str = "bmb") -> Dict[str, Any]:
    """Actualiza o agrega un activo de renta fija a la tenencia real de una cartera específica."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return load_user_holdings(portfolio_key)
    
    current = load_user_holdings(portfolio_key)
    fi = current.get("fixed_income_holdings", {})
    if nominals <= 0 and (ppc is None or ppc <= 0):
        fi.pop(clean_tk, None)
    else:
        fi[clean_tk] = {
            "nominals": max(0, int(nominals)),
            "ppc": float(ppc) if ppc and float(ppc) > 0 else fi.get(clean_tk, {}).get("ppc")
        }
    current["fixed_income_holdings"] = fi
    save_user_holdings(current, portfolio_key=portfolio_key)
    return current


def delete_fixed_income_holding(ticker: str, portfolio_key: str = "bmb") -> Dict[str, Any]:
    """Elimina un activo de renta fija de la tenencia real de una cartera específica."""
    clean_tk = sanitize_ticker(ticker)
    if not clean_tk:
        return load_user_holdings(portfolio_key)
    current = load_user_holdings(portfolio_key)
    if "fixed_income_holdings" in current:
        current["fixed_income_holdings"].pop(clean_tk, None)
    save_user_holdings(current, portfolio_key=portfolio_key)
    return current


def analyze_rotation(
    target_pf_key: str = "min_drawdown_15",
    portfolio_data: Optional[Dict[str, Any]] = None,
    cash_budget: Optional[float] = None,
    tolerance_pct: float = 1.5,
    target_multiplier: Optional[int] = None
) -> Dict[str, Any]:
    """
    Motor cuantitativo de análisis de brechas (Gap Analysis) y rotación inteligente de capital.
    Compara la Tenencia Real del usuario de target_pf_key vs. la Cartera Objetivo seleccionada.
    Utiliza el MCM discreto para calcular nominales objetivo enteros proporcionales.
    """
    user_data = load_user_holdings(target_pf_key)
    raw_holdings = user_data.get("holdings", {})
    raw_fi = user_data.get("fixed_income_holdings", {})
    cash_ars = user_data.get("cash_ars", 0.0)
    effective_cash = float(cash_budget) if cash_budget is not None else cash_ars
    
    # Saneamiento canónico: si un bono fue guardado erróneamente en holdings, reclasificarlo
    from services.financial_units import is_fixed_income_ticker, to_unit_price, to_market_quote
    holdings = {}
    fixed_income = dict(raw_fi)
    for tk, val in raw_holdings.items():
        if is_fixed_income_ticker(tk):
            if tk not in fixed_income:
                fixed_income[tk] = val
        else:
            holdings[tk] = val
    
    portfolios = load_portfolios()
    target_pf = portfolio_data or portfolios.get(target_pf_key, portfolios.get("min_drawdown_15", {}))
    pf_mode = target_pf.get("mode", "weights")
    target_weights = target_pf.get("weights") or target_pf.get("assets", {})
    target_alloc = target_pf.get("asset_allocation", {}) if isinstance(target_pf, dict) else {}
    fi_assets = target_pf.get("fixed_income_assets", {})

    # REGLA CANÓNICA: La cartera objetivo define si hay renta fija o no
    has_explicit_fi = bool(
        target_alloc.get("fixed_income_weight") is not None and 
        float(target_alloc.get("fixed_income_weight", 0)) > 0 and 
        bool(fi_assets)
    )

    equity_tickers = sorted(list(set(list(holdings.keys()) + list(target_weights.keys()))))
    
    if has_explicit_fi:
        # Cartera con Renta Fija: incluir bonos del usuario y del objetivo
        fi_tickers = sorted(list(set(list(fixed_income.keys()) + list(fi_assets.keys()))))
        all_tickers = sorted(list(set(equity_tickers + fi_tickers)))
    else:
        # REGLA DE INVISIBILIDAD: Cartera 100% Renta Variable
        # La renta fija permanece COMPLETAMENTE INVISIBLE. No se agrega a la tabla ni a las órdenes.
        fi_tickers = []
        all_tickers = equity_tickers
    
    # Cargar cotizaciones spot de Renta Variable
    if hasattr(get_ticker_data, "mock_calls"):
        fetched = {tk: get_ticker_data(tk) for tk in equity_tickers}
    else:
        fetched = get_multiple_tickers_data(equity_tickers)
    market_data = {}
    gf_map = load_fair_values()
    pfcf_map = load_pfcf_values()
    
    for tk in equity_tickers:
        d = fetched.get(tk)
        if d and d.get("local"):
            market_data[tk] = d
        else:
            market_data[tk] = {
                "local": 0.0, "adr": None, "ratio": CEDEAR_RATIOS.get(tk, 1.0), "rsi": None
            }

    # Cómputo de Renta Variable
    total_real_stock_value = 0.0
    total_equity_cost = 0.0
    for tk, h in holdings.items():
        price = market_data.get(tk, {}).get("local", 0.0) or 0.0
        noms = h.get("nominals", 0)
        val = noms * price
        if noms > 0 and price > 0:
            total_real_stock_value += val
            cost = h.get("ppc") or price
            total_equity_cost += noms * cost

    total_real_equity = total_real_stock_value + cash_ars

    # Cómputo de Renta Fija (solo si la cartera objetivo tiene Renta Fija)
    from services.portfolio_service import get_portfolio_fixed_income_summary, calculate_portfolio_mcm
    
    if has_explicit_fi:
        fixed_income_summary = get_portfolio_fixed_income_summary(target_pf_key)
        fi_market_val = fixed_income_summary.get("total_market_value", 0.0) if fixed_income_summary else 0.0
        fi_invested_val = fixed_income_summary.get("total_invested", 0.0) if fixed_income_summary else 0.0
        
        # Registrar cotizaciones spot unitarias para el motor
        for tk in fi_tickers:
            fi_item = next((it for it in (fixed_income_summary.get("items") or []) if it["ticker"] == tk), None)
            if fi_item:
                unit_p = fi_item["precio_spot_unit"]
            else:
                raw_p = fixed_income.get(tk, {}).get("ppc") or 0.0
                unit_p = to_unit_price(raw_p, ticker=tk)
            market_data[tk] = {"local": unit_p, "adr": None, "ratio": 1.0, "rsi": None}
            
        total_consolidated_equity = round(total_real_equity + fi_market_val, 2)
        total_cost_invested = round(total_equity_cost + fi_invested_val, 2)
        target_fi_pct = float(target_alloc["fixed_income_weight"])
        target_equity_pct = float(target_alloc.get("equity_weight", round(100.0 - target_fi_pct, 2)))
        fi_target_source = "explicit"
        real_fi_pct = round((fi_market_val / total_consolidated_equity * 100.0), 2) if total_consolidated_equity > 0 else 0.0
        fi_gap_pct = round(real_fi_pct - target_fi_pct, 2)
    else:
        # Cartera 100% Renta Variable: Renta Fija completamente excluida
        fixed_income_summary = None
        fi_market_val = 0.0
        fi_invested_val = 0.0
        total_consolidated_equity = round(total_real_equity, 2)
        total_cost_invested = round(total_equity_cost, 2)
        target_fi_pct = 0.0
        target_equity_pct = 100.0
        fi_target_source = "implicit_current"
        real_fi_pct = 0.0
        fi_gap_pct = 0.0

    real_equity_pct = round((total_real_stock_value / total_consolidated_equity * 100.0), 2) if total_consolidated_equity > 0 else 0.0
    real_cash_pct = round((cash_ars / total_consolidated_equity * 100.0), 2) if total_consolidated_equity > 0 else 0.0
    eq_gap_pct = round(real_equity_pct - target_equity_pct, 2)

    total_pnl_ars = total_real_stock_value - total_equity_cost if total_equity_cost > 0 else 0.0
    total_pnl_pct = (total_pnl_ars / total_equity_cost * 100.0) if total_equity_cost > 0 else 0.0

    asset_allocation_status = {
        "target_equity_pct": target_equity_pct,
        "target_fixed_income_pct": target_fi_pct,
        "real_equity_pct": real_equity_pct,
        "real_fixed_income_pct": real_fi_pct,
        "real_cash_pct": real_cash_pct,
        "equity_gap_pct": eq_gap_pct,
        "fixed_income_gap_pct": fi_gap_pct,
        "fixed_income_target_source": fi_target_source,
        "fixed_income_policy": target_alloc.get("fixed_income_policy", "preserve")
    }

    # Normalizar pesos del target
    total_tw = sum(target_weights.values()) if target_weights else 0
    norm_target_weights = {}
    if total_tw > 0:
        for t, w in target_weights.items():
            norm_target_weights[t] = (w / total_tw) * target_equity_pct
            
    if has_explicit_fi and fi_assets:
        for t, data in fi_assets.items():
            norm_target_weights[t] = data.get("target_weight_portfolio", 0.0)

    # 2. MCM y Nominales Objetivo para Renta Variable
    # DEC-xx: si la cartera todavía no tiene patrimonio, dimensionar el target
    # sobre un capital hipotético para que el usuario vea un plan accionable.
    capital_base_for_target = total_real_equity if total_real_equity > 0 else 1000000.0
    capital_base_equity = (
        total_consolidated_equity * (target_equity_pct / 100.0)
        if total_consolidated_equity > 0
        else capital_base_for_target
    )
    
    equity_weights_only = {tk: float(w) for tk, w in target_weights.items() if not is_fixed_income_ticker(tk) and float(w) > 0}
    mcm_info = calculate_portfolio_mcm(equity_weights_only, market_data) if equity_weights_only else None
    
    mcm_base_nominals = mcm_info.get("base_nominals", {}) if mcm_info else {}
    mcm_base_capital = mcm_info.get("base_capital", 0.0) if mcm_info else 0.0
    
    # Multiplicador entero perseguido (DEC-08):
    if target_multiplier is not None and int(target_multiplier) >= 1:
        mcm_multiplier = int(target_multiplier)
    elif target_pf.get("target_multiplier"):
        mcm_multiplier = max(1, int(target_pf["target_multiplier"]))
    elif target_pf.get("multiplier"):
        mcm_multiplier = max(1, int(target_pf["multiplier"]))
    elif target_pf.get("qty"):
        mcm_multiplier = max(1, int(target_pf["qty"]))
    else:
        mcm_multiplier = 1
        
    items = []
    sell_candidates = []
    buy_candidates = []
    
    for tk in all_tickers:
        m = market_data.get(tk, {})
        price = m.get("local", 0.0) or 0.0
        adr_price = m.get("adr")
        ratio = m.get("ratio", CEDEAR_RATIOS.get(tk, 1.0))
        rsi = m.get("rsi")
        
        is_fi = is_fixed_income_ticker(tk)
        h = fixed_income.get(tk, {}) if is_fi else holdings.get(tk, {})
        real_noms = h.get("nominals", 0)
        ppc = h.get("ppc")
        
        real_value = real_noms * price
        real_weight = (real_value / total_consolidated_equity * 100.0) if total_consolidated_equity > 0 else 0.0
        
        if is_fi:
            target_weight = norm_target_weights.get(tk, 0.0)
            target_noms = real_noms
            target_value = real_value
            delta_noms = 0
            delta_value = 0.0
            weight_gap = 0.0
            status = "preserved"
            missing_noms = 0
            is_in_tolerance = True
            # Señal PPC simétrica en Base 100
            market_quote_100 = to_market_quote(price, ticker=tk)
            ppc_quote_100 = to_market_quote(ppc, ticker=tk) if ppc else None
            ppc_signal = evaluate_ppc_return(tk, market_quote_100, ppc_quote_100) if (market_quote_100 > 0 and ppc_quote_100) else None
            # Exponer siempre cotización Base 100 en el item para la UI
            display_price = market_quote_100
        else:
            target_weight = norm_target_weights.get(tk, 0.0)
            if pf_mode == "nominals":
                target_noms = int(target_weights.get(tk, 0))
            elif mcm_info and tk in mcm_base_nominals:
                target_noms = mcm_base_nominals.get(tk, 0) * mcm_multiplier
            elif price > 0 and target_weight > 0:
                target_noms = max(0, int(round((capital_base_equity * (target_weight / target_equity_pct)) / price))) if target_equity_pct > 0 else 0
            else:
                target_noms = 0
                
            target_value = target_noms * price
            delta_noms = real_noms - target_noms
            delta_value = delta_noms * price
            weight_gap = real_weight - target_weight
            missing_noms = max(0, -delta_noms)
            is_in_tolerance = abs(weight_gap) <= tolerance_pct
            
            if delta_noms > 0:
                status = "surplus"
            elif delta_noms < 0:
                status = "deficit"
            else:
                status = "balanced"
                
            ppc_signal = evaluate_ppc_return(tk, price, ppc) if (price > 0 and ppc) else None
            display_price = round(price, 2)

        # Señales Cuantitativas
        gf_signal = evaluate_fair_value_signal(tk, adr_price, gf_map) if adr_price else None
        pfcf_signal = evaluate_fcf_rsi_state(tk, pfcf_map.get(tk), rsi) if pfcf_map.get(tk) else None

        is_take_profit = bool(ppc_signal and ppc_signal.get("is_take_profit"))
        
        is_overbought = bool(rsi is not None and rsi > 65.0)
        is_deep_overbought = bool(rsi is not None and rsi >= 70.0)
        is_oversold = bool(rsi is not None and rsi < 35.0)
        is_deep_oversold = bool(rsi is not None and rsi <= 30.0)
        is_rsi_neutral = bool(rsi is not None and 35.0 <= rsi <= 65.0)
        
        is_undervalued = bool(gf_signal and "subval" in gf_signal.get("badge_text", "").lower()) or \
                         bool(pfcf_signal and pfcf_signal.get("state_key") in ("optimo", "compra_optima"))
        is_overvalued = bool(gf_signal and gf_signal.get("signal") == "overvalued") or \
                        bool(pfcf_signal and pfcf_signal.get("state_key") == "no_comprar")
        is_severely_overvalued = bool(gf_signal and gf_signal.get("signal") == "overvalued" and (gf_signal.get("discount_pct") or 0) <= -25.0) or \
                                 bool(pfcf_signal and pfcf_signal.get("state_key") == "no_comprar")
        is_deficit = delta_noms < 0 and tk in norm_target_weights
        
        # Timing táctico y filtro de veto para compras
        is_buy_blocked = False
        timing_status = "neutral"
        timing_badge_text = None
        
        if is_deficit:
            if is_overbought:
                is_buy_blocked = True
                timing_status = "wait_pullback"
                timing_badge_text = f"Esperar retroceso (RSI {round(rsi, 1)})"
            elif is_oversold and not is_severely_overvalued:
                timing_status = "buy_optimal"
                timing_badge_text = f"Oportunidad técnica (RSI {round(rsi, 1)})"
            elif is_undervalued and not is_overbought:
                timing_status = "buy_optimal"
                timing_badge_text = "Descuento fundamental"
            else:
                timing_status = "buy_neutral"
                timing_badge_text = "Completar cuota"
        
        item_data = {
            "ticker": tk,
            "in_target": tk in norm_target_weights,
            "price": round(display_price, 2),
            "price_unit": round(price, 6) if is_fi else round(price, 2),
            "ratio": ratio,
            "rsi": round(rsi, 1) if rsi is not None else None,
            "real_nominals": real_noms,
            "real_value": round(real_value, 2),
            "real_weight": round(real_weight, 2),
            "target_nominals": target_noms,
            "target_value": round(target_value, 2),
            "target_weight": round(target_weight, 2),
            "delta_nominals": delta_noms,
            "delta_value": round(delta_value, 2),
            "weight_gap": round(weight_gap, 2),
            "status": status,
            "missing_nominals": missing_noms,
            "is_in_tolerance": is_in_tolerance,
            "ppc": ppc,
            "ppc_return": ppc_signal,
            "gf_signal": gf_signal,
            "pfcf_signal": pfcf_signal,
            "is_take_profit": is_take_profit,
            "is_overbought": is_overbought,
            "is_deep_overbought": is_deep_overbought,
            "is_oversold": is_oversold,
            "is_deep_oversold": is_deep_oversold,
            "is_rsi_neutral": is_rsi_neutral,
            "is_undervalued": is_undervalued,
            "is_overvalued": is_overvalued,
            "is_severely_overvalued": is_severely_overvalued,
            "is_buy_blocked": is_buy_blocked,
            "timing_status": timing_status,
            "timing_badge_text": timing_badge_text
        }
        items.append(item_data)
        
        # Candidato a VENTA (ESTRICTO Y EXCLUSIVO RENTA VARIABLE):
        # La renta fija JAMÁS califica como candidata a venta en rotación
        has_sell_signal = is_take_profit or is_deep_overbought or (not is_in_tolerance)
        is_sell_eligible = (not is_fi) and real_noms > 0 and (
            (tk not in norm_target_weights) or 
            (delta_noms > 0 and has_sell_signal)
        )
        
        if is_sell_eligible:
            sell_score = 0
            if is_take_profit:
                sell_score += 50
            if is_deep_overbought:
                sell_score += 40
            elif is_overbought:
                sell_score += 25
            if delta_noms > 0:
                sell_score += min(30, int(abs(weight_gap) * 2))
            if tk not in norm_target_weights:
                sell_score += 35
            
            # DEC-04 / DEC-07: Si el activo pertenece a la cartera objetivo, solo vender el excedente (delta_noms).
            available_noms = delta_noms if (tk in norm_target_weights and delta_noms > 0) else real_noms
            sell_candidates.append({
                "ticker": tk,
                "score": sell_score,
                "price": price,
                "available_noms_to_sell": max(1, available_noms),
                "item": item_data
            })
            
        # Veto Táctico: solo califica como orden de compra si está en déficit y NO está en sobrecompra
        if is_deficit and not is_buy_blocked:
            buy_score = 0
            if is_deep_oversold:
                buy_score += 40
            elif is_oversold:
                buy_score += 25
                
            if is_undervalued:
                buy_score += 35
                
            if is_severely_overvalued:
                buy_score -= 30
            elif is_overvalued:
                buy_score -= 15
                
            buy_score += min(30, int(abs(weight_gap) * 2))
            buy_score = max(0, buy_score)
            
            buy_candidates.append({
                "ticker": tk,
                "score": buy_score,
                "price": price,
                "noms_needed": abs(delta_noms),
                "item": item_data
            })
            
    sell_candidates.sort(key=lambda x: x["score"], reverse=True)
    buy_candidates.sort(key=lambda x: x["score"], reverse=True)
    
    # 3. Emparejamiento de Órdenes
    rotation_trades = []
    running_capital = float(effective_cash)
    
    unpaired_buys = list(buy_candidates)
    unpaired_sells = list(sell_candidates)
    pairs = []
    
    for s in unpaired_sells:
        best_b = None
        for b in unpaired_buys:
            if b["ticker"] != s["ticker"]:
                best_b = b
                break
        if best_b:
            pairs.append((s, best_b))
            unpaired_buys.remove(best_b)
        else:
            pairs.append((s, None))
            
    for b in unpaired_buys:
        pairs.append((None, b))
        
    for i, (s, b) in enumerate(pairs):
        sell_data = None
        buy_data = None
        
        sell_has_urgency = False
        if s:
            item_s = s["item"]
            sell_has_urgency = (
                item_s.get("is_take_profit") or
                item_s.get("is_deep_overbought") or
                (item_s.get("is_overbought") and item_s.get("delta_nominals", 0) > 0) or
                (not item_s.get("in_target") and (item_s.get("is_overbought") or s["score"] >= 60))
            )
            
        buy_has_urgency = False
        if b:
            item_b = b["item"]
            rsi_justified = item_b.get("is_deep_oversold") or (item_b.get("is_oversold") and not item_b.get("is_overvalued"))
            valuation_justified = not item_b.get("is_severely_overvalued")
            buy_has_urgency = (
                b["score"] >= 60 and
                rsi_justified and
                valuation_justified
            )

        if sell_has_urgency and (b is None or not item_b.get("is_severely_overvalued")):
            priority = "Alta"
        elif buy_has_urgency:
            priority = "Alta"
        elif (s and s["score"] >= 40) or (b and b["score"] >= 35 and not item_b.get("is_severely_overvalued")):
            priority = "Media"
        else:
            priority = "Baja"
        
        sell_cash = 0.0
        if s:
            sell_p = s["price"]
            sell_noms = s["available_noms_to_sell"]
            sell_cash = sell_noms * sell_p
            running_capital += sell_cash
            
            reasons = []
            if s["item"].get("is_take_profit"):
                reasons.append(f"Asegurar toma de ganancia ({s['item']['ppc_return']['badge_text']})")
            elif s["item"].get("is_deep_overbought"):
                reasons.append(f"RSI en sobrecompra extrema ({s['item']['rsi']})")
            elif s["item"].get("is_overbought"):
                reasons.append(f"RSI en sobrecompra ({s['item']['rsi']})")
            elif s["item"]["delta_nominals"] > 0:
                reasons.append(f"Recortar sobreponderación (+{s['item']['delta_nominals']} VN)")
            elif not s["item"]["in_target"]:
                reasons.append("Activo fuera de cartera objetivo")
            
            sell_data = {
                "ticker": s["ticker"],
                "nominals": sell_noms,
                "price": round(sell_p, 2),
                "total_cash": round(sell_cash, 2),
                "reason": " • ".join(reasons)
            }
            
        available_capital = running_capital
        b_action = "execute"
        
        if b:
            buy_p = b["price"]
            buy_noms = b["noms_needed"]
            capital_required = buy_noms * buy_p
            
            executable_noms = min(buy_noms, int(available_capital // buy_p)) if buy_p > 0 else 0
            committed = executable_noms * buy_p if executable_noms > 0 else 0.0
            running_capital -= committed

            if executable_noms > 0:
                b_action = "buy"
            elif buy_p <= 0:
                b_action = "wait_price"
            elif available_capital < buy_p:
                b_action = "wait_cash"
            else:
                b_action = "buy"
            
            buy_reasons = []
            if b["item"].get("is_deep_oversold"):
                buy_reasons.append(f"RSI en sobreventa extrema ({b['item']['rsi']})")
            elif b["item"].get("is_oversold"):
                buy_reasons.append(f"RSI en sobreventa ({b['item']['rsi']})")
            if b["item"].get("is_undervalued"):
                buy_reasons.append("Precio en descuento fundamental")
            elif b["item"].get("is_severely_overvalued"):
                buy_reasons.append(f"Cotiza sobrevaluada ({b['item']['gf_signal'].get('badge_text') if b['item'].get('gf_signal') else 'sin margen'})")
            buy_reasons.append(f"Completar déficit de cartera (-{buy_noms} VN)")
            if b_action == "wait_cash":
                buy_reasons.append(f"Fondos insuficientes (requiere ${round(capital_required - available_capital, 2):,.2f} adicionales)")
            elif executable_noms < buy_noms:
                buy_reasons.append(f"Fondos disponibles para {executable_noms} de {buy_noms} VN ahora")
            
            buy_data = {
                "ticker": b["ticker"],
                "nominals": buy_noms,
                "missing_nominals": buy_noms,
                "recommended_nominals_now": executable_noms,
                "price": round(buy_p, 2),
                "total_cash": round(capital_required, 2),
                "capital_required": round(capital_required, 2),
                "capital_available": round(available_capital, 2),
                "capital_after_trade": round(running_capital, 2),
                "action": b_action,
                "reason": " • ".join(buy_reasons)
            }
            
        net_cash = sell_cash - (b["price"] * b["noms_needed"] if b else 0.0)
        trade_class = "equity_to_equity" if (s and b) else ("equity_sell" if s else "cash_to_equity")
        trade_action = b_action if (b and not s) else ("sell" if (s and not b) else "execute")
        
        rotation_trades.append({
            "id": f"trade_{i}",
            "trade_class": trade_class,
            "action": trade_action,
            "sell": sell_data,
            "buy": buy_data,
            "net_cash_ars": round(net_cash, 2),
            "priority": priority,
            "capital_available": round(available_capital, 2),
            "capital_after_trade": round(running_capital, 2)
        })
            
    # Calcular Tracking Error / Desvío promedio respecto al target
    active_gaps = [abs(it["weight_gap"]) for it in items if it["in_target"] or it["real_nominals"] > 0]
    avg_tracking_error = (sum(active_gaps) / len(active_gaps)) if active_gaps else 0.0

    return {
        "target_portfolio_key": target_pf_key,
        "target_portfolio_name": target_pf_key.replace("_", " ").upper(),
        "total_real_equity": round(total_real_equity, 2),
        "total_real_stock_value": round(total_real_stock_value, 2),
        "total_consolidated_equity": total_consolidated_equity,
        "total_cost_invested": round(total_cost_invested, 2),
        "total_pnl_ars": round(total_pnl_ars, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "cash_ars": round(cash_ars, 2),
        "avg_tracking_error": round(avg_tracking_error, 2),
        "tracking_error_pct": round(avg_tracking_error, 2),
        "items": items,
        "rotation_trades": rotation_trades,
        "asset_allocation_status": asset_allocation_status,
        "fixed_income_summary": fixed_income_summary,
        "calculation_basis": "mcm",
        "mcm_info": mcm_info,
        "mcm_multiplier": mcm_multiplier,
        "mcm_base_capital": round(mcm_base_capital, 2) if mcm_info else 0.0,
        "mcm_base_nominals": mcm_base_nominals,
        "available_portfolios": [{"id": k, "name": k.replace("_", " ").upper()} for k in portfolios.keys()]
    }
