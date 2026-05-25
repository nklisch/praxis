---
id: feature-refactor-course-create-service-decomposition-step-3-extract-incremental-mutators
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Extract incremental mutator logic to `course-create/draft-mutators.ts`

## Priority / Risk
Priority: Medium — the mutators are repetitive boilerplate; extracting them reduces noise
in the service class, but they are low-risk pure-ish functions already.
Risk: Low-Medium — each mutator loads a draft, validates, mutates, saves. The logic is
simple but there are many call-sites to move carefully.

## Files affected
- **New**: `packages/core/src/services/course-create/draft-mutators.ts`
- **Modified**: `packages/core/src/services/course-create-service.ts`

## Current state
Nine incremental mutator methods live in `CourseCreateServiceImpl` (lines 200–479):
- `addConcept` (203–222) — duplicate-check via `normalizeConceptName`, push, save
- `removeConcept` (225–251) — filter concepts + edges + lesson refs, save
- `addEdge` (253–286) — validate both endpoints exist, no self-edge, no dupe, push, save
- `addLesson` (288–317) — validate concept refs, push, save
- `removeLesson` (319–333) — bounds check, splice, save
- `addUnit` (337–396) — validate lesson ids + summative concept refs, push, save
- `setAssessmentPlan` (398–409) — set scalar field, save
- `addLessonAssessment` (411–458) — validate lesson id + concept refs, push, save
- `setMetadata` (460–479) — patch title/subject/gradeLevel/thresholds, save

Each follows the pattern: `store.load → null-check → mutate → lastTouchedAt = now → saveAndEmitUpdate`.

## Target state
Extract pure mutation functions (load-mutate-return) into
`packages/core/src/services/course-create/draft-mutators.ts`.

Each exported function accepts `(draft: DraftCourseState, input: ...) → { ok, ... } | DraftCourseState`
and returns the new state or an error shape. The service method becomes:
```ts
async addConcept(input: ...) {
  const d = this.store.load(brandId<"DraftId">(input.draftId) as DraftId);
  if (!d) return { ok: false, reason: "draft not found or expired" };
  const result = addConceptMutation(d, input);
  if (!result.ok) return result;
  result.draft.lastTouchedAt = Date.now() as Timestamp;
  this.saveAndEmitUpdate(result.draft);
  return { ok: true, conceptCount: result.draft.proposed.proposedConcepts.length };
}
```

The service retains: load, null-check, timestamp bump, `saveAndEmitUpdate`, return shaping.
The module provides: the pure validation + mutation logic.

## Implementation notes
- All mutation functions in `draft-mutators.ts` import `normalizeConceptName` from
  `./helpers.js` (same directory).
- No DB access in the new module — pure functions on `DraftCourseState`.
- The `uuidv7` call inside `addUnit` (summative `draftAssessmentId`) and
  `addLessonAssessment` (`draftAssessmentId`) must remain available —
  either import `uuidv7` in the new module or pass ids in from the service.
  Preferred: import `uuidv7` in the module (it's a utility, not an injectable dep).
- `addLesson` also calls `uuidv7()` for `draftLessonId`. Same treatment.
- No change to the `DraftCourseState` type or the service's public API.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- `course-create-service.ts` drops by ~280 lines (the 9 mutator bodies).
- Public method signatures on `CourseCreateService` unchanged.
- All existing tests pass without modification.

## Risk + Rollback
Risk: Low-Medium — moving logic across file boundaries; tests provide coverage.
Rollback: inline the functions back; tests catch regressions immediately.

## Implementation notes

- Created `packages/core/src/services/course-create/draft-mutators.ts` (379 lines).
- Nine pure mutation functions exported: `addConceptMutation`, `removeConceptMutation`,
  `addEdgeMutation`, `addLessonMutation`, `removeLessonMutation`, `addUnitMutation`,
  `setAssessmentPlanMutation`, `addLessonAssessmentMutation`, `setMetadataMutation`.
- Each function signature: `(draft: DraftCourseState, input: XxxInput) → XxxResult`
  where `XxxResult` is either `{ ok: true; draft: DraftCourseState; ...extras }` or
  `{ ok: false; reason: string }`.
- All input/result types are exported as named interfaces for strong typing in Step 7.
- `uuidv7` imported directly in the module for `addLesson` (draftLessonId),
  `addUnit` (draftUnitId + summative draftAssessmentId), and `addLessonAssessment`
  (draftAssessmentId) — no injectable dep needed.
- `normalizeConceptName` re-exported from `./helpers.js` for convenience.
- `course-create-service.ts` was NOT modified per the task instructions — Step 7 handles wiring.
- `pnpm typecheck` and `pnpm --filter @praxis/core test` both pass (96 files, 1164 tests).

## Review

Verdict: **done**.

`draft-mutators.ts` (379 lines) exports all 9 mutation functions with the designed `(draft: DraftCourseState, input: XxxInput) → XxxResult` signature. Each result type is a proper discriminated union on `ok`. All input/result types are exported for strong typing at Step 7. `uuidv7` is imported directly for ID generation in `addLesson`, `addUnit`, and `addLessonAssessment`. `normalizeConceptName` is imported from `./helpers.js` and additionally re-exported for caller convenience. No DB access, no async, no side effects beyond mutating the passed-in draft (consistent with the design's intent — callers own the lifecycle). The `normalizeConceptName` re-export is a minor deviation from the design (not required) but is benign. `pnpm typecheck` and 1164 core tests pass.
