---
created: <% tp.file.creation_date("YYYY-MM-DD HH:mm") %>
tags:
  - note
  - journal
  - data-science
  - modern-portfolio-theory
  - markowitz
  - monte-carlo
  - risk-management
  - var
  - cvar
---

> [!TIP] Backlinks:
> - [[docs/data_science/README|Índice de Data Science]]
> - [[services/markowitz_service.py|Servicio Markowitz & Monte Carlo]]
> - [[frontend/src/components/MarkowitzLab|Vista Interactiva MarkowitzLab]]
> - [[modern-portfolio-theory|Teoría Moderna de Portafolios]]
> - [[monte-carlo-simulation|Simulaciones de Monte Carlo]]
> - [[sharpe-ratio|Ratio de Sharpe & Tangencia]]
> - [[value-at-risk|Value at Risk (VaR 95%)]]
> - [[conditional-value-at-risk|Conditional Value at Risk (CVaR / Expected Shortfall)]]
> - [[covariance-matrix|Matriz de Covarianza & Correlación]]
> - [[instructivo|Instructivo General]]

---

# 📊 01. Optimización de Carteras de Markowitz & Simulación de Monte Carlo

## 📌 1. Resumen: Qué, Cómo y Por Qué

* **¿Qué es?** 
  Es un cálculo para encontrar la mejor combinación de porcentajes de inversión entre varias acciones, buscando la mayor ganancia esperada con la menor variación de precios posible.
* **¿Cómo funciona?** 
  El sistema genera 4.000 combinaciones de inversión con porcentajes al azar. Para cada una, calcula la ganancia anual promedio y la oscilación de precios (volatilidad). Luego, las ubica en un gráfico y encuentra la combinación con mejor rendimiento por unidad de riesgo.
* **¿Por qué se usa?** 
  Porque tener muchas acciones no garantiza reducir el riesgo si todas bajan al mismo tiempo ante un mismo evento de mercado. Este método analiza cómo se mueven los precios de cada acción en relación con las demás para encontrar combinaciones equilibradas y medir el riesgo de pérdidas en días difíciles con métricas como VaR y CVaR.

---

## 🔍 2. Explicación Paso a Paso del Proceso

### 1. Los Datos de Entrada (Precios y Rendimientos)
El modelo toma el historial de precios de cierre diarios de las acciones seleccionadas. Para cada activo, calcula su rendimiento diario como el cambio porcentual de precio de un día al siguiente.

Con estos rendimientos diarios, se obtienen dos medidas estadísticas clave:
1. **Rendimiento anual promedio:** El promedio de retornos diarios multiplicado por 252 (la cantidad de días hábiles en un año financiero).
2. **Matriz de covarianzas:** Una tabla que mide en qué grado dos acciones tienden a subir o bajar juntas. Si dos acciones se mueven en direcciones opuestas o de forma independiente, combinarlas reduce la oscilación total de la cartera.

---

### 2. La Simulación de Monte Carlo
En lugar de resolver ecuaciones complejas a mano, la computadora genera 4.000 carteras de prueba en segundos:
1. Asigna un porcentaje al azar a cada acción (por ejemplo: 15% a Apple, 30% a Microsoft, etc.).
2. Normaliza los números para que la suma de todos los porcentajes dé exactamente 100%.
3. Calcula la ganancia esperada de la cartera ($E[R_p]$) y su volatilidad anual ($\sigma_p$).

---

### 3. El Ratio de Sharpe y la Selección de Carteras
Para saber qué cartera es mejor que otra, se utiliza el **Ratio de Sharpe**:
$$ \text{Ratio de Sharpe} = \frac{\text{Ganancia de la Cartera} - \text{Tasa Libre de Riesgo}}{\text{Volatilidad de la Cartera}} $$

* **Tasa Libre de Riesgo ($R_f$):** Es la tasa que paga una inversión de mínimo riesgo (como bonos del Tesoro de EE.UU., típicamente alrededor del 4% anual).
* **Interpretación:** Cuanto más alto es el Ratio de Sharpe, más ganancia se obtiene por cada punto de oscilación de precios que se asume.

El sistema identifica dos carteras destacadas:
1. **Cartera de Máximo Sharpe (Óptima):** La combinación que entrega el valor de Sharpe más alto de las 4.000 probadas.
2. **Cartera de Mínima Volatilidad:** La combinación que logra la menor oscilación de precios posible de todas las opciones simuladas.

---

### 4. Medición del Riesgo en Días Difíciles (VaR y CVaR al 95%)

Para medir qué tan grande puede ser una pérdida en un mal día de mercado, se aplican dos métricas estadísticas sobre el historial de la cartera:

1. **Value at Risk ($VaR_{95\%}$ a 1 día):** 
   * Se ordenan todos los rendimientos diarios históricos de menor a mayor.
   * Se toma el valor que se ubica en el peor 5% de los días (percentil 5).
   * **Significado:** En el 95% de los días habituales de mercado, la pérdida diaria no superará este porcentaje.
2. **Conditional Value at Risk ($CVaR_{95\%}$ / Expected Shortfall):**
   * Es el promedio de las pérdidas registradas en ese 5% de los peores días de la historia.
   * **Significado:** Si ocurre un día muy malo que supera el límite del VaR, esta métrica indica cuánto se pierde en promedio en esos escenarios extremos.

---

## 💻 3. Código en Python Utilizado en el Proyecto

El siguiente fragmento corresponde a la función en `services/markowitz_service.py` que realiza este cálculo:

```python
import numpy as np
import pandas as pd

def simulate_monte_carlo(
    returns_df: pd.DataFrame, 
    num_simulations: int = 4000, 
    rf_rate: float = 0.04
) -> dict:
    num_assets = returns_df.shape[1]
    mean_returns = returns_df.mean() * 252
    cov_matrix = returns_df.cov() * 252
    
    # 1. Generar 4.000 combinaciones de pesos al azar que sumen 100%
    raw_weights = np.random.random((num_simulations, num_assets))
    weights_matrix = raw_weights / np.sum(raw_weights, axis=1)[:, np.newaxis]
    
    # 2. Calcular rendimiento y volatilidad para cada una de las 4.000 carteras
    portfolio_returns = np.dot(weights_matrix, mean_returns)
    portfolio_volatilities = np.sqrt(
        np.sum(np.dot(weights_matrix, cov_matrix) * weights_matrix, axis=1)
    )
    
    # 3. Calcular el Ratio de Sharpe de cada cartera
    sharpe_ratios = (portfolio_returns - rf_rate) / portfolio_volatilities
    
    # 4. Encontrar las dos mejores combinaciones
    idx_max_sharpe = np.argmax(sharpe_ratios)
    idx_min_vol = np.argmin(portfolio_volatilities)
    
    return {
        "max_sharpe": {
            "return": float(portfolio_returns[idx_max_sharpe]),
            "volatility": float(portfolio_volatilities[idx_max_sharpe]),
            "sharpe": float(sharpe_ratios[idx_max_sharpe]),
            "weights": weights_matrix[idx_max_sharpe].tolist()
        },
        "min_volatility": {
            "return": float(portfolio_returns[idx_min_vol]),
            "volatility": float(portfolio_volatilities[idx_min_vol]),
            "sharpe": float(sharpe_ratios[idx_min_vol]),
            "weights": weights_matrix[idx_min_vol].tolist()
        }
    }

def calculate_tail_risk(returns_df: pd.DataFrame, weights: np.ndarray) -> dict:
    """Calcula el VaR y el CVaR al 95% de confianza."""
    # Rendimiento diario histórico de la cartera con sus pesos
    daily_returns = returns_df.dot(weights)
    
    # Peor 5% de los días (VaR 95%)
    var_95 = float(-np.percentile(daily_returns, 5))
    
    # Pérdida promedio en los días que superaron el VaR (CVaR 95%)
    worst_days = daily_returns[daily_returns <= -var_95]
    cvar_95 = float(-worst_days.mean()) if len(worst_days) > 0 else var_95
    
    return {
        "var_95": round(var_95 * 100, 2),
        "cvar_95": round(cvar_95 * 100, 2)
    }
```

---

## 📱 4. Aplicación Práctica en la App
* **Pantalla:** Pestaña **Laboratorio Markowitz** (`MarkowitzLab.tsx`).
* **Cómo se usa:** Puedes elegir cualquiera de tus carteras guardadas o ingresar una lista de acciones separadas por coma. El sistema ejecuta la simulación, muestra los 4.000 puntos en pantalla y te entrega los porcentajes ideales sugeridos para maximizar el rendimiento o minimizar las oscilaciones.
