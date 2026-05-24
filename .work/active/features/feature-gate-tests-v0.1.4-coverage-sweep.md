---
id: feature-gate-tests-v0.1.4-coverage-sweep
kind: feature
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-24
updated: 2026-05-24
---

# Gate-tests v0.1.4: outstanding test-coverage gaps

## Brief
Six test-coverage gaps surfaced by the gate-tests pass on release v0.1.4 (gate_origin: tests). Each is an already-designed story with a "Suggested test" block in its body — no design phase needed. The feature is a tracking bucket so `/agile-workflow:autopilot` or `/agile-workflow:implement-orchestrator` can drain them together.

## Children
1. **`gate-tests-library-picker-drag-overlay-child-leave-guard`** — drop-overlay child-leave guard has no exercising test.
2. **`gate-tests-recordcitation-error-message-text`** — `recordCitation` inverted-range error message text not pinned by a test.
3. **`gate-tests-session-list-empty-excludemodeids-envelope`** — `praxis.session.list` envelope doesn't cover empty `excludeModeIds: []`.
4. **`gate-tests-useingestion-duplicate-paths-spec`** — `useIngestion.startBatchWithPaths` spec is silent on duplicates / invalid characters.
5. **`gate-tests-vitest-filter-desktop-ci-smoke`** — `pnpm --filter @praxis/desktop test` exit-0 not guarded by a CI step.
6. **`gate-tests-workspace-edge-padding-token-presence`** — workspace edge-padding token has no regression guard.

All marked low-priority by the originating gate-tests run. Children are independent.

## Entry point
`/agile-workflow:implement-orchestrator` (with `--all` over this feature) — each child is a small test-addition with a suggested implementation already in its body. Or work individually inline via `/agile-workflow:implement` for the smaller ones.

## Source
Children pre-existed in `.work/backlog/` as `gate-tests-*` from the v0.1.4 quality-gate pass (2026-05-23). Promoted into active and re-parented here as part of the 2026-05-24 backlog scope sweep.
