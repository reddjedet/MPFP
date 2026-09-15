# 📜 Bitácora de Evolución Arquitectónica — Máquina de Planes, Finanzas y Portfolios (MPFP)

Esta bitácora documenta la historia técnica, las fases de desarrollo, las decisiones de arquitectura y el registro de hitos del proyecto **Máquina de Planes, Finanzas y Portfolios (MPFP)**.

---

## 🏛️ Evolución del Stack Tecnológico

```
┌────────────────────────────────┐
│   FASE 0: PROTOTIPO INICIAL    │
│   • Python + Streamlit         │  ❌ Renderizado monolítico, refrescos globales, estado en sesión volátil.
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│   FASE 1: TRANSICIÓN SSR       │
│   • FastAPI + Jinja2 + HTMX    │  ⚠️ Mejor desacoplamiento pero sobrecarga de SSR, templates acoplados
│   • Gráficos Plotly SSR        │     y duplicidad de contratos HTML vs JSON.
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│   FASE 2: SPA MODERNA (REACT)  │
│   • Frontend: React 19 + Vite  │  ⚡ Desacoplamiento total, interactividad fluida, renderizado cliente
│   • Visualización: ECharts     │     vía Canvas/WebGL, tablas TanStack Table v8 y Tailwind CSS.
│   • Backend: FastAPI REST JSON │
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│   FASE 3: PURGA & BLINDAJE     │
│   • Purga de código zombie     │  🛡️ Cero código muerto, erradicación total de templates y Plotly SSR.
│   • Snapshot Isolation Tests   │  🛡️ 125 tests automatizados sin tocar bases de datos reales.
│   • Gobernanza y Subagentes IA │  🛡️ Reglas y prompts blindados contra regresiones.
└────────────────────────────────┘
```

---

## 🗓️ Cronología de Fases & Decisiones de Ingeniería

### Fase 0: Prototipo Monolítico en Streamlit
- **Problema:** La aplicación nació como una prueba de concepto en Streamlit para cálculo de rebalanceos y cotizaciones de CEDEARs. A medida que se sumaron módulos complejos (valuación por 6 modelos fundamentales, calendario de balances y optimización de carteras), la recarga completa del script en cada interacción volvió la experiencia lenta y frágil.
- **Decisión:** Desacoplar la lógica de cálculo y persistencia en un backend con FastAPI.

### Fase 1: Transición Server-Side Rendering (FastAPI + Jinja2 + HTMX + Plotly SSR)
- **Implementación:** Se construyó una capa web utilizando templates Jinja2 y fragments HTML intercambiados vía HTMX. Los gráficos interactivos se generaban en el servidor serializados como HTML vía Plotly (`fig.to_html()`).
- **Limitaciones Detectadas:**
  - El servidor gastaba tiempo de CPU valioso serializando estructuras DOM y JSON de gráficos que debían viajar por la red.
  - Los formularios requería endpoints híbridos recibiendo `Form(...)` o `Request`, duplicando la API respecto a las necesidades de datos puros.
  - La interfaz carecía de la reactividad instantánea requerida para manipular carteras con decenas de activos en tiempo real.

### Fase 2: Migración a Single Page Application (React 19 + TypeScript + Vite + ECharts)
- **Implementación:** Se desarrolló una SPA completa dentro de `frontend/` utilizando React 19, TypeScript con tipado estricto, Tailwind CSS, Lucide Icons, TanStack Table v8 para tablas de datos y Apache ECharts (`echarts-for-react`) para visualizaciones de alto rendimiento.
- **Ventajas Inmediatas:**
  - Cero renderizado visual en el backend: FastAPI solo sirve payloads REST JSON ultraligeros.
  - El motor de ECharts renderiza vía Canvas y WebGL en el hardware del cliente, permitiendo zoom, tooltips y mapas de calor fluidos.
  - Separación limpia de responsabilidades.

### Fase 3: Purga Integral de Código Zombie & Blindaje de Gobernanza (Actual)
- **Limpieza Definitiva:**
  - Se eliminaron todos los archivos `.html` de la carpeta `templates/` (11 templates suprimidos).
  - Se eliminó la hoja de estilos estática redundante `static/styles.css`.
  - Se eliminaron librerías obsoletas en el backend (`plotly`, `jinja2`) de `requirements.txt`.
  - Se eliminó el router legacy `routers/pruebas.py` y los endpoints wrappers que generaban HTML.
- **Blindaje de Calidad & QA:**
  - Se migraron los tests al estándar **Snapshot Isolation** con `tempfile.TemporaryDirectory()`, evitando que los 91 tests de la suite alteren o ensucien las 9 bases de datos JSON de usuario.
  - Se creó el script canónico `test.sh` que compila el frontend TypeScript (`tsc --noEmit && npm run build`), corre los 91 tests de Python y ejecuta la auditoría de ciberseguridad e integridad de datos.
- **Blindaje de Contexto & Agentes:**
  - Se actualizaron todos los archivos de gobernanza (`.agents/AGENTS.md`, `.agents/RULES.md`, `.agents/agents/*`, `.agents/skills/*`).
  - Se estableció la prohibición formal y explícita de reintroducir HTMX, Jinja2, Plotly SSR o renderizado HTML desde el servidor.
- **Ergonomía Frontend & Erradicación de Bugs de Captura en Linux:**
  - Se erradicaron los selectores nativos `<select>` con `appearance-none` que sufrían de captura prematura de `mouseup` en entornos Linux GTK/Chromium, reemplazándolos por Dropdowns React controlados por estado (`useState`, `useRef`, tecla `Escape` y libre flotación `z-50`).
  - Se incorporó la Matriz Térmica (Heatmap) en la vista de Rendimiento con cálculo de Alpha en vivo contra el SPY.

### Fase 4: Estandarización Cromática y Aprendizaje sobre Temas Duales
- **Purga de CSS Destructivo:** Se eliminó la regla `.light [class*="bg-blue-600"]` que forzaba texto blanco ilegible en fondos claros.
- **Hook `useChartTheme` & Canvas Sync:** Creación de `frontend/src/hooks/useChartTheme.ts` para sincronizar los gráficos de Apache ECharts con el tema visual.

### Fase 5: Erradicación del Modo Claro & Estandarización en Modo Oscuro Exclusivo (Eigengrau)
- **Problema:** Mantener simultáneamente temas claro y oscuro en una suite cuantitativa con tablas de alta densidad y gráficos canvas generaba una deuda técnica exponencial de contrastes.
- **Decisión Arquitectónica:** Erradicación total del Modo Claro y selectores `.light`. Estandarización canónica e inquebrantable en **Modo Oscuro Exclusivo (*Eigengrau* `#0f1015`)** con paneles `#181920` y textos `text-white` / `text-zinc-300`, garantizando contraste WCAG AA óptimo sin sobrecarga de mantenimiento.

### Fase 6: Laboratorio de Índices Históricos & Ciclos Electorales
- **Implementación:** Creación de `market_indices_service.py`, endpoint `/api/indices` y vista `MarketIndicesView.tsx`.
- **Características:**
  - Series temporales de 8 activos (S&P Merval en USD y ARS, ETF ARGT, EWZ Brasil, Bovespa BRL, S&P 500, Nasdaq, Dow Jones) indexados a Base 100.
  - Métricas cuantitativas de largo plazo (CAGR %, Max Drawdown %, Volatilidad).
  - Superposición interactiva de mandatos presidenciales (Argentina, Brasil, EE.UU.) y eventos electorales.
  - Persistencia en base de datos `data/historical_indices.json`.

### Fase 7: Primitiva Canónica `<Dropdown />`, TDD Ágil por Hitos (Opción A) & Suite de 125 Tests
- **Componente Canónico `<Dropdown />`:** Creación de `Dropdown.tsx` con z-50, teclado Escape, detección de clic exterior, corrección del bug `mouseup` en Linux/Chromium y variantes de acento.
- **Protocolo TDD Ágil por Hitos (Opción A):** Desacoplamiento entre TDD estricto para lógica financiera y persistencia, y protocolo ágil para iteraciones visuales de frontend (verificación estricta con `npx tsc --noEmit` y suite completa al cierre del hito).
- **Cobertura y Diagnóstico:** Expansión de la suite a **125 tests automatizados** y creación del script `scripts/audit_security_privacy.py` para verificación pre-commit.

### Fase 8: Papelera de Reciclaje de Portfolios (FIFO 7), Calculadora Efímera & Refactorización de UI
- **Papelera de Reciclaje de Portfolios:** En vez de eliminar directamente las carteras personalizadas, se trasladan de forma segura a `data/portfolios_trash.json` con capacidad máxima de 7 carteras bajo política FIFO (al ingresar una 8va, la más antigua se purga automáticamente). Se eliminó la necesidad de modales de confirmación invasivos.
- **Modal y Restauración:** Componente `PortfolioTrashModal.tsx` con indicador reactivo `X / 7`, restauración al catálogo activo (`POST /api/portfolios/restore_json/{pf_type}`) y eliminación permanente (`DELETE /api/portfolios/trash_json/{pf_type}`).
- **Calculadora Efímera de Compra:** Herramienta en `RotationView.tsx` (`PurchaseCalculator.tsx`) para simulación instantánea de nominales enteros y vuelto sin memorizar estado.
- **Depuración de UI:** Eliminación de código huérfano (`Sidebar.tsx`), eliminación del botón redundante "Sincronizar Cartera" en `CedearsView.tsx`, preservación de la lógica del activo ancla (MCM).
- **Cobertura Expandida:** 126 tests automatizados con Snapshot Isolation para la 11va base de datos.

---

## 🗄️ Repositorios de Persistencia Atómica (11 Bases de Datos)

El backend de MPFP opera con 11 archivos de persistencia JSON en `data/`, gobernados por la clase `AtomicJsonDatabase` (`services/atomic_persistence.py`):

| Archivo de Base de Datos | Servicio Principal | Contenido y Propósito |
|---|---|---|
| `portfolios.json` | `portfolio_service.py` | Carteras modelo (pesos porcentuales o nominales enteros). |
| `portfolios_trash.json` | `portfolio_service.py` | Papelera de reciclaje de carteras (máx. 7 carteras, política FIFO). |
| `user_holdings.json` | `rotation_service.py` | Cartera real del usuario aislada por broker (nominales, PPC, caja ARS). |
| `ppc_values.json` | `ppc_service.py` | Precios Promedio de Compra globales para cálculo de PnL. |
| `fair_values.json` | `fair_value_service.py` | Valores intrínsecos estimados (GuruFocus) y margen de seguridad. |
| `pfcf_values.json` | `pfcf_service.py` | Multiplicadores P/FCF normalizados históricos y percentiles. |
| `earnings_calendar.json` | `earnings_service.py` | Fechas confirmadas de balances y estados de reportes corporativos. |
| `valuation_profiles.json` | `valuation_service.py` | Perfiles asignados a cada ticker según su sector (6 modelos). |
| `user_valuation_inputs.json` | `valuation_service.py` | Parámetros financieros ingresados por el usuario para valuación. |
| `cedear_ratios.json` | `cedear_service.py` | Ratios oficiales de conversión CEDEAR/Acción subyacente. |
| `historical_indices.json` | `market_indices_service.py` | Series históricas multiactivo y catálogo de mandatos políticos. |

---

## 🚀 Estado Operativo y Comandos Canónicos

* **Iniciar la aplicación:** `./start.sh` (Inicia FastAPI en `127.0.0.1:8000` y Vite dev server en `5173`).
* **Detener la aplicación:** `./stop.sh` (Finaliza ordenadamente los procesos en segundo plano).
* **Validación Integral de Calidad:** `./test.sh` (Compila frontend TypeScript + ejecuta 126 tests de backend + audita 11 DBs JSON y ciberseguridad).

---

## 🧭 Visión y Próximos Pasos

1. Mantener 100% de cobertura y Snapshot Isolation en cualquier nuevo desarrollo.
2. Preservar la estricta privacidad local (cero telemetría, cero APIs remotas no autorizadas, cero `git push`).
3. Continuar optimizando la experiencia ergonómica de la interfaz inspirada en Antigravity IDE.
