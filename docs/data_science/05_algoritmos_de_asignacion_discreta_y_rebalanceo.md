---
created: <% tp.file.creation_date("YYYY-MM-DD HH:mm") %>
tags:
  - note
  - journal
  - data-science
  - discrete-allocation
  - integer-programming
  - portfolio-rebalancing
  - decision-matrix
  - anti-fomo-filter
---

> [!TIP] Backlinks:
> - [[docs/data_science/README|Índice de Data Science]]
> - [[services/portfolio_service.py|Servicio de Portafolios]]
> - [[services/rotation_service.py|Servicio de Rotación]]
> - [[frontend/src/components/RotationView|Vista RotationView]]
> - [[discrete-optimization|Optimización Discreta de Asignación]]
> - [[portfolio-rebalancing|Algoritmos de Rebalanceo de Cartera]]
> - [[tactical-asset-allocation|Asignación Táctica de Activos]]
> - [[instructivo|Instructivo General]]

---

# ⚖️ 05. Asignación Discreta, Rebalanceo de Cartera & Filtros Tácticos

## 📌 1. Resumen: Qué, Cómo y Por Qué

* **¿Qué es?** 
  Es el conjunto de reglas y cálculos que transforma los porcentajes teóricos de una cartera en cantidades exactas de acciones enteras para comprar o vender en el mercado.
* **¿Cómo funciona?** 
  Calcula cuántas acciones enteras corresponden a cada activo según los precios actuales de cotización. Además, identifica la escala mínima de capital requerida para que ningún activo quede en cero y analiza si una acción faltante está en condiciones técnicas adecuadas antes de sugerir su compra.
* **¿Por qué se usa?** 
  Porque en el mercado real no es posible comprar fracciones de CEDEARs o acciones locales, sino números enteros ($1, 2, 5, 10$). Este módulo evita errores de ejecución práctica, como vender activos que ya se encuentran por debajo del cupo deseado o comprar acciones que están atravesando subas excesivas de corto plazo.

---

## 🔍 2. Explicación Paso a Paso del Proceso

### 1. De Porcentajes Continuos a Acciones Enteras (Granularidad)
Cuando un modelo define que una cartera debe tener, por ejemplo, 15% en una acción y 25% en otra, al multiplicar esos porcentajes por el dinero disponible y dividirlos por el precio de cada acción, el resultado casi siempre arroja números con decimales (por ejemplo, 3.42 acciones o 8.87 acciones).

El sistema resuelve esto mediante una regla de asignación proporcional basada en un **Activo Ancla**:
1. El usuario elige un activo de referencia ($A$) y define una cantidad entera ($Q_A$).
2. Para cada uno de los demás activos ($i$), se calcula la cantidad teórica de nominales multiplicando la relación de pesos y precios, redondeando al número entero más próximo:
   $$ N_i = \text{round}\left( \frac{\text{Peso}_i}{\text{Peso}_A} \times \frac{\text{Precio}_A}{\text{Precio}_i} \times Q_A \right) $$

---

### 2. El Cuello de Botella y la Cartera Base Mínima ($1\times$)

Para armar una cartera diversificada sin que las acciones de precio más alto queden excluidas en 0 nominales por falta de capital, el sistema determina la **escala mínima indivisible**:

1. **Capital Requerido por Activo ($C_i$):**
   Para cada acción, se calcula el capital total de cartera que se necesitaría para que esa acción represente al menos 1 nominal completo:
   $$ C_i = \frac{\text{Precio}_i}{\text{Peso Porcentual}_i / 100} $$
2. **Identificación del Cuello de Botella:**
   La acción que arroja el valor más alto de $C_i$ es el **Cuello de Botella**. Es el activo que exige mayor capital global para adquirir una sola unidad sin distorsionar las proporciones deseadas.
3. **Generación de la Cartera $1\times$:**
   Al fijar la cantidad de la acción cuello de botella en exactamente 1 nominal, se derivan automáticamente los nominales del resto de los activos. Todos quedan con al menos 1 nominal y la suma de sus valores define el capital mínimo indispensable para replicar la cartera.

---

### 3. Matriz de Decisión de Rotación y Filtros de Seguridad

El módulo de Rotación compara las tenencias reales que el usuario tiene en su cuenta frente a la cartera objetivo seleccionada:

1. **Cálculo de Brechas:**
   $$ \text{Diferencia de Nominales} = \text{Nominales Reales} - \text{Nominales Objetivo} $$
   * **Superávit ($\text{Diferencia} > 0$ o activo fuera de la cartera):** El usuario tiene más acciones de las planificadas. Califica como **candidato a venta**.
   * **Déficit ($\text{Diferencia} < 0$):** El usuario tiene menos acciones de las planificadas. Califica como **candidato a compra**.

2. **Regla de Prohibición de Venta en Déficit:**
   Un activo que está en déficit **nunca se selecciona para venta**, incluso si tiene una ganancia porcentual acumulada alta por precio de compra (Take Profit). Vender un activo en déficit aumentaría la desviación respecto al objetivo de la cartera.

3. **Filtro de Veto Táctico Anti-FOMO:**
   Si un activo está en déficit (hacen falta acciones para completar el cupo), pero su indicador técnico muestra **sobrecompra ($RSI \ge 65.0$)**, el sistema bloquea temporalmente la recomendación de compra y emite el estado *"Esperar retroceso técnico hacia zona neutral (< 55)"*.

4. **Emparejamiento sin Auto-Rotación:**
   Al armar las sugerencias de rotación de capital, el algoritmo asegura que cada tarjeta de sugerencia empareje la venta de un activo con la compra de un activo diferente, evitando recomendaciones cruzadas sobre el mismo ticker.

---

## 💻 3. Código en Python Utilizado en el Proyecto

El siguiente fragmento corresponde a las funciones implementadas en `services/portfolio_service.py` y `services/rotation_service.py`:

```python
def calculate_portfolio_mcm(weights: dict[str, float], market_data: dict) -> dict:
    """
    Calcula el activo cuello de botella y la cartera base mínima 1x.
    """
    valid_weights = {k: v for k, v in weights.items() if v > 0}
    
    # 1. Identificar el activo que exige más capital para 1 acción entera
    bottleneck_tk = None
    max_capital_req = -1.0
    
    for tk, w in valid_weights.items():
        price = market_data.get(tk, {}).get("local", 0.0)
        if price > 0:
            capital_needed = price / (w / 100.0)
            if capital_needed > max_capital_req:
                max_capital_req = capital_needed
                bottleneck_tk = tk
                
    if not bottleneck_tk:
        return None
        
    p_bottle = market_data[bottleneck_tk]["local"]
    w_bottle = valid_weights[bottleneck_tk]
    
    # 2. Escalar el resto de los activos fijando el cuello de botella en 1
    base_nominals = {}
    base_capital = 0.0
    
    for tk, w in valid_weights.items():
        p = market_data.get(tk, {}).get("local", 0.0)
        nominals = max(1, int(round((w / w_bottle) * (p_bottle / p) * 1))) if p > 0 else 0
        base_nominals[tk] = nominals
        base_capital += nominals * p
        
    return {
        "bottleneck_ticker": bottleneck_tk,
        "bottleneck_qty": 1,
        "base_nominals": base_nominals,
        "base_capital": round(base_capital, 2),
        "total_nominals": sum(base_nominals.values())
    }
```

---

## 📱 4. Aplicación Práctica en la App
* **Módulos:** `PortfolioView.tsx`, `RotationView.tsx`, `HoldingsDrawer.tsx`.
* **Cómo se usa:**
  1. En **Portfolios**, el botón **1x Cartera Base** ajusta inmediatamente las cantidades enteras mínimas para operar la cartera completa.
  2. En **Rotación**, el sistema compara tu tenencia real cargada en el cajón lateral con la cartera seleccionada y genera pares de sugerencias de venta (sobreponderados) y compra (subponderados) respetando los filtros técnicos.
