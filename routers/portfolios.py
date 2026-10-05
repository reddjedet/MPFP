import json
import logging
logger = logging.getLogger(__name__)
from typing import Optional, Any, Dict, List
from fastapi import APIRouter, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from schemas.api_schemas import (
    BulkQuickUpdateAssetRequest,
    PortfolioCreateRequest,
    PortfolioWeightsRequest,
    PortfolioSettingsRequest,
    PortfolioFixedIncomeTargetRequest,
    QuickUpdateAssetRequest,
    QuickUpdateAssetResponse,
    PortfolioListResponse,
    PortfolioRebalanceResponse,
    PortfolioCreateResponse,
    TrashListResponse,
    RestoreAsRequest,
    RenamePortfolioResponse,
    ImportPortfoliosResponse,
    SuccessEnvelope,
    ErrorEnvelope,
    DeletePortfolioResponse,
    RenamePortfolioRequest
)

from pydantic import BaseModel

from services.cedear_service import get_multiple_tickers_data
from services.performance_service import calculate_backtest_performance
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
    is_portfolio_name_taken,
    normalize_weights_dict,
    find_non_cedear_tickers
)
from services.security_service import (
    sanitize_ticker,
    sanitize_portfolio_name,
    parse_weights_string,
    MAX_FILE_SIZE_BYTES
)
from services.earnings_service import get_ticker_earnings_badge, load_earnings_calendar
from services.financial_units import is_fixed_income_ticker
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
    PortfolioNotFoundError,
    InvalidTickerError
)


router = APIRouter()




@router.get("/list_json", response_model=PortfolioListResponse)
def get_portfolios_list_json():
    portfolios_data = load_portfolios()
    weights_str_map = {}
    for pf_name, pf_val in portfolios_data.items():
        assets = pf_val.get("assets", {})
        weights_str_map[pf_name] = ", ".join([f"{k}:{v}" for k, v in assets.items()])
    fair_values_map = load_fair_values()
    return PortfolioListResponse(portfolios=portfolios_data, weights_str_map=weights_str_map, fair_values_map=fair_values_map, selected_pf=list(portfolios_data.keys())[0] if portfolios_data else "bmb")

@router.get("/rebalance_json/{pf_type}", response_model=PortfolioRebalanceResponse)
def get_rebalance_data_json(
    pf_type: str,
    anchor: Optional[str] = None,
    qty: Optional[int] = None,
    cash_budget: Optional[float] = None,
    tolerance_pct: float = 1.5
):
    from services.portfolio_service import get_portfolio_rebalance_data
    from services.security_service import sanitize_portfolio_name
    from services.exceptions import DomainValidationError
    
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        raise DomainValidationError("Nombre de portfolio no válido.")
        
    data = get_portfolio_rebalance_data(
        pf_clean=pf_clean,
        anchor=anchor,
        qty=qty,
        cash_budget=cash_budget,
        tolerance_pct=tolerance_pct
    )
    return data

@router.post("/quick_update_json", response_model=QuickUpdateAssetResponse)
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
        
    return QuickUpdateAssetResponse(success=True, ticker=clean_tk, ppc=get_ppc_value(clean_tk), gf_value=get_fair_value(clean_tk), pfcf=get_pfcf_value(clean_tk))

@router.post("/bulk_quick_update_json", response_model=SuccessEnvelope)
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

@router.post("/settings_json/{pf_type}", response_model=SuccessEnvelope)
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

@router.post("/weights_json/{pf_type}", response_model=SuccessEnvelope)
def update_portfolio_weights_json(pf_type: str, body: PortfolioWeightsRequest):
    """Actualiza los pesos objetivo de una cartera existente preservando el resto de sus metadatos.

    create_json solo crea carteras nuevas: no puede usarse para editar pesos porque
    devuelve 409 si el nombre ya existe y rechaza los nombres reservados (bmb/bal).
    """
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)

    portfolios_data = load_portfolios()
    if pf_clean not in portfolios_data:
        raise PortfolioNotFoundError(f"La cartera '{pf_clean}' no existe.")

    new_weights, err = parse_weights_string(body.weights_str or "")
    if err:
        return JSONResponse({"success": False, "error": err}, status_code=400)

    new_weights, err = normalize_weights_dict(new_weights)
    if err:
        return JSONResponse({"success": False, "error": err}, status_code=400)

    invalid = find_non_cedear_tickers(new_weights.keys())
    if invalid:
        return JSONResponse({
            "success": False,
            "error": f"Estos tickers no son CEDEARs de BYMA: {', '.join(invalid)}. Corregí la cartera e intentá de nuevo."
        }, status_code=400)

    pf_data = portfolios_data[pf_clean]
    pf_data["assets"] = new_weights
    # El modo por nominales fue retirado: toda cartera se define por pesos.
    pf_data["mode"] = "weights"
    portfolios_data[pf_clean] = pf_data
    save_portfolios(portfolios_data)

    return JSONResponse({
        "success": True,
        "pf_type": pf_clean,
        "assets": pf_data["assets"],
        "mode": pf_data["mode"]
    })


FIXED_INCOME_POLICY_DEFAULT = "preserve"


@router.post("/fixed_income_target_json/{pf_type}", response_model=SuccessEnvelope)
def update_portfolio_fixed_income_target_json(pf_type: str, body: PortfolioFixedIncomeTargetRequest):
    """
    Define el objetivo de renta fija de una cartera existente.

    El usuario informa únicamente el TAMAÑO del sleeve de renta fija (`fixed_income_weight`)
    y el REPARTO de ese sleeve entre títulos (`target_weight_rf`). El servidor deriva de
    esos dos únicos datos:

      - `target_weight_portfolio` de cada título  =  peso_rf / 100 × tamaño_del_sleeve
      - `equity_weight`                           =  100 − tamaño_del_sleeve

    Así los tres campos quedan siempre consistentes entre sí, que antes solo ocurría por
    suerte cuando la cartera tenía un único título de renta fija.

    Los pesos que no sumen 100 se normalizan proporcionalmente (mismo criterio que los
    pesos de renta variable en `analyze_rotation`). Con sleeve 0 o sin títulos, la cartera
    queda 100% renta variable y la renta fija vuelve a ser invisible para el motor.
    """
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"error": "Nombre de portfolio no válido."}, status_code=400)

    portfolios_data = load_portfolios()
    if pf_clean not in portfolios_data:
        raise PortfolioNotFoundError(f"La cartera '{pf_clean}' no existe.")

    # Validar y sanear tickers: el objetivo solo admite instrumentos de renta fija
    clean_items: Dict[str, float] = {}
    for item in body.fixed_income_assets:
        tk = sanitize_ticker(item.ticker)
        if not tk:
            return JSONResponse({"error": f"Ticker inválido: '{item.ticker}'."}, status_code=400)
        if not is_fixed_income_ticker(tk):
            return JSONResponse(
                {"error": f"'{tk}' no es un instrumento de renta fija."}, status_code=400
            )
        if tk in clean_items:
            return JSONResponse(
                {"error": f"Ticker duplicado en el objetivo de renta fija: '{tk}'."}, status_code=400
            )
        clean_items[tk] = float(item.target_weight_rf)

    sleeve = max(0.0, min(100.0, float(body.fixed_income_weight)))
    total_rf = sum(clean_items.values())

    # Normalización silenciosa a 100; las participaciones en 0 se descartan
    normalized: Dict[str, float] = {}
    if total_rf > 0.0:
        normalized = {
            tk: round((w / total_rf) * 100.0, 4) for tk, w in clean_items.items() if w > 0.0
        }

    pf_data = portfolios_data[pf_clean]
    asset_alloc = dict(pf_data.get("asset_allocation") or {})

    if sleeve <= 0.0 or not normalized:
        # Cartera 100% renta variable: se desactiva el objetivo de renta fija
        pf_data.pop("fixed_income_assets", None)
        asset_alloc["equity_weight"] = 100.0
        asset_alloc["fixed_income_weight"] = 0.0
        asset_alloc["fixed_income_policy"] = FIXED_INCOME_POLICY_DEFAULT
        pf_data["asset_allocation"] = asset_alloc
        portfolios_data[pf_clean] = pf_data
        save_portfolios(portfolios_data)
        return JSONResponse({
            "success": True,
            "pf_type": pf_clean,
            "asset_allocation": asset_alloc,
            "fixed_income_assets": {},
        })

    fi_assets: Dict[str, Dict[str, float]] = {}
    for tk, weight_rf in normalized.items():
        fi_assets[tk] = {
            "target_weight_portfolio": round((weight_rf / 100.0) * sleeve, 4),
            "target_weight_rf": weight_rf,
        }

    asset_alloc["equity_weight"] = round(100.0 - sleeve, 2)
    asset_alloc["fixed_income_weight"] = round(sleeve, 2)
    asset_alloc["fixed_income_policy"] = FIXED_INCOME_POLICY_DEFAULT
    pf_data["asset_allocation"] = asset_alloc
    pf_data["fixed_income_assets"] = fi_assets
    portfolios_data[pf_clean] = pf_data
    save_portfolios(portfolios_data)

    return JSONResponse({
        "success": True,
        "pf_type": pf_clean,
        "asset_allocation": asset_alloc,
        "fixed_income_assets": fi_assets,
    })


@router.post("/create_json", response_model=PortfolioCreateResponse)
async def create_custom_portfolio(request: Request):
    req_name = None
    req_mode = "weights"
    req_weights_str = None
    req_bench = None
    
    try:
        body = await request.json()
        req_name = body.get("name")
        req_mode = body.get("mode", "weights")
        req_weights_str = body.get("weights_str")
        if not req_weights_str and "assets" in body and isinstance(body["assets"], dict):
            req_weights_str = ", ".join([f"{k}:{v}" for k, v in body["assets"].items()])
        req_bench = body.get("benchmark")
    except Exception:
        return JSONResponse({"success": False, "error": "Cuerpo del request inválido. Se requiere un JSON válido."}, status_code=400)

    name_clean = sanitize_portfolio_name(req_name or "")
    if not name_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio inválido. Solo letras minúsculas, números y guiones bajos (máx 30 caracteres)."})
        
    if is_portfolio_name_taken(name_clean):
        return JSONResponse({
            "success": False,
            "error": f"Ya existe un portfolio llamado '{name_clean}' o ese nombre sigue reservado en la papelera."
        }, status_code=409)

    mode_clean = "weights"

    new_weights, err = parse_weights_string(req_weights_str or "")
    if err:
        return JSONResponse({"success": False, "error": err})

    new_weights, err = normalize_weights_dict(new_weights)
    if err:
        return JSONResponse({"success": False, "error": err})

    invalid = find_non_cedear_tickers(new_weights.keys())
    if invalid:
        return JSONResponse({
            "success": False,
            "error": f"Estos tickers no son CEDEARs de BYMA: {', '.join(invalid)}. Corregí la cartera e intentá de nuevo."
        }, status_code=400)

    portfolios_data = load_portfolios()
    portfolios_data[name_clean] = {
        "mode": mode_clean,
        "assets": new_weights
    }
    if req_bench:
        
        portfolios_data[name_clean]["benchmark"] = sanitize_ticker(req_bench)
    save_portfolios(portfolios_data)
    return JSONResponse({"success": True, "name": name_clean, "portfolio": portfolios_data[name_clean]})

@router.delete("/delete_json/{pf_type}", response_model=DeletePortfolioResponse)
def delete_custom_portfolio(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."})
        
    res = move_portfolio_to_trash(pf_clean)
    return DeletePortfolioResponse(**res)

@router.get("/trash_json", response_model=TrashListResponse)
def get_portfolios_trash():
    trash = load_portfolios_trash()
    return JSONResponse({
        "success": True,
        "count": len(trash),
        "max_capacity": MAX_TRASH_CAPACITY,
        "trash": trash
    })

@router.post("/restore_json/{pf_type}", response_model=SuccessEnvelope)
def restore_custom_portfolio(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)
    res = restore_portfolio_from_trash(pf_clean)
    if not res.get("success"):
        return JSONResponse(res, status_code=404)
    return DeletePortfolioResponse(**res)


@router.post("/restore_as_json/{pf_type}", response_model=SuccessEnvelope)
def restore_portfolio_as_new(pf_type: str, body: RestoreAsRequest):
    """
    Restaura una cartera de la papelera bajo un nombre nuevo, conservando objetivos,
    tenencias, bonos y efectivo. La entrada original sigue en la papelera.
    """
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)

    target = sanitize_portfolio_name(body.new_name or "")
    if not target:
        return JSONResponse({"success": False, "error": "El nombre destino no es válido."}, status_code=400)

    res = restore_portfolio_from_trash(pf_clean, new_name=target)
    if not res.get("success"):
        return JSONResponse(res, status_code=409)
    return JSONResponse({"success": True, "restored": res["restored"], "portfolio": res["portfolio"]})

@router.delete("/trash_json/{pf_type}", response_model=SuccessEnvelope)
def purge_portfolio_from_trash(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    if not pf_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)
    res = delete_permanently_from_trash(pf_clean)
    return DeletePortfolioResponse(**res)

@router.post("/rename_json", response_model=RenamePortfolioResponse)
def rename_custom_portfolio(body: RenamePortfolioRequest):
    old_clean = sanitize_portfolio_name(body.old_name)
    new_clean = sanitize_portfolio_name(body.new_name)

    if not old_clean or not new_clean:
        return JSONResponse({"success": False, "error": "Nombre de portfolio no válido."}, status_code=400)

    portfolios_data = load_portfolios()
    if old_clean not in portfolios_data:
        return JSONResponse({"success": False, "error": f"El portfolio '{old_clean}' no existe."}, status_code=404)

    if new_clean != old_clean and is_portfolio_name_taken(new_clean):
        return JSONResponse({"success": False, "error": f"El nombre '{new_clean}' ya está en uso."}, status_code=400)

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
    except Exception as e:
        logger.warning(f"Holdings migration failed during rename {old_clean} -> {new_clean}: {e}")

    return RenamePortfolioResponse(success=True, old_name=old_clean, new_name=new_clean)

@router.post("/import_json", response_model=ImportPortfoliosResponse)
async def import_custom_portfolios(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
):
    try:
        content = await file.read(MAX_FILE_SIZE_BYTES + 1)
        if len(content) > MAX_FILE_SIZE_BYTES:
            return JSONResponse({"success": False, "error": "El archivo supera el tamaño máximo permitido (1 MB)."})
            
        try:
            imported_data = json.loads(content.decode("utf-8"))
        except Exception:
            return JSONResponse({"success": False, "error": "El archivo no contiene un formato JSON válido."})
            
        if not isinstance(imported_data, dict):
            return JSONResponse({"success": False, "error": "El formato JSON debe ser un objeto (diccionario) con los nombres de portfolios."})

        # Un mapa plano {TICKER: valor} describe UNA sola cartera. En ese caso el
        # nombre no viene en el JSON y hay que pedirlo, en vez de tomar cada ticker
        # por el nombre de una cartera (lo que antes no importaba nada en silencio).
        if imported_data and all(
            isinstance(v, (int, float)) and not isinstance(v, bool)
            for v in imported_data.values()
        ):
            if not name:
                return JSONResponse({
                    "success": False,
                    "error": "El JSON es un mapa de activos (TICKER: valor). Indicá el nombre de la cartera.",
                    "needs_name": True,
                })
            imported_data = {name: {"mode": "weights", "assets": imported_data}}
        elif (
            "assets" in imported_data
            and isinstance(imported_data.get("assets"), dict)
            and all(
                isinstance(v, (int, float)) and not isinstance(v, bool)
                for v in imported_data["assets"].values()
            )
        ):
            # Envoltura de un solo portfolio: {"assets": {...}} o
            # {"mode": "weights", "assets": {...}}. Antes se tomaba la palabra
            # "assets" como nombre de cartera y se creaba una llamada "assets".
            single = {"mode": imported_data.get("mode", "weights"), "assets": imported_data["assets"]}
            if not name:
                return JSONResponse({
                    "success": False,
                    "error": "El JSON describe una sola cartera. Indicá el nombre de la cartera.",
                    "needs_name": True,
                })
            imported_data = {name: single}

        sanitized_portfolios = {}
        skipped: List[str] = []
        for pf_name, data_item in imported_data.items():
            pf_name_clean = sanitize_portfolio_name(pf_name)
            if not pf_name_clean:
                skipped.append(str(pf_name))
                continue
            if is_portfolio_name_taken(pf_name_clean):
                # Ya existe viva o sigue en la papelera: no se puede reimportar.
                skipped.append(pf_name_clean)
                continue
                
            if isinstance(data_item, dict) and "assets" in data_item:
                # El modo por nominales fue retirado: se ignora el del JSON importado.
                mode = "weights"
                assets = data_item.get("assets", {})
            elif isinstance(data_item, dict):
                mode = "weights"
                assets = data_item
            else:
                skipped.append(pf_name_clean)
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
                # Misma regla que al crear: los pesos se persisten normalizados a 100.
                clean_assets, norm_err = normalize_weights_dict(clean_assets)
                if norm_err:
                    skipped.append(f"{pf_name_clean} ({norm_err})")
                    continue
                entry = {
                    "mode": mode,
                    "assets": clean_assets
                }
                if "anchor" in data_item:
                    anc_clean = sanitize_ticker(str(data_item["anchor"]))
                    if anc_clean:
                        entry["anchor"] = anc_clean
                if "benchmark" in data_item:
                    
                    anc_clean = sanitize_ticker(str(data_item["benchmark"]))
                    if anc_clean:
                        entry["benchmark"] = anc_clean
                if "qty" in data_item:
                    try:
                        q_val = int(data_item["qty"])
                        if q_val > 0:
                            entry["qty"] = q_val
                    except (ValueError, TypeError):
                        pass
                if "asset_allocation" in data_item and isinstance(data_item["asset_allocation"], dict):
                    aa = data_item["asset_allocation"]
                    clean_aa = {}
                    for k in ("equity_weight", "fixed_income_weight"):
                        if k in aa:
                            try:
                                clean_aa[k] = max(0.0, min(100.0, float(aa[k])))
                            except (ValueError, TypeError):
                                pass
                    if "fixed_income_policy" in aa:
                        clean_aa["fixed_income_policy"] = str(aa["fixed_income_policy"])
                    if clean_aa:
                        entry["asset_allocation"] = clean_aa
                if "fixed_income_assets" in data_item and isinstance(data_item["fixed_income_assets"], dict):
                    clean_fia = {}
                    for tk, fi_info in data_item["fixed_income_assets"].items():
                        tk_c = sanitize_ticker(tk)
                        if tk_c and isinstance(fi_info, dict):
                            clean_fia[tk_c] = {
                                "target_weight_portfolio": max(0.0, min(100.0, float(fi_info.get("target_weight_portfolio", 0.0)))),
                                "target_weight_rf": max(0.0, min(100.0, float(fi_info.get("target_weight_rf", 0.0))))
                            }
                    if clean_fia:
                        entry["fixed_income_assets"] = clean_fia

                sanitized_portfolios[pf_name_clean] = entry
                
        if not sanitized_portfolios:
            # Si hubo carteras omitidas, Saying which ones y por qué: un error genérico
            # hace que el usuario no entienda por qué no se importó nada.
            if skipped:
                detail = "; ".join(skipped[:5])
                more = f" (y {len(skipped) - 5} más)" if len(skipped) > 5 else ""
                return JSONResponse({
                    "success": False,
                    "imported_count": 0,
                    "skipped": skipped,
                    "error": f"No se importó ninguna cartera. Omitidas: {detail}{more}.",
                })
            return JSONResponse({"success": False, "error": "No se encontraron portfolios válidos para importar en el archivo."})

        # Regla de todo-o-nada: si algún ticker del archivo no es CEDEAR, no se importa
        # nada. Importar la mitad deja carteras a medio construir, que es peor.
        invalid = find_non_cedear_tickers(
            tk for entry in sanitized_portfolios.values() for tk in (entry.get("assets") or {})
        )
        if invalid:
            return JSONResponse({
                "success": False,
                "imported_count": 0,
                "error": (
                    f"Estos tickers no son CEDEARs de BYMA: {', '.join(invalid)}. "
                    "No se importó ninguna cartera."
                ),
            }, status_code=400)

        current_data = load_portfolios()
        current_data.update(sanitized_portfolios)
        save_portfolios(current_data)
        return ImportPortfoliosResponse(
            success=True,
            imported_count=len(sanitized_portfolios),
            portfolios=sanitized_portfolios,
            skipped=skipped,
        )
    except Exception as e:
        return JSONResponse({"success": False, "error": f"Error al procesar el archivo: {str(e)}"})

@router.get("/export_json/{pf_type}", response_model=Dict[str, Any])
def export_custom_portfolio(pf_type: str):
    pf_clean = sanitize_portfolio_name(pf_type)
    portfolios = load_portfolios()
    if not pf_clean or pf_clean not in portfolios:
        raise PortfolioNotFoundError("Portfolio no encontrado.")
    return {pf_clean: portfolios[pf_clean]}


@router.get("/performance_json/{pf_type}", response_model=Dict[str, Any])
def get_portfolio_performance(pf_type: str, period: str = "ytd"):
    result = calculate_backtest_performance(pf_type, chart_period=period)
    return result
