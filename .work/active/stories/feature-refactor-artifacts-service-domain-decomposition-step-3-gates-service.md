---
id: feature-refactor-artifacts-service-domain-decomposition-step-3-gates-service
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-artifacts-service-domain-decomposition
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Extract GatesService

## What

Extract all gate-domain methods from `ArtifactsServiceImpl` into a new
`GatesServiceImpl` class in
`packages/core/src/services/gates-service.ts`.

## Methods to move

From `ArtifactsServiceImpl` (public):
- `gates(courseId)` — line 154
- `gateView(input)` — line 296 (pure read + evaluator; calls `this.gates()`
  internally — now calls `GatesServiceImpl.gates()`)
- `evaluateAndPersistGates(input)` — line 342 (calls `this.gates()` then
  writes in a transaction)
- `markGatesViewed(input)` — line 404
- `newlyUnlockedCount(input)` — line 422
- `createGate(input)` — line 613
- `updateGate(input)` — line 649
- `deleteGate(input)` — line 683
- `overrideGate(input)` — line 694 (atomic: gate state + audit event in one TX)
- `getGate(gateId)` — line 775
- `upsertGate(gate)` — line 824

Row-to-domain helpers that move:
- `rowToGate(row)` — line 1051

## Deps interface

```ts
export interface GatesServiceDeps {
  db: PraxisDb;
  log: Logger;
  masteryReader: MasteryReader;
  gradeReader: GradeReader;
}
```

`gateView` and `evaluateAndPersistGates` need `masteryReader` and
`gradeReader` for `GateEvaluatorImpl.evaluate(...)`. These are the same
injected deps that `ArtifactsServiceDeps` currently carries.

## Target file

`packages/core/src/services/gates-service.ts`

Export `GatesServiceImpl` from `packages/core/src/services/index.ts`.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass
- `ArtifactsService` interface unchanged
- `GatesServiceImpl` can be constructed independently with
  `{ db, log, masteryReader, gradeReader }`

## Risk

Low — pure extraction. All transactions (overrideGate, evaluateAndPersistGates)
are self-contained within `GatesServiceImpl`.
