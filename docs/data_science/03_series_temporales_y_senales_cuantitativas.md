---
created: <% tp.file.creation_date("YYYY-MM-DD HH:mm") %>
tags:
  - note
  - journal
  - data-science
  - time-series
  - signal-processing
  - wilder-smoothing
  - rsi
  - quantitative-momentum
---

> [!TIP] Backlinks:
> - [[docs/data_science/README|Índice de Data Science]]
> - [[services/cedear_service.py|Servicio CEDEARs & RSI]]
> - [[frontend/src/components/CedearsView|Vista CedearsView]]
> - [[time-series-analysis|Análisis de Series Temporales]]
> - [[exponential-smoothing|Suavizado Exponencial (EWMA)]]
> - [[wilder-rsi|RSI de Wilder]]
> - [[momentum-oscillators|Osciladores de Momentum]]
> - [[instructivo|Instructivo General]]

---

# 📉 03. Procesamiento de Series Temporales & Oscilador de Momentum Wilder (RSI)

## 📌 1. Resumen: Qué, Cómo y Por Qué

* **¿Qué es?** 
  Es un indicador numérico que oscila entre 0 y 100, diseñado para medir la magnitud y velocidad de los cambios recientes en el precio de una acción.
* **¿Cómo funciona?** 
  Toma la serie histórica de precios de cierre diarios de los últimos 6 meses, separa los incrementos diarios de las disminuciones de precio y calcula un promedio ponderado exponencial con la fórmula original de J. Welles Wilder para un período de 14 días.
* **¿Por qué se usa?** 
  Para evaluar el estado técnico de una acción antes de tomar decisiones de compra o venta:
  * Valores **mayores a 65 o 70** indican un estado de **sobrecompra** (el precio ha subido con rapidez durante varios días continuos, aumentando la probabilidad de una pausa o retroceso).
  * Valores **menores a 35 o 30** indican un estado de **sobreventa** (el precio ha acumulado caídas consecutivas, aumentando la probabilidad de estabilización o rebote).

---

## 🔍 2. Explicación Paso a Paso del Proceso

### 1. Cálculo de Cambios Diarios
El proceso comienza calculando la diferencia entre el precio de cierre de hoy y el de la jornada anterior para cada día hábil:
$$ \text{Diferencia de Precio} = \text{Precio de Hoy} - \text{Precio de Ayer} $$

A partir de esta diferencia, se generan dos series separadas:
* **Ganancia ($U$):** Si la diferencia es positiva, se toma ese valor; si fue negativa o cero, se asigna 0.
* **Pérdida ($D$):** Si la diferencia es negativa, se toma su valor absoluto (en positivo); si fue positiva o cero, se asigna 0.

---

### 2. El Método de Suavizado de Wilder (Ponderación Exponencial)
Para promediar las ganancias y pérdidas de los últimos 14 períodos sin que un día pasado desaparezca de golpe al día 15, Wilder definió una media móvil exponencial con un factor de decaimiento constante:
$$ \alpha = \frac{1}{14} \approx 0.0714 $$

La fórmula recursiva que calcula el promedio actual es:
$$ \text{Ganancia Promedio Hoy} = \left( \frac{1}{14} \times \text{Ganancia de Hoy} \right) + \left( \frac{13}{14} \times \text{Ganancia Promedio de Ayer} \right) $$
$$ \text{Pérdida Promedio Hoy} = \left( \frac{1}{14} \times \text{Pérdida de Hoy} \right) + \left( \frac{13}{14} \times \text{Pérdida Promedio de Ayer} \right) $$

De esta forma, cada nuevo día tiene un peso del 7.14% en el cálculo, mientras que todo el historial acumulado anterior retiene el 92.86% restante.

---

### 3. Fuerza Relativa ($RS$) y Escala Normalizada a 100
Con ambos promedios calculados, se obtiene la Fuerza Relativa dividiendo la ganancia promedio sobre la pérdida promedio:
$$ RS = \frac{\text{Ganancia Promedio}}{\text{Pérdida Promedio}} $$

Finalmente, para que el resultado siempre quede acotado entre 0 y 100, se aplica la normalización estándar:
$$ RSI = 100 - \left( \frac{100}{1 + RS} \right) $$

---

### 4. Por Qué se Requieren 6 Meses de Datos Diarios y Temporalidad Estricta

1. **Convergencia del Cálculo (Warm-up Period):**
   Al ser una fórmula recursiva que depende del valor del día anterior, si solo se toman 14 o 20 días de datos, el valor inicial puede distorsionar el resultado final. Para que el cálculo converja con exactitud a los valores oficiales de mercado, se necesitan al menos 60 períodos previos. MPFP descarga **6 meses de cotizaciones diarias** para asegurar que el valor coincida de forma idéntica con plataformas de mercado como TradingView.
2. **Temporalidad Diaria vs. Horaria:**
   El cálculo debe realizarse estrictamente sobre precios de cierre diarios (`interval="1d"`). Si se ejecutara sobre velas horarias o intradiarias, se obtendría un indicador de volatilidad de corto plazo en lugar del estado de tendencia de dos semanas que requiere la estrategia de cartera.
3. **Reglas de Seguridad contra División por Cero:**
   * Si la **Pérdida Promedio es 0** (la acción solo subió en los 14 días) $\implies RSI = 100.0$.
   * Si tanto la **Ganancia como la Pérdida son 0** (el precio estuvo congelado sin movimientos) $\implies RSI = 50.0$.

---

## 💻 3. Código en Python Utilizado en el Proyecto

El siguiente fragmento corresponde a la función implementada en `services/cedear_service.py`:

```python
import numpy as np
import pandas as pd

def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Calcula el RSI de Wilder sobre una serie de precios de cierre diarios.
    """
    # 1. Obtener la diferencia día a día
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    # 2. Aplicar el suavizado exponencial con alpha = 1 / period
    avg_gain = gain.ewm(alpha=1.0/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0/period, adjust=False).mean()
    
    # 3. Calcular la Fuerza Relativa evitando divisiones por cero
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    
    # 4. Manejo de casos de borde
    # Si no hubo pérdidas y hubo subas, el RSI es 100
    rsi = rsi.fillna(100.0).where(avg_loss != 0, 100.0)
    
    # Si el precio no cambió en ningún día, el estado es neutral (50.0)
    rsi = rsi.where((avg_gain != 0) | (avg_loss != 0), 50.0)
    
    return rsi
```

---

## 📱 4. Aplicación Práctica en la App
* **Módulos:** `CedearsView.tsx`, `PortfolioView.tsx`, `RotationView.tsx`.
* **Cómo se usa:**
  1. En **CEDEARs**, muestra el RSI individual de cada empresa con alertas visuales automáticas cuando supera 65 o cae por debajo de 35.
  2. En **Portfolios**, calcula el **Termómetro de RSI Ponderado de Cartera** para saber si la cartera global está en zona de sobrecompra o sobreventa.
  3. En **Rotación**, funciona como filtro de veto para evitar comprar acciones que ya están sobrecompradas.
