---
created: <% tp.file.creation_date("YYYY-MM-DD HH:mm") %>
tags:
  - note
  - journal
  - data-science
  - quantitative-valuation
  - factor-investing
  - roic-wacc
  - margin-of-safety
  - fundamental-analysis
---

> [!TIP] Backlinks:
> - [[docs/data_science/README|Índice de Data Science]]
> - [[services/valuation_service.py|Servicio de Valuación Fundamental]]
> - [[frontend/src/components/ValuationView|Vista ValuationView]]
> - [[factor-investing|Inversión por Factores Cuantitativos]]
> - [[roic-wacc-spread|Creación de Valor Económico (ROIC vs WACC)]]
> - [[free-cash-flow-yield|Flujo de Caja Libre (FCF)]]
> - [[margin-of-safety|Margen de Seguridad]]
> - [[instructivo|Instructivo General]]

---

# 🏢 04. Modelos Factoriales de Valuación & Auditoría por Vía Negativa

## 📌 1. Resumen: Qué, Cómo y Por Qué

* **¿Qué es?** 
  Es un sistema de evaluación que calcula el valor intrínseco estimado de una empresa a partir de sus datos contables y financieros reales (generación de efectivo, nivel de deuda, rentabilidad sobre el capital invertido y dilución de acciones).
* **¿Cómo funciona?** 
  En lugar de basarse en pronósticos a largo plazo, analiza las métricas de los últimos balances, penaliza los factores de riesgo identificados y aplica un margen de seguridad del 25% al 35% sobre el valor resultante para definir el precio máximo de compra.
* **¿Por qué se usa?** 
  Porque los diferentes sectores de la economía tienen estructuras de balance distintas. Un banco no se analiza de la misma forma que una empresa de software o una compañía petrolera. Este modelo adapta sus reglas de evaluación según la industria a la que pertenece cada empresa.

---

## 🔍 2. Explicación Paso a Paso del Proceso

### 1. El Concepto de Creación de Valor: ROIC frente a WACC
Una empresa solo crea valor económico si el rendimiento que obtiene por el capital invertido en su negocio es mayor que el costo de conseguir ese capital:

* **ROIC (Return on Invested Capital):** Es el porcentaje de beneficio operativo neto que la empresa genera por cada dólar que tiene invertido en instalaciones, inventarios, tecnología y operaciones.
* **WACC (Weighted Average Cost of Capital):** Es el costo promedio de financiamiento de la empresa, combinando la tasa de interés de su deuda y el rendimiento esperado por los accionistas.
* **Diferencia (Spread):**
  * Si $\text{ROIC} > \text{WACC}$: La empresa genera valor adicional por encima de su costo de financiamiento.
  * Si $\text{ROIC} \le \text{WACC}$: La empresa no compensa el costo de los recursos utilizados, lo que reduce el múltiplo de valuación que se le asigna.

---

### 2. El Flujo de Caja Libre Normalizado (FCF)
Para empresas de tecnología, consumo o salud, la métrica principal es el **Flujo de Caja Libre por Acción ($\text{FCF}$)**:
$$ \text{FCF} = \text{Flujo de Efectivo Operativo} - \text{Inversiones de Capital en Bienes de Uso (Capex)} $$

Es el dinero en efectivo que queda disponible al final del año para los accionistas (para pagar dividendos, recomprar acciones o reducir deuda) después de haber realizado todas las inversiones necesarias para mantener el negocio operativo.

---

### 3. Ajustes Cuantitativos al Múltiplo de Valuación
El modelo parte de un múltiplo base promedio (por ejemplo, 20 veces el FCF) y le aplica ajustes automáticos según la calidad de los balances:

1. **Bonificación o Penalización por ROIC vs. WACC:**
   Si la empresa tiene un ROIC alto y supera ampliamente a su WACC, se le suma hasta 5 puntos al múltiplo de valuación. Si el ROIC es bajo, se le descuenta.
2. **Penalización por Deuda Excesiva:**
   Se analiza la relación entre la Deuda Neta y el beneficio operativo bruto ($\text{EBITDA}$). Si la deuda neta supera 1.5 veces el EBITDA anual, se reduce el múltiplo asignado en proporción al nivel de apalancamiento.
3. **Penalización por Dilución de Acciones (SBC):**
   Las empresas a veces pagan parte de los sueldos a sus ejecutivos emitiendo nuevas acciones (*Stock-Based Compensation* o SBC). Si este gasto supera el 5% del flujo operativo anual, el modelo aplica un descuento al múltiplo para reflejar la pérdida de valor por emisión de nuevas acciones.

El **Valor Intrínseco Justo** se calcula multiplicando el FCF por acción por el múltiplo ajustado resultante:
$$ \text{Valor Justo} = \text{FCF por Acción} \times \text{Múltiplo Ajustado} $$

---

### 4. El Margen de Seguridad
Para proteger la inversión frente a imprevistos o caídas generales del mercado, el modelo no recomienda comprar al Valor Justo exacto, sino con un descuento exigido:

$$ \text{Precio de Entrada Sugerido} = \text{Valor Justo} \times (1 - \text{Margen de Seguridad}) $$

* **Empresas de Estados Unidos (Mercado Desarrollado):** Se exige un **25% de descuento**.
* **Empresas de Mercados Emergentes (incluyendo Argentina):** Se exige un **35% de descuento** debido al riesgo país y a la volatilidad cambiaria.

---

### 5. Los 6 Modelos Adaptativos por Sector

1. **`standard_fcf` (Tecnología, Consumo Masivo, Salud):** Centrado en generación de caja libre, retorno sobre capital y control de dilución por compensaciones.
2. **`banking` (Bancos Comerciales y Fintech):** Evalúa la solvencia mediante el ratio de capital regulatorio ($\text{CET1} \ge 12\%$), la rentabilidad sobre capital tangible ($\text{RoTCE}$) y la proporción de préstamos incobrables ($\text{NCO}$).
3. **`financial_holding` (Sociedades de Cartera e Inversión):** Considera las ganancias no consolidadas de empresas participadas (*Look-Through Earnings*), el costo del dinero de pólizas de seguros (*Float*) y la disponibilidad de caja.
4. **`industrial_dual_debt` (Empresas de Maquinaria y Automotrices con Financiera Propia):** Separa la deuda de la fábrica industrial de la deuda de la división de créditos a clientes, evitando clasificar erróneamente a la empresa como sobreendeudada.
5. **`energy_upstream` (Producción de Petróleo y Gas):** Analiza el costo de extracción por barril (*Lifting Cost*), el precio del petróleo necesario para cubrir costos (*Breakeven Brent*) y los flujos en moneda extranjera.
6. **`discarded` (Trampas de Valor):** Diagnóstico automático para empresas que presentan destrucción crónica de capital o pérdida sostenida de clientes.

---

## 💻 3. Código en Python Utilizado en el Proyecto

El siguiente fragmento corresponde a la función implementada en `services/valuation_service.py`:

```python
def evaluate_standard_fcf(metrics: dict, profile: dict) -> dict:
    """
    Calcula el valor justo y el precio de compra con margen de seguridad.
    """
    price = metrics.get("price", 100.0)
    fcf_share = metrics.get("fcf_per_share", 5.0)
    roic = metrics.get("roic", 15.0)
    wacc = metrics.get("wacc", 9.0)
    net_debt_ebitda = metrics.get("net_debt_ebitda", 1.0)
    sbc_ocf = metrics.get("sbc_ocf", 5.0)
    
    base_mult = profile.get("base_fcf_multiple", 20.0)
    mos = profile.get("required_margin_of_safety", 0.25)
    
    # 1. Ajustes al múltiplo según calidad del negocio
    adj_roic = min(5.0, max(-5.0, (roic - wacc) * 0.5))
    adj_debt = max(0.0, (net_debt_ebitda - 1.5) * 2.0)
    adj_sbc = max(0.0, (sbc_ocf - 5.0) * 0.3)
    
    # 2. Múltiplo final y cálculo de valor justo
    final_multiple = max(8.0, base_mult + adj_roic - adj_debt - adj_sbc)
    fair_value = fcf_share * final_multiple
    buy_target = fair_value * (1.0 - mos)
    
    # 3. Comparación con el precio de mercado
    upside_fair = ((fair_value - price) / price) * 100.0
    
    status = "COMPRA FUERTE" if price <= buy_target else (
        "VALOR JUSTO" if price <= fair_value else "SOBREVALUADO"
    )
    
    return {
        "fair_value": round(fair_value, 2),
        "buy_target": round(buy_target, 2),
        "final_multiple": round(final_multiple, 1),
        "upside_to_fair": round(upside_fair, 2),
        "status": status
    }
```

---

## 📱 4. Aplicación Práctica en la App
* **Pantalla:** Pestaña **Valuación Fundamental** (`ValuationView.tsx`).
* **Cómo se usa:** Permite seleccionar entre 32 empresas con perfiles precargados, ajustar cualquier variable financiera del balance y guardar el valor calculado. Con el botón de sincronización, ese Valor Justo se traslada a las pantallas de Cartera y Rotación para evaluar si el activo está en precio de compra.
