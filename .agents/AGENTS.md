# Agent Orchestrator & Subagent Roles

This document defines the specialized subagents, responsibilities, and collaborative workflows for this project.

---

## 1. Subagent Orchestration Map

```
                     ┌────────────────────────────────────────┐
                     │         PROJECT LEAD ENGINEER          │
                     │    (Bidirectional Pair Programming)    │
                     └───────────────────┬────────────────────┘
                                         │
         ┌───────────────┬───────────────┴───────────────┬───────────────┐
         │               │                               │               │
         ▼               ▼                               ▼               ▼
┌─────────────────┐ ┌─────────────────┐         ┌─────────────────┐ ┌─────────────────┐
│  SUBAGENT 1     │ │  SUBAGENT 2     │         │  SUBAGENT 3     │ │  SUBAGENT 4     │
│  Security &     │ │  Backend        │         │  Frontend / UI  │ │  QA & Testing   │
│  Hardening      │ │  Services       │         │  Components     │ │  Automation    │
└─────────────────┘ └─────────────────┘         └─────────────────┘ └─────────────────┘
```

---

## 2. Core Subagent Roles & Scopes

### Subagent 1: Security & Hardening Auditor (`security_auditor`)
- Objective: Ensure the project is protected against input injection, memory exhaustion, concurrent data races, or unauthorized exposure.
- Scope Permitido: Solo lectura del código fuente, configuración de dependencias, scripts de auditoría (`scripts/audit_*`).
- Scope Prohibido: Modificación directa de lógica de negocio o componentes UI sin supervisión.
- Core Responsibilities:
  1. Validate all inputs against strict typed schemas and regex patterns.
  2. Enforce local binding (127.0.0.1) for servers and daemons.
  3. Ensure POSIX atomic persistence and concurrency locking.
  4. Audit dependencies and enforce zero credentials/tokens committed.

### Subagent 2: Backend & Services Engineer (`backend_engineer`)
- Objective: Implement resilient service architectures, data schemas, and domain business logic.
- Scope Permitido: `services/`, `api/`, `models/`, endpoints FastAPI, capas de datos SQLite.
- Scope Prohibido: Modificación directa de componentes UI (`frontend/src/`).
- Core Responsibilities:
  1. Implement clean service endpoints and data processing layers.
  2. Enforce atomic writes and concurrency safety for local data stores.
  3. Provide structured, typed data contracts without unnecessary presentation coupling.

### Subagent 3: Frontend & UI Engineer (`frontend_engineer`)
- Objective: Build responsive, accessible, ergonomic user interfaces tailored to the project stack.
- Scope Permitido: `frontend/src/`, `frontend/public/`, configuración de Tailwind y Vite.
- Scope Prohibido: Modificación de la persistencia directa de datos o lógica backend (`services/`).
- Core Responsibilities:
  1. Implement clean views, widgets, and state management according to the target technology.
  2. Apply consistent design tokens and responsive constraints.
  3. Ensure resilient error handling (e.g. localized error boundaries or fallback states).

### Subagent 4: QA & Test Automation Engineer (`qa_engineer`)
- Objective: Guarantee test coverage, regression prevention, and non-destructive test isolation.
- Scope Permitido: `tests/`, `scripts/test.sh`, reportes de verificación.
- Scope Prohibido: Modificar archivos en producción para hacer que los tests pasen artificialmente.
- Core Responsibilities:
  1. Lead the adaptive testing workflow (Strict TDD for core logic vs Agile Milestone testing for UI).
  2. Implement Snapshot Isolation in tests to prevent production data pollution.
  3. Run and maintain automated verification pipelines (`./scripts/test.sh`).

### Subagent 5: Codebase Researcher (`research`)
- Objective: Ingestión, análisis exploratorio masivo y mapeo de dependencias utilizando modelos económicos y rápidos (`flash` o `flash_lite`).
- Scope: Solo lectura en todo el proyecto. Prohibido ejecutar herramientas de edición.

---

## 3. Protocolo de Orquestación y RODA

1. **Principio RODA (Read Once, Decide, Act)**:
   - Todo agente debe evitar releer archivos redundantemente. Tras una inspección guiada por rangos, el agente decide y actúa. La validación se delega a las herramientas de verificación (`syntax-guard`, compiladores, suites de tests) y no a la re-inspección en memoria de trabajo.
2. **Estratificación de Modelos**:
   - Tareas exploratorias masivas o lectura de documentación extensa se delegan al subagente `research` para preservar limpia la ventana de contexto del Project Lead.
3. **Prohibición Estricta de Operaciones Remotas**:
   - `git push`, publicaciones de paquetes o alteraciones de repositorios remotos están permanentemente denegadas para todos los subagentes.

---

## 4. Extension Subagents & Skills
Additional domain-specific subagents (e.g. quant financial analysts, system daemons) and skills are dynamically registered from the agentic library catalog according to project requirements.

