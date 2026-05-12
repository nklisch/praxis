---
id: gate-cruft-misplaced-biome-ignore-suppressions
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Misplaced `biome-ignore noExplicitAny` suppressions — Biome reports `suppressions/unused` and the underlying `any` warnings stay unmuted

## Confidence
High

## Category
stale comment

## Location
- `scripts/db-gates.ts:34`
- `tests/engine-conformance.test.ts:159, 187`
- `tests/configure-end-to-end.test.ts:220`
- `tests/full-turn-with-fake-engine.test.ts:114`
- `tests/gates-end-to-end.test.ts:206`
- `tests/mastery-end-to-end.test.ts:261`
- `tests/foundation.test.ts:41, 45`

## Evidence
Biome reports `suppressions/unused` for all of these. Example from `scripts/db-gates.ts`:
```ts
// line 34: biome-ignore lint/suspicious/noExplicitAny: graderServices stub for CLI
const assignmentService = new AssignmentServiceImpl({
  db, log,
  graderServices: { sympy: null as any, sandbox: null as any, engineResolver: null as any }, // line 38 — the actual `any` lives here
});
```
The Biome suppression must be on the line immediately preceding the diagnostic. Currently each suppression is too far away, so it triggers `suppressions/unused` AND leaves the underlying `noExplicitAny` warnings unmuted.

## Removal
Move each suppression to the line immediately before the offending `any`, or change to an inline `// biome-ignore` at the end of the line, depending on context. Suppressions at the test-helper-call layer need to follow the line that actually casts. Treat as one logical fix across all 8 sites.

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.
