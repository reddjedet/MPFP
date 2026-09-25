# Benchmarks Schema — Eval Records

Schema for evaluation ("eval") definitions and their run records in this repository.
Applies to every `specs/EVALS-*.md` file and every report under `specs/verifications/`.

---

## 1. Directory layout

```text
specs/
├── benchmarks/
│   └── SCHEMA.md                      # [This file] eval record schema & gate rules
├── EVALS-<feature>.md                 # Eval definitions + results for one capability
├── state.yaml                         # Promotion counters, flakes, open decisions
└── verifications/
    └── eNNsYY-eval-report.md          # Eval report keyed by story ID (traceability)
```

Naming:
- `EVALS-<feature>.md` — `<feature>` is a lowercase kebab-case slug of the capability under test.
- `eNNsYY-eval-report.md` — `eNN` = epic, `sYY` = story that triggered the eval run.

---

## 2. Eval record fields

Every eval row in an `EVALS-*.md` MUST define:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique within the file. `C<n>` = capability eval, `R<n>` = regression eval |
| `eval` | string | yes | One-line statement of what is being checked |
| `grader` | enum | yes | `code` or `model` (see §3) |
| `tier` | enum | yes | `EXPERIMENTAL` \| `USUALLY_PASSES` \| `ALWAYS_PASSES` (see §4) |
| `verify` | shell command | for `code` | Runnable, non-interactive, exit 0 = PASS, non-zero = FAIL |
| `rubric` | checklist | for `model` | Explicit pass/fail criteria; every box must be checked to PASS |
| `k` | int | yes | Number of runs for pass@k (default 3) |

### 2.1 Code grader constraints (`grader: code`)
- The `verify:` command MUST be runnable from the repository root as-is.
- MUST be deterministic: no network calls, no wall-clock dependence, no randomness.
- MUST use isolated state (`tempfile.TemporaryDirectory` or equivalent); never mutate `data/`.
- Side effects outside the repo (network, other processes) are forbidden.

### 2.2 Model grader constraints (`grader: model`)
- MUST carry an explicit rubric with binary checkboxes: `[ ] criterion`.
- PASS requires **all** criteria checked, with file/line evidence cited per criterion.
- The grader model MUST NOT modify code; it inspects and records evidence only.
- Rubric outcomes are reproducible only at the criterion level; that is why model graders
  default to `USUALLY_PASSES` and are promoted more slowly (see §4).

---

## 3. Grader types

| Grader | Meaning | Verdict source |
|--------|---------|----------------|
| `code` | Shell `verify:` command | Process exit code |
| `model` | Rubric evaluated by the agent/model | All-or-nothing rubric checkboxes + evidence |

---

## 4. Strictness tiers (graduated promotion)

| Tier | Meaning | Gate behaviour | Promotion rule |
|------|---------|----------------|----------------|
| `EXPERIMENTAL` | New eval, may flake | Log only — never blocks | → `USUALLY_PASSES` after 3 consecutive passes |
| `USUALLY_PASSES` | Stable in dev | Warn on failure; blocks BUILD only when the `ALWAYS_PASSES` suite is also failing | → `ALWAYS_PASSES` after 5 consecutive passes with zero flakes documented in `specs/state.yaml` |
| `ALWAYS_PASSES` | Zero tolerance, release gate | Any single failure blocks BUILD and merge | Demote on any unexplained flake |

Authoring rule: deterministic `code` graders with fully isolated, reproducible `verify:`
commands may be authored directly at `ALWAYS_PASSES` when they guard release-critical
invariants. Anything timing-, concurrency- or judgment-dependent starts lower and must
earn promotion through the counters in `specs/state.yaml`.

---

## 5. pass@k

- Run every capability eval **k times** (default `k = 3`).
- `pass@k` = `<passing runs>/<total runs>`.
- Ship only when all k runs pass, or when a known flake is documented in
  `specs/state.yaml` under `handoff.open_decisions`.
- Regression evals use the same accounting; a single regression run is permitted only
  for graders marked non-blocking.

---

## 6. Results table format

Inside `EVALS-*.md` and in each eval report:

```markdown
## Results
| Run | C1 | C2 | R1 | pass@k |
|-----|----|----|-----|--------|
| 1 | PASS | PASS | PASS | 3/3 |
| 2 | PASS | PASS | PASS | 6/6 |
| 3 | PASS | PASS | PASS | 9/9 |
```

The report at `specs/verifications/eNNsYY-eval-report.md` MUST additionally state:
1. Capability under test (one sentence).
2. Eval tables (capability + regression) with grader and tier.
3. Per-run results and per-eval `pass@k`.
4. Gate decision: BUILD blocked / released, per tier rules in §4.
5. Promotion actions and open decisions recorded in `specs/state.yaml`.

---

## 7. Gate semantics (BUILD phase)

- Any `ALWAYS_PASSES` failure at agreed k => **BUILD blocked**, no merge.
- `USUALLY_PASSES` failures => warnings; blocking only when the `ALWAYS_PASSES` suite
  is failing at the same time.
- `EXPERIMENTAL` failures => logged in the report and `specs/state.yaml` only.
