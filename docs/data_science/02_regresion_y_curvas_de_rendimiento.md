---
created: <% tp.file.creation_date("YYYY-MM-DD HH:mm") %>
tags:
  - note
  - journal
  - data-science
  - fixed-income
  - yield-curve
  - non-linear-regression
  - modified-duration
  - relative-value
---

> [!TIP] Backlinks:
> - [[docs/data_science/README|Índice de Data Science]]
> - [[services/fixed_income_service.py|Servicio de Renta Fija]]
> - [[frontend/src/components/FixedIncomeView|Vista Interactiva FixedIncomeView]]
> - [[term-structure-of-interest-rates|Estructura Temporal de Tasas de Interés]]
> - [[yield-curve-fitting|Ajuste de Curvas de Rendimiento]]
> - [[modified-duration|Modified Duration & Sensibilidad de Tasa]]
> - [[basis-points-spread|Spreads en Puntos Básicos (bps)]]
> - [[relative-value-arbitrage|Arbitraje de Valor Relativo]]
> - [[instructivo|Instructivo General]]

---

# 📈 02. Regresión No Lineal & Curvas de Rendimiento de Renta Fija

## 📌 1. Resumen: Qué, Cómo y Por Qué

* **¿Qué es?** 
  Es un método de análisis para comparar bonos y letras soberanas entre sí, determinando cuáles ofrecen un rendimiento superior o inferior al promedio del mercado según su fecha de vencimiento.
* **¿Cómo funciona?** 
  Toma los datos de cotización en tiempo real de todos los bonos (su duración en años y su tasa anual de ganancia TEA). Luego, calcula una curva de regresión matemática que conecta el promedio de rendimientos a lo largo de los diferentes plazos de vencimiento.
* **¿Por qué se usa?** 
  Para identificar oportunidades de inversión por valor relativo. Los bonos que se ubican por encima de la curva calculada ofrecen un rendimiento adicional frente a activos de similar plazo, mientras que los que están por debajo ofrecen un rendimiento menor. Además, permite estimar la ganancia de capital si las tasas de interés bajan en el futuro.

---

## 🔍 2. Explicación Paso a Paso del Proceso

### 1. Variables Clave en Renta Fija
Para analizar un bono o letra se utilizan dos medidas fundamentales:
1. **Tasa Efectiva Anual (TEA / TIR):** El porcentaje de ganancia anualizada que obtiene un inversor si compra el bono al precio actual y lo mantiene hasta su fecha de vencimiento.
2. **Modified Duration (MD):** Una medida de tiempo expresada en años que indica dos factores:
   * El tiempo promedio que se tarda en recuperar el dinero invertido a través de amortizaciones e intereses.
   * La sensibilidad del precio del bono ante cambios en la tasa de interés: por cada 1% que baja la tasa de mercado, el precio del bono sube aproximadamente un porcentaje igual a su Modified Duration.

---

### 2. Por Qué la Relación entre Plazo y Tasa No es una Línea Recta
En condiciones normales de mercado, los títulos de deuda a plazos más largos suelen pagar tasas más altas que los títulos de corto plazo, debido a que el dinero queda comprometido durante más tiempo.

Sin embargo, esta relación no crece de forma recta ni infinita: suele subir más rápido en los plazos cortos (de 0 a 1 año) y tiende a aplanarse en los plazos largos (de 2 a 10 años). Para representar esta forma natural, el modelo aplica una **transformación logarítmica** sobre la variable de duración ($\ln(1 + MD)$) antes de calcular la línea de tendencia.

---

### 3. Cálculo de la Curva de Regresión
El algoritmo realiza los siguientes pasos:
1. Toma todos los bonos que tienen cotización y volumen operado real en BYMA o MAE.
2. Aplica la transformación logarítmica sobre el valor de $MD$ de cada bono.
3. Ajusta una ecuación polinómica mediante el método de mínimos cuadrados (un procedimiento matemático que encuentra la curva que pasa a la menor distancia posible de todos los puntos observados).
4. La curva resultante define la **Tasa Teórica Esperada** para cada nivel de plazo.

---

### 4. Detección de Desvíos (Spreads en Puntos Básicos) y Ganancia Potencial

Una vez trazada la curva, se calcula la diferencia entre la tasa real de cada bono y la tasa teórica que le corresponde:

1. **Spread en Puntos Básicos ($bps$):**
   * Un punto básico ($1\text{ bps}$) equivale al $0.01\%$ de tasa de interés (es decir, $100\text{ bps} = 1.00\%$).
   * Se calcula restando la tasa real del bono menos la tasa teórica de la curva:
     $$ \text{Spread (bps)} = (\text{TEA Real} - \text{TEA Teórica}) \times 10.000 $$
   * **Posición Arriba de la Curva ($\text{Spread} > 0$):** El bono paga más tasa que el promedio del mercado para ese plazo (rinde más / oportunidad de compra).
   * **Posición Abajo de la Curva ($\text{Spread} < 0$):** El bono paga menos tasa que el promedio del mercado para ese plazo.

2. **Ganancia de Capital por Compresión de Tasa (Upside):**
   Si la tasa de interés de un bono desciende (por ejemplo, si el riesgo país baja), el precio del bono sube. El sistema calcula la suba porcentual esperada del precio ante una tasa objetivo definida:
   $$ \text{Ganancia de Capital (\%)} = (\text{Tasa Actual} - \text{Tasa Objetivo}) \times MD $$

---

## 💻 3. Código en Python Utilizado en el Proyecto

El siguiente fragmento corresponde a la función implementada en `services/fixed_income_service.py`:

```python
import numpy as np
import pandas as pd

def fit_yield_curve(df: pd.DataFrame, x_col: str = "md", y_col: str = "tea") -> pd.DataFrame:
    """
    Calcula la curva de rendimiento promedio y la distancia de cada bono en puntos básicos.
    """
    if df is None or df.empty or x_col not in df.columns or y_col not in df.columns:
        return df

    df["teorica"] = None
    df["spread_curva_bps"] = None
    df["posicion_curva"] = None

    # Filtrar solo bonos con datos válidos de plazo y tasa positiva
    valid_mask = df[x_col].notna() & df[y_col].notna() & (df[x_col] > 0) & (df[y_col] > 0)
    
    if valid_mask.sum() >= 3:
        sub = df[valid_mask].sort_values(by=x_col)
        x_vals = sub[x_col].values.astype(float)
        y_vals = sub[y_col].values.astype(float)

        try:
            # 1. Transformación logarítmica de la duración
            log_x = np.log1p(x_vals)
            deg = min(2, len(x_vals) - 1)
            
            # 2. Ajuste de la curva por mínimos cuadrados
            poly_coeffs = np.polyfit(log_x, y_vals, deg=deg)
            poly_func = np.poly1d(poly_coeffs)

            # 3. Comparar cada bono contra la curva teórica
            for idx, row in df.iterrows():
                if pd.notna(row[x_col]) and row[x_col] > 0 and pd.notna(row[y_col]):
                    lx = np.log1p(float(row[x_col]))
                    y_pred = float(poly_func(lx))
                    spread_bps = int(round((float(row[y_col]) - y_pred) * 10000))
                    
                    df.at[idx, "teorica"] = round(y_pred, 2)
                    df.at[idx, "spread_curva_bps"] = spread_bps
                    df.at[idx, "posicion_curva"] = "arriba" if spread_bps > 0 else "abajo"
        except Exception:
            pass

    return df
```

---

## 📱 4. Aplicación Práctica en la App
* **Pantalla:** Pestaña **Renta Fija** (`FixedIncomeView.tsx`).
* **Cómo se usa:** Puedes alternar entre la curva en pesos de letras capitalizables (**LECAPs / BONCAPs**) y la curva en dólares de bonos soberanos (**AL / GD**). La gráfica colorea los puntos en verde si están por encima de la curva o en rojo si están por debajo, y permite ingresar una tasa proyectada para ver el retorno estimado de capital en cada bono.
