# Universal Engineering & Architecture Canonical Rules

This document establishes universal canonical rules for software engineering, security, testing, and operational discipline across projects.

---

## 1. Security & Backend Shielding
1. **Host Binding Policy (DEP-01)**:
   - **Local Development**: Services and scripts bind strictly and exclusively to `127.0.0.1` (localhost).
   - **Cloud/PaaS Deployment (Render)**: Binding to `0.0.0.0` is permitted strictly within the internal container runtime when required by the PaaS ingress router, operating behind the managed TLS reverse proxy and strict CORS origin validation.
2. **Zero Trust Input Validation**:
   - Every input (parameters, query strings, body payloads, files) must be strictly validated against typed schemas and strict regex patterns.
   - User inputs must never be directly concatenated into OS commands, file system paths, or raw shell calls.
   - Enforce payload size limits (e.g. 1 MB max) to prevent memory exhaustion and Denial of Service.
3. **OWASP Standard Headers & CSP (SEC-03)**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 0` (modern OWASP standard; sanitizes legacy XSS filter vulnerabilities in favor of CSP)
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - Strict `Content-Security-Policy` without `'unsafe-eval'`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`
4. **POSIX Atomic Persistence**:
   - File-based persistence must implement atomic writes with concurrency control (e.g. `threading.RLock`):
     1. Write to ephemeral temporary file (`.tmp`).
     2. Flush and force disk sync (`flush()` + `fsync()`).
     3. Atomic POSIX replacement (`os.replace()`).
     4. Create safety backup before overwriting critical stores.

---

## 2. Quality Assurance, Adaptive Testing & Snapshot Isolation
1. **Adaptive Testing Protocol**:
   - **Strict TDD (Red-Green-Refactor)**: Mandatory for core business logic, atomic storage, math models, schemas, and security boundaries.
   - **Agile Milestone Protocol**: For rapid UI/visual prototyping, prioritize fast iteration and static checks, validating the entire test suite upon milestone consolidation.
2. **Strict Snapshot Isolation**:
   - Tests must execute inside isolated ephemeral directories (e.g. `tempfile.TemporaryDirectory`).
   - Tests must never mutate or pollute production files or user data directories.
3. **Automated Verification Pipeline**:
   - A standard runner (`./scripts/test.sh`) must verify static typing, unit tests, and security hygiene before changes are finalized.

---

## 3. Operational Discipline & Token Management
1. **RODA Protocol (Read Once, Decide, Act)**:
   - Inspect files only when necessary. Eliminate redundant re-reading cycles.
   - Rely on test runners and compilers to validate behavior rather than manual inspections.
2. **Context Budgeting (25/10 Rule)**:
   - Keep chat sessions focused. Rotate to a fresh session upon reaching <= 25 exchanges or <= 10 artifacts.
   - Record session state and immediate next steps in `docs/bitacora.md` before transitioning.
