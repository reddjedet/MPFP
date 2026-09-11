from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.fixed_income_service import fetch_yield_curve, calc_spread, fetch_lecaps
import pandas as pd
import numpy as np

router = APIRouter()

def _bond_type(ticker: str) -> str:
    ticker_upper = ticker.upper()
    if ticker_upper.startswith("GD") or ticker_upper.startswith("BP"):
        return "Ley NY"
    elif ticker_upper.startswith("AL") or ticker_upper.startswith("AE"):
        return "Ley Local"
    return "Ley Local"

@router.get("/curve", response_class=JSONResponse)
@router.get("/curve_json", response_class=JSONResponse)
@router.get("/data_json", response_class=JSONResponse)
def get_yield_curve_json(
    category: str = "lecap",
    ley: str = "Ambas",
    tipo_inst: str = "Todos",
    rem: float = 30.0,
    target_tir: float = 0.0
):
    try:
        cat_clean = (category or "").lower().strip()
        if cat_clean in ["lecap", "lecaps"]:
            df = fetch_lecaps()
            if df is None or df.empty:
                df = pd.DataFrame()
            elif tipo_inst in ["LECAP", "BONCAP", "BONTE"]:
                df = df[df["tipo"] == tipo_inst]
        else:
            df = fetch_yield_curve(cat_clean)
            if df is None or df.empty:
                df = pd.DataFrame()
            else:
                if "tipo" not in df.columns:
                    if "ley" in df.columns:
                        df["tipo"] = df["ley"]
                    elif "ticker" in df.columns:
                        df["tipo"] = df["ticker"].apply(_bond_type)
                if ley in ["Ley NY", "Ley Local"]:
                    df = df[df["tipo"] == ley]
                if target_tir > 0 and not df.empty:
                    df = calc_spread(df, target_tir)

        highlights = {}
        if not df.empty:
            tir_col = "tea" if "tea" in df.columns else ("tir" if "tir" in df.columns else ("tir_real" if "tir_real" in df.columns else None))
            if tir_col:
                df_v = df[df[tir_col].notna() & (df[tir_col] > 0)]
                if not df_v.empty:
                    idx = df_v[tir_col].idxmax()
                    r = df.loc[idx]
                    highlights["best_tir"] = {"ticker": str(r["ticker"]), "val": f"{float(r[tir_col]):.1f}%"}

            if "paridad" in df.columns:
                df_p = df[df["paridad"].notna() & (df["paridad"] > 0)]
                if not df_p.empty:
                    idx = df_p["paridad"].idxmin()
                    r = df.loc[idx]
                    highlights["lowest_parity"] = {"ticker": str(r["ticker"]), "val": f"{float(r['paridad']):.1f}%"}

            if "monto" in df.columns:
                df_m = df[df["monto"].notna() & (df["monto"] > 0)]
                if not df_m.empty:
                    idx = df_m["monto"].idxmax()
                    r = df.loc[idx]
                    moneda = str(r.get("moneda", "")).upper()
                    cur_sym = "U$" if (cat_clean not in ["lecap", "lecaps"] and (moneda == "USD" or cat_clean in ["hard_dollar", "soberanos", "soberano", "bopreal"])) else "A$"
                    highlights["most_liquid"] = {"ticker": str(r["ticker"]), "val": f"{cur_sym} {float(r['monto'])/1_000_000:.1f}M"}

        df_clean = df.copy()
        df_clean = df_clean.replace({np.nan: None})
        records = df_clean.to_dict(orient="records")

        scatter_points = []
        curve_line = []
        if not df.empty and "md" in df.columns:
            y_col = "tea" if "tea" in df.columns else ("tir" if "tir" in df.columns else "tir_real")
            df_sorted = df.sort_values(by="md").dropna(subset=["md"])
            for _, row in df_sorted.iterrows():
                y_val = row.get(y_col)
                if pd.notna(y_val):
                    md_val = float(row["md"])
                    pos = row.get("posicion_curva")
                    pos_str = str(pos) if pd.notna(pos) else "neutral"
                    precio_val = row.get("precio")
                    paridad_val = row.get("paridad")
                    spread_val = row.get("spread_curva_bps")
                    teorica_val = row.get("teorica")

                    scatter_points.append({
                        "ticker": str(row.get("ticker", "")),
                        "md": round(md_val, 2),
                        "yield_val": round(float(y_val), 2),
                        "posicion_curva": pos_str,
                        "precio": float(precio_val) if pd.notna(precio_val) else None,
                        "paridad": float(paridad_val) if pd.notna(paridad_val) else None,
                        "spread_curva_bps": int(spread_val) if pd.notna(spread_val) else None
                    })
                    if pd.notna(teorica_val):
                        curve_line.append([round(md_val, 2), round(float(teorica_val), 2)])

        return JSONResponse({
            "category": category,
            "ley": ley,
            "tipo_inst": tipo_inst,
            "highlights": highlights,
            "scatter_points": scatter_points,
            "curve_line": curve_line,
            "table_data": records
        })
    except Exception as e:
        return JSONResponse({"error": str(e), "category": category, "highlights": {}, "scatter_points": [], "curve_line": [], "table_data": []})
