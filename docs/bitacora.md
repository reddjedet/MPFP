# Development Log & Context Handoff

This document tracks project evolution, session metrics, and seamless context handoffs between developer and AI agents (Google Antigravity, OpenCode, etc.).

---

## 1. Project Status & Session Health

- Active Git Branch: `main`
- Active Milestone: `[Milestone Name]`
- TypeScript Compilation: `0 errors (npx tsc --noEmit)`
- Automated Test Suite: `100% passing (./scripts/test.sh)`
- Security / Privacy Audit: `100% passing`

### Context Saturation Indicator (Target: <= 25 exchanges / <= 10 artifacts)
- Current Session Exchanges: `[0..25]`
- Current Artifacts Count: `[0..10]`
- Chat Health State: `[Fresh (1-10) | Nominal (11-20) | Saturated (21-25) -> Rotate to New Chat]`

---

## 2. Chronological Session Registry

### Session 2026-09-23: Refactorización por Fases de correcciones.md (Fases 1, 2 y 3)
- Primary Goal: Resolver por fases metódicas las correcciones de valuación/renta fija (Fase 1), motor MCM/rotación (Fase 2) y seguridad/despliegue (Fase 3).
- Context Handoff File: `FASE_4_Y_PENDIENTES.md` (ubicado en la raíz).

#### 2.1 Changes Delivered
- **Fase 1 (Valuación y Renta Fija):**
  - Creado `services/financial_units.py` (normalización base 100 y aislamiento de magnitudes).
  - Resueltos `DASH-01` (error factor 100x), `DASH-02` (doble conteo patrimonial), `DASH-03` (prohibida venta de renta fija para comprar equity) y `MATH-07`.
- **Fase 2 (Motor de Recomendación y MCM):**
  - Modificado `services/rotation_service.py` (`DASH-04..06`, `DEC-01..10`).
  - MCM discreto como única fuente de verdad; déficit estructural desacoplado de presupuesto inmediato (`wait_cash`); venta estricta de excedentes.
- **Fase 3 (Seguridad y Despliegue):**
  - Modificado `services/security_service.py` (`get_cors_configuration()`) desacoplando CORS y eliminando comodines en producción (`SEC-02`).
  - Modificado `main.py`: CSP endurecida sin `'unsafe-eval'`, directivas completas y `X-XSS-Protection: 0` (`SEC-03`); ciclo de vida graceful en `lifespan` (`DEP-03`); endpoints `/live` y `/ready` (`DEP-04`).
  - Creado `.python-version` (3.12.8) coincidente con `render.yaml` (`DEP-02`).
  - Armonizado host binding: local 127.0.0.1 y container Render 0.0.0.0 (`DEP-01`).
  - Modificado `stop.sh` con apagado `SIGTERM` previo al fallback `SIGKILL` (`DEP-03`).

#### 2.2 Verification Results
- [x] TypeScript check: `tsc --noEmit` limpio (0 errores).
- [x] Production build: `npm run build` en `frontend/` exitoso.
- [x] Automated test suite: **165/165 tests pasando al 100%** (`./scripts/test.sh`).
- [x] Security & privacy audit: Limpio (0 anomalías detectadas).

#### 2.3 Context Handoff Snapshot (Carry-over to Next Chat)
- Documento guía: `FASE_4_Y_PENDIENTES.md` (archivo local del desarrollador, no versionado).
- Status: Completado.

### Session 2026-09-23: Fase 4 — Persistencia y Migración a SQLite (DATA-01 a DATA-03)
- Primary Goal: Migrar almacenamiento JSON a SQLite con modo WAL, transacciones inmediatas, durabilidad ACID y test de concurrencia.
- Changes Delivered:
  - Creado `services/sqlite_persistence.py` con `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA synchronous=NORMAL` y tabla de versiones `schema_migrations`.
  - Fachada retrocompatible `services/atomic_persistence.py` conectada a `SQLiteTableStore`.
  - Migración y respaldo automático con `scripts/migrate_json_to_sqlite.py` (10 datasets JSON a `data/mpfp.db`).
  - Suite de pruebas `tests/test_sqlite_persistence.py` (10 tests cubriendo multiproceso concurrente, no destructividad y rollback).
- Verification: 175/175 tests pasando al 100%.

### Session 2026-09-23: Fase 5 — Backend, Arquitectura de APIs y Excepciones (API-01 a API-05)
- Primary Goal: Jerarquía de excepciones de dominio, modelos Pydantic v2, prewarm asíncrono con timeouts, validación centralizada de invariantes y observabilidad con Correlation-ID.
- Changes Delivered:
  - `API-01`: Creada jerarquía `services/exceptions.py` (`MPFPError`, `DomainValidationError`, `FinancialInvariantError`, `ResourceNotFoundError`, `ExternalProviderError`, `PersistenceFailureError`) y handlers globales en `main.py` con envelope uniforme (`error`, `code`, `details`, `request_id`).
  - `API-02`: Modelos Pydantic v2 fuertemente tipados en `schemas/api_schemas.py` y modernización de endpoints en `routers/`.
  - `API-03`: Prewarm desacoplado en `services/prewarm_service.py` con timeouts estrictos (5s), flag `ENABLE_PREWARM` y cancelación segura sin bloquear readiness.
  - `API-04`: Validación centralizada de invariantes en `services/financial_validation.py` (pesos al 100% ± 0.5%, no-negatividad y nominales enteros en CEDEARs).
  - `API-05`: Middleware de observabilidad en `services/observability.py` inyectando `X-Request-ID` y `X-Process-Time`, y logging estructurado con sanitización de credenciales.
  - Suite de pruebas exhaustiva en `tests/test_api_architecture.py` (30 tests pasando).
- Verification: 205/205 tests pasando al 100% (`./scripts/test.sh`), TypeScript limpio, auditorías de seguridad y privacidad saludables.

### Session 2026-09-23: Fase 6 — Caché de Mercado y Rendimiento (CACHE-01, CACHE-02)
- Primary Goal: Optimizar el subsistema de caché en `services/cache_service.py` eliminando la reescritura masiva de archivos JSON y colisiones de claves.
- Changes Delivered:
  - `CACHE-01`: Migración SQLite v2 implementada en `services/sqlite_persistence.py` creando la tabla `market_cache` con índices en `expires_at`, `func_name`, `category` y `last_accessed_at`.
  - `CACHE-01`: Arquitectura de dos niveles: L1 (en memoria con thread lock y LRU) + L2 (SQLite WAL individual fila por fila con single-flight coordination para evitar dogpiling).
  - `CACHE-01`: TTL granular adaptado a la rueda bursátil argentina (intradía 60s, realtime 180s, market_data 300s, slow_metrics 1h, historical 4h, static/calendar 24h, o custom numérico).
  - `CACHE-01`: Soporte recursivo tipado para DataFrames, Series, ndarrays de NumPy, tuplas y DatetimeIndex/Timestamps. Políticas de desalojo `purge_expired` y `enforce_lru`.
  - `CACHE-02`: Generación canónica de claves con SHA-256 e introspección de firmas (`inspect.signature`), resolución de defaults y normalización recursiva de argumentos. Invariante ante paso de positional vs keyword arguments y orden de diccionarios.
  - Verificación en `scripts/audit_project.py` integrando la tabla `market_cache`.
  - Suite de 17 pruebas exhaustivas en `tests/test_cache_service.py` (concurrencia multihilo, TTLs, roundtrip DataFrame, fallback stale, etc.).
- Verification: 218/218 tests pasando al 100% (`./scripts/test.sh` en 4.16s), TypeScript limpio (`tsc -b && vite build`), auditorías de seguridad y privacidad en verde.
  - [ ] Implementar **Fase 7: Frontend, Calidad y Experiencia de Usuario (`QA-01`, `FE-01` a `FE-03`, `DOC-01`)**.

### Session 2026-09-23: Diagnóstico y Fix de CI en GitHub Actions + Reorganización de Docs
- Primary Goal: Diagnosticar y solucionar el fallo de la suite backend en GitHub Actions (`3a50f42`), configurar directorio `ignorados/` y actualizar documentación.
- Changes Delivered:
  - Creado directorio `ignorados/` (ignorado en `.gitignore` y auditado en `scripts/audit_security_privacy.py`), trasladando notas de harness y prompts de valuación (`docs/prompts/` -> `ignorados/prompts/`).
  - Corregido `services/sqlite_persistence.py` (`load()` en `valuation_profiles` retornando default limpio).
  - Corregido `services/atomic_persistence.py` (`_bootstrap_if_needed()` con detección amplia de tablas vacías y target DB con `.db`).
  - Actualizados `README.md`, `SECURITY.md`, `instructivo.md` y `docs/aprendizaje_de_errores.md` (INC-08).
- Verification: 218/218 tests pasando al 100% en clon limpio y `./scripts/test.sh`.


---

### Session 2026-09-25: Evals, Aislamiento de Tests, Reparación de bmb y Leyenda del Treemap
- Primary Goal: Establecer harness de evals, cerrar DEC-01 (tests contaminaban data/), reparar el portfolio bmb y mejorar la visualización de composición.
- Changes Delivered:
  - `EVALS-01`: Harness de evals en `specs/` (benchmarks/SCHEMA.md, EVALS-financial-core.md, verifications/e02s01-eval-report.md, state.yaml). 11 evals con pass@k=3; C5/R4 promovidas a ALWAYS_PASSES.
  - `TEST-01` (DEC-01, resuelto): Aislamiento de tests vía `MPFP_DATA_DIR` (`services/data_paths.py` + `tests/conftest.py` con snapshot temporal) y guard de integridad en `scripts/test.sh`. 263/263 tests, data/ intacto.
  - `DATA-01`: Reparación de `bmb` (contaminación por tests pre-fix): RV = CAT 24.4 / MRK 38.1 / GOOGL 16.9 / MA 2.3 / PM 8.5 / AMAT 9.8; split RV 46.56 / RF 53.44; S30S6 53.44% (100% del bloque RF). Limpieza de fixtures de test en tenencias (GGAL 10 nominales, cash_ars 1500). Verificación independiente vía subagentes + spot-check del padre.
  - `FE-01`: Leyenda "Todos los activos" bajo el Treemap en `HoldingsManagerView.tsx` (ticker + sector + % ordenado por peso descendente, click abre ficha). Motivo: ECharts no renderiza labels en teselas chicas (MA 2.3%).
  - `DOC-01`: script `typecheck` agregado a `frontend/package.json` (AGENTS.md lo referenciaba pero no existía).
- Architectural Decisions & Edge Cases:
  - `data/portfolios.db` es el store AUTORITATIVO de portfolios (`portfolio_service._db.file_path`); `data/mpfp.db` contiene tablas espejo y debe sincronizarse en cada reparación.
  - Reparaciones de datos SIEMPRE con la app detenida (la caché en memoria del daemon pisó escrituras) + `PRAGMA wal_checkpoint(TRUNCATE)` para que la verdad quede en el .db principal, no solo en el -wal.
  - Backups de SQLite deben copiar también `-wal`/`-shm` (un backup del .db solo puede leerse como estado viejo).
  - Tests: prohibido hardcodear expectativas sobre datos vivos de producción (fixtures propios en el store aislado).
- Verification:
  - `./venv/bin/pytest tests/ -q` → 263/263; data/ sin mutación.
  - `./scripts/test.sh` → 100% con "Test isolation verified (data/ untouched)".
  - `npm --prefix frontend run build` (tsc -b && vite build) → OK.
  - Verificación post-boot por API y servicios de todos los datos reparados.
- Context Handoff Snapshot:
  - Completed: evals, DEC-01, bmb (config + tenencias), leyenda del Treemap.
  - Next Steps: usuario ajustará la RV de bmb por UI (variante con VIST anotada); promover R5/C6 en specs/state.yaml al acumular corridas limpias.
  - Blockers: None.

---

## 3. Bootstrap Prompt for Fresh Chat Sessions

When rotating to a new chat after reaching context limits, copy and paste this exact prompt:

```text
Starting a new session for [Project Name].
1. Read .agents/RULES.md, .agents/AGENTS.md, and docs/bitacora.md.
2. Review active state and edge cases in WORKFLOW.md.
3. Confirm current milestone and immediate pending task from bitacora.md before taking action.
4. Adhere to Pareto (80/20) and RODA protocols. No emojis.
```

---

## 4. Blank Template for New Sessions

```markdown
### Session YYYY-MM-DD: [Title]
- Exchanges: [N/25] | Artifacts: [M/10]
- Primary Goal: 

#### Changes Delivered
- 

#### Architectural Decisions & Edge Cases
- 

#### Verification
- [ ] `npx tsc --noEmit`
- [ ] `./scripts/test.sh`

#### Context Handoff Snapshot
- Completed:
- Next Steps:
- Blockers: None
```
