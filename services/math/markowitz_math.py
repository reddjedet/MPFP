import numpy as np
import scipy.optimize as sco
from typing import Tuple, List

def safe_div(n, d):
    return n / d if d != 0 else 0

def optimize_min_volatility(cov: np.ndarray) -> np.ndarray:
    """Calcula los pesos de la cartera de Mínima Varianza Global (Long-Only) usando scipy."""
    n = cov.shape[0]
    args = (cov,)
    
    def min_vol(w, cov_mat):
        return np.sqrt(np.dot(w.T, np.dot(cov_mat, w)))
        
    bounds = tuple((0.0, 1.0) for _ in range(n))
    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0})
    # Cannot easily use safe_div here as it's array / scalar, which works naturally, but let's just do np.ones(n)/n
    initial_guess = np.ones(n) / n if n > 0 else np.ones(n)
    
    result = sco.minimize(min_vol, initial_guess, args=args,
                          method='SLSQP', bounds=bounds, constraints=constraints)
    return result.x

def optimize_max_sharpe(mu: np.ndarray, cov: np.ndarray, rf: float) -> np.ndarray:
    """Calcula los pesos de la cartera de Máximo Ratio de Sharpe (Cartera Tangente) usando scipy."""
    n = len(mu)
    args = (mu, cov, rf)
    
    def neg_sharpe(w, mu_vec, cov_mat, rf_rate):
        ret = np.dot(w, mu_vec)
        vol = np.sqrt(np.dot(w.T, np.dot(cov_mat, w)))
        if vol == 0:
            return 0
        return -(ret - rf_rate) / vol if vol != 0 else 0
        
    bounds = tuple((0.0, 1.0) for _ in range(n))
    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0})
    initial_guess = np.ones(n) / n if n > 0 else np.ones(n)
    
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
    last_w = np.ones(n) / n if n > 0 else np.ones(n)
    
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
