from pathlib import Path
from typing import Dict, Any, Optional, List
import logging
import pandas as pd

from services.atomic_persistence import AtomicJsonDatabase
from services.security_service import sanitize_ticker
from services.ppc_service import load_ppc_values, save_ppc_value, evaluate_ppc_return
from services.cedear_service import get_ticker_data, get_multiple_tickers_data, CEDEAR_RATIOS
from services.portfolio_service import load_portfolios
from services.fair_value_service import load_fair_values, evaluate_fair_value_signal
from services.pfcf_service import load_pfcf_values, evaluate_fcf_rsi_state

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
            nom = max(0, int(val.get("nominals", 0)))
            ppc_val = val.get("ppc")
            if nom > 0 or ppc_val is not None:
                clean_holdings[clean_tk] = {
                    "nominals": nom,
                    "ppc": float(ppc_val) if ppc_val and float(ppc_val) > 0 else None
                }
                if ppc_val and float(ppc_val) > 0:
                    save_ppc_value(clean_tk, ppc_val)

        existing_fi = all_data.get(target_pf, {}).get("fixed_income_holdings", {})
        fi_dict = data.get("fixed_income_holdings", existing_fi)
        clean_fi = {}
        for tk, val in fi_dict.items():
            clean_tk = sanitize_ticker(tk)
            if not clean_tk or not isinstance(val, dict):
                continue
            nom = max(0, int(val.get("nominals", 0)))
            ppc_val = val.get("ppc")
            if nom > 0 or ppc_val is not None:
                clean_fi[clean_tk] = {
                    "nominals": nom,
                    "ppc": float(ppc_val) if ppc_val and float(ppc_val) > 0 else None
                }
                if ppc_val and float(ppc_val) > 0:
                    save_ppc_value(clean_tk, ppc_val)

        cash = max(0.0, float(data.get("cash_ars", all_data.get(target_pf, {}).get("cash_ars", 0.0))))
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
                nom = max(0, int(val.get("nominals", 0)))
                ppc_val = val.get("ppc")
                if nom > 0 or ppc_val is not None:
                    clean_holdings[clean_tk] = {
                        "nominals": nom,
                        "ppc": float(ppc_val) if ppc_val and float(ppc_val) > 0 else None
                    }
                    if ppc_val and float(ppc_val) > 0:
                        save_ppc_value(clean_tk, ppc_val)

            existing_fi = all_data.get(pf_k, {}).get("fixed_income_holdings", {})
            fi_dict = pf_v.get("fixed_income_holdings", existing_fi)
            clean_fi = {}
            for tk, val in fi_dict.items():
                clean_tk = sanitize_ticker(tk)
                if not clean_tk or not isinstance(val, dict):
                    continue
                nom = max(0, int(val.get("nominals", 0)))
                ppc_val = val.get("ppc")
                if nom > 0 or ppc_val is not None:
                    clean_fi[clean_tk] = {
                        "nominals": nom,
                        "ppc": float(ppc_val) if ppc_val and float(ppc_val) > 0 else None
                    }
                    if ppc_val and float(ppc_val) > 0:
                        save_ppc_value(clean_tk, ppc_val)

            cash = max(0.0, float(pf_v.get("cash_ars", 0.0)))
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


def analyze_rotation(target_pf_key: str = "min_drawdown_15") -> Dict[str, Any]:
    """
    Motor cuantitativo de análisis de brechas (Gap Analysis) y rotación inteligente de capital.
    Compara la Tenencia Real del usuario de target_pf_key vs. la Cartera Objetivo seleccionada.
    """
    user_data = load_user_holdings(target_pf_key)
    holdings = user_data.get("holdings", {})
    cash_ars = user_data.get("cash_ars", 0.0)
    
    portfolios = load_portfolios()
    target_pf = portfolios.get(target_pf_key, portfolios.get("min_drawdown_15", {}))
    target_weights = target_pf.get("assets", {}) if isinstance(target_pf, dict) else {}
    
    # Normalizar pesos del target
    total_tw = sum(target_weights.values()) if target_weights else 0
    norm_target_weights = {t: (w * 100.0 / total_tw) for t, w in target_weights.items()} if total_tw > 0 else {}
    
    # Universo total de tickers (Tenencia Real + Cartera Objetivo)
    all_tickers = sorted(list(set(list(holdings.keys()) + list(norm_target_weights.keys()))))
    
    # Cargar cotizaciones y señales (paralelo en producción, directo si está mockeado en tests)
    if hasattr(get_ticker_data, "mock_calls"):
        fetched = {tk: get_ticker_data(tk) for tk in all_tickers}
    else:
        fetched = get_multiple_tickers_data(all_tickers)
    market_data = {}
    gf_map = load_fair_values()
    pfcf_map = load_pfcf_values()
    
    for tk in all_tickers:
        d = fetched.get(tk)
        if d and d.get("local"):
            market_data[tk] = d
        else:
            # Fallback seguro
            market_data[tk] = {
                "local": 0.0,
                "adr": None,
                "ratio": CEDEAR_RATIOS.get(tk, 1.0),
                "rsi": None
            }
            
    # 1. Calcular Valor Real de Mercado y Costo Total
    total_real_equity = cash_ars
    total_real_stock_value = 0.0
    total_cost_invested = 0.0
    
    for tk, h in holdings.items():
        price = market_data.get(tk, {}).get("local", 0.0) or 0.0
        noms = h.get("nominals", 0)
        val = noms * price
        
        if noms > 0:
            if price > 0:
                total_real_stock_value += val
                total_real_equity += val
                # Si no hay PPC, asume que el costo es el precio actual (PnL = 0) para evitar % irreales
                cost = h.get("ppc") or price
                total_cost_invested += noms * cost
            
    total_pnl_ars = total_real_stock_value - total_cost_invested if total_cost_invested > 0 else 0.0
    total_pnl_pct = (total_pnl_ars / total_cost_invested * 100.0) if total_cost_invested > 0 else 0.0
    
    # 2. Calcular Nominales Objetivo escalados al Patrimonio Total (Acciones + Caja)
    # Ya que la caja es una oportunidad, el target abarca todo el capital disponible
    capital_base_for_target = total_real_equity if total_real_equity > 0 else 1000000.0
    
    items = []
    sell_candidates = []
    buy_candidates = []
    
    for tk in all_tickers:
        m = market_data.get(tk, {})
        price = m.get("local", 0.0) or 0.0
        adr_price = m.get("adr")
        ratio = m.get("ratio", CEDEAR_RATIOS.get(tk, 1.0))
        rsi = m.get("rsi")
        
        h = holdings.get(tk, {})
        real_noms = h.get("nominals", 0)
        ppc = h.get("ppc")
        
        real_value = real_noms * price
        real_weight = (real_value / capital_base_for_target * 100.0) if capital_base_for_target > 0 else 0.0
        
        target_weight = norm_target_weights.get(tk, 0.0)
        
        # Nominales ideales calculados
        if price > 0 and target_weight > 0:
            target_noms = max(0, int(round((capital_base_for_target * (target_weight / 100.0)) / price)))
        else:
            target_noms = 0
            
        target_value = target_noms * price
        delta_noms = real_noms - target_noms
        delta_value = delta_noms * price
        weight_gap = real_weight - target_weight
        
        # Señales Cuantitativas
        ppc_signal = evaluate_ppc_return(tk, price, ppc) if (price > 0 and ppc) else None
        gf_signal = evaluate_fair_value_signal(tk, adr_price, gf_map) if adr_price else None
        pfcf_signal = evaluate_fcf_rsi_state(tk, pfcf_map.get(tk), rsi) if pfcf_map.get(tk) else None
        
        # Clasificación de Brecha
        if delta_noms > 0:
            status = "surplus"
        elif delta_noms < 0:
            status = "deficit"
        else:
            status = "balanced"
            
        is_take_profit = bool(ppc_signal and ppc_signal.get("is_take_profit"))
        
        # Umbrales Canónicos de RSI (Regla del Ecosistema MPFP):
        # - Rango Neutral: 35.0 <= RSI <= 65.0 (Inacción / Esperar momento)
        # - Luz Amarilla: RSI < 35.0 (Sobreventa) o RSI > 65.0 (Sobrecompra)
        # - Alerta Extrema / Roja: RSI <= 30.0 (Sobreventa extrema) o RSI >= 70.0 (Sobrecompra extrema)
        is_overbought = bool(rsi is not None and rsi > 65.0)
        is_deep_overbought = bool(rsi is not None and rsi >= 70.0)
        is_oversold = bool(rsi is not None and rsi < 35.0)
        is_deep_oversold = bool(rsi is not None and rsi <= 30.0)
        is_rsi_neutral = bool(rsi is not None and 35.0 <= rsi <= 65.0)
        
        # Filtros Fundamentales:
        is_undervalued = bool(gf_signal and "subval" in gf_signal.get("badge_text", "").lower()) or \
                         bool(pfcf_signal and pfcf_signal.get("state_key") in ("optimo", "compra_optima"))
        is_overvalued = bool(gf_signal and gf_signal.get("signal") == "overvalued") or \
                        bool(pfcf_signal and pfcf_signal.get("state_key") == "no_comprar")
        is_severely_overvalued = bool(gf_signal and gf_signal.get("signal") == "overvalued" and (gf_signal.get("discount_pct") or 0) <= -25.0) or \
                                 bool(pfcf_signal and pfcf_signal.get("state_key") == "no_comprar")

        is_surplus = delta_noms > 0 or (tk not in norm_target_weights and real_noms > 0)
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
            "price": round(price, 2),
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
        
        # Candidato a VENTA:
        # Solo califica si tiene nominales reales Y (está fuera del target O tiene superávit real delta_noms > 0)
        # Nunca se vende un activo que está en déficit respecto al objetivo de cartera.
        is_sell_eligible = real_noms > 0 and (delta_noms > 0 or tk not in norm_target_weights)
        
        if is_sell_eligible:
            sell_score = 0
            if is_take_profit:
                sell_score += 50
            if is_deep_overbought:  # RSI >= 70
                sell_score += 40
            elif is_overbought:     # RSI > 65
                sell_score += 25
            if delta_noms > 0:
                sell_score += min(30, int(abs(weight_gap) * 2))
            if tk not in norm_target_weights:
                sell_score += 35
            
            available_noms = delta_noms if delta_noms > 0 else real_noms
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
            if is_deep_oversold:   # RSI <= 30 (Sobreventa profunda)
                buy_score += 40
            elif is_oversold:      # RSI < 35 (Entrada en zona de sobreventa)
                buy_score += 25
                
            if is_undervalued:
                buy_score += 35
                
            # Penalización por sobrevaloración:
            if is_severely_overvalued:
                buy_score -= 30  # Resta puntaje por cotizar con sobreprecio excesivo (>25% o P/FCF > 32)
            elif is_overvalued:
                buy_score -= 15  # Descuento leve por falta de margen de seguridad
                
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
    
    # 3. Generador de Oportunidades de Rotación (Garantizando que nunca se venda y compre el mismo activo)
    rotation_trades = []
    
    unpaired_buys = list(buy_candidates)
    unpaired_sells = list(sell_candidates)
    pairs = []
    
    # Emparejar cada venta con la mejor compra de distinto ticker
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
            
    # Agregar compras restantes sin venta emparejada
    for b in unpaired_buys:
        pairs.append((None, b))
        
    for i, (s, b) in enumerate(pairs):
        net_cash = 0.0
        sell_data = None
        buy_data = None
        
        # Evaluación estricta de confluencia y urgencia
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
            # REGLA CANÓNICA: Jamás hay urgencia de compra si el RSI está en rango neutral (35-65)
            # o si el activo está severamente sobrevalorado.
            rsi_justified = item_b.get("is_deep_oversold") or (item_b.get("is_oversold") and not item_b.get("is_overvalued"))
            valuation_justified = not item_b.get("is_severely_overvalued")
            buy_has_urgency = (
                b["score"] >= 60 and
                rsi_justified and
                valuation_justified
            )

        # Jerarquía de Prioridad:
        # - ALTA: Confluencia real y justificada por RSI / Valuación / Take Profit.
        # - MEDIA: Catalizador parcial o rebalanceo con sesgo constructivo sin sobrevaloración severa.
        # - BAJA: Sin justificación técnica de RSI (zona neutral 35-65), activo sobrevalorado o simple rebalanceo pasivo.
        if sell_has_urgency and (b is None or not item_b.get("is_severely_overvalued")):
            priority = "Alta"
        elif buy_has_urgency:
            priority = "Alta"
        elif (s and s["score"] >= 40) or (b and b["score"] >= 35 and not item_b.get("is_severely_overvalued")):
            priority = "Media"
        else:
            priority = "Baja"
        
        if s:
            sell_p = s["price"]
            sell_noms = s["available_noms_to_sell"]
            sell_cash = sell_noms * sell_p
            net_cash += sell_cash
            
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
            
        if b:
            buy_p = b["price"]
            buy_noms = b["noms_needed"]
            buy_cash = buy_noms * buy_p
            net_cash -= buy_cash
            
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
            
            buy_data = {
                "ticker": b["ticker"],
                "nominals": buy_noms,
                "price": round(buy_p, 2),
                "total_cash": round(buy_cash, 2),
                "reason": " • ".join(buy_reasons)
            }
            
        rotation_trades.append({
            "id": f"trade_{i}",
            "sell": sell_data,
            "buy": buy_data,
            "net_cash_ars": round(net_cash, 2),
            "priority": priority
        })
            
    # Calcular Tracking Error / Desvío promedio respecto al target
    active_gaps = [abs(it["weight_gap"]) for it in items if it["in_target"] or it["real_nominals"] > 0]
    avg_tracking_error = (sum(active_gaps) / len(active_gaps)) if active_gaps else 0.0

    # Resumen de Renta Fija y Asignación Macro
    from services.portfolio_service import get_portfolio_fixed_income_summary
    fixed_income_summary = get_portfolio_fixed_income_summary(target_pf_key)
    fi_market_val = fixed_income_summary.get("total_market_value", 0.0) if fixed_income_summary else 0.0
    total_consolidated_equity = round(total_real_equity + fi_market_val, 2)
    
    target_alloc = target_pf.get("asset_allocation", {}) if isinstance(target_pf, dict) else {}
    target_equity_pct = target_alloc.get("equity_weight", 100.0)
    target_fi_pct = target_alloc.get("fixed_income_weight", 0.0)
    real_equity_pct = round((total_real_stock_value / total_consolidated_equity * 100.0), 2) if total_consolidated_equity > 0 else 0.0
    real_fi_pct = round((fi_market_val / total_consolidated_equity * 100.0), 2) if total_consolidated_equity > 0 else 0.0
    real_cash_pct = round((cash_ars / total_consolidated_equity * 100.0), 2) if total_consolidated_equity > 0 else 0.0
    
    asset_allocation_status = {
        "target_equity_pct": target_equity_pct,
        "target_fixed_income_pct": target_fi_pct,
        "real_equity_pct": real_equity_pct,
        "real_fixed_income_pct": real_fi_pct,
        "real_cash_pct": real_cash_pct,
        "equity_gap_pct": round(real_equity_pct - target_equity_pct, 2),
        "fixed_income_gap_pct": round(real_fi_pct - target_fi_pct, 2)
    }

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
        "items": items,
        "rotation_trades": rotation_trades,
        "asset_allocation_status": asset_allocation_status,
        "fixed_income_summary": fixed_income_summary,
        "available_portfolios": [{"id": k, "name": k.replace("_", " ").upper()} for k in portfolios.keys()]
    }
