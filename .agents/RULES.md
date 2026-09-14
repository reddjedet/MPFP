# 📜 Reglas de Arquitectura, Ciberseguridad y Desarrollo - Máquina de Planes, Finanzas y Portfolios (MPFP)

Este documento establece las reglas canónicas que deben seguir todos los desarrolladores y agentes de IA al modificar, auditar o expandir **Máquina de Planes, Finanzas y Portfolios (MPFP)**.

---

## 1. 🛡️ Ciberseguridad & Blindaje del Backend
1. **Host Binding Estricto**: La aplicación debe vincularse exclusivamente a `127.0.0.1` (localhost). Jamás exponer a `0.0.0.0` sin capa de autenticación previa.
2. **Validación de Entradas (Zero Trust)**:
   - Toda entrada de usuario (tickers, nombres de cartera, ponderaciones, inputs de valuación) debe pasar por `services/security_service.py`.
   - **Tickers**: Expresión regular `^[A-Z0-9.]{1,10}$`.
   - **Nombres de cartera**: Expresión regular `^[a-z0-9_]{1,30}$`.
   - **Archivos de Importación**: Límite estricto de 1 MB (`MAX_FILE_SIZE_BYTES`) para evitar ataques de agotamiento de memoria (DoS).
3. **Cabeceras de Seguridad OWASP**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
4. **Protección de Datos Predefinidos**: Las carteras base del sistema (`bal` y `bmb`) no pueden ser sobreescritas ni eliminadas por endpoints públicos.
5. **Persistencia Atómica POSIX Multi-Base de Datos**:
   - Todos los repositorios de datos (`data/portfolios.json`, `data/fair_values.json`, `data/earnings_calendar.json`, `data/user_valuation_inputs.json`, `data/valuation_profiles.json`) deben usar `AtomicJsonDatabase` (`services/atomic_persistence.py`) con cerrojo `threading.RLock()` y atomic write (`.tmp` + `flush` + `fsync` + `os.replace`).

---

## 2. 📈 Fórmulas y Reglas de Cálculo Financiero

### 2.1 Rebalanceo y Portfolios
1. **RSI (Relative Strength Index)**: Suavizado exponencial de Wilder (14 periodos) con manejo de división por cero y fallback a 50.0.
2. **Termómetro de Momentum (RSI Ponderado)**: La aplicación calcula el RSI promedio ponderado por el peso real de cada activo en la cartera, mostrando un termómetro visual debajo del gráfico. El estado textual solo se muestra si está en zonas extremas (< 35 Sobrevendido, > 65 Sobrecomprado); en zonas neutrales se mantiene solo el valor numérico para reducir ruido visual.
3. **Modo Ponderaciones (`weights`)**: Normalización estricta a 100%, redondeo de enteros con respecto al activo ancla (`anchor_ticker` / `anchor_qty`).
4. **Modo Nominales (`nominals`)**: Cálculo de valor directo por cantidades nominales $\times$ precio actual.
5. **GuruFocus Fair Value & Persistencia Global**:
   - Persistencia global centralizada (`data/fair_values.json`) sincronizada en tiempo real entre carteras.
   - Umbrales de Margen de Seguridad: $\ge 25\%$ para activos de mercados desarrollados (EE.UU./Global) y $\ge 35\%$ para mercados emergentes (Brasil, Argentina, etc.).
6. **Precio Promedio de Compra (PPC) y Take Profit**:
   - Persistencia global (`data/ppc_values.json`) centralizada.
   - Cálculo del porcentaje de ganancia/pérdida (`(Current - PPC) / PPC`).
   - Generación de alerta `Take Profit` en rojo (Urgent: \> 25% de suba) o amarillo (Warning: \> 15% de suba).
7. **P/Normalized FCF & Momentum**:
   - Múltiplo fundamental cruzado con RSI(14) en vivo (`services/pfcf_service.py`) para clasificar en Óptimo (Ganga), Sub-óptimo, Hold o No Comprar.

### 2.2 Motor de Valuación Fundamental Adaptativa (Vía Negativa)
1. **Modelos Específicos por Sector**:
   - `standard_fcf` (Tech, Pagos, Farma): Spread ROIC vs WACC, Solvencia Net Debt/EBITDA, Dilución Accionaria y SBC / OCF.
   - `banking` (Bancos & Fintech): Ratio de Capital CET1 Fortress ($\ge 14.5\%$), Rentabilidad Tangible RoTCE/ROE ($\ge 16-17\%$), Calidad Crediticia NCO ($\le 0.50\%$) y Dilución.
   - `financial_holding` (Conglomerados & Holdings como BRK.B): Look-Through Operating Earnings $\times$ Múltiplo base $+$ Exceso de Caja e inversiones líquidas, con auditoría del Costo de Float ($\le 0.0\%$).
   - `industrial_dual_debt` (Industriales con brazo financiero como DE, CAT): Separación obligatoria de Deuda Industrial pura ($\le 1.0x$) aislando la división de préstamos, y FCF de ciclo medio.
   - `energy_upstream` (Shale Oil & Gas como VIST, PAM): Costo de extracción Lifting Cost ($\le \$5.00/\text{boe}$), Breakeven Brent ($< \$40/\text{bbl}$), Deuda Neta USD ($\le 0.8\text{x}$) e Ingresos dolarizados ($\ge 80\%$).
   - `discarded` (Trampas de valor): Vía negativa con veredicto automático `RED FLAG` (0.0% asignación sugerida) por dilución especulativa, quema estructural de caja o colapso de poder de precios.
2. **Memoria de Inputs**: Guardado automático de parámetros personalizados por ticker en `data/user_valuation_inputs.json`.
3. **Sincronización en 1 Clic**: Endpoint `/api/valuation/sync_to_gf` para propagar el Fair Value calculado directamente a las tablas de carteras.

### 2.3 Calendario de Reportes de Ganancias (Earnings Calendar)
1. **Fechas Certeras & Persistencia**: Guardado de `confirmed_date` (`YYYY-MM-DD`) en `data/earnings_calendar.json`.
2. **Jerarquía Cronológica Estricta de Ordenamiento**:
   - Nivel 1: Balances que reportan **Hoy** (`delta_days == 0`) y **Mañana** (`delta_days == 1`).
   - Nivel 2: Balances dentro del **Mes Actual** ordenados por días restantes.
   - Nivel 3: Balances del **Próximo Mes**.
   - Nivel 4: Balances de **Meses Posteriores**.
   - Nivel 5: Balances **Ya Presentados / Pasados** (`delta_days < 0`) ubicados al final.
3. **Eventos Relevantes (< 14 días)**:
   - Resaltado con insignia dorada/energética `.pill-event` tanto en la tabla general como en las carteras (`⚡ reporta en Xd (DD/MM)`).
4. **Formato Simplificado**: `reporta DD/MM` (omitir prefijos redundantes).

### 2.4 Renta Fija & Bonos
1. **TIR Cuantitativa Exacta por Bisección**: Resolución del VPN sobre flujos oficiales de cupones y amortizaciones mediante bisección numérica acotada (precisión $10^{-5}$) y derivación de Modified Duration analítica. Queda terminantemente prohibido el uso de aproximaciones lineales o "mock math".
2. **TEM Mensual en Tasa Fija ARS**: Cálculo obligatorio de la Tasa Efectiva Mensual en LECAPs y BONCAPs: $\text{TEM} = ((1 + \text{TEA}/100)^{30/365} - 1) \times 100$, exhibida como métrica reina junto al Valor Final (VF).
3. **Clasificación Determinista de Jurisdicción**: Identificación y tipado riguroso de `Ley NY` (GD/BP), `Ley Local` (AL/AE) y `BOPREAL (BCRA)` en los servicios y DataFrames.
4. **TIR Real**: $( (1 + TIR/100) / (1 + REM/100) - 1 ) \times 100$.
5. **Upside estimado**: $-MD \times (Target\_TIR - Current\_TIR)$.
6. **Eficiencia de tasa**: $TIR / MD$.

---

## 3. 🧪 Testing & Garantía de Calidad (QA)
1. **Regla de No Regresión**: Cualquier cambio debe validar que el 100% de la suite de tests (`./test.sh`) pase exitosamente.
2. **Aislamiento Total de Base de Datos en Tests (*Snapshot Isolation*)**:
   - Ningún test puede modificar ni borrar de forma permanente las entradas ingresadas por el usuario.
   - Todo test suite (`unittest.TestCase`) DEBE capturar en memoria un snapshot en `setUpClass` y restaurarlo obligatoriamente en `tearDownClass`.
3. **Módulos de Prueba Obligatorios (13 Suites / 112 Tests)**:
   - `test_security_service.py`: Validación contra inyección XSS, nombres maliciosos y strings de pesos inválidos.
   - `test_portfolio_calculations.py`: Verificación de algoritmos de rebalanceo y casos límite.
   - `test_cedear_service.py`: Precisión de RSI y cobertura de ratios de CEDEARs.
   - `test_cache_service.py`: Validación de TTL según horarios del mercado financiero y Thread-Safety con cerrojos.
   - `test_fair_value_service.py`: Cálculo de señales, margen de seguridad por tipo de mercado y persistencia atómica.
   - `test_earnings_service.py`: Cálculo de días, fechas pasadas, eventos inminentes y orden jerárquico cronológico.
   - `test_valuation_service.py`: Evaluación de los 6 modelos fundamentales, perfiles adaptativos y memoria de inputs de usuario.
   - `test_ppc_service.py`: Lógica de PPC, Take Profit y formato numérico regional.
   - `test_pfcf_service.py`: Clasificación fundamental P/FCF y cruce con RSI.
   - `test_markowitz_service.py`: Optimización de portafolios (Sharpe y Mínima Varianza) y simulación Monte Carlo.
   - `test_fixed_income_service.py`: Flujo de fondos, TIR, paridad y métricas de bonos soberanos y corporativos.
   - `test_rotation_service.py`: Tenencias reales multi-cuenta, aisladas por cartera y sugerencias de arbitraje.
   - `test_api_endpoints.py`: Integración HTTP con FastAPI `TestClient` para todas las rutas REST JSON.

---

## 4. 🎨 Frontend React 19, UI/UX & Visualización
1. **Arquitectura SPA Desacoplada y Modo Oscuro Exclusivo (Eigengrau `#0f1015`)**:
   - El frontend es una aplicación de una sola página (SPA) en **React 19 + TypeScript + Vite + ECharts**, servida directamente desde la raíz (`/`).
   - **Esquema Cromático Canónico (Dark Only)**: Fondo base Eigengrau (`#0f1015`), paneles y tarjetas institucionales en glassmorphism profundo (`#181920` / `rgba(24, 25, 32, 0.7)`), bordes sutiles `rgba(255, 255, 255, 0.08)`, y tipografía de alto contraste (`text-white` para titulares, `text-zinc-300` para cuerpo de datos, `text-zinc-400` para metadatos y etiquetas).
   - **Prohibición Terminante de Modo Claro**: Queda terminantemente erradicado y prohibido reintroducir el Modo Claro o alternancias de tema. No se admiten lienzos blancos/grises, selectores `.light` en CSS, ni estilos de contraste invertido que degraden la legibilidad de las métricas cuantitativas y gráficos.
2. **Superficies Neutras y Acentos Puntuales (Cero Verde sobre Verde / Cero Rojo sobre Rojo)**:
   - Toda tarjeta de sugerencia o estado financiero debe poseer fondo neutro (`bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/10`).
   - Queda terminantemente prohibido colorear contenedores completos con fondos saturados verdes o rojos con texto del mismo tono en su interior ("verde sobre verde", "rojo sobre rojo") o usar fondos grises fijos. Las acciones se declaran exclusivamente con badges o pills compactos (`↗ COMPRAR`, `↘ VENDER`) y las justificaciones en texto neutro de alto contraste (`text-slate-600 dark:text-zinc-300`).
3. **Garantía de Visibilidad Integral en Viewports $\ge 1366\times 768$ (Cero Scroll Horizontal)**:
   - En pantallas de resolución de escritorio ($1366\times 768$ en adelante), todas las columnas de las matrices financieras deben entrar completas y visibles sin generar barras de scroll horizontal. Se debe compactar el padding de celdas (`px-2.5 py-1.5`), utilizar fuentes compactas legibles (`text-xs`, `text-[11px]`) y abreviar títulos de columna donde sea necesario.
4. **Tree-Shaking Estricto de Librerías Visuales**:
   - En visualizaciones con Apache ECharts, está terminantemente prohibido importar el paquete monolítico completo (`import * as echarts from 'echarts'`).
   - Se debe importar exclusivamente el núcleo (`echarts-for-react/lib/core`), registrando únicamente los renderizadores (Canvas/SVG), gráficos (Bar, Line, Scatter, Heatmap) y componentes necesarios (Tooltip, Grid, Legend, DataZoom).
5. **Dashboard de Ejecución y Cajones Desplegables**:
   - Las tablas principales son matrices de consulta y decisiones rápidas (Read-Only).
   - Las modificaciones y carga de datos masivos se gestionan en cajones colapsables (*ActionDrawers*), enviando mutaciones consolidadas al backend.
6. **Insignias y Alertas Anti-Sobrecarga (Minimalismo Semántico)**:
   - Los badges de Fair Value y P/FCF solo se renderizan cuando representan una oportunidad o alerta accionable (`🟢 ÓPTIMO` o `Subval. >= 25%`). Los estados neutrales se mantienen sutiles para evitar fatiga cognitiva.
7. **Uso Obligatorio de Componentes Canónicos (`<Dropdown />`)**:
   - Todo selector o menú desplegable en la aplicación debe implementarse obligatoriamente con el componente canónico `<Dropdown />` (`components/ui/Dropdown.tsx`). Queda prohibido programar selectores ad-hoc con `useState/useRef` locales o utilizar elementos `<select>` nativos con `appearance-none`. El componente ya resuelve de forma nativa la jerarquía de stacking context (`z-50`), accesibilidad (`Escape`), clic exterior y la estética Eigengrau con soporte para acentos (`blue` / `emerald`).

---

## 5. 🏗️ Primitivas Canónicas & Golden Paths (El "Pit of Success")

> **Filosofía de Construcción (*Pit of Success*)**:  
> *"La arquitectura debe guiar al desarrollador y al agente hacia hacer lo correcto haciendo que lo correcto sea el camino más fácil y natural."*  
> En lugar de mantener una lista paralizante de advertencias defensivas ("no cometas el error X"), el sistema proporciona **abstracciones canónicas y contratos predefinidos** que hacen del error una imposibilidad estructural.
>
> 📌 *Para consultar el historial forense de incidentes, análisis post-mortem y causas raíz históricas (INC-01 al INC-17), consultar la caja negra en [`docs/aprendizaje_de_errores.md`](../docs/aprendizaje_de_errores.md).*

### Catálogo de Golden Paths y Primitivas Canónicas:

1. **Idempotencia en APIs (`GET` Inmutable)**:
   - **Golden Path**: Los endpoints `GET` son puramente funciones de lectura e idempotentes. Toda mutación de estado o I/O en disco viaja exclusivamente a través de verbos `POST`, `PUT` o `DELETE`.
2. **Mutaciones Atómicas Consolidadas**:
   - **Golden Path**: Las actualizaciones multivariable de un activo se ejecutan mediante endpoints consolidados atómicos (ej. `/api/portfolios/quick_update_json`), garantizando una única transacción de I/O en disco.
3. **Zona Horaria Bursátil Explícita**:
   - **Golden Path**: Todos los cálculos bursátiles y políticas de caducidad de caché fijan explícitamente `ZoneInfo("America/Argentina/Buenos_Aires")` (ART), garantizando sincronía exacta con la rueda operativa (11:00 a 17:00 ART).
4. **Conectores de Mercado Desacoplados**:
   - **Golden Path**: Los clientes de mercado externos residen formalmente en `services/clients/` (`byma_client.py`, `mae_client.py`, `tv_client.py`) consumidos mediante interfaces limpias y tipadas, sin manipulaciones de `sys.path`.
5. **Arquitectura Extensible por Estrategias (Pattern Strategy)**:
   - **Golden Path**: Descomponer la lógica en estrategias independientes por sector (`_evaluate_banking`, `_evaluate_energy_upstream`, etc.) registradas de forma declarativa en diccionarios de despacho (`MODEL_STRATEGIES`), preservando funciones concisas y desacopladas.
6. **Optimización de Bundles & Tree-Shaking**:
   - **Golden Path**: Modularizar imports y auditar chunks de Rollup/Vite para mantener el bundle principal por debajo de 200 kB y tiempos de compilación de $\approx 350\text{ms}$.
7. **Concurrencia Simple para Escritorio**:
   - **Golden Path**: Proteger la concurrencia local mediante cerrojos reentrantes estándar `threading.RLock()`, priorizando la robustez y simplicidad de depuración frente a patrones asíncronos distribuidos innecesarios.
8. **Paridad Continua de Contratos REST**:
   - **Golden Path**: Todo componente o vista frontend consume modelos Pydantic v2 documentados y testeados formalmente en `tests/test_api_endpoints.py`.
9. **Persistencia Atómica POSIX (`AtomicJsonDatabase`)**:
   - **Golden Path**: Todo almacenamiento JSON en `data/` se gestiona mediante `AtomicJsonDatabase` (`.tmp` + `flush` + `fsync` + `os.replace`), garantizando cero corrupción ante cortes intempestivos.
10. **Desenrollado Seguro de Módulos CommonJS en ESM**:
    - **Golden Path**: Al importar componentes de librerías externas con empaquetado mixto (como `echarts-for-react/lib/core`), desenrollar siempre defensivamente:  
      `const ReactComponent = (RawComponent as any)?.default || RawComponent;`  
      garantizando inmunidad contra el runtime error de React #130.
11. **Error Boundaries Reactivos con Reset por Navegación**:
    - **Golden Path**: Todo contenedor de ruta dinámico se envuelve con `<ErrorBoundary key={activeTab}>`, asegurando que cualquier fallo puntual en una pestaña no bloquee la interfaz y se resetee limpiamente al cambiar de vista.
12. **Aislamiento Efímero en Tests (*Snapshot Isolation con tempfile*)**:
    - **Golden Path**: Toda clase de test redirige los atributos `file_path` de las bases de datos (`_db`, `_ppc_db`, etc.) a un directorio efímero generado con `tempfile.TemporaryDirectory()` en `setUpClass` y restaura las rutas en `tearDownClass`. Cero mutaciones en `data/*.json` durante la ejecución de tests.
13. **SPA REST Pura (React 19 + TypeScript + Vite)**:
    - **Golden Path**: La capa de presentación es 100% una Single Page Application en React 19 servida desde la raíz. El backend FastAPI expone exclusivamente endpoints REST JSON con matrices numéricas.
14. **Contratos Tipados con Pydantic v2**:
    - **Golden Path**: Todos los cuerpos de petición se modelan con subclases de `BaseModel` de Pydantic v2 validados antes de procesar la lógica de negocio.
15. **Sincronización End-to-End de Pipelines de Calidad**:
    - **Golden Path**: `./test.sh` compila TypeScript (`tsc --noEmit`), valida el empaquetado de producción de Vite, corre la suite de 96 tests unitarios/integración y ejecuta la auditoría de integridad de las 9 bases de datos (`audit_project.py`).
16. **Importación Rigurosa de Tipos**:
    - **Golden Path**: Todo símbolo de type hinting (`Dict`, `List`, `Any`, `Optional`) se importa explícitamente desde `typing`, asegurando chequeo estático limpio.
17. **Componente Canónico de Selección (`<Dropdown />`)**:
    - **Golden Path**: Todo menú, selector de carteras, filtros o acciones desplegables se construye con `<Dropdown />` (`components/ui/Dropdown.tsx`). Encapsula de fábrica elevación dinámica de stacking context (`z-50`), detección exterior de clics, accesibilidad por teclado (`Escape`) y estética Eigengrau con acentos (`blue` / `emerald`).
18. **Estilos Atómicos Limpios y Tokens Neutros**:
    - **Golden Path**: Estructurar los estilos mediante utilidades atómicas de Tailwind CSS sobre tokens de superficie neutra (`#181920`), erradicando terminantemente overrides forzados con `!important`.
19. **Esquema Cromático Canónico (*Eigengrau* `#0f1015`)**:
    - **Golden Path**: La aplicación se rige por un esquema exclusivo de alto contraste en Modo Oscuro: fondo base `#0f1015`, paneles `#181920` con bordes `rgba(255,255,255,0.08)`, textos en `text-white` y `text-zinc-300`, y acentos semánticos compactos.
20. **Fidelidad Semántica y Ergonomía Visual en Apache ECharts**:
    - **Golden Path**: Todo gráfico refleja la exactitud de su fundamentación matemática (ej. Heatmap continuo bidimensional Alpha vs SPY), con tooltips configurados con fondo oscuro `#181920` y texto blanco (`#ffffff`) para contraste WCAG AA independiente del canvas.
21. **Mapeo Determinista y Validación Tipada en Enrutadores**:
    - **Golden Path**: Normalizar parámetros mediante diccionarios exhaustivos de alias y listas blancas tipadas; ante parámetros desconocidos, responder con error HTTP 400 descriptivo en lugar de desvíos silenciosos en `else`.
22. **Rigor Numérico Cuantitativo**:
    - **Golden Path**: Los cálculos de TIR, modified duration, margen de seguridad y frontera eficiente se derivan de algoritmos numéricos cuantitativos exactos (bisección numérica acotada a 40 iteraciones y precisión $10^{-5}$ sobre flujos oficiales), erradicando aproximaciones sintéticas mockeadas.
23. **Exposición de Métricas Canónicas del Mercado Local**:
    - **Golden Path**: En paneles de deuda fija en moneda local (LECAPs/BONCAPs), exponer prioritariamente la Tasa Efectiva Mensual (TEM %) y el Valor Final (VF).
24. **Elevación Jerárquica de Capas con Elementos Flotantes**:
    - **Golden Path**: Todo contenedor posicionado que aloje selectores o menús flotantes debe declarar jerarquía superior (`relative z-40` frente a `relative z-20` en bloques contiguos), garantizando que las capas flotantes reciban los eventos de ratón sin oclusión.
25. **Tenencias Reales Multi-Cuenta / Multi-Cartera Independientes**:
    - **Golden Path**: Las tenencias físicas del usuario se gestionan de forma 100% aislada por broker o cartera (`bal`, `bmb`, `min_drawdown_15`, etc.) en `data/user_holdings.json`, consumidas con el parámetro `?portfolio=...`. El análisis de brechas evalúa exclusivamente la cartera seleccionada, erradicando sugerencias cruzadas de venta entre brokers.
26. **Navegación Ergonómica y Botones Minimalistas de Acción (Estilo IDE)**:
    - **Golden Path**: La navegación principal se orquesta desde un Launcher Hub minimalista (`LauncherHub.tsx`) con botones de acción estructurados en disposición triangular, esquinas rectas con bordes no redondeados (`rounded-[3px]`), textos internos concisos de una sola línea, cero emojis en botones (reemplazados por iconos SVG outline de Lucide) y cabecera de espacio de trabajo contextual (`WorkspaceHeader.tsx`) que maximiza el área horizontal disponible para tablas y gráficos.
27. **Desarrollo Guiado por Pruebas (TDD Pragmático) & Token Guard**:
    - **Golden Path**: Toda nueva funcionalidad, cálculo financiero, modelo adaptativo o endpoint debe comenzar con una prueba previa en `tests/` que falle (*Red*), seguida de la implementación mínima aprobatoria (*Green*) y refactorización limpia (*Refactor*). Los archivos de prueba deben mantenerse modulares (< 150 líneas) y desacoplados para cumplir con el Token Guard (Patrón Spotify). No se permite la creación de archivos JSON residuales en disco para tests; toda persistencia de prueba debe realizarse en memoria o mediante directorios efímeros con `tempfile.TemporaryDirectory()`.
28. **Principio RODA (Read Once, Decide, Act) contra Parálisis por Análisis**:
    - **Golden Path**: Queda prohibido el re-escaneo o re-lectura redundante de archivos y funciones ya consultados durante la misma tarea, a menos que hayan sido modificados previamente por una acción de escritura. El agente debe recopilar la información mínima necesaria en una única pasada, decidir la estrategia y actuar directamente (escribir el test o editar el código). La validación de la solución se delega exclusivamente a la ejecución de la suite de pruebas automáticas (`unittest` / `tsc`), erradicando bucles de sobrecarga de cautela e inspección defensiva.

