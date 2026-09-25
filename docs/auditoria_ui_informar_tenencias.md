# 🔍 Auditoría de UI — "Informar Tenencias" (HoldingsManagerView + TickerTape)
## Revisión multi-agente de las correcciones recientes de la vista de tenencias

> **Metodología:** 4 subagentes independientes (scout · reviewer · delegate · oracle) con adjudicación final  
> **Fecha:** Septiembre 2026  
> **Alcance:** Cambios sin commit en `frontend/src/components/portfolio/HoldingsManagerView.tsx` y `frontend/src/components/ui/TickerTape.tsx`  
> **Modo:** read-only — ningún agente modificó código

---

## 1. Metodología

| Agente | Lente | Entregable | Artefacto |
|---|---|---|---|
| `scout` | Convenciones reales del codebase vs desvíos introducidos | 12 hallazgos (H-01…H-12) + contexto comprimido | `5ecd1a49…_scout_output.md` |
| `reviewer` | Code review del diff (a11y, tokens, Tailwind, UX de datos, React/TS) | 15 findings P1/P2/P3 + veredicto de merge | `63820349…_reviewer_output.md` |
| `delegate` | Checklist acotado de accesibilidad e interacción (10 ítems) | Tabla CUMPLE/VIOLA + 6 violaciones priorizadas | `7ddbf869…_delegate_output.md` |
| `oracle` | Adjudicación contra código real + reglas del proyecto + anti-drift | 32 items unificados (U-01…U-32) | `c7f22950…_oracle_output.md` |

Los tres primeros corrieron en paralelo con lentes disjuntos; `oracle` recibió sus resultados, **verificó cada claim contra los archivos reales**, deduplicó y clasificó la severidad final.

---

## 2. Veredicto global

**🔴 BLOCK de merge de calidad UI** (veredicto unánime de reviewer/oracle).

**32 hallazgos unificados: 10 P1 · 16 P2 · 4 P3 · 2 ACEPTABLE.**

Los P1 se concentran en tres ejes:

1. **Accesibilidad y semántica** (U-05, U-06, U-07, U-08): controles nuevos sin nombre accesible, sin foco de teclado ni relación ARIA.
2. **Integridad de datos financieros** (U-02): se suman ARS y USD como si fueran la misma moneda en KPIs y P&L — el total es numéricamente inválido.
3. **Feedback de errores y mutaciones** (U-03, U-04, U-32): fallos de fetch/mutación invisibles, `alert()` + `window.location.reload()` como flujo normal, error inicial indistinguible de "cargado".

### Lo que quedó bien (verificado por reviewer/delegate)
- Supresión de click tras drag con `DRAG_THRESHOLD_PX` + `didDrag`.
- Tooltip portaleado a `body` (ya no lo recorta el `overflow-hidden` de la barra).
- Tabla con `overflow-x-auto`, botones con `type="button"` y nombres accesibles.
- Estados vacíos y de carga explícitos; KPIs + leyenda funcionan como alternativa textual del gráfico.

---

## 3. Hallazgos adjudicados (oracle)

### 🔴 P1 — Corregir antes de considerar cerrado el trabajo

| ID | Hallazgo | Evidencia verificada | Fix recomendado |
|---|---|---|---|
| U-01 | Colores ECharts fuera del tema compartido | `HoldingsManagerView.tsx:27-28,337-380`; `useChartTheme.ts:14-32` | Consumir `useChartTheme()` para tooltip, texto, bordes y labels *(matiz §5)* |
| U-02 | Agregación financiera ARS/USD inválida | `HoldingsManagerView.tsx:202-216,237-251,260-268` | Separar KPIs por moneda o convertir con FX antes de sumar; nunca mostrar un total único con `mixedCurrency` |
| U-03 | Errores de fetch y mutaciones sin feedback renderizado | `HoldingsManagerView.tsx:76-121,134-163,448-478` | Estado `error`/`success`, validar cada `res.ok`, diferenciar carga/error/vacío |
| U-04 | `alert()` + `window.location.reload()` como flujo normal de mutación | `HoldingsManagerView.tsx:475-478,748-749,779-785,827-834` | Actualizar estado + invalidar caches; feedback inline o `role="alert"` |
| U-05 | Inputs de tabla sin nombre accesible | `HoldingsManagerView.tsx:604-632` | `label`/`htmlFor` o `aria-label` por ticker+campo; `scope="col"` en cabeceras |
| U-06 | Toggle Modelo/Real sin semántica accesible | `HoldingsManagerView.tsx:665-677` | `role="group" aria-label` + `aria-pressed`; clases con `cn()` |
| U-07 | TickerTape no operable por teclado ni foco | `TickerTape.tsx:208-223` | `<button type="button">` con nombre accesible, Enter/Space |
| U-08 | Tooltip del ticker solo por hover, sin relación ARIA | `TickerTape.tsx:208-255` | ID estable + `aria-describedby`; abrir/cerrar también con `focus`/`blur` |
| U-31 | Tabla editable contradice la arquitectura declarada (tabla read-only + ActionDrawer) | `HoldingsManagerView.tsx:604-642`; `frontend_engineer.md` puntos 4-5 | **Decisión pendiente** *(ver §5)* |
| U-32 | El error de carga inicial no se comunica al usuario | `HoldingsManagerView.tsx:76-121,493-497` | Estado `error` separado de `loading` |

### 🟠 P2 — Deberían corregirse (calidad UI)

| ID | Hallazgo | Evidencia | Fix recomendado |
|---|---|---|---|
| U-09 | Tooltip ECharts interpola HTML sin escape (XSS) | `HoldingsManagerView.tsx:285-334` | `escapeHtml()` sobre `ticker`, `sector`, `name` |
| U-11 | Error del TickerTape indistinguible del estado vacío | `TickerTape.tsx:39-48,183-203` | Propagar error desde el fetcher; estado de error aparte |
| U-12 | Moneda perdida en los precios del TickerTape | `TickerTape.tsx:13-18,51-57` | Conservar `ARS/USD` en `TickerTapeItem`, ticker, tooltip y drawer |
| U-13 | Lógica de wrap acoplada a seis copias del strip | `TickerTape.tsx:13-16,91-92,142-151` | Constante `COPY_COUNT` única que derive render y wrap |
| U-16 | Contraste/tamaño de textos 9-10px y targets reducidos | `HoldingsManagerView.tsx:637-642,685-692,724,733`; `TickerTape.tsx:194-203,253` | Subir contraste/tamaño; targets ~40-44px; `focus-visible:ring-*` |
| U-17 | Tabla sin `scope="col"` en cabeceras | `HoldingsManagerView.tsx:576-585` | `scope="col"` + asociación inputs-cabecera |
| U-18 | Tarjeta analítica con altura fija `h-[560px]` | `HoldingsManagerView.tsx:657` | `min-h` + auto; leyenda con `max-h`/scroll |
| U-19 | Layout sin breakpoint intermedio (todo o nada hasta `xl`) | `HoldingsManagerView.tsx:563-656` | Composición intermedia en `lg`; verificar cero desbordes |
| U-20 | Uso extensivo de `any` en TS estricto | `HoldingsManagerView.tsx:52-56,128-130,296,365,386-410` | Tipar respuestas API, drafts, metadata ECharts y payloads |
| U-21 | Monolito con modales y responsabilidades mezcladas | `HoldingsManagerView.tsx:42-847` | Hooks de datos/mutaciones + `HoldingsTable` + `HoldingsAnalytics` + modales |
| U-22 | Modales inline sin contrato accesible reutilizable | `HoldingsManagerView.tsx:721-847` | `role="dialog"`, `aria-modal`, título asociado, Escape, foco inicial/retorno |
| U-23 | Duplicación de queries/cache entre vistas | `HoldingsManagerView.tsx:2,47-64`; `TickerTape.tsx:3,39-68` | Centralizar fetchers/keys o documentar TTLs |
| U-26 | Falta `prefers-reduced-motion` y pausa accesible | `TickerTape.tsx:79-132,268-274` | Respetar el media query; pausar con foco; botón de pausa |
| U-28 | Paleta sectorial hex fija no documentada | `HoldingsManagerView.tsx:27-28,232-248` | Paleta semántica documentada (no necesariamente un token por sector) |
| U-29 | Importación/borrado implementados dentro de la vista | `HoldingsManagerView.tsx:721-847` | Extraer componentes controlados (`isOpen`, `onClose`, error) |
| U-30 | Import de ECharts sin el contrato canónico (tree-shaking/core) | `HoldingsManagerView.tsx:5`; `frontend_engineer.md` punto 3 | Verificar y, si corresponde, migrar a `echarts-for-react/lib/core` |

### 🟡 P3 — Pulido

| ID | Hallazgo | Fix recomendado |
|---|---|---|
| U-10 | Tooltip portaled sin clamp de viewport | Clamp local (flip/shift) antes de adoptar una librería |
| U-15 | Fallback hex del caret del tooltip | Variable/clase semántica sin fallback hardcodeado |
| U-24 | Clases condicionales manuales sin `cn()` | Adoptar `cn()` en toggles, tonos y estados |
| U-25 | Números mágicos de animación/layout | Extraer constantes (velocidad, copias, gap, altura, umbral) |

### ⚪ ACEPTABLE — Decisión consciente, no es deuda

| ID | Item | Justificación |
|---|---|---|
| U-14 | Estilos inline dinámicos (`transform`, posición del tooltip) | Valores calculados legítimos para rAF/portal; solo los estáticos deben salir a clases |
| U-27 | `transform` inline del drag/animación | Necesario para `requestAnimationFrame`; no clasificarlo como incumplimiento |

---

## 4. Resumen por lente

### Scout — convenciones del codebase (12 hallazgos)
Los desvíos más importantes respecto de las convenciones existentes: colores ECharts fuera de `useChartTheme()` (H-01), errores de fetch/guardado sin feedback cuando `PortfolioTrashModal`/`CreatePortfolioModal` sí lo tienen (H-02), `alert()` + reload donde el resto usa estado local (H-03), modales inline duplicados (H-04) y el monolito con estado duplicado (H-05). **Contexto clave:** el codebase domina tokens semánticos, estados loading/vacío/error separados, y estilos inline solo para valores realmente dinámicos.

### Reviewer — diff review (15 findings)
Corrección sobre el cambio reciente: sin nombre accesible en los 4 inputs (P1), toggle sin `aria-pressed` (P1), ticker `<div>` sin teclado (P1), **mezcla ARS/USD en totales** (P1) y ECharts con hex hardcodeados (P1). Merge verdict: **BLOCK**. Incluye fixes concretos con snippet (`sr-only` labels, `role="group"`, `<button type="button">` para el ticker, KPIs separados por moneda).

### Delegate — checklist a11y/interacción (10 ítems)
**7 VIOLA / 3 CUMPLE.** Cumplen: nombres de botones, alternativa textual del gráfico (KPIs/leyenda), estados de carga/vacío. Violan: labels de inputs, foco visible, tooltip descubrible sin hover, operabilidad por teclado, contraste de textos 9-10px (`muted-foreground` sobre `secondary/40`), tamaño de targets (~28px), relación ARIA del tooltip.

---

## 5. Matices que cambian el plan (verificación del oracle)

1. **`useChartTheme()` hoy solo devuelve tema dark** (`theme: 'dark'` permanente). U-01 es por **consistencia de convención**, no porque exista un tema claro roto. No sobredimensionar el alcance.
2. **U-31 es una contradicción arquitectónica real, no una preferencia visual:** `.agents/agents/frontend_engineer.md` prescribe tablas de consulta read-only con mutaciones en `ActionDrawer`, y esta vista mantiene edición inline. Requiere **decisión explícita del dueño del producto**: exceptuar y documentar esta vista, o migrar la edición masiva a un ActionDrawer.
3. **U-30 fue omitido por las tres auditorías** y lo detectó el oracle: verificar el contrato de importación de ECharts exigido por el proyecto (wrapper/tree-shaking) antes de dar por buena la implementación del sunburst.
4. **Modales sin contrato accesible** (`role="dialog"`, Escape, foco inicial/retorno): detectado solo en la adjudicación; incluirlo al extraer los modales (U-22/U-29).
5. **No declarar resuelto el problema monetario con el texto "monedas mixtas":** el aviso actual no vuelve válidos los KPIs; siguen sumando monedas distintas (U-02).

---

## 6. Consistencia con reglas del proyecto

- `.agents/RULES.md` exige validación estricta y sanitización XSS → **U-09** es el punto más sensible (tooltip con HTML de datos externos sin escape).
- Regla de verificación UI (`tsc --noEmit`, TS estricto) → **U-20** contradice el objetivo con `any` propagado.
- `frontend_engineer.md` (React 19, TS estricto, ECharts con tree-shaking/core, cero desbordes horizontales) → **U-20, U-30, U-18/U-19**.
- Misma guía (tablas read-only + ActionDrawer) → **U-31**.

### Drift a evitar (acuerdos del oracle)
- No reemplazar `useCachedQuery`/`cachedFetch` por otra librería de datos sin resolver U-23 con las keys/TTL existentes.
- No eliminar todos los estilos inline: `transform` y coordenadas del tooltip son legítimos (U-14/U-27).
- No usar `aria-label` genéricos ("Editar campo"): deben identificar ticker y campo.
- No adoptar una librería de tooltip externa solo para el clamp (U-10); primero cálculo local.
- No "arreglar" U-02 solo con texto aclaratorio.
- No extraer modales rompiendo los contratos de `CreatePortfolioModal` / `PortfolioTrashModal`.
- No asumir que `useChartTheme()` resuelve tema claro todavía.

---

## 7. Plan de corrección propuesto

| Fase | Contenido | Items |
|---|---|---|
| **A — Integridad de datos y errores** | KPIs por moneda (o FX), estados de error/success, validar `res.ok`, quitar `alert()`/reload, error de carga inicial | U-02, U-03, U-04, U-32 |
| **B — Accesibilidad** | Labels/aria en inputs, toggle semántico, ticker como botón + tooltip con foco y `aria-describedby`, targets y contraste | U-05, U-06, U-07, U-08, U-16, U-17 |
| **C — Tema y contratos** | `useChartTheme()` en el sunburst, escape HTML en tooltips, verificar import canónico de ECharts | U-01, U-09, U-30 |
| **D — Decisión arquitectónica** | Resolver U-31 (edición inline vs ActionDrawer) y, según la decisión, extraer hooks/tabla/analítica/modales | U-21, U-22, U-29, U-31 |
| **E — Pulido** | Altura flexible, breakpoint `lg`, tipos, queries centralizadas, reduced-motion, moneda en ticker, `COPY_COUNT`, `cn()`, constantes, clamp del tooltip | U-10, U-12, U-13, U-15, U-18, U-19, U-20, U-23, U-24, U-25, U-26, U-28 |

Orden recomendado: **A → B → C**, con **D** como decisión de producto que puede correr en paralelo (no bloquea A-C) y **E** al final.

---

## 8. Anexo — artefactos de la auditoría

Directorio de artefactos de los runs:  
`/home/christian/.pi/agent/sessions/--run-media-christian-51cc8d45-50ef-4ae6-8f35-ecd9286e0c67-Documentos-Proyectos Antigravity-Streamlit-a-app-github--/subagent-artifacts/`

- `5ecd1a49-47a0-42b1-acfe-428704238825_scout_output.md`
- `63820349-5203-42e0-8b2a-0f2dff145218_reviewer_output.md`
- `7ddbf869-e468-4bd8-b864-76d9b7cbc547_delegate_output.md`
- `c7f22950-236e-4082-9986-ffb9d3e34773_oracle_output.md`

Workflow run: `8fbf5b52-33fc-43b0-b90c-d5a6abcf6de1` (4 hijos, todos completados).
