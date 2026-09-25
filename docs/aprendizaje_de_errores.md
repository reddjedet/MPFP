# 🛡️ Aprendizaje de Errores & Memoria Forense (Anti-Patrones y Post-Mortems)

Este documento constituye la **caja negra de ingeniería y memoria forense** del proyecto. Recopila los incidentes reales enfrentados durante el desarrollo, la causa raíz identificada, la solución definitiva implementada y las **Reglas de Oro Inquebrantables** para blindar la arquitectura y evitar cualquier regresión.

---

## 🗺️ Mapa Rápido de Incidentes y Aprendizajes Canónicos

| ID | Incidente / Anti-Patrón | Causa Raíz | Solución Definitiva | Estado |
|---|---|---|---|:---:|
| **INC-01** | **Código Zombie / Stack Híbrido** (Jinja2, HTMX, Plotly SSR coexistiendo con React 19) | Migración incompleta por etapas sin purga del stack previo | Purga integral de templates, dependencias y routers legacy; contratos REST JSON puros | 🟢 Blindado |
| **INC-02** | **Polución de Base de Datos en Tests** (Tests sobreescribían datos reales del usuario) | Tests unitarios apuntaban a rutas fijas de producción en disco | Snapshot Isolation obligatorio con `tempfile.TemporaryDirectory()` en `setUpClass`/`tearDownClass` | 🟢 Blindado |
| **INC-03** | **React Error #130 en ECharts** (Fallo de elemento inválido en React 19) | Incompatibilidad de export CommonJS de `echarts-for-react` con Vite ESM | Unwrapper defensivo `(ReactEChartsCore as any)?.default || ReactEChartsCore` | 🟢 Blindado |
| **INC-04** | **Corrupción en Disco por Escritura Interrumpida** (Archivos JSON dañados por cortes) | Escritura directa mediante `json.dump()` sin atomicidad ni sync | `AtomicJsonDatabase` con escritura en `.tmp`, `os.fsync()`, reemplazo atómico y `threading.RLock()` | 🟢 Blindado |
| **INC-05** | **Cierre Instantáneo de Selectores en Linux/Chromium** (Bug de captura del evento `mouseup`) | Selectores nativos con `appearance-none` y contenedor con `overflow-hidden` capturan el `mouseup` al hacer clic | Componente canónico `Dropdown.tsx` con React state, `useRef`, `Escape`, `z-50` y `stopPropagation` | 🟢 Blindado |
| **INC-06** | **Oclusión de Menús por Stacking Contexts Hermanos** (Imposibilidad de seleccionar opciones superiores en dropdown) | Hermanos relativos con igual `z-index`: el segundo se apila encima y captura los clics de los hijos absolutos | Elevación jerárquica del stacking context padre (`z-40` vs `z-20`) para liberar el área de interacción | 🟢 Blindado |
| **INC-07** | **Inconsistencias Cromáticas y Contraste por Modo Claro** (Textos ilegibles y deuda técnica) | Coexistencia de temas claro y oscuro en dashboards cuantitativos de alta densidad genera colisiones | Erradicación total del Modo Claro; estandarización canónica en **Modo Oscuro Exclusivo (*Eigengrau* `#0f1015`)** | 🟢 Blindado |
| **INC-08** | **Fallo de Bootstrap de SQLite en CI / Entornos Limpios** (Omisión de carga inicial de catálogos y colisión de rutas) | `_store.load()` devolvía un template `{"sectors": [], "profiles": {}}` en lugar de vacío, impidiendo la hidratación de datos iniciales en ausencia de `mpfp.db` | Retorno canónico de `self.default_data` limpio, bootstrap ampliado para detectar colecciones sin valores y aislamiento de SQLite DB con sufijo `.db` | 🟢 Blindado |
| **INC-09** | **CI Rojo por Tests Acoplados a Datos Locales no Trackeados** (Verde local, rojo en CI) | Los tests asumían portfolios existentes solo en `data/` del desarrollador; el snapshot local ocultaba la dependencia y CI usaba runner distinto al canónico | Fixtures explícitos por test (`tests/portfolio_fixtures.py`), gate permanente de **Clean-Checkout Simulation** en `scripts/test.sh` y CI alineado al runner canónico (pytest) | 🟢 Blindado |

---

## 🔍 Estructura Estándar para Registrar Nuevos Incidentes

Al enfrentar un bug complejo o regresión, duplicar este bloque y completarlo al resolver el problema:

```markdown
### INC-XX: [Título Descriptivo del Incidente]

#### Síntoma y Contexto
- ¿Qué fallo visual, error de consola o comportamiento anómalo se presentó?
- ¿En qué circunstancias o navegadores se reprodujo?

#### Causa Raíz (Análisis de los 5 Porqués)
- Explicación técnica precisa del motivo por el cual falló el código.
- Identificar si fue un problema de concurrencia, tipado, empaquetado ESM/CJS o eventos del DOM.

#### Solución Definitiva
- Explicación de los cambios realizados para subsanar el error de raíz.
- Archivos modificados o componentes canónicos introducidos.

#### 💡 Regla de Oro / Blindaje
> **Regla de Oro XX:** Formular una directriz afirmativa concisa que deba seguirse en el futuro para imposibilitar que el error vuelva a ocurrir.
```

---

## 📋 Incidentes Detallados

### INC-01: Código Zombie & Arquitectura Híbrida (Mezcla de Stacks)
- **Causa Raíz:** Se conservaron plantillas Jinja2 y scripts SSR del stack anterior "por si algo fallaba", lo que contaminaba el contexto de los agentes de IA, haciéndolos sugerir código para el stack obsoleto.
- **Solución Definitiva:** Eliminación atómica de todos los archivos y dependencias obsoletas (`jinja2`, `plotly`). El backend expone exclusivamente endpoints REST JSON.
- **Regla de Oro:** Al migrar a una SPA en React 19, todo el código y librerías del stack previo deben ser purgados de raíz. Cero código legacy conservado "por las dudas".

### INC-02: Polución de Base de Datos en Tests
- **Causa Raíz:** Las clases `unittest.TestCase` escribían en las rutas fijas de producción (`data/`), destruyendo las configuraciones reales del usuario al correr la suite de pruebas.
- **Solución Definitiva:** Snapshot Isolation obligatorio mediante `tempfile.TemporaryDirectory()` en `setUpClass()` y limpieza en `tearDownClass()`.
- **Regla de Oro:** Jamás permitir que un test automatizado cree, modifique o borre archivos reales del usuario en disco. Toda prueba debe ejecutarse sobre carpetas temporales efímeras.

### INC-03: React Error #130 en Apache ECharts
- **Causa Raíz:** Vite empaqueta con ESM nativo, mientras que librerías como `echarts-for-react` empaquetan en CommonJS. En React 19, si el componente default no se desenvuelve explícitamente, React intenta renderizar un objeto en lugar de una función componente, lanzando `Error: Element type is invalid: expected a string or a class/function but got: object`.
- **Solución Definitiva:** Unwrapper defensivo universal:
  ```typescript
  const ReactECharts = (ReactEChartsCore as any)?.default || ReactEChartsCore;
  ```
- **Regla de Oro:** Siempre desenvolver componentes empaquetados en CommonJS que sean consumidos en un entorno Vite ESM bajo React 19.

### INC-04: Riesgo de Corrupción Atómica en Disco
- **Causa Raíz:** La escritura directa mediante `json.dump()` en un archivo existente corrompe la base de datos si el proceso es interrumpido o se apaga abruptamente a mitad de la escritura.
- **Solución Definitiva:** `AtomicJsonDatabase` con cerrojo reentrante `threading.RLock()`, escritura en `.tmp`, volcado a disco forzado (`os.fsync()`) y sustitución atómica POSIX con `os.replace()`.
- **Regla de Oro:** Nunca sobreescribir un archivo de base de datos directamente en su ruta de destino; siempre escribir en un archivo temporal con `fsync` y luego realizar un reemplazo atómico con `os.replace`.

### INC-08: Fallo de Bootstrap de SQLite en Entornos Limpios (CI GitHub Actions)
- **Síntoma y Contexto:** En local todos los tests pasaban al 100%, pero en el runner de GitHub Actions la suite backend fallaba con 9 tests en `test_valuation_service.py` y `test_api_endpoints.py`.
- **Causa Raíz:**
  1. En un clon limpio donde `data/mpfp.db` aún no existe, `SQLiteTableStore.load()` para la tabla `valuation_profiles` retornaba el molde `{"sectors": [], "profiles": {}}` en vez de un diccionario vacío o default.
  2. `_bootstrap_if_needed()` en `atomic_persistence.py` solo verificaba `current_data == {} or current_data == []`, por lo que consideraba la tabla erróneamente inicializada y omitía cargar `data/valuation_profiles.json`.
  3. Adicionalmente, `atomic_persistence.py` buscaba la subcadena `"test"` o `"tmp"` en cualquier parte de la ruta absoluta del archivo para alternar la base SQLite, lo que provocaba que rutas legítimas que contuvieran la palabra "test" intentaran abrir archivos `.json` directamente con el motor binario de SQLite.
- **Solución Definitiva:**
  1. Modificar `SQLiteTableStore.load()` para retornar `copy.deepcopy(self.default_data)` cuando no hay registros en `key_value_store`.
  2. Extender la detección de vacío en `_bootstrap_if_needed()` para abarcar `{"sectors": [], "profiles": {}}` y diccionarios con valores vacíos, forzando la hidratación desde el JSON de datos o `.example`.
  3. Aislamiento estricto de la base SQLite usando `.with_suffix(".db")` para evitar toda colisión de formato entre JSON y SQLite.
- **Regla de Oro:** Todo motor de persistencia relacional con respaldo de archivos de ejemplo/semilla debe garantizar hidratación idempotente desde cero sobre un entorno recién clonado sin bases de datos preexistentes.

