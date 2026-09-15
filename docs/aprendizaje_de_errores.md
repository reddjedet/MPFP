# 🛡️ Aprendizaje de Errores & Anti-Patrones — Máquina de Planes, Finanzas y Portfolios (MPFP)

Este documento constituye la **caja negra de ingeniería y lecciones aprendidas** de **Máquina de Planes, Finanzas y Portfolios (MPFP)**. Recopila los incidentes reales enfrentados durante el desarrollo, la causa raíz identificada en cada caso, la solución definitiva implementada y las **Reglas de Oro Inquebrantables** para blindar la arquitectura y evitar cualquier regresión.

---

## 🗺️ Mapa Rápido de Incidentes y Aprendizajes

| ID | Incidente / Anti-Patrón | Causa Raíz | Solución Definitiva | Estado |
|---|---|---|---|:---:|
| **INC-01** | **Código Zombie / Stack Híbrido** (Jinja2, HTMX, Plotly SSR coexistiendo con React 19) | Migración incompleta por etapas sin purga del stack previo | Purga integral de templates, dependencias y routers legacy; prohibición en gobernanza | 🟢 Blindado |
| **INC-02** | **Polución de Base de Datos en Tests** (Tests sobreescribían datos reales de `data/*.json`) | Tests unitarios apuntaban a rutas de producción fijas | Snapshot Isolation obligatorio con `tempfile.TemporaryDirectory()` en `setUpClass`/`tearDownClass` | 🟢 Blindado |
| **INC-03** | **React Error #130 en ECharts** (Fallo al renderizar gráficos en React 19) | Incompatibilidad de módulo CJS de `echarts-for-react` con Vite ESM | Unwrapper defensivo `(ReactEChartsCore as any)?.default || ReactEChartsCore` | 🟢 Blindado |
| **INC-04** | **Auto-Rotación y Venta en Déficit** (Sugerencias incoherentes en Matriz de Rotación) | Falta de filtro en diagonal (`ticker_from == ticker_to`) y validación de superávit | Filtro estricto de exclusión de diagonal, validación de `gap_ars > 0` y timing de compra | 🟢 Blindado |
| **INC-05** | **Fallas en Fetching de Mercado** (Timeouts y errores 500 por APIs externas) | Llamadas sin caché resiliente ni fallback tipado ante caídas de red | `cache_service.py` con TTL adaptativo a horarios bursátiles y respuestas fallback seguras | 🟢 Blindado |
| **INC-06** | **Prompts de Subagentes Desalineados** (Subagentes proponiendo Jinja2/HTMX) | System prompt de `frontend_engineer.md` desactualizado con stack previo | Actualización de todos los roles de subagentes en `.agents/` con prohibición de legacy | 🟢 Blindado |
| **INC-07** | **Scripts de QA Desactualizados** (`audit_project.py` incompleto y `test.sh` sin TypeScript) | El sistema creció a 9 bases de datos y frontend TypeScript sin sincronizar scripts | Auditoría de 9 DBs e integración obligatoria de `tsc --noEmit && npm run build` en `test.sh` | 🟢 Blindado |
| **INC-08** | **Desincronización de Contratos API** (Endpoints con nombres o métodos dispares) | Rutas con nombres dispares (`/sync_gf` vs `/sync_gf_json`, payloads en query vs body) | Unificación en modelos Pydantic v2 en `Body(...)` y sincronización con interfaces TypeScript | 🟢 Blindado |
| **INC-09** | **Riesgo de Corrupción Atómica en Disco** (Escritura directa en archivos JSON) | Potencial corrupción si el servidor se interrumpe durante un `json.dump()` | `AtomicJsonDatabase` con escritura en `.tmp`, `os.fsync()`, reemplazo atómico y `threading.RLock()` | 🟢 Blindado |
| **INC-10** | **Cierre Instantáneo de Selectores en Linux** (Bug de captura `mouseup` GTK/Chromium) | `<select>` nativos con `appearance-none` y padres con `overflow-hidden` capturan el `mouseup` al hacer clic | Dropdowns personalizados controlados por React (`useState`, `useRef`, `Escape`, `z-50`) sin `overflow-hidden` | 🟢 Blindado |
| **INC-11** | **Inconsistencias Cromáticas y Contraste en Modo Claro** (Textos blancos/amarillos ilegibles y canvas desincronizado) | Reglas CSS globales agresivas (`[class*="bg-blue-600"]`) y renderizado `<canvas>` de ECharts ajeno a hojas CSS | Paleta clara neutra de 3 capas, hook `useChartTheme()` para tokens reactivos y purga de reglas globales destructivas | 🟢 Blindado |
| **INC-12** | **El Espejismo del Modo Dual (Claro/Oscuro)** (Complejidad exponencial de contraste en dashboards cuantitativos) | La coexistencia de dos temas cromáticos en una suite de alta densidad genera colisiones y deuda técnica | Erradicación total del Modo Claro; estandarización canónica en **Modo Oscuro Exclusivo (*Eigengrau* `#0f1015`)** | 🟢 Blindado |
| **INC-13** | **Inconsistencia Semántica en Visualizaciones** (Falsa "Matriz Térmica" y fallos de hover ilegible) | Nomenclatura desalineada de la matemática visual y tooltips sin contraste explícito sobre canvas | Heatmap continuo bidimensional calibrado por **Alpha vs SPY** y tooltips con contraste WCAG AA independiente | 🟢 Blindado |
| **INC-14** | **Despacho Binario Rígido y Fallback Residual** (Duplicación silenciosa de BOPREAL en Soberanos USD) | Evaluación `letra = "H" if category == "hard_dollar" else "B"` donde `"soberanos"` caía ciegamente en `"B"` | Mapeo determinista de alias explícitos, validación tipada y eliminación de fallbacks residuales en `else` | 🟢 Blindado |
| **INC-15** | **"Mock Math" y Fórmulas Ficticias en Renta Fija** (TIR estimada con fórmula lineal ad-hoc y filtro de ley roto) | Números mágicos sintéticos para "salvar" faltantes de datos y filtros en router por columnas inexistentes | Cálculo cuantitativo exacto de TIR y Duration por **bisección numérica**, flujos espejo y tipado de jurisdicción | 🟢 Blindado |
| **INC-16** | **Omisión de Métricas Clave de Mercado** (Falta de TEM Mensual en tabla de LECAPs) | Diseño de UI desacoplado de las convenciones prácticas del mercado financiero local | Integración de `tem_mkt` en backend y destaque visual en verde esmeralda en frontend | 🟢 Blindado |
| **INC-17** | **Oclusión de Menús por Stacking Contexts Hermanos** (Imposibilidad de seleccionar opciones superiores en dropdown) | Hermanos relativos con igual `z-index` (`z-20`): el segundo se apila encima y captura los clics de los hijos absolutos | Elevación jerárquica del stacking context padre (`z-40` vs `z-20`) para liberar el área de interacción | 🟢 Blindado |
| **INC-18** | **Fricción de TDD Rígido en Micro-Iteraciones de UI** (Bloqueo y lentitud en ajustes cosméticos de frontend) | Aplicación uniforme e inflexible del ciclo Red-Green-Refactor estricto a componentes visuales y diseño | Protocolo Dual Adaptativo (**Opción A**): TDD estricto en backend/matemáticas y desarrollo ágil por hitos en UI con `npx tsc --noEmit` | 🟢 Blindado |

---

## 🔍 Análisis Detallado de Incidentes y Post-Mortem

---

### 1. INC-01: Código Zombie & Arquitectura Híbrida (Mezcla de Stacks)

#### Síntoma y Contexto
Durante el proceso de evolución del proyecto, se construyó una Single Page Application (SPA) moderna en React 19 servida desde `main.py`. Sin embargo, en el backend continuaban existiendo carpetas `templates/` con 11 archivos Jinja2, referencias a HTMX, scripts de renderizado con Plotly SSR (`fig.to_html()`), y routers duplicados como `routers/pruebas.py` o endpoints que recibían `Request` y retornaban fragmentos HTML.

#### Causa Raíz
Se preservaron los archivos del stack anterior bajo la premisa de "tener un respaldo por si algo falla". Esta práctica generó:
1. **Contaminación de Contexto:** Los modelos de IA y agentes leían los templates Jinja2 y generaban sugerencias para HTMX en lugar de componentes React.
2. **Desperdicio de Recursos:** El backend cargaba dependencias pesadas (`jinja2`, `plotly`) y ejecutaba lógica de renderizado que el frontend en React ignoraba por completo.
3. **Mantenimiento Duplicado:** Modificar un endpoint requería actualizar la versión JSON y la versión HTML para evitar tests rotos.

#### Solución Definitiva
1. Se eliminaron de raíz todas las carpetas y archivos legacy: `templates/`, `static/styles.css`, `routers/pruebas.py`.
2. Se eliminaron `plotly` y `jinja2` de `requirements.txt`.
3. Se unificaron todos los routers exclusivamente en contratos REST JSON puros.
4. Se formalizaron las **Reglas 13 y 14** en `.agents/RULES.md` prohibiendo terminantemente la reintroducción de librerías SSR o templates.

#### 💡 Regla de Oro
> **Regla de Oro 1:** Al migrar a una Single Page Application (React 19), todo el código, librerías y plantillas del stack anterior deben ser purgados de forma atómica e integral. Prohibido conservar código "por las dudas". Si una funcionalidad es necesaria, se implementa como componente React consumiendo un endpoint JSON.

---

### 2. INC-02: Polución de Base de Datos en Tests (Destrucción de Entradas de Usuario)

#### Síntoma y Contexto
Cada vez que un desarrollador o agente ejecutaba `pytest` o `./test.sh`, los archivos reales de configuración del usuario en `data/*.json` sufrían alteraciones silenciosas:
- `data/fair_values.json` se sobreescribía con un valor de prueba para Apple (`150.0`).
- `data/portfolios.json` perdía o modificaba los portfolios reales guardados.
- `data/ppc_values.json` quedaba con datos ficticios (`AAPL: 120.0`).

#### Causa Raíz
Las clases de test unitario (`unittest.TestCase`) instanciaban servicios o ejecutaban peticiones con `TestClient(app)` que escribían directamente en las rutas por defecto de producción (`data/`). Aunque algunos tests intentaban restaurar los datos en `tearDown()`, cualquier aserción fallida o interrupción dejaba los archivos corrompidos permanentemente.

#### Solución Definitiva
Se implementó el patrón canónico **Snapshot Isolation** mediante `tempfile.TemporaryDirectory()`:
```python
@classmethod
def setUpClass(cls):
    cls.temp_dir = tempfile.TemporaryDirectory()
    cls.mock_db_path = os.path.join(cls.temp_dir.name, "test_db.json")
    # Redirigir la base de datos o el path del servicio al directorio efímero
    cls.patcher = patch.object(service_module, "DB_PATH", cls.mock_db_path)
    cls.patcher.start()

@classmethod
def tearDownClass(cls):
    cls.patcher.stop()
    cls.temp_dir.cleanup()
```
Ningún test vuelve a tocar el directorio `data/` del proyecto.

#### 💡 Regla de Oro
> **Regla de Oro 2:** Ninguna suite de pruebas automatizadas puede leer ni escribir sobre los archivos reales de usuario en `data/*.json`. Todo test debe operar en un entorno efímero (`tempfile.TemporaryDirectory()`) aislado en memoria o en disco temporal que se destruye automáticamente al finalizar.

---

### 3. INC-03: React Error #130 al Renderizar Apache ECharts

#### Síntoma y Contexto
Al renderizar vistas complejas con visualizaciones interactivas (como el Termómetro de RSI en `PortfolioView`, la Frontera Eficiente en `MarkowitzLab` o la Matriz de Reportes en `EarningsView`), la aplicación crasheaba con pantalla en blanco y el error de React:
```
Error: Minified React error #130; visit https://react.dev/errors/130 for the full details.
```

#### Causa Raíz
La librería `echarts-for-react` está empaquetada internamente como un módulo CommonJS (CJS). En el entorno Vite + Rollup con soporte para React 19 (ES Modules estricto), el import `import ReactEChartsCore from 'echarts-for-react/lib/core'` no expone la función componente directamente en el default import en todas las condiciones de bundling, sino que queda anidada en `.default`.

#### Solución Definitiva
Se estableció el patrón defensivo de desenvolvimiento para todas las instancias de ECharts en la aplicación:
```tsx
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, HeatmapChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, VisualMapComponent } from 'echarts/components';

echarts.use([CanvasRenderer, LineChart, BarChart, HeatmapChart, TooltipComponent, GridComponent, VisualMapComponent]);

// Unwrapper defensivo para evitar React Error #130:
const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;
```
Además, se envolvió cada vista en un `ErrorBoundary` reactivo con clave de pestaña (`key={activeTab}`) para que cualquier error visual quede confinado sin voltear la navegación completa de la aplicación.

#### 💡 Regla de Oro
> **Regla de Oro 3:** Al utilizar librerías visuales de terceros empaquetadas en CJS dentro de Vite + React 19, desenvuelve siempre defensivamente el módulo exportado (`(Component as any)?.default || Component`) y aplica tree-shaking manual de módulos para mantener bundles ligeros y prevenir crasheos de renderizado.

---

### 4. INC-04: Auto-Rotación y Venta de Activos en Déficit

#### Síntoma y Contexto
En el módulo de Rotación Táctica de Cartera (`RotationView`), la tabla de sugerencias recomendaba rotar activos hacia sí mismos (ejemplo: vender `AAPL` para comprar `AAPL`), o sugería vender activos que se encontraban en déficit respecto al peso objetivo de la cartera modelo.

#### Causa Raíz
1. La función de cruce matricial no excluía la diagonal principal donde el activo emisor y el activo receptor coincidían (`ticker_from == ticker_to`).
2. No se comprobaba rigurosamente el signo del desvío patrimonial (`gap_ars`): un activo con déficit de capital (gap negativo) era evaluado como potencial donante de liquidez si su RSI era moderadamente alto.

#### Solución Definitiva
1. Se añadió una cláusula de exclusión explícita: `if ticker_from == ticker_to: continue`.
2. Se definió la condición previa indispensable para ser activo donante: `gap_ars > 0` (solo activos con superávit real de capital pueden donar liquidez).
3. Se integró el veto táctico por timing: el activo receptor debe tener $RSI < 65$ (o de lo contrario la orden se veta clasificándose como `⏳ ESPERAR RETROCESO`).

#### 💡 Regla de Oro
> **Regla de Oro 4:** Toda matriz de arbitraje cuantitativo debe filtrar matemáticamente la diagonal principal y verificar las condiciones de solvencia y dirección de flujo antes de generar órdenes de rebalanceo o rotación.

---

### 5. INC-05: Fallas Silenciosas en Consultas de Mercado Externas

#### Síntoma y Contexto
Cuando BYMA, MAE o TradingView tardaban en responder, aplicaban rate limiting temporal o devolvían esquemas vacíos, el backend arrojaba excepciones no controladas (Error 500) y la interfaz de usuario se congelaba o mostraba indicadores rotos.

#### Causa Raíz
Llamadas de red síncronas o asíncronas sin timeouts prudentes, sin caché en memoria para absorber picos de peticiones y sin respuestas fallback tipadas.

#### Solución Definitiva
1. Creación de `services/cache_service.py` con políticas de TTL inteligente:
   - Durante horario bursátil: TTL de 5 minutos.
   - Fuera de horario bursátil y fines de semana: TTL de 30 a 60 minutos.
2. Control de concurrencia con `threading.RLock()` para proteger las estructuras de caché en memoria.
3. Respuestas fallback estructuradas: si la conexión falla, se retorna la última cotización conocida en caché o valores seguros por defecto, acompañados de un mensaje explicativo en los logs sin propagar el error 500 al cliente.

#### 💡 Regla de Oro
> **Regla de Oro 5:** Toda integración con proveedores de mercado externos (TradingView, BYMA, MAE, Yahoo Finance) debe ser protegida con caché en memoria con TTL dinámico, timeouts estrictos y mecanismos de fallback que garanticen que la aplicación continúe operativa aun con cortes de red.

---

### 6. INC-06: Desalineación de System Prompts en Subagentes de IA

#### Síntoma y Contexto
Al trabajar en pair programming con agentes de IA autónomos (subagentes), el agente `frontend_engineer` intentaba continuamente reintroducir plantillas HTML, sintaxis HTMX o scripts de Plotly, requiriendo correcciones manuales recurrentes.

#### Causa Raíz
El archivo `.agents/agents/frontend_engineer.md` contenía instrucciones obsoletas previas a la migración: *"Eres el Frontend Engineer especializado en HTMX, Jinja2, Plotly y Vanilla CSS"*. El modelo de lenguaje ejecutaba fielmente su system prompt desactualizado.

#### Solución Definitiva
1. Se reescribió por completo el archivo `.agents/agents/frontend_engineer.md`, estableciendo explícitamente:
   - Especialidad: React 19, TypeScript, Vite, Tailwind CSS y Apache ECharts.
   - Prohibición Arquitectónica: Terminantemente prohibido generar HTML en backend, Jinja2, HTMX o Plotly SSR.
2. Se actualizaron al unísono las directrices maestras en `.agents/AGENTS.md` y `.agents/RULES.md`.

#### 💡 Regla de Oro
> **Regla de Oro 6:** Al ejecutar una migración tecnológica, los archivos de contexto, prompts de agentes y directrices de gobernanza deben actualizarse de manera sincrónica e inmediata. Los agentes de IA son tan precisos como las instrucciones y el contexto que se les provee.

---

### 7. INC-07: Desfase en Scripts Operativos y Pipelines de Verificación

#### Síntoma y Contexto
El comando `./test.sh` reportaba que todo estaba en orden, pero al iniciar la aplicación web o correr `npm run build`, la compilación fallaba por errores tipográficos en interfaces de TypeScript o parámetros incompatibles en componentes React. Además, el script `scripts/audit_project.py` solo verificaba 5 archivos JSON de base de datos cuando el sistema ya utilizaba 9.

#### Causa Raíz
Los scripts de testing no estaban integrados holísticamente:
1. `test.sh` solo invocaba pruebas de backend (`pytest` / `unittest`), ignorando el frontend.
2. `audit_project.py` no fue actualizado cuando se incorporaron nuevos servicios (`ppc_service`, `pfcf_service`, `user_holdings`, `cedear_ratios`).

#### Solución Definitiva
1. Se actualizó `scripts/audit_project.py` para auditar la integridad, permisos y sintaxis de los **9 archivos JSON** de base de datos.
2. Se blindó `test.sh` para ejecutar una validación de calidad en tres etapas:
   - **Etapa 1:** Tipado y compilación del frontend (`cd frontend && npx tsc --noEmit && npm run build`).
   - **Etapa 2:** Suite completa de backend (12 suites / 91 tests automatizados con Snapshot Isolation).
   - **Etapa 3:** Auditoría de integridad de base de datos y ciberseguridad con `scripts/audit_project.py`.

#### 💡 Regla de Oro
> **Regla de Oro 7:** El pipeline de verificación local (`./test.sh`) debe ser holístico: ningún cambio se considera aprobado si no valida tanto la compilación y tipado estricto de TypeScript en el frontend, como la suite completa de tests de backend y la integridad estructural de las bases de datos.

---

### 8. INC-08: Desincronización de Contratos de API (Frontend vs Backend)

#### Síntoma y Contexto
Botones de sincronización en la interfaz (como "Sincronizar Fair Value" o "Rebalancear Cartera") no tenían efecto o devolvían errores 422 (Unprocessable Entity) debido a discordancias en los nombres de rutas (`/sync_gf` vs `/sync_gf_json`) o en la estructura esperada del payload (parámetros en querystring versus cuerpo JSON).

#### Causa Raíz
Falta de formalización de contratos REST entre los componentes React y los routers de FastAPI.

#### Solución Definitiva
1. Todos los endpoints de mutación (`POST`, `PUT`, `DELETE`) reciben payloads JSON tipados definidos con modelos Pydantic v2 en `Body(...)`.
2. Las llamadas en el frontend utilizan interfaces TypeScript que replican con exactitud los esquemas de Pydantic.
3. Se añadió `test_api_endpoints.py` que ejercita cada ruta con `TestClient` verificando códigos de estado y respuestas JSON.

#### 💡 Regla de Oro
> **Regla de Oro 8:** Todo intercambio de datos entre frontend y backend debe regirse por contratos JSON tipados (Pydantic v2 en Python, TypeScript interfaces en React), eliminando parámetros sueltos o formularios urlencoded.

---

### 9. INC-09: Riesgo de Corrupción de Datos en Escrituras Concurrentes

#### Síntoma y Contexto
Si el servidor se detenía bruscamente (cierre de terminal, reinicio de sistema) mientras se guardaba una cartera grande o una actualización masiva de precios, existía riesgo de dejar archivos JSON truncados o corrompidos.

#### Causa Raíz
El método convencional de Python `with open(path, 'w') as f: json.dump(...)` vacía el archivo antes de terminar de escribir. Si ocurre una interrupción en ese milisegundo, los datos se pierden irreversiblemente.

#### Solución Definitiva
Se formalizó la clase `AtomicJsonDatabase` (`services/atomic_persistence.py`):
1. **Archivo Temporal:** Se escribe el nuevo contenido en un archivo intermedio `.tmp`.
2. **Flush y Sincronización:** Se llama a `f.flush()` y `os.fsync(f.fileno())` para forzar la escritura física en disco por parte del sistema operativo.
3. **Reemplazo Atómico:** Se ejecuta `os.replace(tmp_path, target_path)`, una operación atómica a nivel de sistema de archivos POSIX/Linux.
4. **Cerrojo Reentrante:** Cada operación está protegida por un `threading.RLock()` para garantizar thread-safety en entornos multihilo.

#### 💡 Regla de Oro
> **Regla de Oro 9:** Toda persistencia en disco de bases de datos JSON debe ser atómica (archivo temporal `.tmp`, `os.fsync()`, `os.replace()`) y protegida por cerrojos `threading.RLock()`. Jamás escribir directamente sobre el archivo de producción con `open('w')`.

---

### 10. INC-10: Cierre Instantáneo de Selectores Nativos en Linux / Chromium

#### Síntoma y Contexto
En las vistas de **Rotación Inteligente & Cartera Real** (`RotationView`), **Rebalanceo K-Means** (`PortfolioView`) y **Markowitz Lab** (`MarkowitzLab`), al hacer un clic simple sobre el selector de cartera, el menú desplegable se cerraba instantáneamente en el mismo milisegundo. El usuario solo podía seleccionar una opción manteniendo presionado el botón izquierdo del ratón sin soltarlo hasta situarse sobre el ítem deseado (*"el selector de cartera se cierra tan pronto como lo abro. puedo sortear ese problema sosteniendo el click, pero no es lo apropiado"*).

#### Causa Raíz
1. **Captura Prematura del Evento `mouseup` en Linux GTK/Chromium:** En entornos Linux bajo Chromium con librerías GTK3/GTK4, un elemento `<select>` nativo de HTML con estilos de `appearance-none` invoca el popup nativo del sistema operativo justo debajo del cursor del ratón en el evento `mousedown`. En una pulsación de clic ordinaria (que dura entre 80ms y 150ms), el evento complementario `mouseup` se dispara ya encima de la ventana emergente de GTK, provocando que el sistema operativo lo interprete como una confirmación inmediata de selección sobre el ítem situado en esa coordenada, cerrando el menú de inmediato.
2. **Geometría Truncada por `overflow-hidden`:** Los paneles contenedores (`glass-panel`) utilizaban la clase `overflow-hidden` para recortar elementos gráficos decorativos (círculos difusos con `blur-3xl`), lo que además impedía que cualquier componente desplegable absoluto flotara fuera del límite visual del contenedor.

#### Solución Definitiva
1. **Componente Dropdown Controlado por React:** Se reemplazaron todos los selectores nativos críticos por componentes Dropdown reactivos basados en estado (`useState`), referencias al DOM (`useRef`), detección de clics exteriores (`mousedown` sobre `document`) y accesibilidad mediante teclado (tecla `Escape`).
2. **Aislamiento de Fondos Decorativos:** Se reestructuraron las tarjetas de cabecera aislando las luces y degradados borrosos dentro de contenedores absolutos específicos (`<div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">`), liberando al contenedor principal de `overflow-hidden` y otorgándole `relative z-20` para permitir la elevación de menús con `z-50`.
3. **Ergonomía Visual Glassmorphism:** Se incorporaron indicadores de estado activo con iconos `CheckCircle2`, efectos hover transparentes y bordes activos en azul/esmeralda según el contexto temático de la vista.

#### 💡 Regla de Oro
> **Regla de Oro 10:** En interfaces React modernas para Linux y navegadores Chromium, no utilizar elementos `<select>` nativos combinados con `appearance-none` en selectores principales de navegación o cartera. Utilizar componentes Dropdown controlados por estado React con contención de eventos, soporte para `Escape` y libre elevación espacial (`z-50`) sin que los contenedores padre los recorten con `overflow-hidden`.

---

### 11. INC-11: Inconsistencias Cromáticas y Contraste Ilegible en Modo Claro

#### Síntoma y Contexto
Al activar el modo claro de la aplicación, diversas pantallas presentaban graves anomalías de contraste y legibilidad:
1. **Sidebar:** El botón de la pestaña activa mostraba un fondo celeste claro (`bg-blue-600/15`) con texto blanco forzado, tornando el título del módulo casi ilegible.
2. **Laboratorio de Markowitz:** En la frontera eficiente y las tarjetas de métricas aparecían textos, leyendas y líneas amarillas brillantes sobre fondos blancos y grises claros (`#edf2f9` / `#ffffff`), volviéndose prácticamente invisibles.
3. **Reportes Corporativos (Earnings):** La matriz térmica mostraba un contraste agresivo y desordenado con celdas negras, franjas oscuras y textos azules estridentes.
4. **Curvas de Renta Fija y Performance:** Ejes, tooltips, líneas benchmark y etiquetas de dispersión mantenían fondos negros y textos pálidos desalineados con el fondo claro de la página.

#### Causa Raíz
1. **Reglas CSS Globales Agresivas con Selectores por Subcadena:** En `index.css` existía la regla `.light [class*="bg-blue-600"] { color: #ffffff !important; }`. El selector por subcadena `[class*="..."]` capturaba clases con opacidad como `bg-blue-600/15` (usada para fondos suaves) y forzaba el texto a blanco `!important` sobre fondos celestes claros.
2. **Aislamiento del Renderizado Canvas en ECharts:** Los gráficos de Apache ECharts se dibujan en elementos `<canvas>` a nivel de píxel puro mediante JavaScript. Las reglas de Tailwind CSS o selectores globales en CSS no tienen ningún alcance sobre los ejes, etiquetas, leyendas, líneas o tooltips de ECharts. Al cambiar a modo claro, si los objetos `option` conservan valores estáticos oscuros (`#ffffff`, `#181920`, `#ffd600`), los gráficos se vuelven ilegibles.
3. **Falta de un Sistema de Color Jerárquico Neutro:** Se utilizaban colores llamativos (amarillos, celestes saturados, franjas negras) para elementos secundarios o fondos, rompiendo la jerarquía visual del modo claro.

#### Solución Definitiva
1. **Purga de Selectores CSS Destructivos:** Se eliminó la regla `[class*="bg-blue-600"]` y se restringió el forzado de texto blanco exclusivamente a botones de acción sólida primaria: `.light button.bg-blue-600:not([class*="/"]) { color: #ffffff !important; }`.
2. **Establecimiento de la Paleta Neutra de 3 Capas para Modo Claro:**
   - **Capa Base (Canvas App):** Slate 50 (`#f8fafc`).
   - **Capa Superficie (Tarjetas `.glass-panel`):** Blanco puro (`#ffffff`) con borde `#e2e8f0` y sombra sutil `0 1px 3px rgba(0,0,0,0.04)`.
   - **Capa Contenedora Interna (Subpaneles e Inputs):** Slate 100 (`#f1f5f9`) con texto de alto contraste Slate 900 (`#0f172a`).
   - Colores llamativos reservados exclusivamente para botones de acción directa, alertas de riesgo (rojo/ámbar) e información cuantitativa crítica.
3. **Hook Centralizado Reactivo `useChartTheme()`:** Se creó el hook `frontend/src/hooks/useChartTheme.ts`, el cual lee el estado de `useTheme()` y suministra tokens optimizados en milisegundos para Apache ECharts:
   - Tooltips claros (`#ffffff` con borde `#e2e8f0` y texto `#0f172a` en modo claro).
   - Ejes y rejillas en gris suave (`#cbd5e1` / `#f1f5f9`).
   - Líneas benchmark y puntos óptimos con tonalidades de alto contraste (Ámbar oscuro `#b45309` / Azul `#2563eb`).
   - Etiquetas de dispersión en Slate 900 (`#0f172a`).
4. **Sincronización Total de Componentes ECharts:** Se conectaron las 6 vistas con gráficos (`EarningsView`, `FixedIncomeView`, `PerformanceView`, `RotationView`, `MarkowitzCharts`, `PortfolioCharts`) a `useChartTheme()`, garantizando adaptación visual instantánea sin recargar la página.

#### 💡 Regla de Oro
> **Regla de Oro 11:** Nunca utilices selectores CSS globales agresivos basados en subcadenas (`[class*="..."]`) para forzar estilos de texto sobre variantes de color con opacidad. En Single Page Applications con librerías de Canvas (Apache ECharts), la sincronización cromática de temas claro/oscuro debe orquestarse mediante un Hook reactivo centralizado (`useChartTheme`) que inyecte tokens de contraste adaptativo directamente en la definición de las opciones del gráfico.

---

### 12. INC-12: El Espejismo del Modo Dual (Claro/Oscuro) en Dashboards Cuantitativos y su Erradicación Definitiva

#### Síntoma y Contexto
A pesar de los esfuerzos por estabilizar el Modo Claro (INC-11), la coexistencia de dos temas cromáticos en un dashboard financiero institucional de alta densidad (con múltiples gráficos Apache ECharts en `<canvas>`, tablas maestras con cientos de celdas numéricas, badges condicionales de rebalanceo y alertas de margen de seguridad) continuaba introduciendo una fragilidad permanente: colisiones sutiles de texto claro sobre fondos desincronizados, pérdida de jerarquía en contrastes de riesgo y un costo de mantenimiento desproporcionado.

#### Causa Raíz
Los dashboards cuantitativos profesionales operan con mayor nitidez analítica bajo un fondo oscuro uniforme donde los colores semánticos (verde ganancia, rojo pérdida, ámbar advertencia, azul benchmark) destacan sin competir con un lienzo brillante. Mantener paridad dual en librerías de canvas exigía duplicar configuraciones de temas para cada gráfico y generaba fatiga visual innecesaria. El usuario ordenó: *"el modo claro está dando muchos problemas. vamos a eliminarlo de cuajo. que no quede nada. sólo modo oscuro de ahora en más"*.

#### Solución Definitiva
1. **Erradicación Total del Modo Claro:** Se eliminaron los selectores `.light`, toggles de tema (`ThemeToggle`), clases redundantes `dark:` y archivos de estilo dual.
2. **Estandarización Canónica en Modo Oscuro (*Eigengrau*):**
   - **Lienzo Base:** *Eigengrau* profundo (`#0f1015`).
   - **Superficies & Paneles:** Glassmorphism institucional (`#181920` / `rgba(24, 25, 32, 0.8)` con bordes `rgba(255, 255, 255, 0.08)`).
   - **Tipografía de Alto Contraste:** `text-white` para títulos, `text-zinc-300` para métricas y `text-zinc-400` para metadatos.
   - **Acentos Semánticos Exclusivos:** Colores saturados restringidos a pills y badges compactos sobre superficies neutras oscuras.

#### 💡 Regla de Oro
> **Regla de Oro 12:** En MPFP (Máquina de Planes, Finanzas y Portfolios), el estándar cromático es única y exclusivamente **Modo Oscuro (*Eigengrau* `#0f1015`)**. Queda terminantemente prohibido reintroducir el Modo Claro, selectores `.light`, toggles de tema o overrides forzados globales con `!important`. Toda nueva vista debe construirse sobre superficies neutras oscuras con tipografía de alto contraste WCAG AA.

---

### 13. INC-13: Inconsistencia Semántica en Visualizaciones (La Falsa "Matriz Térmica" y Fallos de Hover en Canvas)

#### Síntoma y Contexto
En la sección de Rendimiento Histórico (Performance), la vista se titulaba "Matriz Térmica de Rendimiento", pero en realidad mostraba una tabla convencional sin gradientes térmicos ni calor visual (*"no sé si es correcto llamar matriz 'térmica' a este gráfico... no veo el componente 'térmico'"*). Además, al hacer hover sobre los gráficos de barras o dispersión, el texto del tooltip tenía el mismo color que el fondo, resultando completamente ilegible.

#### Causa Raíz
1. **Desfase entre Nomenclatura y Realidad Visual:** Se bautizó como "matriz térmica" a un componente que no implementaba la lógica matemática ni visual de un Heatmap bidimensional continuo.
2. **Tooltips Desacoplados en ECharts:** Los tooltips no definían explícitamente estilos de fondo y color (`backgroundColor`, `textStyle.color`), heredando valores por defecto que se mimetizaban con el canvas en hover.

#### Solución Definitiva
1. **Verdadero Heatmap Bidimensional:** Se rediseñó el componente utilizando la serie `heatmap` de Apache ECharts, con una escala de color divergente continua calibrada por **Alpha vs SPY** (benchmark de referencia). Las celdas reflejan visualmente el diferencial respecto al mercado mediante intensidad cromática (rojo = bajo rendimiento relativo, neutro = en línea con mercado, verde = sobre-rendimiento/alpha positivo).
2. **Retorno Dual Informativo:** Cada celda exhibe el retorno absoluto del activo y, en simultáneo, el alpha generado contra el SPY.
3. **Blindaje de Tooltips:** Se forzó `backgroundColor: '#181920'`, `borderColor: 'rgba(255, 255, 255, 0.15)'` y tipografía clara `#ffffff` de alto contraste en todas las opciones de ECharts.

#### 💡 Regla de Oro
> **Regla de Oro 13:** Toda denominación en la interfaz debe responder rigurosamente a su fundamento matemático y visual: no llamar "matriz térmica" a una tabla que carezca de un gradiente de calor bidimensional continuo. Todo tooltip en gráficos de Canvas (ECharts) debe declarar explícitamente colores de fondo y texto con contraste verificado WCAG AA, impidiendo cualquier colisión de color en eventos hover.

---

### 14. INC-14: Despacho Binario Rígido y Fallback Residual Ciego (El Bug Soberanos vs. BOPREAL)

#### Síntoma y Contexto
Al navegar al módulo de Renta Fija y alternar entre las pestañas "Soberanos USD" y "BOPREAL", ambas vistas mostraban exactamente los mismos títulos (BPOB7, BPOD7) y la misma curva de rendimiento, provocando que los bonos soberanos reestructurados (AL30, GD30, etc.) fueran inaccesibles para el usuario (*"'soberanos usd' y 'bopreal' parecen estar mostrando lo mismo"*).

#### Causa Raíz
En `fixed_income_service.py`, la selección de la letra de cotización de MAE se ejecutaba mediante un condicional binario rígido con fallback residual:
```python
letra = "H" if category == "hard_dollar" else "B"
```
El frontend enviaba `category="soberanos"`. Al no ser estrictamente `"hard_dollar"`, la condición caía de forma silenciosa y ciega en el bloque `else: "B"` (BOPREAL). El backend devolvía la curva de BOPREAL sin emitir advertencia, error de validación ni excepción HTTP 400.

#### Solución Definitiva
1. **Mapeo Determinista de Alias:** Se implementó un mapeo exhaustivo y normalizado:
```python
cat_clean = category.strip().lower()
is_hard_dollar = cat_clean in {"hard_dollar", "soberanos", "soberano", "usd"}
letra = "H" if is_hard_dollar else "B"
```
2. **Validación Defensiva Temprana:** Se eliminó cualquier `else:` que asuma categorías por descarte sin validación previa contra una lista blanca permitida.
3. **Test Unitario de No Regresión:** Se añadió `test_endpoint_soberanos_category_alias` en `tests/test_fixed_income_service.py` que comprueba explícitamente que invocar `category="soberanos"` retorne títulos con `moneda == "USD"` y soberanos oficiales (AL/GD).

#### 💡 Regla de Oro
> **Regla de Oro 14:** Prohibido utilizar sentencias `else:` residuales para asignar categorías o parámetros de negocio por descarte ciego. Todo parámetro de categoría debe validarse contra una lista blanca tipada o mapearse mediante un registro explícito de alias. Si el valor es desconocido, el sistema debe emitir un error de validación explícito (HTTP 400) en lugar de retornar datos equivocados de forma silenciosa.

---

### 15. INC-15: "Mock Math" y Fórmulas Ficticias en Modelos Cuantitativos vs. Rigor Numérico

#### Síntoma y Contexto
En el servicio de renta fija, cuando el bono más negociado de Argentina (AL30) no aparecía con flujo de fondos directo en la API de MAE, el código ejecutaba una fórmula lineal sintética inventada para estimar su TIR:
```python
tir_est = round(9.15 + (0.56 - p_usd) * 35.0, 2)
```
Además, en `routers/renta_fija.py`, el filtrado por ley (`Ley NY` vs `Ley Local`) provocaba tablas vacías debido a que el servicio devolvía un DataFrame que carecía de la columna `tipo` o `ley`, dejando un bloque de código muerto huérfano (`_bond_type`).

#### Causa Raíz
1. **Uso de "Mock Math" o Atajos Lineales:** Se introdujo una interpolación lineal de fantasía para "mostrar un valor" en lugar de implementar el cálculo financiero cuantitativo real sobre el cronograma oficial de cupones y amortizaciones.
2. **Contratos Incompletos entre Servicio y Router:** El router filtraba por `df["tipo"]`, pero el DataFrame producido por el servicio no garantizaba dicha columna, silenciando los datos.

#### Solución Definitiva
1. **Erradicación de Fórmulas Ficticias:** Se eliminó completamente cualquier aproximación sintética.
2. **Algoritmo Cuantitativo de Bisección Numérica:** Se implementó `calculate_irr_and_duration(price, cash_flows)`:
   - Resuelve el Valor Presente Neto $NPV(r) = \sum \frac{CF_t}{(1+r)^t} - P = 0$ mediante **bisección numérica acotada** (40 iteraciones, precisión de $10^{-5}$).
   - Calcula la Modified Duration analítica ponderada sobre los flujos descontados.
3. **Flujos Espejo Oficiales y Cotizaciones Spot:** Se estructuraron los flujos espejo para los bonos reestructurados (ej. AL35 espejo de GD35, GD30 espejo de AL30) combinados con cotizaciones spot de BYMA (`AL30D`, `GD30D`), garantizando cobertura cuantitativa real para los 8 bonos soberanos.
4. **Clasificación Determinista de Jurisdicción:** Se creó `classify_bond_law(ticker)`, asegurando que tanto `tipo` como `ley` existan con valores certeros (`Ley NY`, `Ley Local`, `BOPREAL (BCRA)`).

#### 💡 Regla de Oro
> **Regla de Oro 15:** Tolerancia cero al "Mock Math" y a las fórmulas sintéticas inventadas. En MPFP (Máquina de Planes, Finanzas y Portfolios), todo cálculo de rendimiento, valuación, duration o frontera eficiente debe derivarse de métodos cuantitativos rigurosos (bisección numérica, flujos de fondos oficiales, optimización cuadrática) o reportar `null` explícito si los datos de mercado no son suficientes. Jamás inventar números mágicos para llenar campos en la interfaz.

---

### 16. INC-16: Omisión de Métricas Operativas Clave del Mercado Local (TEM Mensual en LECAPs)

#### Síntoma y Contexto
En el panel de instrumentos de tasa fija en pesos (LECAPs y BONCAPs), la tabla presentaba TEA, TNA y Modified Duration, pero omitía la **Tasa Efectiva Mensual de Mercado (TEM)** y el **Valor Final Capitalizado (VF)**, obligando a los operadores a realizar cálculos manuales para saber cuánto rinde el instrumento a 30 días.

#### Causa Raíz
Diseño del modelo de datos enfocado únicamente en la convención estándar internacional (TEA anualizada), desconociendo la práctica cotidiana del mercado monetario argentino, donde la TEM es la métrica de referencia canónica con la que se comparan plazos fijos, cauciones y LECAPs.

#### Solución Definitiva
1. **Cálculo de TEM de Mercado:** Se incorporó en backend la capitalización mensual de mercado:
   $$\text{TEM} = \left( (1 + \text{TEA}/100)^{30/365} - 1 \right) \times 100$$
2. **Destaque Visual Protagónico:** Se rediseñó la tabla en `FixedIncomeView.tsx` posicionando la **TEM Mensual (%)** como métrica reina, formateada en verde esmeralda con fondo tenue y tipografía tabular destacada, junto al **Valor Final (VF)** y días al vencimiento.

#### 💡 Regla de Oro
> **Regla de Oro 16:** Toda interfaz financiera debe respetar y priorizar las convenciones operativas del mercado local en el que cotizan los activos (ej. TEM Mensual y Valor Final para letras de tasa fija en moneda local; Paridad y Jurisdicción para títulos de deuda soberana en USD).

---

### 17. INC-17: Oclusión de Menús Desplegables por Stacking Contexts Hermanos en CSS

#### Síntoma y Contexto
En la vista de Rebalanceo de Carteras (`PortfolioView`), al desplegar el menú de carteras, el usuario no podía seleccionar las opciones superiores (`BAL` y `BMB`). Al hacer clic sobre ellas, el menú se cerraba de inmediato sin activar la selección ni disparar la petición de datos correspondiente (*"el desplegable de portfolios no me permite seleccionar bal ni bmb"*).

#### Causa Raíz
1. **Colisión de Contextos de Apilamiento (*Stacking Contexts*) en Elementos Hermanos:**
   - La cabecera superior contenedora del dropdown (`CABECERA Y CONTROLES`) estaba estilizada con `relative z-20`.
   - El elemento hermano que le seguía en el DOM (la barra de multiplicador de rebalanceo `Rebalancing Multiplier Bar`) también poseía `relative z-20`.
   - Por especificación CSS, cuando dos elementos hermanos posicionados comparten el mismo `z-index`, el navegador los apila según su orden en el documento: el segundo se dibuja por encima del primero.
2. **Oclusión de Puntero por Contenedores Transparentes:**
   - El menú flotante del dropdown tenía `position: absolute; z-index: 50`. Sin embargo, al ser descendiente del primer contenedor (`z-20`), su alcance quedó atrapado dentro de ese contexto de apilamiento.
   - Al desplegarse hacia abajo, la porción superior del menú cayó físicamente detrás del área de la barra de rebalanceo hermana, la cual se extiende de lado a lado con un fondo transparente (`bg-white/[0.02]`).
   - Al pulsar sobre las opciones superiores (`BAL` o `BMB`), el evento de clic del ratón impactó sobre la barra de rebalanceo hermana en lugar de los botones del menú. El listener global `handleClickOutside` detectó un clic fuera de la referencia del dropdown y procedió a cerrarlo sin ejecutar la acción.

#### Solución Definitiva
1. **Elevación Jerárquica del Contenedor Padre:**
   - Se incrementó el contexto de apilamiento de la cabecera a `relative z-40`, garantizando que todo su subárbol se renderice por encima de la barra hermana (`z-20`).
   - Se elevó el contenedor inmediato del selector a `relative z-50`.
2. **Simplificación y Robustez de Eventos:**
   - Se limpiaron los manejadores redundantes de `onMouseDown` en los botones hijos a favor de `onClick` estándar, con guarda temprana si el portfolio ya se encuentra seleccionado.

#### 💡 Regla de Oro
> **Regla de Oro 17:** En interfaces con elementos flotantes absolutos (`z-50`), el contenedor padre posicionado (`relative`) debe poseer un `z-index` superior al de cualquier elemento hermano contiguo posterior en el DOM. Si dos hermanos posicionados comparten el mismo `z-index`, los hijos absolutos del primero quedarán atrapados y serán ocluidos por el segundo hermano, interceptando clics silenciosamente y disparando cierres falsos por clic exterior.

---

### 18. INC-18: Fricción Burocrática de TDD en Micro-Iteraciones de UI (Opción A - Desarrollo Ágil por Hitos)

#### Síntoma y Contexto
Durante iteraciones de diseño, ajustes de layout, cambios de espaciado, variantes de acento en botones o maquetación en React 19, la exigencia de escribir un test unitario previo (*Red-Green-Refactor*) antes de tocar cualquier línea generaba una enorme fricción burocrática, tests frágiles acoplados al árbol DOM y ralentizaba el ciclo de pair programming.

#### Causa Raíz
Aplicación dogmática e indiferenciada de una misma metodología de pruebas a dos dominios de naturaleza opuesta:
1. **Lógica Financiera / Backend / Persistencia:** Requiere matemática determinista, tolerancia cero al error y contratos estrictos (TDD Red-Green-Refactor obligatorio).
2. **Interfaz de Usuario / Estilos / Ergonomía:** Es inherentemente exploratoria, visual e iterativa; testear si un botón tiene `px-3` o `px-4` con unit tests previos agrega costo sin valor de calidad.

#### Solución Definitiva
Se formalizó el **Protocolo Dual Adaptativo (Opción A)**:
1. **TDD Estricto:** Reservado para fórmulas cuantitativas (TIR, Markowitz, PPC, Fair Value), persistencia atómica multi-DB (`AtomicJsonDatabase`), filtros de seguridad y endpoints.
2. **Protocolo Ágil por Hitos (Opción A):** Para frontend y UI. Durante el desarrollo se valida el tipado estricto quirúrgico con `npx tsc --noEmit`. Al concluir el hito (*Milestone Completion*), se ejecuta la suite completa de integración (`./test.sh`) y diagnósticos para certificar 0 regresiones.

#### 💡 Regla de Oro
> **Regla de Oro 18:** Adaptar el harness de calidad a la capa del sistema: rigor TDD estricto (*Red-Green-Refactor*) para modelos matemáticos, contratos de datos y persistencia; y protocolo ágil por hitos (*Opción A*) para el frontend, apalancándose en el compilador de TypeScript (`tsc --noEmit`) para agilidad visual sin comprometer la solidez de la suite de integración al consolidar.

---

## 🎯 Resumen de Reglas de Oro Inquebrantables

1. **Stack Puro:** React 19 SPA + FastAPI REST JSON. Cero templates Jinja2, cero HTMX, cero Plotly SSR.
2. **Snapshot Isolation:** Tests obligatoriamente aislados en `tempfile.TemporaryDirectory()`. Prohibido alterar `data/*.json`.
3. **ECharts Resiliente:** Unwrapper defensivo para evitar React Error #130 y Tree-shaking estricto de componentes.
4. **Validación Cuantitativa:** Filtrar diagonales de matrices y validar solvencia económica antes de emitir sugerencias.
5. **Resiliencia de Mercado:** Caché en memoria con TTL dinámico bursátil y fallbacks seguros ante caídas de proveedores.
6. **Sincronía de Gobernanza:** Actualizar `.agents/` y system prompts al mismo tiempo que la arquitectura del código.
7. **Verificación Holística:** `./test.sh` debe compilar TypeScript en frontend y aprobar los 125 tests de backend sin excepciones.
8. **Contratos Tipados:** Pydantic v2 en FastAPI y TypeScript interfaces en React para todos los endpoints.
9. **Persistencia Atómica:** Escritura segura `.tmp` + `os.fsync()` + `os.replace()` con cerrojos `threading.RLock()`.
10. **Dropdowns Reactivos:** Dropdowns controlados por estado en frontend, inmunes a bugs de captura GTK en Linux y sin recorte por `overflow-hidden`.
11. **Superficies Neutras y Tokens Centralizados:** Sincronización reactiva de gráficos Canvas mediante tokens semánticos claros, eliminando selectores CSS globales invasivos.
12. **Modo Oscuro Exclusivo (*Eigengrau*):** Estándar `#0f1015` dark only. Prohibición absoluta de modo claro, selectores `.light` o toggles de tema.
13. **Fidelidad Semántica y Ergonomía en Canvas:** Nombres que respondan a la realidad matemática/visual (Heatmaps bidimensionales continuos) y tooltips de ECharts con contraste WCAG AA explícito.
14. **Prohibición de Fallbacks Residuales Ciegos:** Validación estricta con lista blanca y mapas de alias. Prohibido usar `else:` para asumir categorías por descarte silencioso.
15. **Tolerancia Cero a "Mock Math":** Rigor cuantitativo estricto mediante algoritmos numéricos (bisección, flujos reales). Prohibido inventar heurísticas lineales o números mágicos.
16. **Convenciones del Mercado Operativo:** Reflejar las métricas canónicas con las que operan los inversores reales (TEM en LECAPs, paridad y ley en soberanos).
17. **Jerarquía de Stacking Contexts en Elementos Flotantes:** Garantizar que el contenedor relativo padre de un dropdown tenga mayor `z-index` que los hermanos contiguos en el DOM para evitar oclusión invisible de clics.
18. **TDD Dual Adaptativo (Opción A):** TDD estricto previo para matemática financiera y persistencia; desarrollo ágil por hitos con chequeo de tipado TypeScript (`tsc --noEmit`) para frontend, corriendo suite integral al cierre del hito.


