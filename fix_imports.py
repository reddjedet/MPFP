with open("routers/portfolios.py", "r") as f:
    content = f.read()

import re

# Remove the old schemas import block
content = re.sub(r'from schemas\.api_schemas import \([^)]+\)', '', content, flags=re.DOTALL)

# Add the new one at the top right after imports
schemas_import = """
from schemas.api_schemas import (
    BulkQuickUpdateAssetRequest,
    PortfolioCreateRequest,
    PortfolioWeightsRequest,
    PortfolioSettingsRequest,
    QuickUpdateAssetRequest,
    QuickUpdateAssetResponse,
    PortfolioListResponse,
    PortfolioRebalanceResponse,
    PortfolioCreateResponse,
    TrashListResponse,
    RenamePortfolioResponse,
    ImportPortfoliosResponse,
    SuccessEnvelope,
    ErrorEnvelope,
    RenamePortfolioRequest
)
"""

content = content.replace("from fastapi.responses import JSONResponse", "from fastapi.responses import JSONResponse" + schemas_import)

with open("routers/portfolios.py", "w") as f:
    f.write(content)
