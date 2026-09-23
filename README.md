#  Máquina de Planes, Finanzas y Portfolios (MPFP) — Terminal Cuantitativa y Asignación de Capital

Plataforma financiera integral para la gestión de carteras de inversión, arbitraje de rotación, optimización de Markowitz, valuación fundamental adaptativa por vía negativa, calendario de balances corporativos y análisis de renta fija soberana.

<p align="left">
  <img src="https://komarev.com/ghpvc/?username=reddjedet&label=Profile%20views&color=2563eb&style=flat-square" alt="Profile Views" />
</p>

---

## Stack Tecnológico Canónico

* **Backend:** Python 3.12+ (compatible hasta 3.14; versión canónica de producción 3.12.8 en Render / `.python-version`) + [FastAPI](https://fastapi.tiangolo.com/) + [Pydantic v2](https://docs.pydantic.dev/) + [NumPy](https://numpy.org/) / [Pandas](https://pandas.pydata.org/) / [SciPy](https://scipy.org/).
* **Frontend:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) + [Tailwind CSS](https://tailwindcss.com/) + [Apache ECharts](https://echarts.apache.org/) (`echarts-for-react/lib/core`) + [TanStack Table v8](https://tanstack.com/table) + [Lucide Icons](https://lucide.dev/).
* **Arquitectura:** Single Page Application (SPA) desacoplada servida desde la raíz de FastAPI (`http://127.0.0.1:8000/`) consumiendo exclusivamente contratos REST JSON tipados.
* **Persistencia Robusta SQLite WAL & Caché Multinivel:** Motor relacional SQLite (`services/sqlite_persistence.py`) con modo WAL (`PRAGMA journal_mode=WAL`), transacciones ACID inmediatas y durabilidad. Integrado con `MarketCacheStore` (`services/cache_service.py`) con arquitectura L1 en memoria (LRU) + L2 SQLite WAL persistente con prevención de estampidas (*single-flight coalescing*), preservando la interfaz retrocompatible `AtomicJsonDatabase` (`services/atomic_persistence.py`).

> [!IMPORTANT]
> **Arquitectura Pura y Cero Código Muerto:** Este proyecto opera exclusivamente con la SPA en React 19 y endpoints REST JSON en FastAPI. Toda tecnología de renderizado de servidor previa (Streamlit, HTMX, plantillas Jinja2 y gráficos generados con Plotly SSR) ha sido formalmente purgada y está prohibida en el desarrollo futuro.

---

## Mapa de Módulos del Sistema

1. **Rotación & Cartera Real (`/api/rotation` / `RotationView.tsx`):**
   
   - Gestión de cartera física real (acciones nominales, PPC y caja líquida en ARS).
   
   - Análisis de brechas (*Gap Analysis*) frente a carteras modelo (`min_drawdown_15`, `bal`, `bmb`).
   
   - Veto táctico anti-FOMO por sobrecompra ($RSI \ge 65.0$) y detección de compras óptimas ($RSI \le 40.0$).
2. **Portfolios & Rebalanceo K-Means (`/api/portfolios` / `PortfolioView.tsx`):**
   
   - Algoritmos en modos de Ponderaciones porcentuales (`weights`) y Nominales fijos (`nominals`).
   
   - Cartera Base $1\times$ por Mínimo Común Múltiplo (MCM) y selección de Ticker Ancla dinámico.
   
   - Termómetro de RSI ponderado por valor patrimonial.
   
   - Alertas paramétricas de Take Profit ($>15\%$ y $>25\%$) y métricas de Alpha vs. SPY.
3. **Laboratorio Cuantitativo de Markowitz (`/api/markowitz` / `MarkowitzLab.tsx`):**
   
   - Simulación Monte Carlo de miles de carteras aleatorias.
   
   - Optimización numérica SLSQP para Cartera de Máximo Sharpe (Tangente) y Mínima Varianza Global.
   
   - Trazado de Frontera Eficiente, Línea de Asignación de Capital (CAL) y Matriz de Correlación.
4. **CEDEARs & Mercado Local (`/api/cedears` / `CedearsView.tsx`):**
   
   - Cotizaciones en tiempo real de BYMA (ARS) y subyacentes en EE.UU. (USD).
   
   - Cálculo del tipo de cambio Contado con Liquidación (CCL) implícito.
   
   - Oscilador RSI suavizado según método original de J. Welles Wilder (14 periodos).
5. **Calendario de Balances Corporativos (`/api/earnings` / `EarningsView.tsx`):**
   
   - Jerarquía cronológica estricta: Hoy, Mañana, Inminentes ($< 14$ días con badge `.pill-event`), Mes Actual, Próximo Mes y Pasados.
   
   - Persistencia de fechas confirmadas (`data/earnings_calendar.json`).
   
   - Matriz térmica interactiva de reportes en Apache ECharts (Heatmap).
6. **Motor de Valuación Fundamental Adaptativa (`/api/valuation` / `ValuationView.tsx`):**
   
   - Auditoría financiera por **Vía Negativa** en 6 modelos sectoriales:
     - `standard_fcf` (Tech, Pagos, Farma): ROIC vs WACC, Net Debt/EBITDA, SBC/OCF, Shares CAGR.
     - `banking` (Bancos & Fintech): Ratio CET1 Fortress, RoTCE/ROE, Pérdidas crediticias NCO.
     - `financial_holding` (Holdings como BRK.B): Look-Through Earnings, Exceso de Caja, Costo de Float.
     - `industrial_dual_debt` (Industriales como DE, CAT): Deuda industrial pura vs financiera.
     - `energy_upstream` (Shale Oil & Gas como VIST, PAM): Lifting Cost, Breakeven Brent, flujos USD.
     - `discarded` (Trampas de valor): Veredicto `RED FLAG` automático (0% asignación).
   
   - Sincronización en un clic de Fair Values calculados hacia las carteras (`/api/valuation/sync_gf_json`).
7. **GuruFocus Fair Value & Múltiplos P/FCF (`services/fair_value_service.py` / `services/pfcf_service.py`):**
   
   - Persistencia global centralizada (`data/fair_values.json`, `data/pfcf_values.json`).
   
   - Margen de seguridad ($\ge 25\%$ en desarrollados, $\ge 35\%$ en emergentes).
   
   - Matriz de 4 estados cruzada con RSI (Óptimo, Sub-óptimo, Hold, No Comprar).
8. **Renta Fija Soberana & Curvas de Rendimiento (`/api/renta_fija` / `FixedIncomeView.tsx`):**
   
   - Curva en dólares (Bonares y Globales) y panel de LECAPs capitalizables.
   
   - Cálculo cuantitativo exacto de TIR y Modified Duration por bisección numérica, Paridad y TEM Mensual (%) destacada.
9. **Performance Multiactivo (`/api/performance` / `PerformanceView.tsx`):**
   
   - Escaneo TradingView Scanner API multiactivo (`Perf.3M`, `Perf.6M`, `Perf.Y`, `Perf.YTD`, `SMA50`, `SMA200`).
10. **Histórico de Índices & Ciclos Electorales (`/api/indices` / `MarketIndicesView.tsx`):**
   
   - Series históricas de retorno multiactivo (S&P Merval en USD y ARS, ETF ARGT, EWZ Brasil, Bovespa BRL, S&P 500, Nasdaq, Dow Jones) con normalización interactiva en Base 100.
   
   - Métricas cuantitativas de largo plazo (CAGR %, Max Drawdown %, Volatilidad anualizada).
   
   - Superposición de mandatos presidenciales y eventos electorales para Argentina, Brasil y Estados Unidos.

---

## Repositorios de Datos (`data/*.json`)

La aplicación persiste de forma atómica y aislada sus datos en **10 archivos JSON**:

| Archivo                           | Descripción                                                  | Servicio Responsable         |
|:--------------------------------- |:------------------------------------------------------------ |:---------------------------- |
| `data/portfolios.json`            | Carteras modelo teóricas (pesos, activos y nominales demo)   | `portfolio_service.py`       |
| `data/user_holdings.json`         | Tenencias multi-cuenta por broker (nominales, PPC, caja ARS) | `rotation_service.py`        |
| `data/earnings_calendar.json`     | Fechas confirmadas y estimadas de balances                   | `earnings_service.py`        |
| `data/fair_values.json`           | Estimaciones de GuruFocus Fair Value                         | `fair_value_service.py`      |
| `data/ppc_values.json`            | Precios Promedio de Compra globales                          | `ppc_service.py`             |
| `data/pfcf_values.json`           | Múltiplos P/Normalized FCF                                   | `pfcf_service.py`            |
| `data/valuation_profiles.json`    | Perfiles y modelos sectoriales de valuación                  | `valuation_service.py`       |
| `data/user_valuation_inputs.json` | Inputs de valuación personalizados por el usuario            | `valuation_service.py`       |
| `data/cedear_ratios.json`         | Ratios oficiales de conversión CEDEAR/Acción                 | `cedear_service.py`          |
| `data/historical_indices.json`    | Series históricas de índices bursátiles y mandatos políticos | `market_indices_service.py`  |

---

## Instalación y Puesta en Marcha

### 1. Clonar el Repositorio

```bash
git clone https://github.com/<tu-usuario>/<tu-repositorio>.git
cd <tu-repositorio>
```

### 2. Configurar Entorno Python

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configurar Frontend React 19

```bash
cd frontend
npm install
cd ..
```

### 4. Variables de Entorno (Opcional)

```bash
cp .env.example .env
```

---

## Comandos Operativos

### Iniciar la Aplicación

```bash
./start.sh
```

* Compila automáticamente la versión de producción de React.
* Inicia el backend FastAPI en `http://127.0.0.1:8000/`.
* Inicia el servidor de desarrollo Vite con Hot-Reload en `http://127.0.0.1:5173/`.
* Abre el navegador en la raíz de la SPA (`http://127.0.0.1:8000/`).

### Detener la Aplicación

```bash
./stop.sh
```

* Libera limpiamente los puertos `8000` y `5173` y finaliza los procesos en segundo plano.

### Ejecutar Pruebas y Diagnóstico Integral

```bash
./scripts/test.sh
```

El pipeline unificado de verificación ejecuta secuencialmente 4 fases:

1. **[1/4] Frontend (Tipado Estático):** Verificación de tipos en TypeScript (`npx tsc --noEmit`) para garantizar cero errores de interfaz.
2. **[2/4] Backend (Suite Automatizada):** Ejecución de 218 tests unitarios y de integración en `tests/` con Snapshot Isolation estricto (incluye persistencia SQLite, caché de mercado, guardrails agénticos, modelos de valuación, Markowitz y curvas soberanas).
3. **[3/4] Ciberseguridad y Privacidad:** Auditoría pre-commit (`scripts/audit_security_privacy.py`) para verificar ausencia total de secretos, tokens, archivos `.env` expuestos y cumplimiento de `.gitignore`.
4. **[4/4] Diagnóstico y Esquemas:** Validación de integridad estructural de las bases de datos y pruebas de inyección/XSS (`scripts/audit_project.py`).

---

## 📚 Documentación Técnica & Bitácora

* **[Instructivo General & Fórmulas](instructivo.md):** Mapa completo de modelos matemáticos, PnL, Rebalanceo MCM y fórmulas financieras.
* **[Aprendizaje de Errores & Anti-Patrones](docs/aprendizaje_de_errores.md):** Post-mortem técnico de incidentes, causas raíz y 9 Reglas de Oro inquebrantables.
* **[Bitácora de Evolución](docs/bitacora.md):** Registro histórico de fases de desarrollo y mejoras continuas de arquitectura.
* **[Módulos de Data Science & Finanzas Cuantitativas](docs/data_science/README.md):** Guía modular de 5 capítulos (Markowitz, Curvas de Rendimiento, Wilder RSI, Modelos Factoriales y Asignación Discreta).

---

## 🛡️ Ciberseguridad & Buenas Prácticas

1. **Zero Hardcoded Secrets:** Sin credenciales ni claves privadas en el código fuente. Las variables opcionales se configuran en un archivo local `.env` a partir de `.env.example`.
2. **Host Binding Canónico (DEP-01):** La aplicación local se enlaza exclusivamente a `127.0.0.1` (localhost). En plataformas PaaS (Render), `0.0.0.0` está reservado exclusivamente al contenedor interno detrás del reverse proxy administrado con TLS.
3. **Cabeceras de Seguridad OWASP & CSP (SEC-02 / SEC-03):** `nosniff`, `DENY` en X-Frame-Options, `X-XSS-Protection: 0`, CSP estricta sin `'unsafe-eval'` ni objetos embebidos (`object-src 'none'`), y CORS por entorno con `allow_credentials=False`.
4. **Snapshot Isolation Total:** Ninguna ejecución de pruebas toca ni modifica los datos de `data/*.json`. Cada suite redirige los punteros de base de datos a carpetas efímeras con `tempfile.TemporaryDirectory()`.
5. **Licencia & Términos:** Publicado bajo Licencia MIT (ver [LICENSE](LICENSE)).

---

## ⚖️ Descargo de Responsabilidad Financiera (Financial Disclaimer)

> [!WARNING]
> **Fines Exclusivamente Educativos y de Investigación:**
> 
> * Esta plataforma es una **herramienta de software cuantitativo y de simulación académica**.
> * Todos los datos precargados en los repositorios (`portfolios.json`, `user_holdings.json`, `ppc_values.json`, etc.) son **estrictamente ficticios, teóricos y educativos**. No representan tenencias patrimoniales reales ni carteras administradas por terceros.
> * El contenido, algoritmos, cálculos de valor intrínseco, indicadores técnicos (RSI) y optimizaciones de cartera (Markowitz) **no constituyen bajo ninguna circunstancia asesoramiento financiero, recomendación de inversión, oferta de compra/venta de activos ni intermediación bursátil**.
> * Las rentabilidades pasadas no garantizan rendimientos futuros. Cada inversor o usuario es el único y exclusivo responsable de sus decisiones de asignación de capital.
