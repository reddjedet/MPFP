import json
from typing import Optional, Any, Dict, List
from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.cedear_service import get_multiple_tickers_data
from services.portfolio_service import (
    load_portfolios, 
    save_portfolios, 
    calculate_portfolio_data, 
    calculate_portfolio_mcm, 
    calculate_portfolio_rsi, 
    calculate_portfolio_alpha,
    get_portfolio_fixed_income_summary,
    calculate_sector_breakdown,
    move_portfolio_to_trash,
    load_portfolios_trash,
    restore_portfolio_from_trash,
    delete_permanently_from_trash,
    MAX_TRASH_CAPACITY,
    RESERVED_PORTFOLIO_NAMES
)
from services.security_service import (
    sanitize_ticker,
    sanitize_portfolio_name,
    parse_weights_string,
    MAX_FILE_SIZE_BYTES
)
from services.earnings_service import get_ticker_earnings_badge, load_earnings_calendar
from services.fair_value_service import (
    get_fair_value,
    load_fair_values,
    save_fair_value,
    save_bulk_fair_values,
    evaluate_fair_value_signal
)
from services.ppc_service import (
    load_ppc_values,
    get_ppc_value,
    save_ppc_value,
    save_bulk_ppc_values,
    evaluate_ppc_return
)
from services.pfcf_service import (
    load_pfcf_values,
    get_pfcf_value,
    save_pfcf_value,
    save_bulk_pfcf_values,
    evaluate_fcf_rsi_state
)
from services.rotation_service import load_user_holdings, analyze_rotation

from services.exceptions import (
    DomainValidationError,
    FinancialInvariantError,
    PortfolioNotFoundError,
    InvalidTickerError
)
from schemas.api_schemas import (
    QuickUpdateAssetRequest,
    PortfolioSettingsRequest,
    PortfolioCreateRequest
)

router = APIRouter()

class BulkQuickUpdateAssetRequest(BaseModel):
    items: List[QuickUpdateAssetRequest]

class CreatePortfolioRequest(PortfolioCreateRequest):
    pass

class RenamePortfolioRequest(BaseModel):
    old_name: str
    new_name: str

@router.get("/list_json", response_class=JSONResponse)
def get_portfolios_list_json():
    portfolios_data = load_portfolios()
    weights_str_map = {}
    for pf_name, pf_val in portfolios_data.items():
        assets = pf_val.get("assets", {})
        weights_str_map[pf_name] = ", ".join([f"{k}:{v}" for k, v in assets.items()])
    fair_values_map = load_fair_values()
    return JSONResponse({
        "portfolios": portfolios_data,
        "weights_str_map": weights_str_map,
        "fair_values_map": fair_values_map,
        "selected_pf": list(portfolios_data.keys())[0] if portfolios_data else "bmb"
    })

@router.get("/rebalance_json/{pf_type}", response_class=JSONResponse)
def get_rebalance_data_json(
    pf_type: str,
    anchor: Optional[str] = None,
    qty: Optional[int] = None,
    cash_budget: Optional[float] = None,
    tolerance_pct: float = 1.5
):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        raise DomainValidationError("Nombre de portfolio no válido.")
        
    portfolios = load_portfolios()
    if pf_clean not in portfolios:
        raise PortfolioNotFoundError(f"El portfolio '{pf_clean}' no existe.")
        
    pf_data = portfolios[pf_clean]
    mode = pf_data.get("mode", "weights")
    weights = pf_data.get("assets", {})
    
    if not weights:
        raise DomainValidationError("El portfolio seleccionado no contiene activos.")
    
    data = get_multiple_tickers_data(list(weights.keys()))
    mcm_info = calculate_portfolio_mcm(weights, data) if mode == "weights" else None
    
    saved_anchor = pf_data.get("anchor")
    saved_qty = pf_data.get("qty")
    
    if anchor is not None:
        anchor_clean = sanitize_ticker(anchor)
        if not anchor_clean or anchor_clean not in weights:
            anchor_clean = saved_anchor if (saved_anchor and saved_anchor in weights) else (
                mcm_info["most_expensive_ticker"] if (mcm_info and mcm_info.get("most_expensive_ticker") in weights) else list(weights.keys())[0]
            )
    else:
        # Priorizar anchor guardado si existe, sino el activo dinámico más caro
        anchor_clean = saved_anchor if (saved_anchor and saved_anchor in weights) else (
            mcm_info["most_expensive_ticker"] if (mcm_info and mcm_info.get("most_expensive_ticker") in weights) else list(weights.keys())[0]
        )
        
    if qty is not None:
        try:
            qty_clean = max(1, int(qty))
        except (ValueError, TypeError):
            qty_clean = saved_qty if (saved_qty and saved_qty > 0) else (
                mcm_info["most_expensive_qty"] if (mcm_info and anchor_clean == mcm_info.get("most_expensive_ticker")) else 1
            )
    else:
        # Priorizar cantidad guardada si existe, sino la calculada por MCM
        if saved_qty and saved_qty > 0:
            qty_clean = saved_qty
        elif mcm_info and anchor_clean == mcm_info.get("most_expensive_ticker"):
            qty_clean = mcm_info["most_expensive_qty"]
        else:
            qty_clean = 1
        
    result = calculate_portfolio_data(pf_data, data, anchor_clean, qty_clean)
    ppc_map = load_ppc_values()
    fair_values_map = load_fair_values()
    pfcf_map = load_pfcf_values()
    earnings_cal = load_earnings_calendar()
    user_holdings = load_user_holdings(pf_clean).get("holdings", {})

    if result:
        for item in result:
            tk = item.get("ticker", "")
            adr_p = item.get("adr_price")
            local_p = item.get("price")
            rsi_val = item.get("rsi")
            item["earnings_badge"] = get_ticker_earnings_badge(tk, cal=earnings_cal)
            item["gf_signal"] = evaluate_fair_value_signal(tk, adr_p, gf_val_map=fair_values_map)
            item["gf_value"] = fair_values_map.get(tk)
            
            # Use portfolio-specific PPC if available, fallback to global PPC
            tk_holdings = user_holdings.get(tk, {})
            item["actual_qty"] = tk_holdings.get("nominals", 0)
            
            pf_ppc = tk_holdings.get("ppc")
            if pf_ppc and pf_ppc > 0:
                item["ppc"] = pf_ppc
            else:
                item["ppc"] = ppc_map.get(tk)
                
            item["ppc_return"] = evaluate_ppc_return(tk, local_p, item["ppc"])
            item["pfcf"] = pfcf_map.get(tk)
            item["pfcf_signal"] = evaluate_fcf_rsi_state(tk, item["pfcf"], rsi_val)
            
    # Recalcular pesos reales y errores de tracking si el usuario informó tenencias
    if result:
        actual_total_val = sum((item.get("actual_qty", 0) * item.get("price", 0)) for item in result)
        has_actual_holdings = actual_total_val > 0
        
        for item in result:
            if has_actual_holdings:
                actual_val = item.get("actual_qty", 0) * item.get("price", 0)
                real_w = (actual_val / actual_total_val * 100) if actual_total_val else 0
                item["real_weight"] = round(real_w, 2)
                
                raw_error = real_w - item["weight"]
                if abs(raw_error) < 2.5:
                    item["error"] = 0.0
                else:
                    item["error"] = round(raw_error, 2)
            else:
                # Si no hay tenencias reales, conservar el error de redondeo teórico (fricción)
                pass

    take_profit_alerts = [
        item for item in result 
        if item.get("ppc_return") and item["ppc_return"].get("is_take_profit")
    ] if result else []
    
    alpha_metrics = calculate_portfolio_alpha(weights)
        
    total_portfolio_value = sum(item.get("value", 0.0) for item in result) if result else 0.0
    total_portfolio_qty = sum(item.get("qty", 0) for item in result) if result else 0
    base_anchor_qty = 1
    if mcm_info and mcm_info.get("base_nominals"):
        base_anchor_qty = mcm_info["base_nominals"].get(anchor_clean, 1)
        
    portfolio_rsi = calculate_portfolio_rsi(result) if result else None
    
    # Renta Fija y Asignación Macro
    fixed_income_summary = get_portfolio_fixed_income_summary(pf_clean)
    asset_allocation = pf_data.get("asset_allocation")
    fi_market_value = fixed_income_summary.get("total_market_value", 0.0) if fixed_income_summary else 0.0
    total_consolidated_value = round(total_portfolio_value + fi_market_value, 2)

    # Desglose Sectorial
    sector_breakdown = calculate_sector_breakdown(result) if result else []

    # Calculate Tactical Rotation Trades
    try:
        rotation_analysis = analyze_rotation(pf_clean, cash_budget=cash_budget, tolerance_pct=tolerance_pct)
        rotation_trades = rotation_analysis.get("rotation_trades", [])
    except Exception:
        rotation_analysis = {}
        rotation_trades = []

    total_real_value = sum(
        (item.get("actual_qty", 0) or 0) * (item.get("price", 0) or 0) for item in (result or [])
    )
    user_cash = load_user_holdings(pf_clean).get("cash_ars", 0.0)

    return JSONResponse({
        "pf_type": pf_clean,
        "mode": mode,
        "anchor": anchor_clean,
        "qty": qty_clean,
        "weights": weights,
        "asset_allocation": asset_allocation,
        "fixed_income_summary": fixed_income_summary,
        "result": result if result is not None else [],
        "sector_breakdown": sector_breakdown,
        "mcm_info": mcm_info,
        "take_profit_alerts": take_profit_alerts if take_profit_alerts is not None else [],
        "rotation_trades": rotation_trades,
        "alpha_metrics": alpha_metrics,
        "summary": {
            "total_portfolio_value": round(total_portfolio_value, 2),
            "total_real_value": round(total_real_value, 2),
            "cash_ars": round(float(user_cash or 0.0), 2),
            "total_portfolio_qty": total_portfolio_qty,
            "total_consolidated_value": total_consolidated_value,
            "base_anchor_qty": base_anchor_qty,
            "portfolio_rsi": portfolio_rsi
        }
    })

@router.post("/quick_update_json", response_class=JSONResponse)
def quick_update_asset_json(body: QuickUpdateAssetRequest):
    clean_tk = sanitize_ticker(body.ticker)
    if not clean_tk:
        raise InvalidTickerError("Ticker no válido")
    
    if body.ppc is not None:
        save_ppc_value(clean_tk, body.ppc)
    if body.gf_value is not None:
        save_fair_value(clean_tk, body.gf_value)
    if body.pfcf is not None:
        save_pfcf_value(clean_tk, body.pfcf)
        
    return JSONResponse({
        "success": True, 
        "ticker": clean_tk,
        "ppc": get_ppc_value(clean_tk),
        "gf_value": get_fair_value(clean_tk),
        "pfcf": get_pfcf_value(clean_tk)
    })

@router.post("/bulk_quick_update_json", response_class=JSONResponse)
def bulk_quick_update_asset_json(body: BulkQuickUpdateAssetRequest):
    ppc_updates: Dict[str, Any] = {}
    fv_updates: Dict[str, Any] = {}
    pfcf_updates: Dict[str, Any] = {}
    
    for item in body.items:
        clean_tk = sanitize_ticker(item.ticker)
        if not clean_tk:
            continue
        if item.ppc is not None:
            ppc_updates[clean_tk] = item.ppc
        if item.gf_value is not None:
            fv_updates[clean_tk] = item.gf_value
        if item.pfcf is not None:
            pfcf_updates[clean_tk] = item.pfcf
            
    if ppc_updates:
        save_bulk_ppc_values(ppc_updates)
    if fv_updates:
        save_bulk_fair_values(fv_updates)
    if pfcf_updates:
        save_bulk_pfcf_values(pfcf_updates)
        
    return JSONResponse({
        "success": True,
        "updated_count": len(body.items)
    })

@router.post("/settings_json/{pf_type}", response_class=JSONResponse)
def update_portfolio_settings_json(pf_type: str, body: PortfolioSettingsRequest):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"error": "Nombre de portfolio no válido."}, status_code=400)
        
    portfolios = load_portfolios()
    if pf_clean not in portfolios:
        raise PortfolioNotFoundError("Portfolio no encontrado.")
        
    pf_data = portfolios[pf_clean]
    if body.anchor is not None:
        clean_anchor = sanitize_ticker(body.anchor)
        if clean_anchor:
            pf_data["anchor"] = clean_anchor
    if body.qty is not None and body.qty > 0:
        pf_data["qty"] = int(body.qty)
        
    portfolios[pf_clean] = pf_data
    save_portfolios(portfolios)
    return JSONResponse({
        "success": True, 
        "pf_type": pf_clean, 
        "anchor": pf_data.get("anchor"), 
        "qty": pf_data.get("qty")
    })

@router.post("/create_json", response_class=JSONResponse)
async def create_custom_portfolio(request: Request):
    req_name = None
    req_mode = "weights"
    req_weights_str = None
    
    try:
        body = await request.json()
        req_name = body.get("name")
        req_mode = body.get("mode", "weights")
        req_weights_str = body.get("weights_str")
        if not req_weights_str and "assets" in body and isinstance(body["assets"], dict):
            req_weights_str = ", ".join([f"{k}:{v}" for k, v in body["assets"].items()])
    except Exception:
        pass

    name_clean = sanitize_portfolio_name(req_name or "")
    if not name_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio inválido. Solo letras minúsculas, números y guiones bajos (máx 30 caracteres)."})
        
    if name_clean in RESERVED_PORTFOLIO_NAMES:
        return JSONResponse({"success": False, "error": "No puedes sobreescribir el portfolio predeterminado (BMB o BAL)."})
        
    mode_clean = "nominals" if req_mode == "nominals" else "weights"
    
    new_weights, err = parse_weights_string(req_weights_str or "")
    if err:
        return JSONResponse({"success": False, "error": err})
        
    portfolios_data = load_portfolios()
    if name_clean in portfolios_data:
        return JSONResponse({
            "success": False,
            "error": f"Ya existe un portfolio llamado '{name_clean}'. Usa otro nombre o renombra el existente."
        }, status_code=409)

    portfolios_data[name_clean] = {
        "mode": mode_clean,
        "assets": new_weights
    }
    save_portfolios(portfolios_data)
    return JSONResponse({"success": True, "name": name_clean, "portfolio": portfolios_data[name_clean]})

@router.delete("/delete_json/{pf_type}", response_class=JSONResponse)
def delete_custom_portfolio(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."})
        
    res = move_portfolio_to_trash(pf_clean)
    return JSONResponse(res)

@router.get("/trash_json", response_class=JSONResponse)
def get_portfolios_trash():
    trash = load_portfolios_trash()
    return JSONResponse({
        "success": True,
        "count": len(trash),
        "max_capacity": MAX_TRASH_CAPACITY,
        "trash": trash
    })

@router.post("/restore_json/{pf_type}", response_class=JSONResponse)
def restore_custom_portfolio(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)
    res = restore_portfolio_from_trash(pf_clean)
    if not res.get("success"):
        return JSONResponse(res, status_code=404)
    return JSONResponse(res)

@router.delete("/trash_json/{pf_type}", response_class=JSONResponse)
def purge_portfolio_from_trash(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)
    res = delete_permanently_from_trash(pf_clean)
    return JSONResponse(res)

@router.post("/rename_json", response_class=JSONResponse)
def rename_custom_portfolio(body: RenamePortfolioRequest):
    old_clean = sanitize_portfolio_name(body.old_name)
    new_clean = sanitize_portfolio_name(body.new_name)

    if not old_clean or not new_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)

    if old_clean in RESERVED_PORTFOLIO_NAMES:
        return JSONResponse({"success": False, "error": "No se puede renombrar un portfolio predeterminado (BMB/BAL)."}, status_code=400)

    if new_clean in RESERVED_PORTFOLIO_NAMES:
        return JSONResponse({"success": False, "error": "No puedes usar nombres reservados (BMB/BAL)."}, status_code=400)

    portfolios_data = load_portfolios()
    if old_clean not in portfolios_data:
        return JSONResponse({"success": False, "error": f"El portfolio '{old_clean}' no existe."}, status_code=404)

    if new_clean != old_clean and new_clean in portfolios_data:
        return JSONResponse({"success": False, "error": f"Ya existe un portfolio llamado '{new_clean}'."}, status_code=400)

    # 1. Migrar en portfolios.json
    pf_content = portfolios_data.pop(old_clean)
    portfolios_data[new_clean] = pf_content
    save_portfolios(portfolios_data)

    # 2. Migrar en user_holdings.json si existían tenencias registradas
    try:
        from services.rotation_service import load_all_user_holdings, _db as holdings_db
        all_holdings = load_all_user_holdings()
        if old_clean in all_holdings:
            all_holdings[new_clean] = all_holdings.pop(old_clean)
            holdings_db.save(all_holdings)
    except Exception:
        pass

    return JSONResponse({"success": True, "old_name": old_clean, "new_name": new_clean})

@router.post("/import_json", response_class=JSONResponse)
async def import_custom_portfolios(file: UploadFile = File(...)):
    try:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            return JSONResponse({"success": False, "error": "El archivo supera el tamaño máximo permitido (1 MB)."})
            
        try:
            imported_data = json.loads(content.decode("utf-8"))
        except Exception:
            return JSONResponse({"success": False, "error": "El archivo no contiene un formato JSON válido."})
            
        if not isinstance(imported_data, dict):
            return JSONResponse({"success": False, "error": "El formato JSON debe ser un objeto (diccionario) con los nombres de portfolios."})
            
        sanitized_portfolios = {}
        for pf_name, data_item in imported_data.items():
            pf_name_clean = sanitize_portfolio_name(pf_name)
            if not pf_name_clean or pf_name_clean in RESERVED_PORTFOLIO_NAMES:
                continue
                
            if isinstance(data_item, dict) and "assets" in data_item:
                mode = "nominals" if data_item.get("mode") == "nominals" else "weights"
                assets = data_item.get("assets", {})
            elif isinstance(data_item, dict):
                mode = "weights"
                assets = data_item
            else:
                continue
                
            clean_assets = {}
            if isinstance(assets, dict):
                for tk, w in assets.items():
                    tk_clean = sanitize_ticker(tk)
                    if tk_clean:
                        try:
                            clean_assets[tk_clean] = max(0.0, float(w))
                        except (ValueError, TypeError):
                            pass
                            
            if clean_assets:
                sanitized_portfolios[pf_name_clean] = {
                    "mode": mode,
                    "assets": clean_assets
                }
                
        if not sanitized_portfolios:
            return JSONResponse({"success": False, "error": "No se encontraron portfolios válidos para importar en el archivo."})
            
        current_data = load_portfolios()
        current_data.update(sanitized_portfolios)
        save_portfolios(current_data)
        return JSONResponse({"success": True, "imported_count": len(sanitized_portfolios), "portfolios": sanitized_portfolios})
    except Exception as e:
        return JSONResponse({"success": False, "error": f"Error al procesar el archivo: {str(e)}"})

@router.get("/export_json/{pf_type}", response_class=JSONResponse)
def export_custom_portfolio(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    portfolios = load_portfolios()
    if not pf_clean or pf_clean not in portfolios:
        raise PortfolioNotFoundError("Portfolio no encontrado.")
    return JSONResponse({pf_clean: portfolios[pf_clean]})
