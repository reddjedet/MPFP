# AGENTS.md — Canonical Project Context

Root context manifest for autonomous agents (**Pi** and **Antigravity**). Defines project ground truth, canonical execution commands, architectural routes, and security boundaries.

---

## 1. Overview & Tech Stack
- **Purpose**: Financial dashboard / valuation app migrated from Streamlit to decoupled FastAPI + React.
- **Backend**: Python 3.11+ / FastAPI / Pydantic v2 / Uvicorn.
- **Frontend**: Vite + React + Tailwind CSS + Lucide Icons (`frontend/` subdirectory).
- **Persistence**: Local JSON / SQLite with POSIX atomic writes (`services/atomic_persistence.py`) in `data/`.
- **Virtualenv**: `venv/` at repository root.

---

## 2. Architecture Map (Repo Map)

```text
Streamlit-a-app-github/
├── AGENTS.md            # [This file] Root context manifest for LLMs
├── main.py              # FastAPI entry point & static mount
├── routers/             # Modular API route endpoints (/api/v1/...)
├── services/            # Pure business logic: financial math, persistence, security
├── schemas/             # Strict Pydantic v2 I/O schemas
├── frontend/            # Web client app (Vite / React / TypeScript / Tailwind)
│   ├── src/             # UI views, components, stores, and hooks
│   └── package.json     # Client dependencies and build scripts
├── tests/               # Pytest automated test suite (isolated tempfile runs)
├── scripts/             # Control, audit, and test execution scripts
├── start.sh / stop.sh   # Background daemon management scripts
├── data/                # Local data storage (JSON/SQLite files)
└── .agents/             # Security harness: hooks.json, guardrails, role specs
```

---

## 3. Canonical Commands (Source of Truth)
*Never hallucinate commands; use only the following:*

- **Activate venv**: `source venv/bin/activate`
- **Run backend tests**: `./venv/bin/pytest tests/` (or `./scripts/test.sh`)
- **Start backend (dev)**: `./venv/bin/uvicorn main:app --reload --port 8000 --host 127.0.0.1`
- **Start full daemon**: `./start.sh`
- **Stop full daemon**: `./stop.sh`
- **Frontend dev server**: `npm --prefix frontend run dev`
- **Build frontend**: `npm --prefix frontend run build`
- **Typecheck frontend**: `npm --prefix frontend run typecheck` (or `npx tsc --noEmit`)

---

## 4. Critical Operational Rules (Golden Path)

1. **Rule Precedence**: Detailed policies and active guardrails reside in `.agents/RULES.md` and `.agents/hooks.json`.
2. **Strict Git Restraints**:
   - **FORBIDDEN**: Never run `git push` or any remote publishing command.
   - **FORBIDDEN**: Never run destructive commands (`git reset --hard`, `git clean -f -d`, `rm -rf /`).
   - Always verify uncommitted files with `git status --porcelain` before untracking.
3. **Frontend Source of Truth**:
   - Never edit compiled bundles in `static/`.
   - Make all UI changes in `frontend/src/` and verify with `npm --prefix frontend run build`.
4. **Security & Zero Leakage**:
   - Zero tokens, credentials, or API keys in tracked files.
   - All dev servers must bind to `127.0.0.1` (never `0.0.0.0`).
5. **Test Isolation**:
   - Tests must never mutate production `data/*.json` files; use `tempfile.TemporaryDirectory`.
   - Backend changes must pass `./venv/bin/pytest tests/` before completion.

---

## 5. Specialized Subagent Delegation
For complex multi-agent workflows, refer to subagent definitions in `.agents/AGENTS.md`:
- `security_auditor`: Audits inputs, secret leaks, and hardening boundaries.
- `backend_engineer`: Endpoints, schemas, and financial calculation services.
- `frontend_engineer`: React components, state, Tailwind, and UI ergonomics.
- `qa_engineer`: Test coverage, regression verification, and automation.
