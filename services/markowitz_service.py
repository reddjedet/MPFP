"""
Módulo de Optimización de Carteras de Markowitz (Media-Varianza) - MPFP (Máquina de Planes, Finanzas y Portfolios)
Implementa:
- Descarga y estimación de rendimientos esperados y matriz de covarianzas.
- Simulación Monte Carlo de miles de carteras aleatorias.
- Optimización con Proyección en el Símplice para Mínima Varianza y Máximo Sharpe.
- Trazado de la Frontera Eficiente y Línea de Asignación de Capital (CAL).
- Series Temporales de Rendimientos Acumulados (Activos individuales vs. Carteras Óptimas).
- Matriz de Correlación Cruzada (Heatmap).
- Exportación limpia de matrices, puntos de simulación y series para renderizado en Apache ECharts.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf
from typing import Dict, List, Any, Optional, Tuple
import logging
from datetime import datetime

from services.cache_service import smart_cache
from services.security_service import sanitize_ticker

logger = logging.getLogger(__name__)

# Parámetros por defecto
DEFAULT_RF_RATE = 0.04  # 4.0% Tasa libre de riesgo anual
ANNUAL_TRADING_DAYS = 252

import scipy.optimize as sco

def optimize_min_volatility(cov: np.ndarray) -> np.ndarray:
    """Calcula los pesos de la cartera de Mínima Varianza Global (Long-Only) usando scipy."""
    n = cov.shape[0]
    args = (cov,)
    
    def min_vol(w, cov_mat):
        return np.sqrt(np.dot(w.T, np.dot(cov_mat, w)))
        
    bounds = tuple((0.0, 1.0) for _ in range(n))
    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0})
    initial_guess = np.ones(n) / n
    
    result = sco.minimize(min_vol, initial_guess, args=args,
                          method='SLSQP', bounds=bounds, constraints=constraints)
    return result.x

def optimize_max_sharpe(mu: np.ndarray, cov: np.ndarray, rf: float = DEFAULT_RF_RATE) -> np.ndarray:
    """Calcula los pesos de la cartera de Máximo Ratio de Sharpe (Cartera Tangente) usando scipy."""
    n = len(mu)
    args = (mu, cov, rf)
    
    def neg_sharpe(w, mu_vec, cov_mat, rf_rate):
        ret = np.dot(w, mu_vec)
        vol = np.sqrt(np.dot(w.T, np.dot(cov_mat, w)))
        if vol == 0:
            return 0
        return -(ret - rf_rate) / vol
        
    bounds = tuple((0.0, 1.0) for _ in range(n))
    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0})
    initial_guess = np.ones(n) / n
    
    result = sco.minimize(neg_sharpe, initial_guess, args=args,
                          method='SLSQP', bounds=bounds, constraints=constraints)
    return result.x

def calculate_efficient_frontier_curve(
    mu: np.ndarray, 
    cov: np.ndarray, 
    r_min: float, 
    r_max: float, 
    n_points: int = 35
) -> Tuple[List[float], List[float], List[np.ndarray]]:
    """Calcula la curva de la Frontera Eficiente minimizando la varianza para niveles de retorno objetivo."""
    n = len(mu)
    max_feasible_return = float(np.max(mu))
    r_max = min(r_max, max_feasible_return)
    if r_max <= r_min:
        r_max = r_min + 1e-4
    target_rets = np.linspace(r_min, r_max, n_points)
    ef_vols = []
    ef_rets = []
    ef_weights = []
    
    bounds = tuple((0.0, 1.0) for _ in range(n))
    last_w = np.ones(n) / n
    
    def port_vol(w):
        return np.sqrt(np.dot(w.T, np.dot(cov, w)))
        
    for tr in target_rets:
        constraints = (
            {'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0},
            {'type': 'eq', 'fun': lambda x: np.dot(x, mu) - tr}
        )
        res = sco.minimize(port_vol, last_w, method='SLSQP', bounds=bounds, constraints=constraints)
        
        if res.success and res.fun > 0:
            calc_ret = float(np.dot(res.x, mu))
            if abs(calc_ret - tr) < 0.005:
                last_w = res.x
                ef_vols.append(float(res.fun))
                ef_rets.append(calc_ret)
                ef_weights.append(res.x)
            
    # Garantizar ordenamiento estrictamente ascendente por retorno para evitar lazos o cuerdas
    if ef_rets:
        sorted_indices = np.argsort(ef_rets)
        ef_vols = [ef_vols[i] for i in sorted_indices]
        ef_rets = [ef_rets[i] for i in sorted_indices]
        ef_weights = [ef_weights[i] for i in sorted_indices]

    return ef_vols, ef_rets, ef_weights

def resolve_calendar_start_date(period: str) -> str:
    """
    Resuelve la fecha de inicio anclada al 1 de Enero del año correspondiente:
    - '1y' o 'ytd': 01/01 del año en curso (ej. 2026-01-01)
    - '2y': 01/01 de hace 1 año (ej. 2025-01-01, cubriendo 2025 y 2026)
    - '3y': 01/01 de hace 2 años (ej. 2024-01-01, cubriendo 2024, 2025 y 2026)
    - '5y': 01/01 de hace 4 años (ej. 2022-01-01, cubriendo 2022 a 2026)
    - '10y': 01/01 de hace 9 años (ej. 2017-01-01, cubriendo 2017 a 2026)
    """
    now = datetime.now()
    clean_p = (period or "2y").strip().lower()
    if clean_p in ("1y", "ytd"):
        start_year = now.year
    elif clean_p == "2y":
        start_year = now.year - 1
    elif clean_p == "3y":
        start_year = now.year - 2
    elif clean_p == "5y":
        start_year = now.year - 4
    elif clean_p in ("10y", "max"):
        start_year = now.year - 9
    else:
        start_year = now.year - 1
    return f"{start_year}-01-01"

@smart_cache("historical")
def fetch_historical_returns_and_cov(
    tickers: tuple[str, ...], 
    period: str = "2y"
) -> Tuple[np.ndarray, np.ndarray, pd.DataFrame, List[str], pd.DataFrame, pd.Series]:
    """
    Descarga precios históricos diarios y calcula retornos esperados anualizados,
    matriz de covarianza y el DataFrame de retornos diarios con fechas reales,
    junto con la serie de benchmark SPY.
    """
    clean_tickers = [sanitize_ticker(t) for t in tickers if sanitize_ticker(t)]
    clean_tickers = list(dict.fromkeys(clean_tickers))
    if not clean_tickers:
        clean_tickers = ["SPY", "QQQ", "AAPL", "MSFT"]
        
    fetch_tickers = list(clean_tickers)
    if "SPY" not in fetch_tickers:
        fetch_tickers.append("SPY")

    start_date = resolve_calendar_start_date(period)

    price_df = pd.DataFrame()
    try:
        yf_tickers = ["BRK-B" if t == "BRKB" else t for t in fetch_tickers]
        data = yf.download(yf_tickers, start=start_date, interval="1d", progress=False)
        if not data.empty and "Close" in data:
            price_df = data["Close"]
            if isinstance(price_df, pd.Series):
                price_df = price_df.to_frame(name=fetch_tickers[0])
            price_df.columns = [c.replace("BRK-B", "BRKB") for c in price_df.columns]
    except Exception as e:
        logger.warning(f"No se pudieron descargar datos de yfinance para Markowitz: {e}")
        
    valid_tickers = []
    daily_returns = pd.DataFrame()
    spy_returns = pd.Series(dtype=float)

    if not price_df.empty:
        price_df = price_df.dropna(how="all").ffill().bfill()
        for tk in clean_tickers:
            if tk in price_df.columns and len(price_df[tk].dropna()) > 20:
                valid_tickers.append(tk)
        if len(valid_tickers) >= 2:
            daily_returns = price_df[valid_tickers].pct_change().dropna()
        if "SPY" in price_df.columns and len(price_df["SPY"].dropna()) > 20:
            spy_returns = price_df["SPY"].pct_change().dropna()
            
    # Fallback determinista y realista si yfinance no devuelve datos suficientes
    if daily_returns.empty or len(valid_tickers) < 2:
        valid_tickers = clean_tickers if len(clean_tickers) >= 2 else ["SPY", "QQQ", "AAPL", "MSFT"]
        n = len(valid_tickers)
        seed = sum(ord(c) for tk in valid_tickers for c in tk) % 10000
        rng = np.random.default_rng(seed)
        
        start_dt = pd.Timestamp(start_date)
        dates = pd.date_range(start=start_dt, end=pd.Timestamp.today(), freq='B')
        if len(dates) < 20:
            dates = pd.date_range(end=pd.Timestamp.today(), periods=252, freq='B')
        base_vols = rng.uniform(0.15, 0.35, n)
        base_returns = rng.uniform(0.10, 0.26, n)
        corr_matrix = np.eye(n) * 0.65 + 0.35
        cov_matrix = np.outer(base_vols, base_vols) * corr_matrix
        
        # Simular serie temporal diaria coherente
        daily_cov = cov_matrix / ANNUAL_TRADING_DAYS
        daily_mu = base_returns / ANNUAL_TRADING_DAYS
        sim_rets = rng.multivariate_normal(daily_mu, daily_cov, size=len(dates))
        daily_returns = pd.DataFrame(sim_rets, index=dates, columns=valid_tickers)
        corr_df = pd.DataFrame(corr_matrix, index=valid_tickers, columns=valid_tickers)

        spy_sim = rng.normal(0.12 / ANNUAL_TRADING_DAYS, 0.16 / np.sqrt(ANNUAL_TRADING_DAYS), size=len(dates))
        spy_returns = pd.Series(spy_sim, index=dates, name="SPY")
        return base_returns, cov_matrix, corr_df, valid_tickers, daily_returns, spy_returns

    if spy_returns.empty or len(spy_returns) < 20:
        spy_seed = 8888
        spy_rng = np.random.default_rng(spy_seed)
        spy_sim = spy_rng.normal(0.12 / ANNUAL_TRADING_DAYS, 0.16 / np.sqrt(ANNUAL_TRADING_DAYS), size=len(daily_returns.index))
        spy_returns = pd.Series(spy_sim, index=daily_returns.index, name="SPY")
    else:
        spy_returns = spy_returns.reindex(daily_returns.index).ffill().bfill()

    mean_daily = daily_returns.mean().values
    annual_returns = mean_daily * ANNUAL_TRADING_DAYS
    
    # James-Stein Shrinkage (Retornos Esperados)
    # Contraemos los retornos hacia la media global para reducir sobreajuste a ganadores recientes
    grand_mean = np.mean(annual_returns)
    shrinkage_mu = 0.5  # 50% muestra, 50% media global
    annual_returns_shrunk = (1.0 - shrinkage_mu) * annual_returns + shrinkage_mu * grand_mean
    
    cov_daily = daily_returns.cov().values
    annual_cov = cov_daily * ANNUAL_TRADING_DAYS
    corr_df = daily_returns.corr()
    
    # Ledoit-Wolf Style Covariance Shrinkage (Hacia correlación constante)
    n_assets = len(valid_tickers)
    if n_assets > 1:
        corr_matrix = corr_df.values
        mask = ~np.eye(n_assets, dtype=bool)
        avg_corr = np.mean(corr_matrix[mask]) if n_assets > 1 else 1.0
        
        vols = np.sqrt(np.diag(annual_cov))
        target_cov = np.outer(vols, vols) * avg_corr
        np.fill_diagonal(target_cov, vols**2)
        
        shrinkage_cov = 0.3  # 70% muestra, 30% correlación constante
        annual_cov_shrunk = (1.0 - shrinkage_cov) * annual_cov + shrinkage_cov * target_cov
    else:
        annual_cov_shrunk = annual_cov
    
    return annual_returns_shrunk, annual_cov_shrunk, corr_df, valid_tickers, daily_returns, spy_returns

def calculate_portfolio_performance_stats(
    ret_series: pd.Series, 
    rf_rate: float = DEFAULT_RF_RATE, 
    benchmark_series: Optional[pd.Series] = None
) -> Dict[str, Any]:
    """
    Calcula estadísticas cuantitativas globales de desempeño (estándar Portfolio Visualizer):
    CAGR, Volatilidad anualizada, Sharpe (ex-post), Sortino, Max Drawdown, Calmar,
    desglose de retornos por año calendario, y métricas activas contra benchmark (SPY).
    """
    if ret_series is None or ret_series.empty:
        return {}

    clean_ret = ret_series.dropna()
    n_days = len(clean_ret)
    if n_days == 0:
        return {}

    years = max(n_days / ANNUAL_TRADING_DAYS, 1.0 / ANNUAL_TRADING_DAYS)

    # 1. Crecimiento acumulado y Saldo final (base $10,000 USD)
    cum_growth = (1.0 + clean_ret).cumprod()
    total_return = float(cum_growth.iloc[-1] - 1.0)
    start_balance = 10000.0
    end_balance = start_balance * (1.0 + total_return)

    # 2. CAGR (Compound Annual Growth Rate)
    if total_return > -1.0 and years > 0:
        cagr = float((1.0 + total_return) ** (1.0 / years) - 1.0)
    else:
        cagr = -1.0

    # 3. Volatilidad Anualizada
    daily_vol = float(clean_ret.std(ddof=1)) if n_days > 1 else 0.0
    annual_vol = daily_vol * np.sqrt(ANNUAL_TRADING_DAYS)

    # 4. Máximo Drawdown
    running_max = cum_growth.cummax()
    drawdowns = (cum_growth - running_max) / (running_max + 1e-12)
    max_dd = float(drawdowns.min()) if not drawdowns.empty else 0.0

    # 5. Sharpe Ratio (ex-post)
    sharpe = (cagr - rf_rate) / (annual_vol + 1e-8)

    # 6. Downside Deviation & Sortino Ratio
    # Penaliza únicamente retornos negativos (< 0)
    negative_returns = np.minimum(0.0, clean_ret.values)
    downside_dev = float(np.sqrt(np.mean(negative_returns ** 2)) * np.sqrt(ANNUAL_TRADING_DAYS))
    sortino = (cagr - rf_rate) / (downside_dev + 1e-8)

    # 7. Calmar Ratio
    calmar = (cagr / abs(max_dd)) if abs(max_dd) > 1e-4 else 0.0

    # 8. Retornos por Año Calendario
    annual_returns_dict = {}
    if hasattr(clean_ret.index, "year"):
        grouped = clean_ret.groupby(clean_ret.index.year)
        for year, group in grouped:
            year_ret = float((1.0 + group).prod() - 1.0)
            annual_returns_dict[int(year)] = round(year_ret * 100.0, 2)

    best_year = None
    worst_year = None
    if annual_returns_dict:
        sorted_years = sorted(annual_returns_dict.items(), key=lambda x: x[1])
        worst_year = {"year": int(sorted_years[0][0]), "return": sorted_years[0][1]}
        best_year = {"year": int(sorted_years[-1][0]), "return": sorted_years[-1][1]}

    stats: Dict[str, Any] = {
        "start_balance": start_balance,
        "end_balance": round(end_balance, 2),
        "total_return": round(total_return * 100.0, 2),
        "cagr": round(cagr * 100.0, 2),
        "volatility": round(annual_vol * 100.0, 2),
        "sharpe": round(float(sharpe), 2),
        "sortino": round(float(sortino), 2),
        "max_drawdown": round(max_dd * 100.0, 2),
        "calmar": round(float(calmar), 2),
        "best_year": best_year,
        "worst_year": worst_year,
        "annual_returns": annual_returns_dict
    }

    # 9. Métricas Activas vs Benchmark (si se provee)
    if benchmark_series is not None and not benchmark_series.empty:
        common_idx = clean_ret.index.intersection(benchmark_series.index)
        if len(common_idx) > 20:
            p_sub = clean_ret.loc[common_idx]
            b_sub = benchmark_series.loc[common_idx]

            b_total = float((1.0 + b_sub).prod() - 1.0)
            sub_years = len(common_idx) / ANNUAL_TRADING_DAYS
            b_cagr = float((1.0 + b_total) ** (1.0 / sub_years) - 1.0) if (b_total > -1.0 and sub_years > 0) else 0.0

            p_total = float((1.0 + p_sub).prod() - 1.0)
            p_cagr = float((1.0 + p_total) ** (1.0 / sub_years) - 1.0) if (p_total > -1.0 and sub_years > 0) else 0.0

            active_return = (p_cagr - b_cagr) * 100.0
            excess_daily = p_sub - b_sub
            tracking_error = float(excess_daily.std(ddof=1) * np.sqrt(ANNUAL_TRADING_DAYS)) * 100.0
            information_ratio = (active_return / tracking_error) if tracking_error > 1e-4 else 0.0

            stats["active_return"] = round(active_return, 2)
            stats["tracking_error"] = round(tracking_error, 2)
            stats["information_ratio"] = round(information_ratio, 2)

    return stats

def calculate_candidate_rsi(
    weights_dict: Dict[str, float], 
    daily_returns: Optional[pd.DataFrame] = None
) -> Optional[Dict[str, Any]]:
    """Calcula el RSI ponderado por capital de una cartera candidata con fallback determinista."""
    if not weights_dict:
        return None
        
    tickers = [tk for tk, w in weights_dict.items() if w > 0]
    if not tickers:
        return None
        
    # Obtener RSI actual vía pool de CEDEARs si está disponible
    cedear_data = {}
    try:
        from services.cedear_service import get_multiple_tickers_data, calculate_rsi
        cedear_data = get_multiple_tickers_data(tickers)
    except Exception as e:
        logger.warning(f"No se pudieron descargar RSIs para cartera candidata: {e}")
        
    valid_items = []
    for tk, w in weights_dict.items():
        if w <= 0:
            continue
        rsi_val = None
        if tk in cedear_data and cedear_data[tk].get("rsi") is not None:
            rsi_val = cedear_data[tk]["rsi"]
        elif daily_returns is not None and tk in daily_returns.columns and len(daily_returns[tk].dropna()) >= 15:
            try:
                from services.cedear_service import calculate_rsi
                price_proxy = (1.0 + daily_returns[tk].dropna()).cumprod()
                rsi_series = calculate_rsi(price_proxy)
                if not rsi_series.dropna().empty:
                    rsi_val = float(rsi_series.dropna().iloc[-1])
            except Exception:
                pass
                
        if rsi_val is not None:
            valid_items.append({"ticker": tk, "rsi": rsi_val, "value": w})
            
    if not valid_items:
        return None
        
    total_val = sum(item["value"] for item in valid_items)
    weighted_rsi = sum(item["rsi"] * item["value"] for item in valid_items) / total_val if total_val > 0 else sum(item["rsi"] for item in valid_items) / len(valid_items)
    simple_rsi = sum(item["rsi"] for item in valid_items) / len(valid_items)
    
    w_rounded = round(weighted_rsi, 1)
    if w_rounded > 65.0:
        status = "Sobrecomprado"
        color = "#FF5252"
        show_status = True
    elif w_rounded < 35.0:
        status = "Sobrevendido (Oportunidad)"
        color = "#00E676"
        show_status = True
    else:
        status = "Neutral"
        color = "#81D4FA"
        show_status = False
        
    return {
        "weighted": w_rounded,
        "simple": round(simple_rsi, 1),
        "status": status,
        "color": color,
        "show_status": show_status,
        "percentage": min(100.0, max(0.0, w_rounded)),
        "valid_count": len(valid_items),
        "total_count": len(weights_dict)
    }

def calculate_candidate_alpha(weights_dict: Dict[str, float]) -> Dict[str, Any]:
    """Calcula Alpha activo vs SPY en ventanas 3M, 6M, YTD y 1A para una cartera candidata."""
    if not weights_dict:
        return {}
    try:
        from services.tv_service import fetch_performance
        from services.portfolio_service import _portfolio_agg
        all_tickers = list(weights_dict.keys()) + ["SPY"]
        perf_data = fetch_performance(all_tickers)
        if not perf_data:
            return {}
        lookup = {r.get("name", "").upper(): r for r in perf_data}
        spy_data = lookup.get("SPY", {})
        periods_map = {"Perf.3M": "3M", "Perf.6M": "6M", "Perf.YTD": "YTD", "Perf.Y": "1A"}
        summary_perf = {}
        for col, label in periods_map.items():
            portfolio_perf = _portfolio_agg(weights_dict, lookup, col)
            spy_perf = spy_data.get(col)
            if portfolio_perf is not None and spy_perf is not None:
                diff = portfolio_perf - spy_perf
                summary_perf[label] = {
                    "portfolio": round(portfolio_perf, 2),
                    "spy": round(spy_perf, 2),
                    "alpha": round(diff, 2),
                    "formatted": f"{'+' if diff > 0 else ''}{diff:.1f}%",
                    "class": "txt-success" if diff > 0 else "txt-danger"
                }
        return summary_perf
    except Exception as e:
        logger.warning(f"Error calculando alpha para cartera candidata: {e}")
        return {}

def simulate_portfolio_returns(
    daily_returns: pd.DataFrame,
    weights: np.ndarray,
    regime: str = "annual"
) -> pd.Series:
    """
    Simula la serie de retornos diarios de una cartera bajo distintos regímenes de rebalanceo:
    - 'annual': Rebalanceo anual (Portfolio Visualizer style). Al inicio de cada año calendario
                los pesos se restauran al objetivo; dentro del año los activos evolucionan según mercado.
    - 'daily': Rebalanceo diario continuo a los pesos objetivo (modelo vectorial clásico).
    - 'none': Buy & Hold puro desde el inicio sin rebalanceo posterior.
    """
    if daily_returns.empty or len(weights) == 0:
        return pd.Series(dtype=float)
        
    weights = np.asarray(weights, dtype=float)
    total_w = np.sum(weights)
    if total_w > 0:
        weights = weights / total_w
    else:
        weights = np.ones(len(weights)) / len(weights)
        
    regime_clean = (regime or "annual").strip().lower()
    if regime_clean == "daily":
        return daily_returns.dot(weights)
        
    if regime_clean == "none":
        # Buy & Hold desde el día 1
        asset_cum = (1.0 + daily_returns).cumprod()
        port_val = (asset_cum * weights).sum(axis=1)
        port_val_prev = port_val.shift(1).fillna(1.0)
        daily_series = (port_val / port_val_prev) - 1.0
        daily_series.iloc[0] = (port_val.iloc[0] / 1.0) - 1.0
        return daily_series

    # Regime == "annual" (estándar Portfolio Visualizer)
    years = sorted(daily_returns.index.year.unique())
    portfolio_daily_rets = []
    curr_capital = 1.0

    for y in years:
        year_mask = (daily_returns.index.year == y)
        year_rets = daily_returns.loc[year_mask]
        if year_rets.empty:
            continue
            
        asset_cum_year = (1.0 + year_rets).cumprod()
        port_val_year = curr_capital * (asset_cum_year * weights).sum(axis=1)
        
        prev_val = curr_capital
        for val in port_val_year:
            portfolio_daily_rets.append((val / prev_val) - 1.0)
            prev_val = val
            
        curr_capital = port_val_year.iloc[-1]

    return pd.Series(portfolio_daily_rets, index=daily_returns.index, name="portfolio_return")

def calculate_markowitz_model(
    tickers: List[str],
    current_weights: Optional[Dict[str, float]] = None,
    period: str = "2y",
    rf_rate: float = DEFAULT_RF_RATE,
    num_simulations: int = 4000,
    include_plot: bool = True,
    rebalance_regime: str = "annual"
) -> Dict[str, Any]:
    """
    Ejecuta el modelo completo de Markowitz, optimizaciones, trayectorias de
    rendimientos acumulados y matrices de correlación.
    """
    mu, cov, corr_df, valid_tickers, daily_returns, spy_returns = fetch_historical_returns_and_cov(tuple(tickers), period=period)
    n_assets = len(valid_tickers)
    
    # 1. Optimización Mínima Volatilidad
    w_min = optimize_min_volatility(cov)
    r_min = float(np.dot(w_min, mu))
    v_min = float(np.sqrt(np.dot(w_min, np.dot(cov, w_min))))
    s_min = (r_min - rf_rate) / (v_min + 1e-8)
    
    # 2. Optimización Máximo Sharpe
    w_ms = optimize_max_sharpe(mu, cov, rf=rf_rate)
    r_ms = float(np.dot(w_ms, mu))
    v_ms = float(np.sqrt(np.dot(w_ms, np.dot(cov, w_ms))))
    s_ms = (r_ms - rf_rate) / (v_ms + 1e-8)
    
    # 3. Simulación Monte Carlo
    rng = np.random.default_rng(42)
    mc_weights = rng.dirichlet(np.ones(n_assets), size=num_simulations)
    mc_rets = np.dot(mc_weights, mu)
    mc_vols = np.sqrt(np.einsum('ij,jk,ik->i', mc_weights, cov, mc_weights))
    mc_sharpes = (mc_rets - rf_rate) / (mc_vols + 1e-8)
    
    # 4. Frontera Eficiente (Curva)
    r_top = float(np.max(mu))
    ef_vols, ef_rets, ef_weights = calculate_efficient_frontier_curve(mu, cov, r_min=r_min, r_max=r_top, n_points=35)
    
    # 5. Cartera Actual (si fue provista)
    curr_point = None
    norm_w_curr = None
    if current_weights:
        raw_w = np.array([current_weights.get(tk, 0.0) for tk in valid_tickers], dtype=float)
        sum_w = np.sum(raw_w)
        if sum_w > 0:
            norm_w_curr = raw_w / sum_w
            r_curr = float(np.dot(norm_w_curr, mu))
            v_curr = float(np.sqrt(np.dot(norm_w_curr, np.dot(cov, norm_w_curr))))
            s_curr = (r_curr - rf_rate) / (v_curr + 1e-8)
            curr_point = {
                "return": r_curr,
                "volatility": v_curr,
                "sharpe": s_curr,
                "weights": {tk: norm_w_curr[i] for i, tk in enumerate(valid_tickers)}
            }
            
    # 6. Tabla de Pesos Óptimos comparativa
    weights_table = []
    for i, tk in enumerate(valid_tickers):
        w_sharpe_val = float(w_ms[i])
        w_min_val = float(w_min[i])
        weights_table.append({
            "ticker": tk,
            "sharpe_weight": w_sharpe_val * 100.0,
            "min_vol_weight": w_min_val * 100.0,
            "sharpe_weight_fmt": f"{w_sharpe_val * 100.0:.2f}%".replace(".", ","),
            "min_vol_weight_fmt": f"{w_min_val * 100.0:.2f}%".replace(".", ",")
        })
    weights_table.sort(key=lambda x: x["ticker"])
    
    # 7. Cálculo de Rendimientos Acumulados (Series Temporales)
    cum_returns_assets = (1.0 + daily_returns).cumprod() - 1.0
    dates_str = [d.strftime('%Y-%m-%d') for d in daily_returns.index]
    
    port_ret_sharpe = simulate_portfolio_returns(daily_returns[valid_tickers], w_ms, regime=rebalance_regime)
    port_ret_min_vol = simulate_portfolio_returns(daily_returns[valid_tickers], w_min, regime=rebalance_regime)
    
    cum_returns_sharpe = (1.0 + port_ret_sharpe).cumprod() - 1.0
    cum_returns_min_vol = (1.0 + port_ret_min_vol).cumprod() - 1.0
    
    port_ret_curr = None
    cum_returns_curr = None
    if norm_w_curr is not None:
        port_ret_curr = simulate_portfolio_returns(daily_returns[valid_tickers], norm_w_curr, regime=rebalance_regime)
        cum_returns_curr = (1.0 + port_ret_curr).cumprod() - 1.0
    # 8. Cálculo de Estadísticas Globales Cuantitativas (Portfolio Visualizer Style)
    stats_sharpe = calculate_portfolio_performance_stats(port_ret_sharpe, rf_rate, benchmark_series=spy_returns)
    stats_min_vol = calculate_portfolio_performance_stats(port_ret_min_vol, rf_rate, benchmark_series=spy_returns)
    stats_curr = calculate_portfolio_performance_stats(port_ret_curr, rf_rate, benchmark_series=spy_returns) if port_ret_curr is not None else None
    stats_spy = calculate_portfolio_performance_stats(spy_returns, rf_rate, benchmark_series=None) if spy_returns is not None and not spy_returns.empty else None

    # 9. Matriz comparativa de retornos por año calendario
    all_years = sorted(list(set(
        list(stats_sharpe.get("annual_returns", {}).keys()) +
        list(stats_min_vol.get("annual_returns", {}).keys()) +
        (list(stats_curr.get("annual_returns", {}).keys()) if stats_curr else []) +
        (list(stats_spy.get("annual_returns", {}).keys()) if stats_spy else [])
    )))
    annual_matrix = []
    for y in all_years:
        annual_matrix.append({
            "year": y,
            "sharpe": stats_sharpe.get("annual_returns", {}).get(y),
            "min_vol": stats_min_vol.get("annual_returns", {}).get(y),
            "cartera_actual": stats_curr.get("annual_returns", {}).get(y) if stats_curr else None,
            "spy": stats_spy.get("annual_returns", {}).get(y) if stats_spy else None,
        })
    
    cal_max_x = max(v_ms * 1.55, float(np.max(mc_vols)) * 0.95)

    # 10. Construcción de Carteras Candidatas Óptimas con Desglose Integral
    def _build_candidate(name: str, weights_arr: np.ndarray, stats_dict: dict) -> dict:
        comp = []
        w_dict = {}
        for i, tk in enumerate(valid_tickers):
            w = float(weights_arr[i])
            w_dict[tk] = round(w, 4)
            if w >= 0.0001:
                comp.append({
                    "ticker": tk,
                    "weight": round(w * 100.0, 2),
                    "weight_fmt": f"{w * 100.0:.2f}%".replace(".", ",")
                })
        comp.sort(key=lambda x: x["weight"], reverse=True)
        rsi_info = calculate_candidate_rsi(w_dict, daily_returns)
        alpha_info = calculate_candidate_alpha(w_dict)
        return {
            "name": name,
            "weights": w_dict,
            "composition": comp,
            "stats": stats_dict,
            "rsi": rsi_info,
            "alpha": alpha_info
        }

    optimal_candidates = {
        "max_sharpe": _build_candidate("Sharpe Óptimo (Cartera Tangente)", w_ms, stats_sharpe),
        "min_volatility": _build_candidate("Mínima Volatilidad (Global Min Variance)", w_min, stats_min_vol),
    }
    if norm_w_curr is not None and stats_curr is not None:
        optimal_candidates["current_portfolio"] = _build_candidate("Cartera Ingresada", norm_w_curr, stats_curr)

    # Estructuración de puntos Monte Carlo enriquecidos con pesos
    mc_points_data = []
    for i in range(len(mc_vols)):
        w_p = {valid_tickers[j]: round(float(mc_weights[i, j]), 4) for j in range(n_assets) if mc_weights[i, j] >= 0.005}
        mc_points_data.append({
            "value": [round(float(mc_vols[i] * 100.0), 2), round(float(mc_rets[i] * 100.0), 2), round(float(mc_sharpes[i]), 3)],
            "weights": w_p
        })

    # Estructuración de puntos de la Frontera Eficiente con pesos
    ef_points_data = []
    for i in range(len(ef_vols)):
        ef_w = ef_weights[i]
        s_val = (ef_rets[i] - rf_rate) / (ef_vols[i] + 1e-8)
        w_p = {valid_tickers[j]: round(float(ef_w[j]), 4) for j in range(n_assets) if ef_w[j] >= 0.005}
        ef_points_data.append({
            "value": [round(float(ef_vols[i] * 100.0), 2), round(float(ef_rets[i] * 100.0), 2), round(float(s_val), 3)],
            "weights": w_p
        })
    
    return {
        "valid_tickers": valid_tickers,
        "max_sharpe": {
            "return": r_ms,
            "volatility": v_ms,
            "sharpe": s_ms,
            "weights": {tk: float(w_ms[i]) for i, tk in enumerate(valid_tickers)}
        },
        "min_volatility": {
            "return": r_min,
            "volatility": v_min,
            "sharpe": s_min,
            "weights": {tk: float(w_min[i]) for i, tk in enumerate(valid_tickers)}
        },
        "current_portfolio": curr_point,
        "optimal_candidates": optimal_candidates,
        "weights_table": weights_table,
        "corr_matrix": corr_df.round(2).to_dict(),
        # Datos para gráfico interactivo de Frontera Eficiente / Monte Carlo en React
        "frontier_data": {
            "mc_points": mc_points_data,
            "efficient_frontier": ef_points_data,
            "cal_line": [
                [0.0, round(float(rf_rate * 100.0), 2)],
                [round(float(cal_max_x * 100.0), 2), round(float((rf_rate + s_ms * cal_max_x) * 100.0), 2)]
            ],
            "max_sharpe_point": {
                "value": [round(float(v_ms * 100.0), 2), round(float(r_ms * 100.0), 2), round(float(s_ms), 3)],
                "weights": {tk: round(float(w_ms[i]), 4) for i, tk in enumerate(valid_tickers)}
            },
            "min_vol_point": {
                "value": [round(float(v_min * 100.0), 2), round(float(r_min * 100.0), 2), round(float(s_min), 3)],
                "weights": {tk: round(float(w_min[i]), 4) for i, tk in enumerate(valid_tickers)}
            },
            "current_portfolio_point": (
                {
                    "value": [round(float(curr_point["volatility"] * 100.0), 2), round(float(curr_point["return"] * 100.0), 2), round(float(curr_point["sharpe"]), 3)],
                    "weights": curr_point["weights"]
                }
                if curr_point else None
            ),
            "assets_points": [
                {
                    "ticker": tk,
                    "vol": round(float(np.sqrt(cov[i, i]) * 100.0), 2),
                    "ret": round(float(mu[i] * 100.0), 2),
                    "sharpe": round(float((mu[i] - rf_rate) / (np.sqrt(cov[i, i]) + 1e-8)), 3)
                }
                for i, tk in enumerate(valid_tickers)
            ]
        },
        # Datos para frontend React
        "time_series": {
            "dates": dates_str,
            "assets_cumulative": {tk: (cum_returns_assets[tk] * 100.0).round(2).tolist() for tk in valid_tickers},
            "portfolios_cumulative": {
                "sharpe_optimo": (cum_returns_sharpe * 100.0).round(2).tolist(),
                "min_volatilidad": (cum_returns_min_vol * 100.0).round(2).tolist(),
                "cartera_actual": (cum_returns_curr * 100.0).round(2).tolist() if cum_returns_curr is not None else None,
                "spy": (((1.0 + spy_returns).cumprod() - 1.0) * 100.0).round(2).tolist() if spy_returns is not None and not spy_returns.empty else None
            }
        },
        "global_stats": {
            "sharpe_optimo": stats_sharpe,
            "min_volatilidad": stats_min_vol,
            "cartera_actual": stats_curr,
            "benchmark_spy": stats_spy,
        },
        "annual_returns_table": annual_matrix,
        "rebalance_regime": rebalance_regime
    }
