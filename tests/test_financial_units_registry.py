import pytest
from services.financial_units import (
    is_fixed_income_ticker, to_unit_price, to_market_quote, KNOWN_FIXED_INCOME_TICKERS,
)
from services.fixed_income_service import (
    LECAP_BONCAP_SPECS, HARD_DOLLAR_BONDS, BOPREAL_BONDS,
)


def test_todo_lo_de_lecap_boncap_specs_es_renta_fija():
    faltantes = [t for t in LECAP_BONCAP_SPECS if not is_fixed_income_ticker(t)]
    assert faltantes == [], f"Tickers de renta fija no detectados: {faltantes}"


def test_soberanos_y_bopreal_son_renta_fija():
    for t in list(HARD_DOLLAR_BONDS) + list(BOPREAL_BONDS):
        assert is_fixed_income_ticker(t), t


def test_registro_y_specs_estan_sincronizados():
    assert KNOWN_FIXED_INCOME_TICKERS >= set(LECAP_BONCAP_SPECS) | set(HARD_DOLLAR_BONDS) | set(BOPREAL_BONDS)


@pytest.mark.parametrize("ticker,raw,esperado_unit", [
    ("TMF27", 250.0, 2.5),     # Bug 1: falso negativo -> ×100
    ("TTD26", 250.0, 2.5),
    ("TY30P", 368.0, 3.68),
    ("S30S6", 112.08, 1.1208),
    ("S30S6", 1.11, 1.11),
    ("AL30",  58.5, 0.585),
])
def test_to_unit_price_con_ticker(ticker, raw, esperado_unit):
    assert to_unit_price(raw, ticker=ticker) == pytest.approx(esperado_unit, rel=1e-6)


def test_to_unit_price_precision_no_se_trunca_a_2_decimales():
    # Bug 2: round(p, 2) destruía precisión en la rama equity
    assert to_unit_price(1234.567, ticker="GGAL") == pytest.approx(1234.567, rel=1e-6)


def test_conversion_sin_ticker_emite_warning(recwarn):
    to_unit_price(250.0)   # sin ticker
    assert any("sin ticker" in str(w.message).lower() for w in recwarn)
