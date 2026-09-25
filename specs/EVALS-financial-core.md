# EVALS: Financial Core (valuation, portfolio analytics, persistence)

**Story:** e02s01 · **Schema:** `specs/benchmarks/SCHEMA.md` · **Agreed k:** 3

## Capability under test (one sentence)

The FastAPI backend computes sector-aware equity valuations and portfolio/fixed-income
analytics correctly and persists all state atomically (SQLite / JSON) with graceful
degradation under cache failure and zero secret leakage.

---

## Capability

| ID | Eval | Grader | Tier | verify / rubric |
|----|------|--------|------|-----------------|
| C1 | Sector-aware valuation engine (banks, holdings, dual-debt industrials, energy, standard FCF) yields correct fair value, margin of safety and rating | code | ALWAYS_PASSES | `verify: ./venv/bin/pytest tests/test_valuation_service.py tests/test_fair_value_service.py -q` |
| C2 | Financial math invariants hold: unit registry, fixed-income yields, PPC/PFCF, CEDEAR ratios, ETF metrics | code | ALWAYS_PASSES | `verify: ./venv/bin/pytest tests/test_financial_math.py tests/test_financial_units_registry.py tests/test_fixed_income_service.py tests/test_ppc_service.py tests/test_pfcf_service.py tests/test_cedear_service.py tests/test_etf_service.py -q` |
| C3 | Portfolio analytics correct: allocation, rebalance with capital accounting, Markowitz frontier, rotation order sizing | code | ALWAYS_PASSES | `verify: ./venv/bin/pytest tests/test_portfolio_calculations.py tests/test_markowitz_service.py tests/test_rotation_service.py -q` |
| C4 | Persistence is crash-safe and bootstrap-safe: atomic POSIX writes, SQLite schema bootstrap, legacy JSON migration without data loss | code | ALWAYS_PASSES | `verify: ./venv/bin/pytest tests/test_persistence_hardening.py tests/test_sqlite_persistence.py -q` |
| C5 | Graceful degradation: cache/SQLite failures fall back to stale data or clean errors; concurrency (single-flight, LRU, TTL) never deadlocks or corrupts | code | ALWAYS_PASSES | `verify: ./venv/bin/pytest tests/test_cache_service.py tests/test_cache_resilience.py -q` |
| C6 | API boundary strictness and error hygiene: hostile/malformed payloads rejected with 4xx, no internal leakage, sanitization before services | model | USUALLY_PASSES | Rubric: [ ] strict Pydantic v2 schemas enforce types/presence on all request bodies [ ] malformed payloads return 4xx (never 5xx) with sanitized messages [ ] ticker/string inputs normalized and length/charset capped before service calls [ ] bulk endpoints validate per item and reject reserved names explicitly [ ] automated tests exist for hostile payloads and pass (`./venv/bin/pytest tests/test_api_validation.py tests/test_api_endpoints.py -q`) |

## Regression

| ID | Eval | Grader | Tier | verify / rubric |
|----|------|--------|------|-----------------|
| R1 | Full backend suite passes | code | ALWAYS_PASSES | `verify: ./venv/bin/pytest tests/ -q` |
| R2 | Frontend static typing + production build clean | code | ALWAYS_PASSES | `verify: npm --prefix frontend run build` |
| R3 | Security & privacy audit clean (zero secrets/leaks in tracked files) | code | ALWAYS_PASSES | `verify: ./venv/bin/python scripts/audit_security_privacy.py` |
| R4 | Project health & DB integrity diagnostic healthy | code | ALWAYS_PASSES | `verify: ./venv/bin/python scripts/audit_project.py` |
| R5 | Test isolation: test runs mutate zero files under `data/` | code | USUALLY_PASSES | `verify: find data -type f -exec md5sum {} + \| sort -k2 > /tmp/data.before && ./venv/bin/pytest tests/ -q && find data -type f -exec md5sum {} + \| sort -k2 \| diff /tmp/data.before -` |

## Results

| Run | C1 | C2 | C3 | C4 | C5 | C6 | R1 | R2 | R3 | R4 | R5 |
|-----|----|----|----|----|----|----|----|----|----|----|----|
| 1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| 2 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | FAIL |
| 3 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | FAIL |
| **pass@k** | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 1/1* | 3/3 | 3/3 | 3/3 | 3/3 | **0/3** |

\* C6 is a model grader: one rubric evaluation (all 5 criteria checked), whose supporting
code evidence (`tests/test_api_validation.py`) passed in all 3 R1 runs.

Full run log and gate decision: `specs/verifications/e02s01-eval-report.md`.

## Results — Run 2 (post DEC-01 fix, 2026-09-25)

R5 fix: `MPFP_DATA_DIR` injectable data dir + `tests/conftest.py` snapshot isolation +
`scripts/test.sh` guard (independently reviewed; 2 review findings fixed and re-verified).

| Run | C1 | C2 | C3 | C4 | C5 | C6 | R1 | R2 | R3 | R4 | R5 |
|-----|----|----|----|----|----|----|----|----|----|----|----|
| 1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS |
| 3 | PASS | PASS | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS |
| **pass@k** | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 1/1* | 3/3 | 3/3 | 3/3 | 3/3 | **3/3** |

\* C6 rubric re-verified unaffected by the fix (path plumbing only); supporting code
evidence green in all R1 runs.
