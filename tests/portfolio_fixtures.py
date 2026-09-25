"""Explicit portfolio definitions used by tests that exercise portfolio lookups."""
from services.portfolio_service import load_portfolios, save_portfolios


def seed_required_portfolios():
    portfolios = load_portfolios()
    # Include the fixed-income instrument in BMB: several tests verify that it
    # remains visible and valued, while never being treated as an equity trade.
    bmb = dict(portfolios.get("bmb", {}))
    bmb_assets = dict(bmb.get("assets", {}))
    bmb["assets"] = bmb_assets
    bmb["fixed_income_assets"] = {"S30S6": {"target_weight_portfolio": 10.0}}
    bmb["asset_allocation"] = {"fixed_income_weight": 10.0}
    bmb["mode"] = "weights"
    portfolios["bmb"] = bmb
    portfolios.update({
        "min_drawdown_15": {"mode": "weights", "assets": {
            "COST": 25.0, "LLY": 20.0, "DE": 20.0, "GOOGL": 20.0, "V": 15.0,
        }}, 
        "bdi_agresiva": {"mode": "weights", "assets": {"GOOGL": 50.0, "LLY": 50.0}},
        "test_mcm": {"mode": "weights", "assets": {"COST": 50.0, "LLY": 50.0}},
        "test_mcm_overbought": {"mode": "weights", "assets": {"COST": 50.0, "LLY": 50.0}},
        "test_surplus": {"mode": "weights", "assets": {"COST": 50.0, "LLY": 50.0}},
        "test_wait_cash": {"mode": "weights", "assets": {"COST": 50.0, "LLY": 50.0}},
        "test_fi_implicit": {"mode": "weights", "assets": {"COST": 50.0, "AL30": 50.0}},
        "test_mcm_3x": {"mode": "weights", "assets": {"COST": 50.0, "LLY": 50.0}},
    })
    save_portfolios(portfolios)
