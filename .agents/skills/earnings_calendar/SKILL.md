---
name: earnings_calendar
description: Motor de seguimiento de balances corporativos, persistencia de fechas confirmadas, cálculo jerárquico de días restantes y matriz térmica de reportes.
---

# 📅 Habilidad: Calendario de Reportes de Ganancias (Earnings Calendar)

Esta habilidad proporciona las directrices y herramientas para el cálculo cronológico y visualización de fechas de balances de empresas cotizantes en EE.UU. y CEDEARs.

## 1. Persistencia de Fechas Confirmadas
- **Archivo**: `data/earnings_calendar.json` mediante `AtomicJsonDatabase`.
- **Campo**: `confirmed_date` (formato `YYYY-MM-DD`).

## 2. Jerarquía Cronológica de Estados
1. **Hoy (`delta_days == 0`)**: `⚡ reporta hoy` (Nivel prioritario).
2. **Mañana (`delta_days == 1`)**: `⚡ reporta mañana (DD/MM)`.
3. **Inminente ($2 \le \text{delta\_days} < 14$)**: `⚡ reporta en Xd (DD/MM)` con badge `.pill-event` (dorada/ámbar).
4. **Mes Actual ($\text{delta\_days} \ge 14$)**: `reporta DD/MM`.
5. **Próximo Mes**: `reporta DD/MM`.
6. **Más Adelante**: `reporta DD/MM/YYYY`.
7. **Pasados (`delta_days < 0`)**: `reportó ayer (DD/MM)` o `reportó hace Xd (DD/MM)` con badge `.badge-past` (al final de la lista).

## 3. Visualizaciones
- **Matriz ECharts (Heatmap)**: Mapa de calor interactivo anual en React (Meses x Tickers) provisto por `/api/earnings/summary_json`.
- **Badges en Portfolios**: Insignia discreta en carteras si el activo reporta en $< 14$ días.
