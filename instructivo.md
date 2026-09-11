# 📘 Instructivo & Mapa de Features — Máquina de Planes, Finanzas y Portfolios (MPFP)

Este documento recopila la totalidad de las funcionalidades, modelos matemáticos cuantitativos, arquitectura de datos y estándares de seguridad de **Máquina de Planes, Finanzas y Portfolios (MPFP)** (FastAPI + React 19 + TypeScript + Vite + Tailwind CSS + Apache ECharts). Sirve como **documento base de auditoría** para evaluar la integridad del proyecto en el futuro.

---

## 1. Arquitectura General del Sistema

* **Backend:** FastAPI (Python 3.14 / venv) con arquitectura modular de routers y servicios en `services/`.
* **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + ECharts (`echarts-for-react`) + TanStack Table v8 + Lucide Icons.
* **Binding Seguro:** Exclusivamente en `127.0.0.1:8000` (Localhost) sin exposición a redes externas.
* **Persistencia Atómica:** Clase `AtomicJsonDatabase` (`services/atomic_persistence.py`) con escrituras seguras temporales `.tmp` y reemplazo atómico `os.replace()`, respaldado por cerrojos reentrantes `threading.RLock()`.

---

## 2. Módulos & Features Detalladas

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MPFP - MODULOS & TERMINAL CUANTITATIVA               │
├──────────────┬──────────────┬──────────────┬─────────────┬─────────────┤
│  1. Rotación │2. Portfolios │ 3. Markowitz │ 4. CEDEARs  │ 5. Earnings │
│  & Cartera   │ & Rebalanceo │  Laboratory  │  & Mercado  │  Calendar   │
├──────────────┼──────────────┼──────────────┼─────────────┼─────────────┤
│ 6. Valuación │ 7. GuruFocus │ 8. Renta     │ 9. Perf. &  │ 10. Security│
│  Fundamental │  & P/NormFCF │    Fija      │ Multi-Asset │  & Testing  │
└──────────────┴──────────────┴──────────────┴─────────────┴─────────────┘
```

---

### 1. Rotación & Cartera Real (`services/rotation_service.py` / `RotationView.tsx`)
* **Gestión de Cartera Real:** Entrada y edición en cajón colapsable (`HoldingsDrawer.tsx`) de cantidades nominales (`nominals`), Precio Promedio de Compra (`ppc`) y Saldo Líquido en Caja (`cash_ars`).
* **Análisis de Brechas (Gap Analysis):** Comparación entre la cartera real del usuario y cualquier cartera modelo seleccionada (`target_pf`, con `min_drawdown_15` como default).
* **Métricas de Cartera:**
  * Patrimonio Real Total (`total_real_equity = acciones + caja`).
  * Desvío Promedio de Ponderación (*Average Tracking Error*).
  * Rendimiento Acumulado Global y por Activo (PnL $ y %) con cálculo seguro ante activos sin PPC o cotizaciones caídas.
* **Veto Táctico por Sobrecompra (Regla V4.3):**
  * Si un activo en déficit tiene $RSI \ge 65.0 \implies$ se veta como orden de compra inmediata y se clasifica como `⏳ ESPERAR RETROCESO`.
  * Si el activo está en sobreventa ($RSI \le 40$) o descuento fundamental $\implies$ `🔥 COMPRA ÓPTIMA`.
  * Si el timing es neutral ($40 < RSI < 65$) $\implies$ `COMPLETAR CUOTA`.
* **Generador de Oportunidades de Rotación:**
  * Sugerencias de arbitraje entre activos con toma de ganancia / superávit hacia activos con déficit y timing favorable.
  * Oportunidades sin restricción de caja (muestra el requerimiento neto de capital para aportes o retiros).
  * En ausencia de compras favorables, sugiere explícitamente `Mantener en Caja / Liquidez de espera`.

---

### 2. Portfolios & Rebalanceo K-Means (`services/portfolio_service.py` / `PortfolioView.tsx`)
* **Cartera Predeterminada:** Carga automática de `MIN DRAWDOWN 15` al ingresar.
* **Modos de Cartera:** Soporte para carteras en base a **Pesos Porcentuales** (`weights`) y **Cantidades Nominales Fijas** (`nominals`).
* **Mínimo Común Múltiplo (MCM / Cartera Base 1x):** Detección del activo cuello de botella (mayor ratio precio/peso) para calcular el capital base mínimo entero sin redondeos a cero.
* **Ancla Dinámica:** Selección de cualquier activo como *Ticker Ancla* con escalado de nominales en múltiplos enteros.
* **Termómetro de RSI Ponderado:** Oscilador de momentum agregado de la cartera ponderado por valor patrimonial con semáforos visuales.
* **Filtro de Fricción / Turn-over:** Umbral del 2.5% para suprimir rebalanceos innecesarios por micro-oscilaciones de precio.
* **Alertas Take Profit:** Notificaciones paramétricas cuando un activo supera su PPC en $>15\%$ o $>25\%$.
* **Métricas de Alpha vs SPY:** Comparación de rendimiento acumulado a 3M, 6M, 1Y y YTD contra el S&P 500.

---

### 3. Laboratorio de Markowitz & Frontera Eficiente (`services/markowitz_service.py` / `MarkowitzLab.tsx`)
* **Optimización Cuantitativa:** Simulación de Monte Carlo con $N$ carteras aleatorias.
* **Puntos Notables:** Cartera de Máximo Sharpe (Tangencia) y Cartera de Mínima Varianza.
* **Métricas de Riesgo de Cola:** Value at Risk ($VaR_{95\%}$) y Conditional Value at Risk ($CVaR_{95\%}$ / Expected Shortfall).
* **Matriz de Covarianza & Correlación:** Mapa térmico interactivo entre todos los activos de la cartera.

---

### 4. CEDEARs & Mercado (`services/cedear_service.py` / `CedearsView.tsx`)
* **Cotizaciones en Tiempo Real:** Precios locales (BYMA en ARS) y subyacentes en EE.UU. (USD).
* **CCL Implícito:** Cálculo del tipo de cambio Contado con Liquidación implícito por activo (`(Local * Ratio) / ADR`).
* **RSI Suavizado Wilder (14 periodos):** Oscilador técnico con clasificación de sobrecompra ($>70$) y sobreventa ($<30$).

---

### 5. Calendario de Balances Corporativos (`services/earnings_service.py` / `EarningsView.tsx`)
* **Jerarquía Temporal:** Orden cronológico de reportes con separación de fechas confirmadas y estimadas.
* **Días Restantes / Transcurridos:** Conteo exacto respecto a la fecha actual del sistema.
* **Alertas de Evento Inminente:** Badges pulsantes para balances dentro de los próximos 14 días.
* **Matriz Térmica ECharts (Heatmap):** Visualización interactiva temporal por meses y tickers.

---

### 6. Motor de Valuación Fundamental Adaptativa (`services/valuation_service.py` / `ValuationView.tsx`)
Auditoría por **Vía Negativa** con 6 modelos financieros según el perfil sectorial del activo:
1. `standard_fcf`: Tech, Pagos y Farma (ROIC vs WACC, Net Debt/EBITDA, dilución SBC/OCF).
2. `banking`: Bancos y Fintech (CET1 Fortress $>12\%$, RoTCE/ROE, provisiones NCO).
3. `financial_holding`: Conglomerados tipo Berkshire (Look-Through Earnings, Exceso de Caja, Costo de Float).
4. `industrial_dual_debt`: Industriales con división de deuda de manufactura vs deuda financiera de financiamiento a clientes.
5. `energy_upstream`: Petroleras y Gas (Lifting Cost, Breakeven Brent, flujos dolarizados).
6. `discarded`: Diagnóstico de trampas de valor por destrucción estructural de capital o dilución desmedida.

---

### 7. GuruFocus Fair Value & P/Normalized FCF (`services/fair_value_service.py` / `services/pfcf_service.py`)
* **Fair Value Global:** Persistencia en base de datos (`data/fair_values.json`) y cálculo de Margen de Seguridad (25% en EE.UU. / 35% en Emergentes).
* **P/Normalized FCF:** Valuación por múltiplos normalizados de flujo de caja libre histórico y percentil relativo.

---

### 8. Renta Fija & Bonos Soberanos (`services/fixed_income_service.py` / `FixedIncomeView.tsx`)
* **Curva Soberana Argentina en USD:** Fichas técnicas de Bonares (AL29, AL30, AL35, AL41) y Globales (GD29, GD30, GD35, GD38, GD41, GD46).
* **Métricas Clave:** Tasa Interna de Retorno (TIR), Modified Duration, Paridad y Spread de Legislación (NY vs Local).

---

### 9. Performance & Comparativas Multiactivo (`services/tv_service.py` / `PerformanceView.tsx`)
* **Conexión sin Autenticación:** TradingView Scanner API para escaneo de métricas de rendimiento histórico (`Perf.3M`, `Perf.6M`, `Perf.Y`, `Perf.YTD`, `SMA50`, `SMA200`).

---

## 3. Arquitectura de Datos (`data/`)

| Archivo JSON | Descripción | Servicio Responsable |
| :--- | :--- | :--- |
| `data/portfolios.json` | Definición de carteras modelo, activos y pesos/nominales | `portfolio_service.py` |
| `data/user_holdings.json` | Tenencias reales del usuario (nominales, PPC, caja ARS) | `rotation_service.py` |
| `data/earnings_calendar.json` | Fechas confirmadas y estimadas de balances | `earnings_service.py` |
| `data/fair_values.json` | Estimaciones de GuruFocus Fair Value | `fair_value_service.py` |
| `data/ppc_values.json` | Historial global de Precios Promedio de Compra | `ppc_service.py` |
| `data/pfcf_values.json` | Múltiplos P/FCF normalizados | `pfcf_service.py` |
| `data/valuation_profiles.json` | Perfiles y modelos de valuación fundamental | `valuation_service.py` |
| `data/user_valuation_inputs.json` | Inputs de valuación personalizados por el usuario | `valuation_service.py` |
| `data/cedear_ratios.json` | Ratios de conversión de CEDEARs a acción subyacente | `cedear_service.py` |

---

## 4. Estándares de Seguridad & QA

1. **Sanitización de Inputs (`security_service.py`):**
   * Regex estricto para tickers: `^[A-Z0-9.\-_]{1,12}$`.
   * Sanitización de nombres de cartera: alfanuméricos y guiones bajos (`^[a-zA-Z0-9_\-\s]{1,50}$`).
   * Límite de carga de archivos: `MAX_FILE_SIZE_BYTES = 1MB`.
2. **Snapshot Isolation en Tests:**
   * Toda la suite en `tests/` implementa aislamiento no destructivo (`setUpClass` / `tearDownClass` con `tempfile.TemporaryDirectory()`) para garantizar cero polución de las carteras reales del usuario.
3. **Comando de Verificación de Salud:**
   ```bash
   ./test.sh
   ```

---

## 5. Fórmulas Matemáticas de Referencia

### 1. RSI de Wilder (Relative Strength Index)
El sistema utiliza el método original de **J. Welles Wilder** para el cálculo del RSI (temporalidad diaria estricta `1d`, ventana histórica de 6 meses para convergencia, 14 períodos).

**1. Diferencia de Precios:**
$$ \Delta = P_t - P_{t-1} $$
*   **Ganancia ($U$):** $\max(\Delta, 0)$
*   **Pérdida ($D$):** $\max(-\Delta, 0)$

**2. Suavizado de Wilder (Smoothed Moving Average):**
Se utiliza una media móvil exponencial (EMA) con factor de suavizado $\alpha = \frac{1}{n}$ donde $n=14$:
$$ \text{AvgGain}_t = \alpha \cdot U_t + (1 - \alpha) \cdot \text{AvgGain}_{t-1} $$
$$ \text{AvgLoss}_t = \alpha \cdot D_t + (1 - \alpha) \cdot \text{AvgLoss}_{t-1} $$

**3. Fuerza Relativa (RS) e Índice (RSI):**
$$ RS = \frac{\text{AvgGain}}{\text{AvgLoss}} $$
$$ RSI = 100 - \left( \frac{100}{1 + RS} \right) $$

**Reglas de Borde (Protección contra División por Cero):**
*   Si $\text{AvgLoss} = 0$ y $\text{AvgGain} > 0 \implies RSI = 100$.
*   Si $\text{AvgLoss} = 0$ y $\text{AvgGain} = 0$ (precio plano constante) $\implies RSI = 50$.

---

### 2. Precio Promedio de Compra (PPC) y Alertas Take Profit
Monitorea la rentabilidad latente individual por activo para identificar oportunidades de toma de ganancias y rotación de capital.

**1. Rendimiento Latente Porcentual:**
$$ \text{PnL\%} = \left( \frac{P_{\text{actual}} - \text{PPC}}{\text{PPC}} \right) \times 100 $$

**2. Matriz de Alertas Paramétricas (Filtro Anti-Fatiga Visual):**
*   **Take Profit Mayor ($\text{PnL\%} \ge +25\%$):** Badge crítico púrpura/magenta. Sugiere toma parcial de ganancias o rebalanceo activo hacia activos rezagados.
*   **Take Profit Táctico ($+15\% \le \text{PnL\%} < +25\%$):** Badge ámbar de advertencia temprana.
*   **Régimen Neutral ($\text{PnL\%} < +15\%$):** Sin alertas intrusivas para mantener limpia la interfaz.

---

### 3. Rebalanceo de Cartera & Cartera Base Mínima (MCM)

**1. Nominales Proporcionales al Activo Ancla ($A$):**
Dado un activo seleccionado como ancla con cantidad $Q_A$, el número de nominales enteros para cada activo $i$ se calcula como:
$$ N_i = \text{round}\left( \frac{w_i}{w_A} \times \frac{P_A}{P_i} \times Q_A \right) $$

**2. Cuello de Botella y Cartera Base Mínima ($1\times$):**
Para determinar el capital mínimo indispensable para armar la cartera sin que ningún activo quede en 0 nominales, se calcula el capital unitario requerido por activo $C_i = \frac{P_i}{w_i / 100}$. El activo cuello de botella ($B$) es:
$$ B = \arg\max_{i} \left( \frac{P_i}{w_i / 100} \right) $$
Fijando $Q_B = 1$ se obtiene la estructura base $1\times$ indivisible de la cartera.

**3. Termómetro de RSI Ponderado de la Cartera:**
$$ \text{RSI}_{\text{cartera}} = \frac{\sum_{i} (N_i \times P_i \times \text{RSI}_i)}{\sum_{i} (N_i \times P_i)} $$
*   $\text{RSI}_{\text{cartera}} \le 40.0 \implies$ Sobreventa General (Zona de Acumulación).
*   $\text{RSI}_{\text{cartera}} \ge 65.0 \implies$ Sobrecompra General (Frenar Aportes / Evaluar Toma de Ganancias).

---

### 4. Matriz de Brechas de Rotación y Filtro de Veto Táctico

**1. Clasificación de Brecha:**
*   $\Delta N_i = N_{\text{real}, i} - N_{\text{target}, i}$
*   $\Delta N_i > 0 \implies$ **Superávit / Excedente** (Candidato a venta o rotación).
*   $\Delta N_i < 0 \implies$ **Déficit** (Candidato a compra para completar cupo).

**2. Filtro de Veto Táctico Anti-FOMO:**
*   Si un activo está en **Déficit** ($\Delta N_i < 0$), pero su oscilador técnico está en **Sobrecompra** ($\text{RSI}_i \ge 65.0$):
    $$ \text{Estado} \implies \text{Bloqueo de Compra / "Esperar retroceso técnico"} $$
*   Si el activo está en **Déficit** y presenta **Subvaluación Fundamental** ($P/\text{Norm FCF} \le 24$ o Margen GuruFocus $\ge 25\%$) junto con **Sobreventa** ($\text{RSI}_i \le 40.0$):
    $$ \text{Estado} \implies \text{"Oportunidad Óptima / Compra Fuerte"} $$

---

### 5. Renta Fija y Curva de Rendimiento Soberana

**1. Tasa Efectiva Anual (TEA / TIR):**
Para un instrumento capitalizable con precio de mercado $P$, valor final $VF$ y días al vencimiento $d$:
$$ \text{TEA} = \left( \frac{VF}{P} \right)^{\frac{365}{d}} - 1 $$

**2. Tasa Efectiva Mensual (TEM de Mercado):**
$$ \text{TEM} = (1 + \text{TEA})^{\frac{30}{365}} - 1 $$

**3. Retorno de Capital Teórico (Upside por Compresión de Spread / TIR):**
Dado un objetivo de compresión de TIR ($\text{TIR}_{\text{target}}$) y la Modified Duration ($MD$) del título:
$$ \text{Upside\%} = (\text{TIR}_{\text{mercado}} - \text{TIR}_{\text{target}}) \times MD $$
