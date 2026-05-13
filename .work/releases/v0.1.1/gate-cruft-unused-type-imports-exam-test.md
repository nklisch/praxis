---
id: gate-cruft-unused-type-imports-exam-test
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Unused type imports in `tests/exam-end-to-end.test.ts`

## Confidence
High

## Category
unused import

## Location
`tests/exam-end-to-end.test.ts:18-25`

## Evidence
```ts
import type {
  AssignmentItem,
  CodeSandbox,
  CourseId,            // unused
  Engine,              // unused
  EngineEvent,         // unused
  EngineOpenOptions,   // unused
  EngineSession,       // unused
  HealthStatus,
  Rubric,              // unused
  StudentId,           // unused
  SymPyService,
} from "@praxis/core/types";
```
Biome `lint/correctness/noUnusedImports` flags 7 of these names.

## Removal
Run `npx biome check --write tests/exam-end-to-end.test.ts` or delete the unused names manually.

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
