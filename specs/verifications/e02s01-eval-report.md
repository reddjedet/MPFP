# Eval Report — e02s01 (Run Evals)

- **Story:** e02s01
- **Date:** 2026-09-25
- **Eval definitions:** `specs/EVALS-financial-core.md`
- **Schema:** `specs/benchmarks/SCHEMA.md`
- **Agreed k:** 3
- **Target:** repository HEAD `670135b` (untracked eval artefacts only)

## 1. Capability under test (one sentence)

The FastAPI backend computes sector-aware equity valuations and portfolio/fixed-income
analytics correctly and persists all state atomically (SQLite / JSON) with graceful
degradation under cache failure and zero secret leakage.

## 2. Capability evals

| ID | Eval | Grader | Tier | verify / rubric | pass@k |
|----|------|--------|------|-----------------|--------|
| C1 | Sector-aware valuation engine (fair value, MoS, rating) | code | ALWAYS_PASSES | `./venv/bin/pytest tests/test_valuation_service.py tests/test_fair_value_service.py -q` | 3/3 |
| C2 | Financial math invariants (units, fixed income, PPC/PFCF, CEDEAR, ETF) | code | ALWAYS_PASSES | `./venv/bin/pytest tests/test_financial_math.py tests/test_financial_units_registry.py tests/test_fixed_income_service.py tests/test_ppc_service.py tests/test_pfcf_service.py tests/test_cedear_service.py tests/test_etf_service.py -q` | 3/3 |
| C3 | Portfolio analytics (allocation, rebalance capital accounting, Markowitz, rotation sizing) | code | ALWAYS_PASSES | `./venv/bin/pytest tests/test_portfolio_calculations.py tests/test_markowitz_service.py tests/test_rotation_service.py -q` | 3/3 |
| C4 | Crash-safe persistence (atomic writes, SQLite bootstrap, legacy migration) | code | ALWAYS_PASSES | `./venv/bin/pytest tests/test_persistence_hardening.py tests/test_sqlite_persistence.py -q` | 3/3 |
| C5 | Graceful degradation (cache/SQLite failure fallback, single-flight concurrency) | code | USUALLY_PASSES | `./venv/bin/pytest tests/test_cache_service.py tests/test_cache_resilience.py -q` | 3/3 |
| C6 | API boundary strictness & error hygiene | model | USUALLY_PASSES | Rubric (below) | 1/1* |

\* Model graders are judged once per rubric pass; the rubric's supporting code evidence
(`tests/test_api_validation.py`) passed inside all 3 full-suite R1 runs.

### C6 rubric (model grader) — verdict: PASS (5/5 checked)

- [x] **Strict Pydantic v2 schemas enforce types/presence on all request bodies** —
  `schemas/api_schemas.py`: `Field(..., min_length=1, max_length=50)`, `ge=0`, `ge=0.0/le=100.0`
  constraints plus `field_validator` per field (`check_nominals`, `check_ppc`, `check_cash`, lines 41–164).
- [x] **Malformed payloads return 4xx (never 5xx) with sanitized messages** —
  `main.py:89–107` maps `RequestValidationError` to 422 `VALIDATION_ERROR`; domain errors use typed
  `MPFPError` envelopes (`main.py:80–87`); unhandled exceptions return a generic
  `"Error interno del servidor."` with no stack internals (`main.py:122–134`).
- [x] **Ticker/string inputs normalized and length/charset capped before service calls** —
  `services/security_service.py:7–25`: `TICKER_REGEX = ^[A-Z0-9.]{1,10}$`,
  `PORTFOLIO_NAME_REGEX = ^[a-z0-9_]{1,30}$`, `sanitize_ticker()`, `sanitize_portfolio_name()`;
  enforced through `services/financial_validation.py:validate_ticker`.
- [x] **Bulk endpoints validate per item and reject reserved names explicitly** —
  `BulkHoldingItem` per-item validators (`schemas/api_schemas.py:141–163`);
  `RESERVED_PORTFOLIO_NAMES = {"bmb","bal"}` enforced at `services/portfolio_service.py:19,39`
  and `routers/portfolios.py:393,461–464`.
- [x] **Automated tests exist for hostile payloads and pass** —
  `tests/test_api_validation.py` (6 tests: non-numeric/fractional nominals → 422, reserved-name
  import blocked, no overwrite of existing portfolio); green in all R1 runs.

## 3. Regression evals

| ID | Eval | Grader | Tier | verify | pass@k |
|----|------|--------|------|--------|--------|
| R1 | Full backend suite passes | code | ALWAYS_PASSES | `./venv/bin/pytest tests/ -q` (263 tests) | 3/3 |
| R2 | Frontend static typing + production build | code | ALWAYS_PASSES | `npm --prefix frontend run build` (`tsc -b && vite build`) | 3/3 |
| R3 | Security & privacy audit clean | code | ALWAYS_PASSES | `./venv/bin/python scripts/audit_security_privacy.py` | 3/3 |
| R4 | Project health & DB integrity diagnostic | code | USUALLY_PASSES | `./venv/bin/python scripts/audit_project.py` | 3/3 |
| R5 | Test isolation: zero `data/` mutation by tests | code | USUALLY_PASSES | `find data -type f -exec md5sum {} + \| sort -k2` diff around a full pytest run | **0/3** |

## 4. Results

| Run | C1 | C2 | C3 | C4 | C5 | C6 | R1 | R2 | R3 | R4 | R5 |
|-----|----|----|----|----|----|----|----|----|----|----|----|
| 1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| 2 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | FAIL |
| 3 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | FAIL |

Cumulative pass@k: **C1–C5, R1–R4 = 3/3 each; C6 = 1/1; R5 = 0/3.**
Zero flakes observed; R5 failures are deterministic, not flaky.

### R5 failure evidence (deterministic)

Files mutated by a full test run (`data/` hashes before → after):

| File | Mutation |
|------|----------|
| `data/mpfp.db` | rewritten |
| `data/portfolios.db` | rewritten |
| `data/user_holdings.db` | rewritten |

Per-module attribution (hash delta after running each module alone):

| Test module | Mutates |
|-------------|---------|
| `tests/test_rotation_service.py` | `mpfp.db`, `portfolios.db` |
| `tests/test_persistence_hardening.py` | `mpfp.db`, `user_holdings.db` |
| `tests/test_portfolio_calculations.py` | `mpfp.db` |
| `tests/test_api_endpoints.py` | `mpfp.db` |
| `tests/test_api_validation.py` | `mpfp.db`, `portfolios.db`, `user_holdings.db` |
| `tests/test_sqlite_persistence.py` | clean |
| `tests/test_agent_guards.py` | clean |

Root cause: SQLite table stores resolve repo-level paths (e.g.
`services/rotation_service.py:21` — `DB_PATH = ... / "data" / "user_holdings.json"`), so any test
exercising them opens and checkpoints production databases. Violates
AGENTS.md §4.5 (Test Isolation). Tracked as **DEC-01** in `specs/state.yaml`.

## 5. Gate decision

| Rule | Status |
|------|--------|
| `ALWAYS_PASSES` (C1–C4, R1–R3) pass at agreed k=3 | **PASS — 24/24 runs** |
| `USUALLY_PASSES` failures (R5 0/3) | Warning only; `ALWAYS_PASSES` suite green |
| `EXPERIMENTAL` failures | none |

**BUILD gate: RELEASED (not blocked).** Merge is permitted, but DEC-01 (high severity,
test isolation) must be fixed before the R5 warning can be cleared and before any
`USUALLY_PASSES → ALWAYS_PASSES` promotion round.

## 6. Promotions & handoff

Recorded in `specs/state.yaml`:
- Streak counters initialized (C1–C5, R1–R4 at 3; C6 at 1; R5 reset to 0).
- `handoff.open_decisions`: **DEC-01** — pytest runs mutate `data/mpfp.db`,
  `data/portfolios.db`, `data/user_holdings.db`; proposed fix: injectable data dir
  (env var / fixture to `tempfile.TemporaryDirectory`).
- Known flakes: none.

---

# Addendum — Run 2: DEC-01 fix (2026-09-25)

## Fix delivered (uncommitted working-tree changes)

| Change | File | Purpose |
|--------|------|---------|
| NEW | `services/data_paths.py` | `get_data_dir()` / `data_file()`; `MPFP_DATA_DIR` env override, default `data/` |
| NEW | `tests/conftest.py` | Redirects `MPFP_DATA_DIR` to a tempdir seeded with a `data/` snapshot (excl. `backups/`, `*-wal`, `*-shm`) before any service import; cleanup at sessionfinish |
| EDIT | 11 × `services/*.py` | Path constants now resolve through `data_file()` (imports cleaned) |
| EDIT | `scripts/test.sh` | Pipeline FAILs if tests mutate `data/` (hash comparison around the test step) |

## Independent review (fresh-context subagent)

Verdict: request-changes → both findings fixed and negatively re-tested:
- **P1** — guard skipped when pytest fails under `set -e`: test run now wrapped in
  `if/else` (`FAILED=1`) and comparison always executes; snapshot cleanup via `trap EXIT`.
- **P2** — no baseline when `data/` absent at start: comparison now always runs against
  an empty baseline; any post-test file counts as mutation.
- Residual risks (accepted, documented in `specs/state.yaml`): import-time path constants
  vs. external pytest plugins; temp snapshot leak on SIGKILL (no production impact).

## Results — Run 2 (k=3)

| Run | C1 | C2 | C3 | C4 | C5 | C6 | R1 | R2 | R3 | R4 | R5 |
|-----|----|----|----|----|----|----|----|----|----|----|----|
| 1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS |
| 3 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS |
| **pass@k** | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 1/1 | 3/3 | 3/3 | 3/3 | 3/3 | **3/3** |

All code graders 3/3; zero flakes. `./scripts/test.sh` end-to-end: 100% green including
the new `PASS: Test isolation verified (data/ untouched)` step. Suite runtime improved
41s → 21s (no production-DB contention).

## Gate decision (Run 2)

**BUILD gate: RELEASED.** All `ALWAYS_PASSES` evals green at k=3, including R5.

## Promotions (Run 2)

- **C5, R4 → `ALWAYS_PASSES`** (6 consecutive clean runs each, zero flakes; rule e45s37).
- R5 streak 3/5 since fix (stays `USUALLY_PASSES` until 5 clean runs).
- C6 streak 1/3 for promotion.
- **DEC-01 → resolved.**
