import re

with open("routers/portfolios.py", "r") as f:
    content = f.read()

# Add imports for api_schemas models
schemas_import = "from schemas.api_schemas import (\n    BulkQuickUpdateAssetRequest,\n    PortfolioCreateRequest,\n    PortfolioWeightsRequest,\n    PortfolioSettingsRequest,\n    QuickUpdateAssetRequest,\n    QuickUpdateAssetResponse,\n    PortfolioListResponse,\n    PortfolioRebalanceResponse,\n    PortfolioCreateResponse,\n    TrashListResponse,\n    RenamePortfolioResponse,\n    ImportPortfoliosResponse,\n    SuccessEnvelope,\n    ErrorEnvelope,\n    RenamePortfolioRequest\n)"
content = re.sub(r'from schemas.api_schemas import (.*?)(?=\nfrom)', schemas_import + r'\nfrom', content, flags=re.DOTALL)
if "from schemas.api_schemas import" not in content:
    content = content.replace("from typing import Optional", schemas_import + "\nfrom typing import Optional", 1)

# Modify get_rebalance_data_json
rebalance_match = re.search(r'@router\.get\("/rebalance_json/\{pf_type\}".*?def get_rebalance_data_json\(.*?\):.*?return JSONResponse\(\{.*?\}\)', content, flags=re.DOTALL)

if rebalance_match:
    old_func = rebalance_match.group(0)
    new_func = """@router.get("/rebalance_json/{pf_type}", response_model=PortfolioRebalanceResponse)
def get_rebalance_data_json(
    pf_type: str,
    anchor: Optional[str] = None,
    qty: Optional[int] = None,
    cash_budget: Optional[float] = None,
    tolerance_pct: float = 1.5
):
    from services.portfolio_service import get_portfolio_rebalance_data
    from services.security_service import sanitize_portfolio_name
    from schemas.exceptions import DomainValidationError
    
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
    return data"""
    content = content.replace(old_func, new_func)

# Fix response models everywhere
replacements = [
    ('@router.get("/list_json", response_class=JSONResponse)', '@router.get("/list_json", response_model=PortfolioListResponse)'),
    ('return JSONResponse({\n        "portfolios": portfolios_data,\n        "weights_str_map": weights_str_map,\n        "fair_values_map": fair_values_map,\n        "selected_pf": list(portfolios_data.keys())[0] if portfolios_data else "bmb"\n    })', 'return PortfolioListResponse(portfolios=portfolios_data, weights_str_map=weights_str_map, fair_values_map=fair_values_map, selected_pf=list(portfolios_data.keys())[0] if portfolios_data else "bmb")'),
    
    ('@router.post("/quick_update_json", response_class=JSONResponse)', '@router.post("/quick_update_json", response_model=QuickUpdateAssetResponse)'),
    ('return JSONResponse({\n        "success": True, \n        "ticker": clean_tk,\n        "ppc": get_ppc_value(clean_tk),\n        "gf_value": get_fair_value(clean_tk),\n        "pfcf": get_pfcf_value(clean_tk)\n    })', 'return QuickUpdateAssetResponse(success=True, ticker=clean_tk, ppc=get_ppc_value(clean_tk), gf_value=get_fair_value(clean_tk), pfcf=get_pfcf_value(clean_tk))'),
    
    ('@router.post("/bulk_quick_update_json", response_class=JSONResponse)', '@router.post("/bulk_quick_update_json", response_model=SuccessEnvelope)'),
    ('return JSONResponse({"success": True, "updated_count": len(body.items)})', 'return SuccessEnvelope(success=True, data={"updated_count": len(body.items)})'),
    
    ('@router.post("/settings_json/{pf_type}", response_class=JSONResponse)', '@router.post("/settings_json/{pf_type}", response_model=SuccessEnvelope)'),
    ('return JSONResponse({"success": True, "message": "Ajustes del portfolio guardados correctamente."})', 'return SuccessEnvelope(success=True, message="Ajustes del portfolio guardados correctamente.")'),
    
    ('@router.post("/weights_json/{pf_type}", response_class=JSONResponse)', '@router.post("/weights_json/{pf_type}", response_model=SuccessEnvelope)'),
    ('return JSONResponse({"success": True, "message": "Ponderaciones actualizadas correctamente."})', 'return SuccessEnvelope(success=True, message="Ponderaciones actualizadas correctamente.")'),
    
    ('@router.post("/create_json", response_class=JSONResponse)', '@router.post("/create_json", response_model=PortfolioCreateResponse)'),
    ('return JSONResponse({\n            "success": True, \n            "name": clean_name,\n            "mode": pf_data.get("mode", "weights"),\n            "assets": pf_data.get("assets", {})\n        })', 'return PortfolioCreateResponse(success=True, name=clean_name, mode=pf_data.get("mode", "weights"), assets=pf_data.get("assets", {}))'),
    ('return JSONResponse({"success": False, "error": f"Ya existe un portfolio llamado \'{clean_name}\'."}, status_code=400)', 'return JSONResponse({"success": False, "error": f"Ya existe un portfolio llamado \'{clean_name}\'."}, status_code=400)'), # keep jsonresponse for errors for now, or we can use HTTPException
    
    ('@router.delete("/delete_json/{pf_type}", response_class=JSONResponse)', '@router.delete("/delete_json/{pf_type}", response_model=SuccessEnvelope)'),
    ('return JSONResponse(res)', 'return SuccessEnvelope(**res) if res.get("success") else JSONResponse(res, status_code=400)'),
    
    ('@router.get("/trash_json", response_class=JSONResponse)', '@router.get("/trash_json", response_model=TrashListResponse)'),
    ('return JSONResponse({"trash": trash_data})', 'return TrashListResponse(trash=trash_data)'),
    
    ('@router.post("/restore_json/{pf_type}", response_class=JSONResponse)', '@router.post("/restore_json/{pf_type}", response_model=SuccessEnvelope)'),
    
    ('@router.delete("/trash_json/{pf_type}", response_class=JSONResponse)', '@router.delete("/trash_json/{pf_type}", response_model=SuccessEnvelope)'),
    
    ('@router.post("/rename_json", response_class=JSONResponse)', '@router.post("/rename_json", response_model=RenamePortfolioResponse)'),
    ('return JSONResponse({"success": True, "old_name": old_clean, "new_name": new_clean})', 'return RenamePortfolioResponse(success=True, old_name=old_clean, new_name=new_clean)'),
    
    ('@router.post("/import_json", response_class=JSONResponse)', '@router.post("/import_json", response_model=ImportPortfoliosResponse)'),
    ('return JSONResponse({"success": True, "imported_count": len(sanitized_portfolios), "portfolios": sanitized_portfolios})', 'return ImportPortfoliosResponse(success=True, imported_count=len(sanitized_portfolios), portfolios=sanitized_portfolios)'),
    
    ('@router.get("/export_json/{pf_type}", response_class=JSONResponse)', '@router.get("/export_json/{pf_type}", response_model=Dict[str, Any])'),
    ('return JSONResponse({pf_clean: portfolios[pf_clean]})', 'return {pf_clean: portfolios[pf_clean]}'),
    
    ('@router.get("/performance_json/{pf_type}", response_class=JSONResponse)', '@router.get("/performance_json/{pf_type}", response_model=Dict[str, Any])'),
    ('return JSONResponse(result)', 'return result'),
]

for old, new in replacements:
    content = content.replace(old, new)

# Also there are classes defined locally that should be removed as they are now in schemas
content = re.sub(r'class BulkQuickUpdateAssetRequest\(BaseModel\):\n.*?items: List\[QuickUpdateAssetRequest\]\n', '', content, flags=re.DOTALL)
content = re.sub(r'class CreatePortfolioRequest\(PortfolioCreateRequest\):\n    pass\n', '', content, flags=re.DOTALL)
content = re.sub(r'class RenamePortfolioRequest\(BaseModel\):\n.*?old_name: str\n    new_name: str\n', '', content, flags=re.DOTALL)

content = content.replace("CreatePortfolioRequest", "PortfolioCreateRequest")

with open("routers/portfolios.py", "w") as f:
    f.write(content)

