---
id: feature-release-v0.1.0-test-findings
kind: feature
stage: review
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
