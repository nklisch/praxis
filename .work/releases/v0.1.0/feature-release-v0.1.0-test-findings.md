---
id: feature-release-v0.1.0-test-findings
kind: feature
stage: done
tags: [testing]
parent: epic-release-v0.1.0-readiness
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# v0.1.0 — test-quality gate drain

## Brief

Container for the 8 findings produced by `/agile-workflow:gate-tests`
against the v0.1.0 bundle on 2026-05-10. The bundle is exceptionally
well-tested for a v0.1.0 release: the audit mapped roughly 200 named
test cases across 41 bundle test files, against acceptance criteria
extracted from each bound item's body. **Zero Criticals, zero
tautological tests flagged.** All 8 findings are genuine acceptance
gaps but at the priority threshold below "blocks ship at all costs."

Notable pre-bundle strengths the audit confirmed: routing-integration
covers every spec branch (frustration spike, sustained ease, etc.);
update service covers all five `UpdateCheckResult` variants plus
boundary semver compares; bootstrap drafts streaming has 9 tests
covering snapshot + every mutator + listener exception isolation;
indexers cover empty + populated + all-correct + all-incorrect deltas
+ clamping; bubble boundaries have a dedicated parity sweep across 8
scenarios.

## Children (8)

### Active (3) — block release readiness

- **High** — `gate-tests-onboarding-config-persistence` (`config_kv`
  upsert + read paths for `OnboardingConfig` are stubbed in the hook
  test and client routing test; no direct DB-round-trip test exists)
- **Medium** — `gate-tests-metacognitive-prompts-exclusion-assertions`
  (study-skills/bootstrap/configure modes must NOT carry the fragment;
  exclusion is asserted by absence-of-code only)
- **Medium** — `gate-tests-onboarding-skip-coverage`
  (skip-on-engine and skip-on-course step partitions of the onboarding
  flow are unasserted)

### Backlog (5) — bound to v0.1.0 for traceability

- **Low** — `gate-tests-ipc-handler-seam-first-run-update`
- **Low** — `gate-tests-tab-state-isolation-parity`
- **Low** — `gate-tests-update-banner-version-edge-inputs`
- **Low** — `gate-tests-logger-rotation-behavior`
- **Low** — `gate-tests-affective-indexer-transaction-atomicity`

The 5 backlog items have `release_binding: v0.1.0` for attribution.
To exclude them, edit each backlog file and remove `release_binding`.

## Implementation order

1. The High first (`onboarding-config-persistence`; new test file in
   `packages/core/src/config/__tests__/`).
2. The two Mediums in parallel (different files).
3. Backlog Lows by user choice (drain or unbind).

## Source

`/agile-workflow:gate-tests v0.1.0` audit committed at `364065b`.

---

## Children complete (2026-05-10)

All 3 active children advanced to `stage: review`:

| Story | Priority | Resolution | Commit |
|---|---|---|---|
| `gate-tests-onboarding-config-persistence` | High | Created `packages/core/src/config/__tests__/onboarding-config.test.ts` (4 cases: fresh-DB null read, ISO timestamp on first call, upsert on second call, strict ordering) | `db04e01` |
| `gate-tests-metacognitive-prompts-exclusion-assertions` | Medium | `it.each` block over study-skills/bootstrap/configure modes asserting no `metacognitive-prompts` fragment present | `032c304` |
| `gate-tests-onboarding-skip-coverage` | Medium | 2 new test cases covering skip-on-engine and skip-on-course step partitions | `a4e0bbb` |

5 backlog children (Lows) remain bound to v0.1.0 for traceability but
do not block this feature's advancement.

## Verification

12 new tests added across this feature + the sibling security/cruft work
(2365 → 2377 passing). Typecheck clean across all 10 workspace packages.

## Review (2026-05-10)

Approve. All 3 active children reviewed and approved individually. The
3 changes close the full High+Medium finding set from the test-quality
gate:

- `onboarding-config-persistence`: new file in the correct package,
  isolated DB tests, all 4 spec partitions covered.
- `metacognitive-prompts-exclusion-assertions`: appended to the
  existing integration test file, uses live mode imports, covers all 3
  required excluded modes.
- `onboarding-skip-coverage`: appended to the existing onboarding flow
  test, correct async hygiene, all 3 skip partitions now asserted.

Tests integrate cleanly into existing infrastructure (`useTempDb`,
`makeFakeClient`, existing `it.each` patterns in the curriculum suite).
No cross-file conflicts; 2377 passing confirmed by sub-agent. 5 Low
backlog items remain bound to v0.1.0 for traceability — they do not
block this feature's done status.

## Lows drained (2026-05-10)

All 5 backlog Low stories were lifted into active and drained by user request via `/agile-workflow:release-deploy v0.1.0` (option "Drain them now"). Test code landed across 2 consolidated commits (`31ae176` and `794a1fc`) due to sub-agent staging sequencing; story body updates landed in the same window.

| Story | Tests added | Commits |
|---|---|---|
| `gate-tests-ipc-handler-seam-first-run-update` | 6 tests — new `ipc-server.first-run-update.test.ts` mirroring log-channel pattern | `2c72664` (code), `31ae176` (story body) |
| `gate-tests-tab-state-isolation-parity` | 1 test — teach→study-skills→teach chip no-bleed assertion | `794a1fc` (code + story body) |
| `gate-tests-update-banner-version-edge-inputs` | 3 tests — edge inputs + prerelease schema rejection | `2c72664` (code), `794a1fc` (story body) |
| `gate-tests-logger-rotation-behavior` | 1 test — pino-roll size rotation confirmed via polling loop | `31ae176` (code), `794a1fc` (story body) |
| `gate-tests-affective-indexer-transaction-atomicity` | 1 test — `vi.spyOn` mid-batch failure, real SQLite ROLLBACK asserted via row count | `31ae176` (code), `794a1fc` (story body) |

Test count: 2377 → 2389 (+12 tests). All 5 stories at `stage: done`.
