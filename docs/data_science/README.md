---
created: <% tp.file.creation_date("YYYY-MM-DD HH:mm") %>
tags:
  - note
  - journal
  - data-science
  - quantitative-finance
  - index
---

> [!TIP] Backlinks:
> - [[docs/data_science/01_optimizacion_markowitz_y_montecarlo|01. Optimización de Markowitz & Monte Carlo]]
> - [[docs/data_science/02_regresion_y_curvas_de_rendimiento|02. Regresión No Lineal & Curvas de Rendimiento]]
> - [[docs/data_science/03_series_temporales_y_senales_cuantitativas|03. Series Temporales & Suavizado Wilder (RSI)]]
> - [[docs/data_science/04_modelos_factoriales_y_valuacion_cuantitativa|04. Modelos Factoriales & Vía Negativa]]
> - [[docs/data_science/05_algoritmos_de_asignacion_discreta_y_rebalanceo|05. Asignación Discreta, MCM & Filtros Tácticos]]
> - [[instructivo|Instructivo y Fórmulas Matemáticas de Referencia]]

---

# 🧠 Módulos de Data Science & Finanzas Cuantitativas (MPFP)

## 📌 Resumen Amigable: ¿De qué se trata esta carpeta?
* **¿Qué es?** Es una guía educativa modular que documenta todos los conceptos de Ciencia de Datos, Álgebra Lineal, Estadística Aplicada y Finanzas Cuantitativas (Quant) implementados dentro del código fuente de Máquina de Planes, Finanzas y Portfolios (MPFP).
* **¿Cómo está estructurado?** Cada documento está dividido en dos partes: primero, una explicación en lenguaje simple y cotidiano que responde **Qué es, Cómo funciona y Por qué se usa**; segundo, un desglose técnico riguroso con formulaciones matemáticas en LaTeX, código en Python (`NumPy`, `Pandas`, `SciPy`) y casos de uso prácticos de la aplicación.
* **¿Por qué existe?** Para que cualquier persona interesada en Data Science o Finanzas Cuantitativas pueda entender cómo se transforman ecuaciones teóricas en herramientas computacionales de decisión en tiempo real.

---

## 🗺️ Mapa Conceptual de Aprendizaje

```
                           ┌────────────────────────────────────────┐
                           │      MPFP: DATA SCIENCE & QUANTS       │
                           └───────────────────┬────────────────────┘
                                               │
         ┌─────────────────────┬───────────────┴───────────────┬─────────────────────┐
         ▼                     ▼                               ▼                     ▼
┌─────────────────┐   ┌─────────────────┐             ┌─────────────────┐   ┌─────────────────┐
│   01. MPT &     │   │  02. CURVAS DE  │             │   03. SERIES    │   │  04. FACTORES & │
│   MONTE CARLO   │   │   RENDIMIENTO   │             │   TEMPORALES    │   │   VALUACIÓN     │
├─────────────────┤   ├─────────────────┤             ├─────────────────┤   ├─────────────────┤
│• Markowitz      │   │• Regresión Log  │             │• Wilder EWMA    │   │• Vía Negativa   │
│• Ratio Sharpe   │   │• Residuals (bps)│             │• RSI 14 Días    │   │• ROIC vs WACC   │
│• VaR & CVaR 95% │   │• Modified Dur.  │             │• Zero Variance  │   │• Margen de Seg. │
└─────────────────┘   └─────────────────┘             └─────────────────┘   └─────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ 05. ASIGNACIÓN  │
                              │    DISCRETA     │
                              ├─────────────────┤
                              │• Granularidad   │
                              │• Cuello Botella │
                              │• Veto Anti-FOMO │
                              └─────────────────┘
```

---

## 📚 Índice Modular de Documentos

1. **[[01_optimizacion_markowitz_y_montecarlo]]**: Simulación de miles de carteras con Monte Carlo, derivación de la Frontera Eficiente, maximización del Ratio de Sharpe y medición de riesgo extremo de cola mediante $VaR_{95\%}$ y $CVaR_{95\%}$ (Expected Shortfall).
2. **[[02_regresion_y_curvas_de_rendimiento]]**: Ajuste estadístico no lineal sobre bonos y letras soberanas (LECAPs/BONCAPs) usando transformaciones logarítmicas, detección de desarbitrajes mediante residuales en puntos básicos (*bps*) y cálculo de potencial de apreciación (*Upside*) por compresión de TIR.
3. **[[03_series_temporales_y_senales_cuantitativas]]**: Tratamiento matemático de series de precios históricos, diferencia entre medias móviles exponenciales estándar y el suavizado de Wilder ($\alpha = 1/14$), convergencia matemática según marcos temporales y control de anomalías por varianza nula.
4. **[[04_modelos_factoriales_y_valuacion_cuantitativa]]**: Algoritmos de scoring por vía negativa para evitar trampas de valor, comparación de ROIC frente a WACC, dilución de capital por stock-based compensation (SBC) y adaptación cuantitativa por sectores industriales.
5. **[[05_algoritmos_de_asignacion_discreta_y_rebalanceo]]**: Resolución del problema de granularidad (pasar de porcentajes continuos a acciones enteras), algoritmo de Mínimo Común Múltiplo para encontrar la escala mínima indivisible $1\times$ y filtros de compuerta lógica para vetar compras en sobrecalentamiento técnico.
