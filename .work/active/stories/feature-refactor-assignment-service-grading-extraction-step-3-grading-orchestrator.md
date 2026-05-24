---
id: feature-refactor-assignment-service-grading-extraction-step-3-grading-orchestrator
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-assignment-service-grading-extraction
depends_on:
  - feature-refactor-assignment-service-grading-extraction-step-1-extract-blending
  - feature-refactor-assignment-service-grading-extraction-step-2-extract-schema-helpers
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Implement `GradingOrchestrator` sub-service

## Priority / Risk
Priority: High (the core extraction)
Risk: Medium — the grading loop has branching logic (workRubric, requireReasoning,
approach-feedback, misconception) that must be preserved exactly; behavioural regression
in any branch silently degrades student feedback quality

## Files touched
- `packages/core/src/services/graders/grading-orchestrator.ts` — **new**
- `packages/core/src/services/graders/index.ts` — export `GradingOrchestrator` + `GradingOrchestratorDeps`

## Current state
The grading loop inside `AssignmentServiceImpl.submit()` (lines 558–654) does:
1. Builds a `GraderContext` (`log`, `graderServices`, `mode`)
2. Iterates `assignment.items`
3. For each item:
   a. Dispatches to `this.registry[item.kind].grade(...)` → `GraderResult`
   b. workRubric blending (math/code with non-empty `response.work`)
   c. requireReasoning blending (single-choice/multi-select/two-tier with `response.work`)
   d. Misconception evidence logging (TODO stub)
   e. Approach-feedback enrichment (guarded by `enableApproachFeedback`)
4. Accumulates `perItem: GradeItem[]`, `totalScore`, `scoredItemCount`, `highestTier`
5. Returns `{ grade: Grade }` to let `submit()` persist and notify

The `registry` is built via `buildGraderRegistry()` once at construction of `AssignmentServiceImpl`.

## Target state

### `GradingOrchestratorDeps`
```typescript
export interface GradingOrchestratorDeps {
  log: Logger;
  graderServices: GraderServices;
  enableApproachFeedback?: boolean;
}
```

### `GradingOrchestrator` interface + `GradingOrchestratorImpl` class
```typescript
export interface GradingOrchestrator {
  gradeAssignment(input: {
    assignment: Assignment;
    responses: AssignmentResponse[];
    mode: "quiz" | "homework" | "exam";
  }): Promise<Grade>;
}
```

`GradingOrchestratorImpl`:
- Builds `this.registry = buildGraderRegistry()` in constructor (moved from `AssignmentServiceImpl`)
- `gradeAssignment` contains the loop verbatim (moved from `submit()` lines 546–654,
  adjusted to accept `assignment` + `responses` rather than reading from DB)
- Internally calls `blendDeterministicAndWorkRubric` from `./blending.js` (Step 1)
- Internally calls `enrichWithApproachFeedback` from `./approach-feedback.js`
- Internally calls `runRubricAgent` from `./rubric-agent.js`

## Implementation notes

### The `Grade` return type is authoritative
`GradingOrchestrator.gradeAssignment` returns the fully-composed `Grade` object.
`submit()` then uses that value directly for the DB write and notification — no mutation
after the call returns.

### `responseByItemId` Map stays inside `gradeAssignment`
`submit()` currently builds the map (line 544) and passes it via closure. After
extraction the orchestrator builds it internally from the `responses` array parameter.

### `GraderContext` construction moves into `gradeAssignment`
```typescript
const ctx: GraderContext = { log: this.deps.log, services: this.deps.graderServices, mode };
```

### Misconception TODO stub stays as-is
The `ctx.log.info("grader.misconception_detected", ...)` call moves verbatim. The Phase
17.5 TODO comment travels with it.

### `enableApproachFeedback` defaults
`this.deps.enableApproachFeedback ?? true` — same default, same semantics.

### No async constructor needed
`buildGraderRegistry()` is synchronous; construct in the `constructor`.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass
- `GradingOrchestratorImpl.gradeAssignment` is separately importable from `graders/`
- `AssignmentServiceImpl` still works identically (not yet slimmed — Step 4 does that)
- The `assignment-service.notify.test.ts` suite continues to pass without modification

## Rollback
Delete `graders/grading-orchestrator.ts` and remove its export from `graders/index.ts`.
No state was moved out of `AssignmentServiceImpl` yet in this step.
