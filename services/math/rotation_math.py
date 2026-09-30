from typing import List, Dict, Any, Tuple

def calculate_rotation_scores_and_pairs(
    items: List[Dict[str, Any]],
    norm_target_weights: Dict[str, float],
    effective_cash: float
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Calculates sell and buy scores, and generates order pairings for rotation.
    """
    sell_candidates = []
    buy_candidates = []

    for item_data in items:
        tk = item_data["ticker"]
        is_fi = item_data.get("_is_fi", False)
        price = item_data.get("_unrounded_price", item_data["price_unit"])
        real_noms = item_data["real_nominals"]
        delta_noms = item_data["delta_nominals"]
        weight_gap = item_data["weight_gap"]
        
        is_in_tolerance = item_data["is_in_tolerance"]
        is_take_profit = item_data["is_take_profit"]
        is_deep_overbought = item_data["is_deep_overbought"]
        is_overbought = item_data["is_overbought"]
        
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
            
            available_noms = delta_noms if (tk in norm_target_weights and delta_noms > 0) else real_noms
            sell_candidates.append({
                "ticker": tk,
                "score": sell_score,
                "price": price,
                "available_noms_to_sell": max(1, available_noms),
                "item": item_data
            })
            
        is_deficit = delta_noms < 0 and tk in norm_target_weights
        is_buy_blocked = item_data["is_buy_blocked"]
        
        if is_deficit and not is_buy_blocked:
            buy_score = 0
            is_deep_oversold = item_data["is_deep_oversold"]
            is_oversold = item_data["is_oversold"]
            is_undervalued = item_data["is_undervalued"]
            is_severely_overvalued = item_data["is_severely_overvalued"]
            is_overvalued = item_data["is_overvalued"]
            
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

    return rotation_trades
