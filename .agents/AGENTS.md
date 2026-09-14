# 🤖 Orquestador de Agentes & Subagentes - Máquina de Planes, Finanzas y Portfolios (MPFP)

Este archivo define la estructura de agentes de IA, roles de subagentes especializados, habilidades (*skills*) y procedimientos de calidad para el proyecto **Máquina de Planes, Finanzas y Portfolios (MPFP)** (FastAPI + React 19 + TypeScript + Vite + Tailwind CSS + Apache ECharts).

---

## 1. Mapa de Subagentes Especializados

```
                     ┌────────────────────────────────────────┐
                     │ 🎯 QUANT & FULL-STACK LEAD ENGINEER   │
                     │   (Pair Programming Bidireccional)     │
                     └───────────────────┬────────────────────┘
                                         │
         ┌───────────────┬───────────────┴───────────────┬───────────────┐
         │               │                               │               │
         ▼               ▼                               ▼               ▼
┌─────────────────┐ ┌─────────────────┐         ┌─────────────────┐ ┌─────────────────┐
│  🛡️ SUBAGENTE 1 │ │  📈 SUBAGENTE 2 │         │  🎨 SUBAGENTE 3 │ │  🧪 SUBAGENTE 4 │
│   Ciberseguridad│ │     Valuación   │         │ Frontend React  │ │  QA & Testing   │
│   & Hardening   │ │  & Modelos Fin  │         │   & ECharts     │ │   Automation    │
└─────────────────┘ └─────────────────┘         └─────────────────┘ └─────────────────┘
```

---

## 2. Definición Detallada de Roles

### 🛡️ Subagente 1: Cybersecurity & Hardening Auditor
- **Objetivo**: Garantizar que el backend y frontend sean invulnerables a inyecciones, fugas de memoria, manipulación concurrente o accesos no autorizados.
- **Herramientas & Responsabilidades**:
  1. Mantener `services/security_service.py` con filtros Regex estrictos para tickers, nombres de cartera e inputs de formularios.
  2. Verificar cabeceras OWASP en `main.py` (`X-Frame-Options`, `nosniff`, CSP).
  3. Auditar la subida de archivos JSON (`MAX_FILE_SIZE_BYTES = 1MB`).
  4. Asegurar que el servidor bindee únicamente en localhost (`127.0.0.1`).
  5. Proteger la integridad atómica de los 9 archivos JSON de base de datos con `AtomicJsonDatabase` y cerrojos reentrantes `threading.RLock()`.

### 📈 Subagente 2: Financial Valuation & Market Math Specialist
- **Objetivo**: Asegurar la fidelidad de los cálculos financieros, modelos de valuación adaptativos, calendario de reportes y conexión con mercados.
- **Herramientas & Responsabilidades**:
  1. Algoritmos de rebalanceo (`portfolio_service.py`) en modo `weights` y `nominals`, incluyendo Termómetro de RSI Ponderado.
  2. Suavizado Wilder de 14 periodos para RSI individual (`cedear_service.py`).
  3. Motor de Valuación Fundamental Adaptativa (`valuation_service.py`):
     - `standard_fcf` (Tech, Pagos, Farma con ROIC vs WACC, Net Debt/EBITDA, SBC/OCF).
     - `banking` (Bancos & Fintech con CET1 Fortress, RoTCE/ROE, NCO).
     - `financial_holding` (Holdings con Look-Through Earnings, Exceso de Caja y Costo de Float).
     - `industrial_dual_debt` (Deuda Industrial pura vs Financiera aislada).
     - `energy_upstream` (Lifting Cost, Breakeven Brent, Deuda Neta USD e Ingresos Dolarizados).
     - `discarded` (Diagnóstico de trampas de valor por dilución o pérdida de poder de precios).
  4. Memoria persistente de inputs ingresados por el usuario (`user_valuation_inputs.json`).
  5. Calendario de Reportes (`earnings_service.py`): persistencia de fechas certeras, orden jerárquico cronológico, alertas inminentes $< 14$ días y matriz térmica ECharts (Heatmap).
  6. GuruFocus Fair Value (`fair_value_service.py`): persistencia global y evaluación de señales de margen de seguridad (25% EE.UU. / 35% Emergentes).
  7. Precio Promedio de Compra (PPC) y Alertas Take Profit (`ppc_service.py`): persistencia global, cálculo de ganancias latentes y alertas paramétricas de dos niveles (Zona de Atención $\ge 20\%$ / Take Profit $\ge 35\%$).
  8. Laboratorio Cuantitativo de Markowitz (`markowitz_service.py`): simulación Monte Carlo, optimización SLSQP (Máximo Sharpe y Mínima Varianza), frontera eficiente y coordenadas para renderizado en ECharts.
  9. Curvas de Renta Fija Soberana y Corporativa (`fixed_income_service.py`): cálculo cuantitativo exacto de TIR y Modified Duration por bisección numérica (40 iteraciones, precisión $10^{-5}$), erradicación de fórmulas lineales sintéticas, cruce spot BYMA/MAE y cálculo de TEM Mensual (%) para instrumentos en ARS.
  10. Tenencias Reales Multi-Cuenta y Rotación Cuantitativa (`rotation_service.py`): persistencia y análisis de brechas 100% aislado por broker/cartera (`bal`, `bmb`, `min_drawdown_15`, etc.) en `data/user_holdings.json`, garantizando rebalanceo y órdenes sin interferencias cruzadas entre cuentas.
  11. Histórico de Índices & Ciclos Electorales (`market_indices_service.py`): series históricas multiactivo (S&P Merval en USD y ARS, ETF ARGT, EWZ Brasil, Bovespa BRL, S&P 500, Nasdaq, Dow Jones) con normalización Base 100, métricas financieras cuantitativas (CAGR, Max Drawdown, Volatilidad) y superposición interactiva de mandatos presidenciales e hitos electorales para Argentina, Brasil y Estados Unidos.

### 🎨 Subagente 3: Frontend React 19, UI/UX & ECharts Specialist
- **Objetivo**: Proporcionar una interfaz estética moderna, fluida y reactiva en React 19 + Vite + TypeScript + ECharts, garantizando un diseño exclusivo en **Modo Oscuro (*Eigengrau*)**, legibilidad WCAG AA, cero scroll horizontal en $\ge 1366\text{px}$, tipado estricto y renderizado robusto.
- **Herramientas & Responsabilidades**:
  1. **Esquema Cromático Exclusivo Eigengrau (Dark Only)**:
     - Lienzo base *Eigengrau* (`#0f1015`), tarjetas y paneles institucionales profundos (`#181920` / `rgba(24, 25, 32, 0.7)`) con bordes sutiles `rgba(255, 255, 255, 0.08)`.
     - Tipografía y contrastes gobernados por tokens oscuros (`text-white`, `text-zinc-300`, `text-zinc-400`), erradicando el Modo Claro, selectores `.light` y overrides con `!important` en CSS.
  2. **Superficies Neutras y Acentos Semánticos**:
     - Las tarjetas de sugerencias y alertas deben montarse sobre fondos neutros oscuros (`#181920`), utilizando pills/badges compactos de acento (`↗ COMPRAR`, `↘ VENDER`, `⚠️ ATENCIÓN`).
     - Fondos semánticos neutros con acentos puntuales de alto contraste (cero fondos saturados monocromáticos completos).
  3. **Garantía de Cero Scroll Horizontal ($\ge 1366\times 768$)**:
     - Todas las tablas maestras de datos financieros (CEDEARs, Cartera & Rotación, Balances, PPC, Fair Value) deben encajar al 100% de ancho sin barra de desplazamiento horizontal en pantallas de escritorio estándar ($\ge 1366\text{px}$), compactando celdas (`px-2 py-1.5`), abreviando encabezados y optimizando tipografías tabulares (`text-xs tabular-nums`).
  4. Single Page Application (SPA) en **React 19**, consumiendo endpoints REST JSON puros tipados.
  5. Tablas de decisión limpias con TanStack Table (Read-Only) y cajones de acción colapsables (*ActionDrawers*) para mutaciones consolidadas.
  6. Visualizaciones con Apache ECharts con tree-shaking riguroso (`echarts-for-react/lib/core` + `echarts/core`), desenvolviendo siempre de forma segura el módulo CommonJS (`(ReactEChartsCore as any)?.default || ReactEChartsCore`) para prevenir React Error #130.
  7. Contención y aislamiento dinámico de fallos mediante Error Boundaries con clave reactiva de ruta (`key={activeTab}`).
  8. Arquitectura 100% React SPA modular desacoplada con Vite ESM, consumiendo exclusivamente matrices numéricas REST JSON del backend FastAPI.
  9. Uso obligatorio del componente canónico `<Dropdown />` (`components/ui/Dropdown.tsx`) para todos los menús y selectores de la aplicación, garantizando de fábrica la libre elevación `z-50`, accesibilidad por teclado (`Escape`), detección de clic exterior, paleta Eigengrau con acentos (`blue` / `emerald`) y erradicación del bug de captura prematura `mouseup` en Linux/Chromium.
  10. Fidelidad semántica en gráficos: mapas de calor bidimensionales (Heatmap continuo Alpha vs SPY), curvas de dispersión con leyendas explícitas (tasa con premio vs comprimida) y tooltips con contraste WCAG AA independiente del canvas.
  11. Arquitectura de navegación ergonómica inspirada en Antigravity IDE: pantalla de inicio `LauncherHub.tsx` con disposición triangular de acciones principales, botones rectos (`rounded-[3px]`), textos concisos, cero emojis en botones y cabecera contextual `WorkspaceHeader.tsx` con memoria de sesión (`localStorage`).

### 🧪 Subagente 4: QA & Test Automation Engineer
- **Objetivo**: Mantener cobertura de tests automatizados, prevenir regresiones, garantizar el aislamiento no destructivo de datos y liderar el ciclo de desarrollo guiado por pruebas (TDD).
- **Herramientas & Responsabilidades**:
  1. **Protocolo TDD Obligatorio (Red-Green-Refactor)**:
     - **Fase Roja (*Red*)**: Diseñar y codificar primero la prueba unitaria en `tests/test_*.py` que defina el contrato matemático o funcional esperado, verificando su fallo antes de implementar.
     - **Fase Verde (*Green*)**: Implementar el código mínimo y necesario en `services/` o `routers/` para que la prueba pase a aprobado.
     - **Fase Refactor / Blindaje**: Limpiar y optimizar la implementación asegurando 0 regresiones en la suite completa.
  2. **Compatibilidad con Token Guard (Patrón Spotify)**:
     - Los tests deben ser modulares, atómicos y acotados (< 150 líneas por archivo o bloque), evitando lecturas monolíticas y manteniendo el consumo de tokens bajo control estricto.
  3. **Suite de Pruebas Integral**:
     - Cobertura de **125 tests automatizados** y verificación previa obligatoria de tipado TypeScript (`cd frontend && npx tsc --noEmit && npm run build`).
  4. **Snapshot Isolation Estricto**:
     - Redirección con `tempfile.TemporaryDirectory()` en `setUpClass` / `tearDownClass` para que ningún test altere, corrompa ni cree archivos JSON residuales en `data/` o en disco.
  5. Ejecución y mantenimiento del script de diagnóstico general `scripts/audit_project.py`, `scripts/audit_security_privacy.py` y el runner unificado `./test.sh`.

---

## 3. Skills del Ecosistema

1. **`byma`**: Consultas de fichas técnicas de bonos y acciones argentinas en BYMA.
2. **`mae`**: Consultas de flujo de fondos, TIR, Modified Duration y cotizaciones en tiempo real del Mercado Abierto Electrónico.
3. **`tradingview`**: Escaneo de métricas de rendimiento histórico multiactivo (`Perf.3M`, `Perf.6M`, `Perf.Y`, `Perf.YTD`, `SMA50`, `SMA200`).
4. **`earnings_calendar`**: Motor de cálculo cronológico jerárquico de balances, fechas confirmadas, días restantes/transcurridos, alertas inminentes $< 14$ días y matriz térmica ECharts.
5. **`fundamental_valuation`**: Motor de auditoría fundamental por vía negativa, perfiles adaptativos por sector (6 modelos), persistencia de inputs y sincronización con carteras.
6. **`audit_project`**: Herramienta CLI para escaneo automático de integridad en las 9 bases de datos, ciberseguridad y ejecución de tests.
