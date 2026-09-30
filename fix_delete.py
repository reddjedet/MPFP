with open("schemas/api_schemas.py", "r") as f:
    schemas = f.read()

schemas += "\nclass DeletePortfolioResponse(BaseModel):\n    success: bool\n    message: Optional[str] = None\n    error: Optional[str] = None\n    moved_to_trash: Optional[str] = None\n"

with open("schemas/api_schemas.py", "w") as f:
    f.write(schemas)

with open("routers/portfolios.py", "r") as f:
    routers = f.read()

routers = routers.replace("SuccessEnvelope,\n    ErrorEnvelope", "SuccessEnvelope,\n    ErrorEnvelope,\n    DeletePortfolioResponse")

import re
routers = re.sub(r'@router\.delete\("/delete_json/\{pf_type\}", response_model=SuccessEnvelope\)', '@router.delete("/delete_json/{pf_type}", response_model=DeletePortfolioResponse)', routers)
routers = routers.replace('return SuccessEnvelope(**res) if res.get("success") else JSONResponse(res)', 'return DeletePortfolioResponse(**res)')

with open("routers/portfolios.py", "w") as f:
    f.write(routers)
