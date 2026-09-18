import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

import copy
from services.atomic_persistence import AtomicJsonDatabase
from services.utils import clamp

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "valuation_profiles.json"
USER_INPUTS_PATH = Path(__file__).resolve().parent.parent / "data" / "user_valuation_inputs.json"
_user_inputs_db = AtomicJsonDatabase(USER_INPUTS_PATH)

_val_db = AtomicJsonDatabase(DB_PATH)

def load_valuation_database() -> dict:
    """Carga la base de datos de perfiles y metodologías de valuación de forma atómica."""
    try:
        data = _val_db.load()
        if isinstance(data, dict) and ("sectors" in data or "profiles" in data):
            return data
        return {"sectors": [], "profiles": {}}
    except Exception:
        return {"sectors": [], "profiles": {}}

def load_user_valuation_inputs() -> dict:
    """Carga los inputs personalizados guardados por el usuario para cada ticker."""
    data = _user_inputs_db.load()
    return data if isinstance(data, dict) else {}

def get_user_valuation_inputs(ticker: str) -> dict:
    """Obtiene los inputs guardados para un ticker específico."""
    ticker_clean = ticker.upper().strip()
    if ticker_clean == "BRKB":
        ticker_clean = "BRK.B"
    return load_user_valuation_inputs().get(ticker_clean, {})

def save_user_valuation_inputs(ticker: str, metrics: Dict[str, Any]) -> None:
    """Guarda los inputs ingresados por el usuario para persistencia automática."""
    ticker_clean = ticker.upper().strip()
    if ticker_clean == "BRKB":
        ticker_clean = "BRK.B"
    data = load_user_valuation_inputs()
    # Sanitizar métricas para guardar solo floats/ints
    clean_metrics = {}
    for k, v in metrics.items():
        if k == "ticker":
            continue
        try:
            val_num = float(v)
            clean_metrics[k] = val_num
        except (ValueError, TypeError):
            continue
    if clean_metrics:
        data[ticker_clean] = clean_metrics
        _user_inputs_db.save(data)

def get_sectors_and_tickers() -> List[dict]:
    """Retorna los sectores con sus respectivos tickers y nombres de empresas."""
    data = load_valuation_database()
    sectors = data.get("sectors", [])
    profiles = data.get("profiles", {})
    
    result = []
    for sec in sectors:
        sec_copy = {
            "id": sec.get("id"),
            "name": sec.get("name"),
            "companies": []
        }
        for tk in sec.get("tickers", []):
            prof = profiles.get(tk, {})
            sec_copy["companies"].append({
                "ticker": tk,
                "name": prof.get("name", tk),
                "is_discarded": (sec.get("id") == "discarded" or prof.get("model_type") == "discarded")
            })
        result.append(sec_copy)
    return result

def get_profile_by_ticker(ticker: str) -> Optional[dict]:
    """Obtiene el perfil y campos adaptativos para un ticker, fusionando los inputs guardados y la cotización en vivo."""
    data = load_valuation_database()
    profiles = data.get("profiles", {})
    ticker_clean = ticker.upper().strip()
    if ticker_clean == "BRKB":
        ticker_clean = "BRK.B"
    
    raw_profile = profiles.get(ticker_clean)
    if not raw_profile:
        return None
        
    profile = copy.deepcopy(raw_profile)
    user_inputs = get_user_valuation_inputs(ticker_clean)
    
    # Consultar precio de mercado en vivo (ADR / NYSE)
    live_price = None
    try:
        from services.cedear_service import get_ticker_data
        sym_to_fetch = "BRKB" if ticker_clean == "BRK.B" else ticker_clean
        quote = get_ticker_data(sym_to_fetch)
        if quote and quote.get("adr") and float(quote.get("adr")) > 0:
            live_price = round(float(quote.get("adr")), 2)
    except Exception as e:
        logger.warning(f"No se pudo obtener precio en vivo para {ticker_clean}: {e}")

    profile["live_market_price"] = live_price

    # Si el usuario ya había ingresado valores para este ticker, sustituir los defaults
    if "fields" in profile:
        for field in profile["fields"]:
            f_key = field.get("key")
            if f_key == "price":
                # El precio spot real en vivo tiene máxima prioridad por defecto
                if live_price is not None:
                    field["default"] = live_price
                elif user_inputs and "price" in user_inputs and user_inputs["price"] is not None:
                    field["default"] = user_inputs["price"]
            elif user_inputs and f_key in user_inputs and user_inputs[f_key] is not None:
                field["default"] = user_inputs[f_key]
                
    profile["saved_user_inputs"] = user_inputs
    return profile


def _evaluate_banking(ticker_clean: str, metrics: Dict[str, Any], profile: dict, current_price: float, base_multiple: float, required_mos: float):
    eps = clamp(float(metrics.get("eps", 10.0)), -1000.0, 100000.0)
    tbv = clamp(float(metrics.get("tbv_per_share", 50.0)), 0.01, 100000.0)
    rotce = clamp(float(metrics.get("rotce", 18.0)), -100.0, 500.0)
    cet1 = clamp(float(metrics.get("cet1_ratio", 14.0)), 0.0, 100.0)
    nco_or_cost = clamp(float(metrics.get("nco_ratio", 0.5)), 0.0, 100.0)
    shares_cagr = clamp(float(metrics.get("shares_cagr", 0.0)), -50.0, 100.0)
    flags = []

    # 1. Solvencia de Capital (CET1 Ratio)
    if cet1 >= 14.5:
        cet1_flag = "GREEN"
        cet1_desc = f"Fortaleza de capital excepcional (CET1 {cet1:.1f}% >= 14.5%). Balance 'Fortress' sin riesgo regulatorio."
    elif cet1 >= 12.5:
        cet1_flag = "YELLOW"
        cet1_desc = f"Capital adecuado (CET1 {cet1:.1f}%). Cumple con Basilea III holgadamente."
    else:
        cet1_flag = "RED"
        cet1_desc = f"Nivel de capital ajustado (CET1 {cet1:.1f}% < 12.5%). Riesgo ante shocks crediticios."
    flags.append({"name": "Solvencia de Capital (CET1 Ratio)", "flag": cet1_flag, "desc": cet1_desc})

    # 2. Rentabilidad Tangible (RoTCE / ROE)
    min_rotce = 25.0 if ticker_clean == "NU" else 17.0
    if rotce >= min_rotce:
        rotce_flag = "GREEN"
        rotce_desc = f"Rentabilidad sobre capital tangible sobresaliente (RoTCE/ROE {rotce:.1f}% >= {min_rotce:.0f}%)."
    elif rotce >= 12.0:
        rotce_flag = "YELLOW"
        rotce_desc = f"Rentabilidad moderada (RoTCE/ROE {rotce:.1f}%). Cubre el costo de capital de la banca."
    else:
        rotce_flag = "RED"
        rotce_desc = f"Baja rentabilidad sobre fondos propios (RoTCE/ROE {rotce:.1f}% < 12.0%). Destruye valor contable."
    flags.append({"name": "Rentabilidad Tangible (RoTCE / ROE)", "flag": rotce_flag, "desc": rotce_desc})

    # 3. Riesgo de Crédito / Costo Operativo (NCO o Cost-to-Serve)
    if ticker_clean == "NU":
        if nco_or_cost < 1.0:
            cost_flag = "GREEN"
            cost_desc = f"Ventaja estructural de bajo costo (Cost to Serve ${nco_or_cost:.2f} USD/mes < $1.00 USD)."
        else:
            cost_flag = "YELLOW"
            cost_desc = f"Costo por cliente (${nco_or_cost:.2f} USD/mes) perdiendo apalancamiento operativo."
        flags.append({"name": "Costo por Cliente Activo", "flag": cost_flag, "desc": cost_desc})
    else:
        if nco_or_cost <= 0.50:
            nco_flag = "GREEN"
            nco_desc = f"Excelente calidad crediticia (Tasa de Pérdidas NCO {nco_or_cost:.2f}% <= 0.50%)."
        elif nco_or_cost <= 0.80:
            nco_flag = "YELLOW"
            nco_desc = f"Pérdidas crediticias moderadas (NCO {nco_or_cost:.2f}%)."
        else:
            nco_flag = "RED"
            nco_desc = f"Alto riesgo de morosidad crediticia (NCO {nco_or_cost:.2f}% > 0.80%)."
        flags.append({"name": "Calidad Crediticia (Net Charge-Offs)", "flag": nco_flag, "desc": nco_desc})

    # 4. Dilución
    dilution_flag = "GREEN" if shares_cagr <= 0.0 else ("YELLOW" if shares_cagr <= 1.0 else "RED")
    dilution_desc = f"Evolución accionaria ({shares_cagr:+.1f}% anual)."
    flags.append({"name": "Evolución Accionaria", "flag": dilution_flag, "desc": dilution_desc})

    # Valuación Bancaria (EPS x Múltiplo)
    fair_value = eps * base_multiple
    buy_below_price = fair_value * (1.0 - required_mos)
    discount_percent = ((fair_value - current_price) / fair_value) * 100.0 if fair_value > 0 else 0
    spread_display = rotce - 10.0 # Spread sobre costo de capital bancario
    key_metrics_display = {
        "metric_1_name": "Valor Contable Tangible", "metric_1_val": f"${tbv:.2f}", "metric_1_sub": f"P/TBV actual: {(current_price/tbv):.2f}x" if tbv > 0 else "—",
        "metric_2_name": "Rentabilidad Tangible", "metric_2_val": f"{rotce:.1f}%", "metric_2_sub": "RoTCE / ROE",
        "metric_3_name": "Ratio de Capital CET1", "metric_3_val": f"{cet1:.1f}%", "metric_3_sub": "Máxima solvencia"
    }
    return fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display

def _evaluate_financial_holding(ticker_clean: str, metrics: Dict[str, Any], profile: dict, current_price: float, base_multiple: float, required_mos: float):
    op_earnings = clamp(float(metrics.get("operating_earnings_per_share", 20.0)), -1000.0, 100000.0)
    excess_cash = clamp(float(metrics.get("excess_cash_per_share", 80.0)), -1000.0, 100000.0)
    float_cost = clamp(float(metrics.get("float_cost", -0.5)), -100.0, 100.0)
    shares_cagr = clamp(float(metrics.get("shares_cagr", -1.0)), -50.0, 100.0)
    flags = []

    # 1. Costo del Float Asegurador
    if float_cost <= 0.0:
        float_flag = "GREEN"
        float_desc = f"Float asegurador a costo negativo ({float_cost:.1f}%). Dinero gratis que apalanca las inversiones."
    elif float_cost <= 2.0:
        float_flag = "YELLOW"
        float_desc = f"Float a costo moderado ({float_cost:.1f}%). Sigue siendo ventajoso frente a tasas bancarias."
    else:
        float_flag = "RED"
        float_desc = f"Pérdidas operativas en seguros (Costo del Float {float_cost:.1f}% > 2.0%)."
    flags.append({"name": "Costo del Float Asegurador", "flag": float_flag, "desc": float_desc})

    # 2. Recompras
    dilution_flag = "GREEN" if shares_cagr <= 0.0 else "RED"
    dilution_desc = f"Recompra disciplinada de acciones ({shares_cagr:+.1f}% anual) por debajo del valor intrínseco."
    flags.append({"name": "Recompras Oportunistas", "flag": dilution_flag, "desc": dilution_desc})

    fair_value = (op_earnings * base_multiple) + excess_cash
    buy_below_price = fair_value * (1.0 - required_mos)
    discount_percent = ((fair_value - current_price) / fair_value) * 100.0 if fair_value > 0 else 0
    spread_display = 8.5
    key_metrics_display = {
        "metric_1_name": "Beneficio Operativo Real", "metric_1_val": f"${op_earnings:.2f}", "metric_1_sub": f"{base_multiple:.0f}x Look-Through Earnings",
        "metric_2_name": "Exceso de Caja / Acción", "metric_2_val": f"${excess_cash:.2f}", "metric_2_sub": "Letras del Tesoro líquidas",
        "metric_3_name": "Costo del Float", "metric_3_val": f"{float_cost:.1f}%", "metric_3_sub": "Financiamiento asegurador"
    }
    return fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display

def _evaluate_industrial_dual_debt(ticker_clean: str, metrics: Dict[str, Any], profile: dict, current_price: float, base_multiple: float, required_mos: float):
    fcf_mid = clamp(float(metrics.get("fcf_per_share", 20.0)), -1000.0, 100000.0)
    ind_debt = clamp(float(metrics.get("industrial_net_debt_ebitda", 0.8)), -50.0, 50.0)
    roic = clamp(float(metrics.get("roic", 20.0)), -100.0, 500.0)
    wacc = clamp(float(metrics.get("wacc", 8.5)), 1.0, 50.0)
    shares_cagr = clamp(float(metrics.get("shares_cagr", -2.0)), -50.0, 100.0)
    flags = []

    # 1. Deuda Industrial Pura
    if ind_debt <= 1.0:
        debt_flag = "GREEN"
        debt_desc = f"Deuda industrial limpia ({ind_debt:.1f}x EBITDA <= 1.0x). La división de préstamos a clientes está aislada."
    elif ind_debt <= 1.8:
        debt_flag = "YELLOW"
        debt_desc = f"Deuda industrial moderada ({ind_debt:.1f}x EBITDA)."
    else:
        debt_flag = "RED"
        debt_desc = f"Sobreendeudamiento industrial ({ind_debt:.1f}x EBITDA > 1.8x)."
    flags.append({"name": "Deuda Industrial Limpia", "flag": debt_flag, "desc": debt_desc})

    # 2. ROIC vs WACC
    spread = roic - wacc
    roic_flag = "GREEN" if (roic >= 18.0 and spread >= 5.0) else ("YELLOW" if spread > 0 else "RED")
    roic_desc = f"ROIC industrial ({roic:.1f}%) vs WACC ({wacc:.1f}%), Spread {spread:+.1f}%."
    flags.append({"name": "ROIC de Ciclo vs WACC", "flag": roic_flag, "desc": roic_desc})

    # 3. Dilución
    dilution_flag = "GREEN" if shares_cagr <= 0.0 else "RED"
    dilution_desc = f"Recompra de acciones de ciclo ({shares_cagr:+.1f}% anual)."
    flags.append({"name": "Evolución Accionaria", "flag": dilution_flag, "desc": dilution_desc})

    fair_value = fcf_mid * base_multiple
    buy_below_price = fair_value * (1.0 - required_mos)
    discount_percent = ((fair_value - current_price) / fair_value) * 100.0 if fair_value > 0 else 0
    spread_display = spread
    key_metrics_display = {
        "metric_1_name": "FCF de Ciclo Medio", "metric_1_val": f"${fcf_mid:.2f}", "metric_1_sub": f"{base_multiple:.0f}x Flujo Normalizado",
        "metric_2_name": "Deuda Industrial Neta", "metric_2_val": f"{ind_debt:.1f}x", "metric_2_sub": "Excluye financiera de clientes",
        "metric_3_name": "ROIC Industrial", "metric_3_val": f"{roic:.1f}%", "metric_3_sub": f"Spread +{spread:.1f}%"
    }
    return fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display

def _evaluate_energy_upstream(ticker_clean: str, metrics: Dict[str, Any], profile: dict, current_price: float, base_multiple: float, required_mos: float):
    fcf_adr = clamp(float(metrics.get("fcf_per_share", 8.0)), -1000.0, 100000.0)
    net_debt = clamp(float(metrics.get("net_debt_ebitda_usd", 1.0)), -50.0, 50.0)
    lifting_cost = clamp(float(metrics.get("lifting_cost", 4.5)), 0.0, 500.0) if "lifting_cost" in metrics else None
    breakeven = clamp(float(metrics.get("breakeven_price", 35.0)), 0.0, 500.0) if "breakeven_price" in metrics else None
    dollar_rev = clamp(float(metrics.get("dollarized_revenue_pct", 80.0)), 0.0, 100.0)
    roic = clamp(float(metrics.get("roic", 20.0)), -100.0, 500.0)
    wacc = clamp(float(metrics.get("wacc", 13.0)), 1.0, 50.0)
    flags = []

    # 1. Ventaja de Costos de Extracción
    if lifting_cost is not None:
        if lifting_cost <= 5.0 and (breakeven is None or breakeven <= 40.0):
            cost_flag = "GREEN"
            cost_desc = f"Costos de extracción de clase mundial (Lifting Cost ${lifting_cost:.2f}/boe, Breakeven < ${breakeven or 40:.0f} Brent)."
        else:
            cost_flag = "YELLOW"
            cost_desc = f"Costo de extracción (${lifting_cost:.2f}/boe)."
        flags.append({"name": "Eficiencia de Extracción (Lifting Cost)", "flag": cost_flag, "desc": cost_desc})

    # 2. Deuda Neta en USD
    max_debt = 3.5 if ticker_clean == "VST" else 1.5
    if net_debt <= 0.8:
        debt_flag = "GREEN"
        debt_desc = f"Deuda mínima en dólares ({net_debt:.1f}x EBITDA <= 0.8x)."
    elif net_debt <= max_debt:
        debt_flag = "YELLOW"
        debt_desc = f"Endeudamiento moderado ({net_debt:.1f}x EBITDA)."
    else:
        debt_flag = "RED"
        debt_desc = f"Sobreendeudamiento ({net_debt:.1f}x EBITDA > {max_debt:.1f}x)."
    flags.append({"name": "Deuda Neta en Dólares", "flag": debt_flag, "desc": debt_desc})

    # 3. Ingresos Dolarizados
    if dollar_rev >= 80.0:
        rev_flag = "GREEN"
        rev_desc = f"Ingresos blindados en dólares ({dollar_rev:.0f}% en USD / Exportaciones)."
    else:
        rev_flag = "YELLOW"
        rev_desc = f"Exposición a moneda local / tarifas reguladas ({dollar_rev:.0f}% en USD)."
    flags.append({"name": "Blindaje de Ingresos en USD", "flag": rev_flag, "desc": rev_desc})

    # 4. ROIC vs WACC
    spread = roic - wacc
    spread_display = spread

    fair_value = fcf_adr * base_multiple
    buy_below_price = fair_value * (1.0 - required_mos)
    discount_percent = ((fair_value - current_price) / fair_value) * 100.0 if fair_value > 0 else 0
    key_metrics_display = {
        "metric_1_name": "FCF por ADR / Acción", "metric_1_val": f"${fcf_adr:.2f}", "metric_1_sub": f"{base_multiple:.1f}x Múltiplo ADR",
        "metric_2_name": "Lifting Cost / Ventaja", "metric_2_val": f"${lifting_cost:.2f}/boe" if lifting_cost else f"{dollar_rev:.0f}% USD", "metric_2_sub": "Costo de extracción" if lifting_cost else "Ingresos en dólares",
        "metric_3_name": "Deuda en USD / EBITDA", "metric_3_val": f"{net_debt:.1f}x", "metric_3_sub": "Apalancamiento neto"
    }
    return fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display

def _evaluate_discarded(ticker_clean: str, metrics: Dict[str, Any], profile: dict, current_price: float, base_multiple: float, required_mos: float):
    shares_cagr = clamp(float(metrics.get("shares_cagr", 5.0)), -50.0, 100.0)
    sbc_ocf = clamp(float(metrics.get("sbc_ocf", 25.0)), 0.0, 500.0)
    auto_margin = clamp(float(metrics.get("automotive_gross_margin", 14.0)), -100.0, 100.0) if "automotive_gross_margin" in metrics else None
    fcf = clamp(float(metrics.get("fcf_per_share", 0.0)), -1000.0, 100000.0)
    flags = []

    val_desc = profile.get("discard_reason", "Trampa de valor descartada por Vía Negativa.")
    flags.append({"name": "Diagnóstico de Vía Negativa", "flag": "RED", "desc": val_desc})
    
    if shares_cagr > 1.0:
        flags.append({"name": "Dilución Accionaria Destructiva", "flag": "RED", "desc": f"Emisión continua de acciones ({shares_cagr:+.1f}% anual)."})
    if sbc_ocf > 15.0:
        flags.append({"name": "Sueldos Excesivos en Acciones", "flag": "RED", "desc": f"El {sbc_ocf:.1f}% del flujo operativo se destina a compensación de directivos."})
    if auto_margin is not None and auto_margin < 18.0:
        flags.append({"name": "Pérdida de Poder de Precios", "flag": "RED", "desc": f"Margen bruto automotriz colapsado ({auto_margin:.1f}% < 18%)."})

    fair_value = 0.0
    buy_below_price = 0.0
    discount_percent = -99.9
    spread_display = -5.0
    key_metrics_display = {
        "metric_1_name": "🚫 Estado Fundamental", "metric_1_val": "DESCARTE", "metric_1_sub": "Vía Negativa",
        "metric_2_name": "FCF Operativo Real", "metric_2_val": f"${fcf:.2f}", "metric_2_sub": "Flujo de caja libre",
        "metric_3_name": "Alerta Principal", "metric_3_val": "RED FLAG", "metric_3_sub": "Sin Margen de Seguridad"
    }
    return fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display

def _evaluate_standard_fcf(ticker_clean: str, metrics: Dict[str, Any], profile: dict, current_price: float, base_multiple: float, required_mos: float):
    fcf_per_share = clamp(float(metrics.get("fcf_per_share", 5.0)), -1000.0, 100000.0)
    roic = clamp(float(metrics.get("roic", 15.0)), -100.0, 500.0)
    wacc = clamp(float(metrics.get("wacc", 9.0)), 1.0, 50.0)
    net_debt_ebitda = clamp(float(metrics.get("net_debt_ebitda", 1.0)), -50.0, 50.0)
    shares_cagr = clamp(float(metrics.get("shares_cagr", 0.0)), -50.0, 100.0)
    sbc_ocf = clamp(float(metrics.get("sbc_ocf", 5.0)), 0.0, 500.0)
    flags = []

    # 1. Solvencia
    max_tolerated_debt = 2.5 if profile.get("sector_id") in ["industrials", "staples_health"] else 1.8
    if net_debt_ebitda <= 0.0:
        solvency_flag = "GREEN"
        solvency_desc = f"Posición de Caja Neta (Net Cash {net_debt_ebitda:.1f}x). Balance blindado."
    elif net_debt_ebitda <= 1.5:
        solvency_flag = "GREEN"
        solvency_desc = f"Endeudamiento óptimo ({net_debt_ebitda:.1f}x EBITDA <= 1.5x)."
    elif net_debt_ebitda <= max_tolerated_debt:
        solvency_flag = "YELLOW"
        solvency_desc = f"Deuda moderada ({net_debt_ebitda:.1f}x EBITDA)."
    else:
        solvency_flag = "RED"
        solvency_desc = f"Sobreendeudamiento ({net_debt_ebitda:.1f}x EBITDA > {max_tolerated_debt:.1f}x)."
    flags.append({"name": "Solvencia & Deuda Neta", "flag": solvency_flag, "desc": solvency_desc})

    # 2. Dilución
    if shares_cagr <= -1.0:
        dilution_flag = "GREEN"
        dilution_desc = f"Recompra neta agresiva ({shares_cagr:.1f}% anual)."
    elif shares_cagr <= 0.0:
        dilution_flag = "GREEN"
        dilution_desc = f"Emisión controlada ({shares_cagr:.1f}% anual)."
    elif shares_cagr <= 1.0:
        dilution_flag = "YELLOW"
        dilution_desc = f"Dilución leve ({shares_cagr:.1f}% anual)."
    else:
        dilution_flag = "RED"
        dilution_desc = f"Dilución accionaria recurrente ({shares_cagr:.1f}% anual > 1.0%)."
    flags.append({"name": "Evolución Accionaria", "flag": dilution_flag, "desc": dilution_desc})

    # 3. SBC
    if sbc_ocf < 10.0:
        sbc_flag = "GREEN"
        sbc_desc = f"Compensación en acciones disciplinada ({sbc_ocf:.1f}% del OCF < 10%)."
    elif sbc_ocf <= 15.0:
        sbc_flag = "YELLOW"
        sbc_desc = f"SBC moderada ({sbc_ocf:.1f}% del OCF)."
    else:
        sbc_flag = "RED"
        sbc_desc = f"Excesiva compensación a directivos ({sbc_ocf:.1f}% del OCF > 15%)."
    flags.append({"name": "Sueldos en Acciones (SBC)", "flag": sbc_flag, "desc": sbc_desc})

    # 4. ROIC vs WACC
    spread = roic - wacc
    spread_display = spread
    if roic >= 20.0 and spread >= 8.0:
        roic_flag = "GREEN"
        roic_desc = f"Creación extraordinaria de valor: ROIC ({roic:.1f}%) supera WACC ({wacc:.1f}%), Spread +{spread:.1f}%."
    elif roic >= 15.0 and spread >= 4.0:
        roic_flag = "GREEN"
        roic_desc = f"Excelente rentabilidad sobre capital (ROIC {roic:.1f}% vs WACC {wacc:.1f}%, Spread +{spread:.1f}%)."
    elif spread > 0.0 and roic >= 10.0:
        roic_flag = "YELLOW"
        roic_desc = f"Rentabilidad moderada: ROIC ({roic:.1f}%) cubre WACC ({wacc:.1f}%), Spread +{spread:.1f}%."
    else:
        roic_flag = "RED"
        roic_desc = f"Destrucción neta de valor: ROIC ({roic:.1f}%) no supera WACC ({wacc:.1f}%), Spread {spread:+.1f}%."
    flags.append({"name": "ROIC vs WACC", "flag": roic_flag, "desc": roic_desc})

    fair_value = fcf_per_share * base_multiple
    buy_below_price = fair_value * (1.0 - required_mos)
    discount_percent = ((fair_value - current_price) / fair_value) * 100.0 if fair_value > 0 else 0
    key_metrics_display = {
        "metric_1_name": "💎 Fair Value (Valor Intrínseco)", "metric_1_val": f"${fair_value:.2f}", "metric_1_sub": f"{base_multiple:.0f}x FCF Normalizado",
        "metric_2_name": "Precio Límite de Compra", "metric_2_val": f"${buy_below_price:.2f}", "metric_2_sub": f"{int(required_mos*100)}% Margen de Seguridad",
        "metric_3_name": "⚡ Spread ROIC vs WACC", "metric_3_val": f"{'+' if spread > 0 else ''}{spread:.1f}%", "metric_3_sub": f"ROIC {roic:.1f}% - WACC {wacc:.1f}%"
    }
    return fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display

MODEL_STRATEGIES = {
    "banking": _evaluate_banking,
    "financial_holding": _evaluate_financial_holding,
    "industrial_dual_debt": _evaluate_industrial_dual_debt,
    "energy_upstream": _evaluate_energy_upstream,
    "discarded": _evaluate_discarded,
    "standard_fcf": _evaluate_standard_fcf
}

def evaluate_valuation(ticker: str, metrics: Dict[str, Any]) -> dict:
    """
    Ejecuta el análisis fundamental adaptado según el modelo de negocio despachando a la estrategia correspondiente:
    - standard_fcf: ROIC vs WACC, Net Debt/EBITDA, SBC/OCF, FCF Múltiplos
    - banking: CET1 Ratio, RoTCE/ROE, NCO/Cost-to-Serve, EPS & TBV
    - financial_holding: Look-Through Operating Earnings, Exceso de Caja, Costo del Float
    - industrial_dual_debt: Deuda Neta Industrial vs Financiera, FCF de Ciclo Medio
    - energy_upstream: Lifting Cost, Breakeven Brent, Deuda Neta USD, Ingresos Dolarizados
    - discarded: Trampas de valor con auditoría del fallo estructural
    """
    ticker_clean = ticker.upper().strip()
    if ticker_clean == "BRKB":
        ticker_clean = "BRK.B"
        
    # Guardar automáticamente los inputs ingresados para recordar el fair value y sus variables
    save_user_valuation_inputs(ticker_clean, metrics)
    
    profile = get_profile_by_ticker(ticker_clean) or {}
    
    model_type = profile.get("model_type", "standard_fcf")
    base_multiple = float(profile.get("base_fcf_multiple", 20.0))
    required_mos = float(profile.get("required_margin_of_safety", 0.25))
    current_price = float(metrics.get("price", 100.0))
    is_discarded_by_nature = (model_type == "discarded")

    strategy_fn = MODEL_STRATEGIES.get(model_type, _evaluate_standard_fcf)
    fair_value, buy_below_price, discount_percent, spread_display, flags, key_metrics_display = strategy_fn(
        ticker_clean, metrics, profile, current_price, base_multiple, required_mos
    )

    # --- EVALUACIÓN DE MARGEN DE SEGURIDAD GENERAL ---
    if not is_discarded_by_nature and fair_value > 0:
        if current_price <= buy_below_price:
            val_flag = "GREEN"
            val_desc = f"Cotiza con Margen de Seguridad favorable ({discount_percent:.1f}% de descuento vs Fair Value de ${fair_value:.2f}). Precio Límite: ${buy_below_price:.2f}."
        elif current_price <= fair_value:
            val_flag = "YELLOW"
            val_desc = f"Cotiza cerca de su Fair Value (${fair_value:.2f}), pero no alcanza el margen exigido ({required_mos*100:.0f}%). Precio de compra óptimo: ${buy_below_price:.2f}."
        else:
            val_flag = "RED"
            val_desc = f"Sobrevaluada frente a sus flujos (Precio ${current_price:.2f} > Fair Value ${fair_value:.2f}). Descuento actual: {discount_percent:.1f}%."
        flags.append({"name": "Valuación & Margen de Seguridad", "flag": val_flag, "desc": val_desc})

    # --- VEREDICTO CONSOLIDADO ---
    red_count = sum(1 for f in flags if f["flag"] == "RED")
    yellow_count = sum(1 for f in flags if f["flag"] == "YELLOW")
    green_count = sum(1 for f in flags if f["flag"] == "GREEN")

    if is_discarded_by_nature or red_count >= 2:
        verdict = "RED FLAG"
        verdict_title = "🚫 DESCARTE / NO COMPRAR (Red Flag)"
        verdict_badge = "badge-verdict-red"
        action_plan = [
            "No asignar capital bajo las condiciones actuales.",
            "Si se posee en cartera, evaluar salida o rotación hacia activos con ventaja competitiva comprobada.",
            "Mantener en lista de descarte hasta una reestructuración de balance o colapso de precio a niveles de remate."
        ]
        target_weight = "0.0%"
    elif red_count == 1 or yellow_count >= 2 or (fair_value > 0 and current_price > buy_below_price):
        verdict = "YELLOW FLAG"
        verdict_title = "LISTA DE VIGILANCIA (Yellow Flag)"
        verdict_badge = "badge-verdict-yellow"
        action_plan = [
            f"Esperar retroceso de precio hacia el rango de compra con margen: < ${buy_below_price:.2f}.",
            "Monitorear los próximos reportes trimestrales para confirmar resolución de banderas amarillas.",
            "Ponderación máxima prudencial en cartera si se ingresa: 3.0% - 5.0%."
        ]
        target_weight = "3.0% - 5.0%"
    else:
        verdict = "GREEN FLAG"
        verdict_title = "🏆 OPORTUNIDAD DE INVERSIÓN (Green Flag)"
        verdict_badge = "badge-verdict-green"
        action_plan = [
            f"Comprar con Margen de Seguridad por debajo de ${buy_below_price:.2f}.",
            "Ejecutar compra en 2 o 3 tramos: 40% inicial al precio actual, 30% ante caídas del 5-8%, 30% de reserva.",
            f"Ponderación objetivo en cartera: 6.0% - 10.0% (Tier 1).",
            "Disparadores de venta: Pérdida estructural de foso competitivo, deterioro permanente de rentabilidad o sobrevaluación extrema."
        ]
        target_weight = "6.0% - 10.0%"

    return {
        "ticker": ticker_clean,
        "name": profile.get("name", ticker_clean),
        "sector_id": profile.get("sector_id", "general"),
        "model_type": model_type,
        "business_summary": profile.get("business_summary", ""),
        "guidance": profile.get("guidance", ""),
        "is_discarded_by_nature": is_discarded_by_nature,
        "price": current_price,
        "fair_value": fair_value,
        "buy_below_price": buy_below_price,
        "discount_percent": discount_percent,
        "base_multiple": base_multiple,
        "required_mos_pct": int(required_mos * 100),
        "spread": spread_display,
        "key_metrics_display": key_metrics_display,
        "flags": flags,
        "summary_counts": {
            "green": green_count,
            "yellow": yellow_count,
            "red": red_count
        },
        "verdict": verdict,
        "verdict_title": verdict_title,
        "verdict_badge": verdict_badge,
        "action_plan": action_plan,
        "target_weight": target_weight
    }
