# Agent Orchestrator & Subagent Roles (MPFP)

Este documento define la arquitectura de orquestación, jerarquía de modelos, contratos de permisos y protocolos de comunicación estructurada para los agentes de este proyecto.

---

## 1. Subagent Orchestration Map

```
                     ┌────────────────────────────────────────┐
                     │         PROJECT LEAD ORCHESTRATOR      │
                     │  (Definido por usuario; def: Pro High) │
                     └───────────────────┬────────────────────┘
                                         │
         ┌───────────────┬───────────────┼───────────────┬───────────────┐
         │               │               │               │               │
         ▼               ▼               ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     SCOUT       │ │    BACKEND      │ │    FRONTEND     │ │       QA        │ │    AUDITORS     │
│  (3.6 Flash Low)│ │ (3.8 Flash Low) │ │ (3.8 Flash Low) │ │ (3.8 Flash Low) │ │ (3.8 Flash Low) │
│ Reconocimiento  │ │ Servicios/FastAPI│ │ React 19 / UI   │ │  Tests / Invar. │ │ Security / Rules│
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 2. Definición de Modelos y Estratificación (Model Tiering)

- **Orquestador Principal (Project Lead):**
  - **Modelo:** Definido por el usuario al iniciar la sesión (por defecto: `gemini-3.1-pro-high` o `inherit`).
  - **Responsabilidad:** Comprender la intención del usuario, descomponer objetivos en sub-prompts atómicos, despachar subagentes, consolidar resultados y gestionar Git en local (con prohibición estricta de `git push` autónomo).
- **Subagentes Operativos Generales (`backend_engineer`, `frontend_engineer`, `qa_engineer`, `security_auditor`, `rules_architect`):**
  - **Modelo:** `gemini-3.8-flash-low` (tier: `flash`).
  - **Autonomía:** Reciben un sub-prompt con la meta y definen de forma autónoma la mejor estrategia técnica para cumplirla.
- **Subagente Explorador (`scout`):**
  - **Modelo:** `gemini-3.6-flash-low` (tier: `flash`).
  - **Objetivo:** Inspección ultrarrápida de rutas, dependencias y contratos.

---

## 3. Matriz de Permisos Declarativos (Least Privilege)

| Subagente | Archivo Especificación | Read | Write | Bash | Web | Ámbito Permitido |
|---|---|:---:|:---:|:---:|:---:|---|
| **`scout`** | [scout.md](file:///run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos%20Antigravity/Streamlit-a-app-github/.agents/agents/scout.md) | ✅ | ✅* | ❌ | 🌐* | Repo local + búsqueda web acotada a documentación técnica oficial. Escritura a `scratch/`. |
| **`backend_engineer`** | [backend_engineer.md](file:///run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos%20Antigravity/Streamlit-a-app-github/.agents/agents/backend_engineer.md) | ✅ | ✅ | ✅ | ❌ | `services/`, `routers/`, `schemas/`, `models/`. Prohibido tocar UI. |
| **`frontend_engineer`** | [frontend_engineer.md](file:///run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos%20Antigravity/Streamlit-a-app-github/.agents/agents/frontend_engineer.md) | ✅ | ✅ | ✅ | ❌ | `frontend/src/`. Prohibido tocar backend o bundles `static/`. |
| **`qa_engineer`** | [qa_engineer.md](file:///run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos%20Antigravity/Streamlit-a-app-github/.agents/agents/qa_engineer.md) | ✅ | ✅ | ✅ | ❌ | `tests/`, ejecución de `./scripts/test.sh`. Snapshot Isolation obligatorio. |
| **`security_auditor`** | [security_auditor.md](file:///run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos%20Antigravity/Streamlit-a-app-github/.agents/agents/security_auditor.md) | ✅ | ❌ | ❌ | ❌ | Auditor puro. No muta código; emite diagnósticos y remediaciones. |
| **`rules_architect`** | [rules_architect.md](file:///run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos%20Antigravity/Streamlit-a-app-github/.agents/agents/rules_architect.md) | ✅ | ✅ | ❌ | ❌ | Gobernanza y reglas canónicas: `AGENTS.md`, `.agents/`, `WORKFLOW.md`. |

*\*Nota: `scout` solo escribe en `scratch/` reportes para el lead y usa `web_search` exclusivamente para documentación técnica de librerías externas. `git_recorder` ha sido eliminado y absorbido por el Orquestador Lead, protegido por `.githooks/pre-push`.*

---

## 4. Protocolo de Comunicación Estructurada (YAML Contract)

Para evitar sobrecarga de contexto, verbosidad y pérdida de tokens, **todos los subagentes deben comunicarse con el orquestador utilizando una estructura mínima predefinida en YAML**:

```yaml
agent: <nombre_subagente>
status: SUCCESS | FAILURE | BLOCKED
summary: "Resumen de alto nivel en una o dos líneas"
actions_taken:
  - "Acción concreta 1"
  - "Acción concreta 2"
files_modified:
  - "ruta/al/archivo"
verification:
  command: "comando ejecutado (si aplica)"
  exit_code: 0
  result: "Resultado conciso de la verificación"
contract_changes:
  added_or_modified: []
blockers_or_notes: []
```

---

## 5. Protocolo de Despacho y Autonomía Operativa

1. **Sub-Prompts Orientados a Metas:** El orquestador no microgestiona línea por línea; instruye a cada subagente con la meta de alto nivel y el contexto pertinente.
2. **Autonomía Resolutiva:** El subagente ejecutor (`backend_engineer`, `frontend_engineer`, `qa_engineer`) analiza, edita los archivos necesarios y valida su propia sintaxis/tipos con sus permisos de escritura y bash.
3. **Reporte Sintético:** El subagente devuelve el bloque YAML estructurado para que el orquestador decida el siguiente paso o cierre el ciclo de verificación.
