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
