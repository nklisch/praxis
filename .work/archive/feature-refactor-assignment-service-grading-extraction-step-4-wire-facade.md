---
id: feature-refactor-assignment-service-grading-extraction-step-4-wire-facade
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-assignment-service-grading-extraction
depends_on:
  - feature-refactor-assignment-service-grading-extraction-step-3-grading-orchestrator
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Slim `AssignmentServiceImpl` to facade + wire `GradingOrchestrator`

## Priority / Risk
Priority: High (completes the extraction)
Risk: Medium — `submit()` atomicity must be preserved; fire-and-forget
`notifyParentSession` behaviour must be unchanged

## Files touched
- `packages/core/src/services/assignment-service.ts` — remove grading loop; delegate to `GradingOrchestratorImpl`; update `AssignmentServiceDeps`
- `packages/core/src/services/graders/index.ts` — confirm `GradingOrchestrator` + `GradingOrchestratorDeps` exported (done in Step 3)
- `packages/core/src/services/index.ts` — export `GradingOrchestratorDeps` (public surface addition)

## Current state (after Steps 1–3)
`AssignmentServiceImpl` still contains the full grading loop inline in `submit()`.
`GradingOrchestratorImpl` exists in `graders/grading-orchestrator.ts` but is not wired.

## Target state

### `AssignmentServiceDeps` change
Add one field:
```typescript
/** GradingOrchestrator — handles registry dispatch, rubric blending, approach-feedback. */
orchestrator: GradingOrchestrator;
```
Remove `graderServices`, `enableApproachFeedback` from `AssignmentServiceDeps` — these
become internal to `GradingOrchestratorDeps`. Update construction sites in
`packages/desktop/electron/main/services.ts` (or wherever `AssignmentServiceImpl` is
constructed) to pass both deps correctly.

> **Exception**: if removing `graderServices` and `enableApproachFeedback` from
> `AssignmentServiceDeps` causes more than 2 downstream construction sites to change,
> keep them on `AssignmentServiceDeps` and thread them into `GradingOrchestratorImpl`
> inside `AssignmentServiceImpl`'s constructor — prefer minimal surface churn. Annotate
> with a TODO to clean up in a follow-on.

### `AssignmentServiceImpl.submit()` after delegation
```typescript
async submit(input: { ... }): Promise<AssignmentSubmissionResult> {
  // 1. Load row (for parentSessionId) + domain Assignment
  // 2. Guard: already submitted?
  // 3. Load responses
  // 4. Resolve mode
  // 5. Delegate: const grade = await this.deps.orchestrator.gradeAssignment({ assignment, responses, mode });
  // 6. Persist: db.update(assignments).set({ submittedAt, gradeJson: grade })
  // 7. notifyParentSession (fire-and-forget, unchanged)
  // 8. Return AssignmentSubmissionResult
}
```
The `registry` field is removed from `AssignmentServiceImpl` (it moves to `GradingOrchestratorImpl`).

### `assignment-service.ts` final line count
Target ≈ 200–250 lines (down from 725): CRUD (create, get, list) + response
tracking (recordResponse, getResponses) + slim submit() + readGrade + helper imports.

## Implementation notes

### Construction site: `services.ts` in desktop
Look for where `AssignmentServiceImpl` is constructed. Wrap with:
```typescript
const gradingOrchestrator = new GradingOrchestratorImpl({
  log,
  graderServices,
  enableApproachFeedback: true,
});
const assignmentService = new AssignmentServiceImpl({
  db,
  log,
  orchestrator: gradingOrchestrator,
  resolveSubmissionMode,
  notifyParentSession,
});
```

### Test construction site: `assignment-service.notify.test.ts`
The test constructs `AssignmentServiceImpl` directly. After this step the test must
pass an `orchestrator` field (or a fake). Two options:
1. Construct a real `GradingOrchestratorImpl` in the test helper (deterministic graders need no LLM)
2. Pass a fake orchestrator that returns a fixed `Grade`

Option 1 is cleaner and keeps tests honest. The test already uses `enableApproachFeedback: false`
(no LLM calls); this flag moves into `GradingOrchestratorDeps`. The test's `makeGraderServices()`
stub stays valid for constructing `GradingOrchestratorImpl`.

### `submit()` atomicity preserved
The DB write (`update(assignments).set({ submittedAt, gradeJson })`) remains in
`submit()`, not in the orchestrator. The orchestrator only computes the grade value;
the facade owns persistence.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass
- `assignment-service.notify.test.ts` passes without any test logic changes (helper
  construction may change to wire `GradingOrchestratorImpl`)
- `AssignmentServiceImpl` has no `registry` field and no grading loop
- `submit()` calls `this.deps.orchestrator.gradeAssignment(...)` exactly once
- Public `AssignmentService` interface (method signatures) is unchanged

## Rollback
Revert `assignment-service.ts` to pre-step state. `GradingOrchestratorImpl` remains
harmlessly unused until Step 3 is also reverted.

## Implementation notes

### Before / after metrics
- `assignment-service.ts`: 725 lines → 338 lines (−387 lines, −53%)
- No construction sites changed (`build-artifacts-services.ts` and test unchanged)
- `AssignmentServiceDeps` retains `graderServices` + `enableApproachFeedback` for
  backward compat (escape hatch applied per story: 2 downstream sites)
- New optional `orchestrator?: GradingOrchestrator` field added to deps;
  constructor constructs `GradingOrchestratorImpl` internally when omitted
- `submit()` reduced to ~35 lines (load → guard → responses → mode → delegate → persist → notify → return)
- `AssignmentItemSchema` and `validateItems` re-exported from graders/item-schemas.js
- `GradingOrchestrator`, `GradingOrchestratorDeps`, `GradingOrchestratorImpl` added to `services/index.ts` public surface
- `pnpm typecheck && pnpm test` green: 4773 tests passed (full workspace)
- No test changes required

## Review

Verdict: **done**

Critical invariants verified:

**Public interface unchanged**: `AssignmentService` interface in `packages/core/src/types/artifacts.ts` was not touched. `create`, `get`, `list`, `recordResponse`, `getResponses`, `submit`, `readGrade` signatures are identical. No IPC channel changes.

**submit() atomicity preserved**: DB write (`update(assignments).set({ submittedAt, gradeJson: grade })`) remains in `submit()` at step 6, after `orchestrator.gradeAssignment()` returns. The orchestrator only computes the grade value; it does not write to the DB.

**notifyParentSession stays in facade**: The fire-and-forget `notifyParentSession` call at step 7 is in `submit()`, not in the orchestrator. The comment "Fire-and-forget — don't block submit()" is retained inline.

**No registry field in AssignmentServiceImpl**: Confirmed — the class now has `private readonly orchestrator: GradingOrchestrator` only; `registry` was removed.

**submit() calls gradeAssignment exactly once**: Confirmed at line 271: `const grade: Grade = await this.orchestrator.gradeAssignment({ assignment, responses, mode })`.

**Backward-compat escape hatch applied correctly**: `orchestrator?: GradingOrchestrator` is optional; constructor constructs `GradingOrchestratorImpl` internally when omitted — no downstream construction sites needed to change. TODO annotated for follow-on cleanup.

**Re-exports**: `AssignmentItemSchema` and `validateItems` re-exported from `assignment-service.ts`; `GradingOrchestrator`, `GradingOrchestratorDeps`, `GradingOrchestratorImpl` added to `services/index.ts` public surface.

**Line count**: 725 → 338 (−387 lines, −53%).

**Tests**: 4773 tests passed (full workspace). `assignment-service.notify.test.ts` passes without modification.
