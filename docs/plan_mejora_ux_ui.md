# 🎨 Plan de Modernización & Ergonomía UX/UI — MPFP
## Rediseño Orientado a Flujos de Trabajo ("Jobs-to-be-Done") y Erradicación de Silos de Navegación

> **Documento de Referencia Técnica y Ejecución para Nuevas Sesiones**  
> **Fecha de Elaboración:** Septiembre 2026  
> **Stack:** React 19 + TypeScript + Vite + Tailwind CSS + Apache ECharts + FastAPI REST JSON

---

## 1. Diagnóstico del Problema: La Trampa de los "Silos de Datos"

Actualmente, la interfaz de MPFP está dividida en **9 pantallas independientes** gobernadas por una cabecera de dos niveles (`WorkspaceHeader.tsx`) y un selector de inicio (`LauncherHub.tsx`). 

La información está organizada por **"el servicio backend que produce los datos"** (carteras, cedears, renta fija, markowitz, balances, valuación) y **no por "la tarea que el usuario necesita resolver"**.

### Fricciones en las Tareas Cotidianas

```
                  SITUACIÓN ACTUAL: 9 SILOS DESCONECTADOS

┌────────────────────────────┐  ┌────────────────────────────────┐  ┌─────────────────────────────┐
│  PORTFOLIOS & TENENCIAS    │  │       MONITOR DE MERCADO       │  │   LABORATORIO CUANTITATIVO  │
│  • Cartera & Rebalanceo    │  │  • CEDEARs & RSI (Watchlist)   │  │  • Frontera Markowitz       │
│  • Rotación & Cartera Real │  │  • Índices & Ciclos            │  │  • Valuación Fundamental    │
│                            │  │  • Renta Fija BYMA/MAE         │  │  • Performance Multi-Activo │
│                            │  │  • Calendario Earnings         │  │                             │
└────────────────────────────┘  └────────────────────────────────┘  └─────────────────────────────┘
  ❌ Para tomar una sola decisión de inversión, el usuario salta entre 3 y 5 pantallas distintas.
```

1. **Control de Cartera vs. Rebalanceo Real:**
   * Existen dos pantallas separadas: `PortfolioView` (modelo teórico/pesos) y `RotationView` (tenencias reales, nominales y caja). El usuario debe saltar entre ambas para calibrar su posición real contra el objetivo.
2. **Rotación Táctica (Venta en Sobrecompra $\rightarrow$ Compra en Sobreventa):**
   * En `RotationView` el motor sugiere rotar un activo (ej: vender SPY por Take Profit y comprar LLY por sobreventa/subvaluación). Para validar esa compra, el usuario debe salir a `CEDEARs` (ver RSI), luego a `Calendario Earnings` (ver fecha de balance), luego a `Valuación Fundamental` (ver margen de seguridad) y volver a `Rotación` para usar la Calculadora de Compra. **Cuatro cambios de pantalla para una sola decisión.**
3. **Consultas Rápidas de Tickers (Quick Lookup):**
   * No existe una vista integral rápida (Ficha 360°). Para evaluar un ticker hay que buscarlo en 3 tablas distintas.
4. **Control de Renta Fija y Arbitraje de Curva:**
   * El usuario tiene bonos/lecaps en cartera (`PortfolioView` o `RotationView`), pero para ver la curva de rendimientos, spreads y si conviene arbitrar a una letra con mayor TIR, debe irse al macro-área de Mercado (`FixedIncomeView`) y buscar el bono entre 50 activos.
5. **Armado de Portfolios Nuevos:**
   * La creación desde `PortfolioView` es un formulario ciego; si se hace desde `MarkowitzLab`, está desconectado de los fundamentales y balances.

---

## 2. Nueva Arquitectura: 3 Macro-Flujos + Capa Transversal

Rediseñar la navegación principal reduciendo los 9 menús a **3 Espacios de Trabajo Orientados a Tareas**, complementados por una **Capa Transversal de Consulta Rápida**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  🔎 BUSCADOR UNIVERSAL / COMMAND PALETTE (Ctrl + K)                                    │
│  Acceso instantáneo a cualquier activo (CEDEAR, Bono, Cartera). Abre Ficha 360° sin salir.│
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐  ┌────────────────────────────┐  ┌────────────────────────────┐
│  💼 1. CENTRO DE CARTERA   │  │  🎯 2. RADAR DE MERCADO    │  │  🧪 3. ESTRATEGIA & LAB    │
│     (Cockpit Operativo)    │  │     (Oportunidades & RSI)  │  │     (Modelos Cuantitativos)│
├────────────────────────────┤  ├────────────────────────────┤  ├────────────────────────────┤
│ • Cartera Híbrida          │  │ • Screener Global CEDEARs  │  │ • Laboratorio Markowitz    │
│   (Real vs Modelo)         │  │ • Termómetro RSI Sectores  │  │ • Valuación DCF/FCF        │
│ • Órdenes de Rotación      │  │ • Matriz de Earnings       │  │ • Backtest Performance     │
│ • Calculadora Integrada    │  │ • Curvas Renta Fija BYMA   │  │ • Diseñador de Portfolios  │
│ • Bonos de la Cartera      │  │ • Índices & Ciclos         │  │                            │
└────────────────────────────┘  └────────────────────────────┘  └────────────────────────────┘
```

---

## 3. Especificación Técnica de los 5 Componentes Clave

### Componente 1: `Ticker360Drawer.tsx` (Ficha 360° Deslizante)
* **Propósito:** Eliminar el 60% de los saltos de menú. Permite consultar toda la información de un activo desde cualquier pantalla sin perder el contexto de trabajo.
* **Ubicación:** `frontend/src/components/common/Ticker360Drawer.tsx`.
* **Comportamiento:**
  * Se desliza desde el lateral derecho (`w-[420px]`, `z-50`, fondo Eigengrau `#181920` con backdrop blur).
  * Se abre al hacer clic en el nombre de cualquier ticker en **cualquier tabla** de la aplicación, o al seleccionarlo en el buscador `Ctrl+K`.
  * Se cierra con la tecla `Escape` o clic exterior.
* **Contenido de la Ficha:**
  1. **Cabecera:** Ticker, Empresa, Ratio CEDEAR, Precio Local ARS, ADR USD.
  2. **Termómetro Técnico:** RSI Wilder 14 períodos con barra visual coloreada (Verde $<30$, Azul $30-70$, Rojo $>70$).
  3. **Eventos Inminentes:** Próximo balance con días restantes y badge de alerta si es $<14$ días.
  4. **Valuación Fundamental:** GuruFocus Fair Value, Margen de Seguridad %, Múltiplo P/FCF.
  5. **Posición en mi Cartera:** Nominales actuales, PPC registrado, Ganancia/Pérdida latente %, Alerta Take Profit activa ($\ge 35\%$).
  6. **Botones de Acción Inmediata:**
     * *"Calcular Compra"* (Abre y pre-carga la Calculadora con este ticker).
     * *"Abrir en Valuación Fundamental"* (Navega al modelo detallado de la empresa).
     * *"Agregar / Modificar en Cartera"*.

---

### Componente 2: `UnifiedPortfolioView.tsx` (Centro de Comando de Cartera)
* **Propósito:** Fusionar `PortfolioView.tsx` y `RotationView.tsx` en un único cockpit de gestión patrimonial.
* **Ubicación:** `frontend/src/components/portfolio/UnifiedPortfolioView.tsx`.
* **Estructura Interna:**
  1. **Header de Control:**
     * Selector canónico de cartera (`selectedPf` con dropdown `z-50`).
     * KPI Cards: Patrimonio Total, Valor en CEDEARs, Renta Fija, Saldo en Caja ARS, Ganancia Global PnL (%), Tracking Error vs Modelo.
     * Termómetro de RSI Ponderado de la Cartera.
  2. **Pestañas Internas (Sub-Tabs):**
     * **Pestaña A: Operación & Rotación (Vista por Defecto):**
       * Tabla híbrida inteligente: muestra activos con columnas `PPC`, `PnL %`, `RSI`, `Nominales Reales`, `Valor Real`, `Objetivo %`, `Diferencia`, `Acción Recomendada`.
       * Cajón de Órdenes de Rotación: tarjetas compactas con pares *"Vender [Activo en Sobrecompra] $\rightarrow$ Comprar [Activo en Sobreventa]"*.
       * Calculadora Rápida de Compra embebida y reactiva (se rellena con 1 clic al presionar "Calcular" en cualquier fila).
     * **Pestaña B: Arquitectura & Modelo:**
       * Pesos objetivo, anclaje (Anchor Ticker), multiplicador de base (MCM), desglose sectorial y Alpha histórico vs SPY.
     * **Pestaña C: Renta Fija en Cartera:**
       * Títulos de renta fija que posee la cartera con su TIR real y Duration, junto a un micrográfico de la curva BYMA que compara el bono tenido contra las mejores alternativas de su mismo tramo.

---

### Componente 3: `CommandPalette.tsx` (Buscador Global `Ctrl + K`)
* **Propósito:** Agilidad y navegación instantánea inspirada en Antigravity IDE / Raycast.
* **Ubicación:** `frontend/src/components/ui/CommandPalette.tsx`.
* **Comportamiento:**
  * Atajo global de teclado: `Ctrl + K` (o `Cmd + K` en macOS).
  * Botón visible en `WorkspaceHeader.tsx` con icono de lupa y badge `Ctrl+K`.
  * Filtro fuzzy en memoria sobre:
    1. Catálogo completo de 305 CEDEARs (nombre, ticker, sector).
    2. Instrumentos de Renta Fija (LECAPs, Bonceres, Soberanos).
    3. Acciones rápidas de la app (ej: *"Ir a Markowitz"*, *"Crear Cartera"*, *"Ver Calendario Earnings"*).
  * Al seleccionar un ticker, abre el `Ticker360Drawer` sin recargar ni alterar la vista actual.

---

### Componente 4: `PortfolioWizardModal.tsx` (Asistente de Armado de Portfolios)
* **Propósito:** Transformar la creación de carteras de un formulario ciego en un proceso asistido de 3 pasos.
* **Ubicación:** `frontend/src/components/portfolio/PortfolioWizardModal.tsx`.
* **Flujo en 3 Pasos:**
  * **Paso 1: Selección de Enfoque:**
    * *Desde Plantilla:* BDI Moderada, Defensiva, Agresiva, Tech/Pagos.
    * *Desde Markowitz (1-Clic):* Importar automáticamente la cartera de Máximo Sharpe o Mínima Varianza optimizada por el backend.
    * *Desde Oportunidades del Mercado:* Seleccionar los CEDEARs con mejor calidad fundamental que se encuentren actualmente en Sobreventa ($RSI < 35$).
    * *Personalizada:* Selector multi-activo desde el catálogo de 305 CEDEARs.
  * **Paso 2: Calibración Visual:**
    * Sliders interactivos de pesos con bloqueo de suma 100%.
    * Indicador en tiempo real del RSI Ponderado proyectado y la asignación Acciones vs Renta Fija.
  * **Paso 3: Confirmación & Persistencia:**
    * Asignación de nombre y guardado atómico mediante `POST /api/portfolios/save_json`.

---

### Componente 5: `FixedIncomePortfolioCard.tsx` (Puente Renta Fija Cartera <-> Curva)
* **Propósito:** Evitar tener que ir a `FixedIncomeView` para saber si un bono en cartera rinde bien.
* **Ubicación:** `frontend/src/components/portfolio/FixedIncomePortfolioCard.tsx`.
* **Detalle:**
  * Toma los tickers de renta fija definidos en la cartera (ej: `S30S6`, `T31Y7`).
  * Cruza automáticamente sus datos con `/api/renta_fija/curve_json`.
  * Muestra una tarjeta compacta:
    * TIR actual vs TIR promedio de la curva del mismo tramo.
    * Upside potencial de compresión de spread en puntos básicos (bps).
    * Alerta de arbitraje: *"Hay un título del mismo tipo con +250 bps de TIR y similar duration"*.

---

## 4. Hoja de Ruta de Implementación (Roadmap por Fases)

Para ejecutar esta modernización de forma segura, respetando la suite de 126 tests y sin romper código existente, se debe seguir este orden:

```
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 1: QUICK WIN DE ALTO IMPACTO (CERO RIESGO DE REGRESIÓN)           │
│ Implementar Ticker360Drawer y conectarlo a las tablas existentes.     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 2: CAPA TRANSVERSAL SPOTLIGHT                                     │
│ Implementar CommandPalette (Ctrl+K) en WorkspaceHeader.                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 3: FUSIÓN DE CARTERA (COCKPIT UNIFICADO)                          │
│ Unificar PortfolioView y RotationView en UnifiedPortfolioView.         │
│ Retener endpoints REST existentes sin alterar lógica de backend.       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 4: SIMPLIFICACIÓN DE LA CABECERA PRINCIPAL                       │
│ Reestructurar WorkspaceHeader a 3 macro-flujos (Cartera, Radar, Lab). │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 5: ASISTENTE DE PORTFOLIOS & RENTA FIJA CONTEXTUAL                │
│ PortfolioWizardModal y tarjeta de arbitraje de renta fija en cartera.  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Instrucciones para Iniciar la Ejecución en una Nueva Sesión

Cuando abras un nuevo chat o quieras comenzar a implementar este rediseño, puedes enviar el siguiente prompt al agente:

```markdown
Hola. Quiero comenzar a implementar el rediseño UX/UI del frontend según lo especificado en `docs/plan_mejora_ux_ui.md`.

Por favor:
1. Lee `docs/plan_mejora_ux_ui.md` para tomar el contexto completo.
2. Comencemos por la FASE 1: Construir el componente `Ticker360Drawer.tsx` y conectarlo como drawer lateral al hacer clic en los tickers de las tablas de cartera y CEDEARs.
3. Asegura tipado TypeScript estricto (`npx tsc --noEmit`) y paleta Eigengrau (#181920).
```

---

*Fin del documento de arquitectura. Guardado y disponible en `docs/plan_mejora_ux_ui.md`.*
