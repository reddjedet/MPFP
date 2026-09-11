---
name: fundamental_valuation
description: Motor de valuación fundamental adaptativa por sector (vía negativa), cálculo de valor intrínseco, margen de seguridad y sincronización con carteras.
---

# 💎 Habilidad: Valuación Fundamental Adaptativa (Vía Negativa)

Esta habilidad formaliza los modelos financieros adaptados por sector para calcular el Fair Value, el precio límite de compra y el veredicto consolidado de inversión.

## 1. Modelos Sectoriales (6 Variantes)

### 1. `standard_fcf` (Tecnología, Pagos, Farma, Consumo)
- **Fair Value**: $\text{FCF Normalizado} \times \text{Múltiplo Base}$.
- **Reglas**: Spread ROIC vs WACC ($> 8\%$ óptimo), Net Debt/EBITDA ($\le 1.5\text{x}$), SBC / OCF ($< 10\%$), Shares CAGR ($\le 0\%$).

### 2. `banking` (Bancos & Fintech: JPM, NU)
- **Fair Value**: $\text{EPS Normalizado} \times \text{Múltiplo Base}$.
- **Reglas**: Ratio CET1 ($\ge 14.5\%$), RoTCE / ROE ($\ge 17\%$), Tasa de Pérdidas Crediticias NCO ($\le 0.50\%$).

### 3. `financial_holding` (Holdings & Conglomerados: BRK.B)
- **Fair Value**: $(\text{Look-Through Operating Earnings} \times 17\text{x}) + \text{Exceso de Caja / Letras del Tesoro}$.
- **Reglas**: Costo del Float Asegurador ($\le 0.0\%$, costo negativo), Recompras de acciones disciplinadas ($\le 0\%$).

### 4. `industrial_dual_debt` (Industriales de Capital Intensivo: DE, CAT)
- **Fair Value**: $\text{FCF de Ciclo Medio} \times \text{Múltiplo Base}$.
- **Reglas**: Deuda Industrial Pura aislada de la división de crédito ($\le 1.0\text{x}$ EBITDA), ROIC vs WACC.

### 5. `energy_upstream` (Shale Oil & Gas: VIST, PAM, VST)
- **Fair Value**: $\text{FCF / ADR} \times \text{Múltiplo Base}$.
- **Reglas**: Lifting Cost ($\le \$5.00/\text{boe}$), Breakeven Brent ($< \$40/\text{bbl}$), Deuda Neta USD ($\le 0.8\text{x}$), Ingresos en USD ($\ge 80\%$).

### 6. `discarded` (Trampas de Valor: MSTR, TSLA, MU, NEM, PLTR)
- **Veredicto Automático**: `RED FLAG` (Asignación sugerida: $0.0\%$).
- **Criterios de descarte**: Dilución destructiva, quema de caja o pérdida severa de pricing power.

## 2. Márgenes de Seguridad & Veredictos
- **Mercados Desarrollados (EE.UU./Global)**: Margen exigido $\ge 25\%$ (Precio compra $\le 0.75 \times \text{Fair Value}$).
- **Mercados Emergentes (Brasil, Argentina)**: Margen exigido $\ge 35\%$ (Precio compra $\le 0.65 \times \text{Fair Value}$).
- **Consolidación**:
  - `GREEN FLAG`: 0 banderas rojas, $\le 1$ amarilla y precio $\le$ precio límite de compra.
  - `YELLOW FLAG`: 1 bandera roja, $\ge 2$ amarillas o cotiza entre precio límite y Fair Value.
  - `RED FLAG`: Modelo de descarte, $\ge 2$ banderas rojas o sobrevaluación extrema.

## 3. Persistencia
- Inputs del usuario memorizados en `data/user_valuation_inputs.json`.
- Sincronización a portafolios mediante `/api/valuation/sync_gf_json`.
