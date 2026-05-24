---
id: feature-refactor-assignment-service-grading-extraction
kind: feature
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Extract grading orchestration from `AssignmentService`

## Brief
`packages/core/src/services/assignment-service.ts` (725 lines) bundles three
distinct concerns:
- (a) Assignment CRUD (create, list, fetch, submit)
- (b) Per-item response tracking + debounced auto-save
- (c) Multi-path grading (item-type-specific graders, approach feedback, rubric agent)

The Zod schemas + `validateItems` (~lines 40–380) are tightly coupled to the
grading path, not the CRUD path. A `graders/` subdirectory already exists for
the per-grader implementations, but the orchestration logic stays inline in
`AssignmentService`.

## Refactor target
Extract grading orchestration into a `GradingOrchestrator` sub-service that
handles:
- Registry dispatch (item-type → grader)
- Approach-feedback enrichment
- Rubric-agent sequencing

`AssignmentService` becomes a facade with CRUD + response tracking, delegating
grading to the orchestrator. Same pattern as the just-shipped `ArtifactsService`
facade decomposition.

## Constraints
- Public `AssignmentService` interface unchanged (consumers + IPC channels)
- `submit()` atomicity preserved
- Per-item-type graders in `graders/` directory stay where they are; the
  extraction only lifts the dispatch + enrichment + sequencing logic

## Discovery evidence
- File length: 725 lines (verified)
- Multi-responsibility: CRUD + tracking + grading
- `validateItems` and Zod schemas tightly coupled to grading path
- Discovered by autopilot refactor cadence after the artifacts-service split landed

## Design

### Analysis

`assignment-service.ts` (725 lines) bundles three distinct concerns that can be
separated cleanly:

| Concern | Lines (approx) | Target home |
|---|---|---|
| Zod schemas + `validateItems` | 40–254 | `graders/item-schemas.ts` |
| DB row helpers + submission note | 256–308 | `graders/submission-helpers.ts` |
| `blendDeterministicAndWorkRubric` | 310–344 | `graders/blending.ts` |
| Service deps interface | 348–379 | stays in `assignment-service.ts` |
| CRUD (`create`, `get`, `list`) | 383–463 | stays in `assignment-service.ts` |
| Response tracking (`recordResponse`, `getResponses`) | 465–520 | stays in `assignment-service.ts` |
| Grading loop (`submit()` core) | 522–701 | `graders/grading-orchestrator.ts` |
| `readGrade` (GradeReader port) | 703–724 | stays in `assignment-service.ts` |

The `graders/` subdirectory already exists for per-item-type graders. The orchestration
logic (registry dispatch, workRubric/reasoning blending, approach-feedback, misconception
detection, tier tracking) belongs there alongside them.

### Sub-service interface

```typescript
// graders/grading-orchestrator.ts
export interface GradingOrchestrator {
  gradeAssignment(input: {
    assignment: Assignment;
    responses: AssignmentResponse[];
    mode: "quiz" | "homework" | "exam";
  }): Promise<Grade>;
}

export interface GradingOrchestratorDeps {
  log: Logger;
  graderServices: GraderServices;
  enableApproachFeedback?: boolean;  // default true
}
```

`GradingOrchestratorImpl` owns the registry (`buildGraderRegistry()`), the item loop,
all three enrichment branches, and tier tracking. It returns a fully-composed `Grade`.
`AssignmentServiceImpl.submit()` retains DB persistence and the `notifyParentSession`
fire-and-forget — those are side effects that belong at the facade layer, not in
the pure grading orchestration.

### Extraction sequence

Steps are ordered smallest→largest risk, each leaving `pnpm typecheck && pnpm lint &&
pnpm test` green. Steps 1 and 2 are independent and can run in parallel.

**Step 1** (low risk): Extract `blendDeterministicAndWorkRubric` pure function
→ `graders/blending.ts`. No logic change. Unblocks Step 3.

**Step 2** (medium risk): Extract Zod schemas + `validateItems` → `graders/item-schemas.ts`;
extract `rowToAssignment` + `composeSubmissionNote` → `graders/submission-helpers.ts`.
Keep re-exports on `assignment-service.ts` for downstream callers. Unblocks Step 3.

**Step 3** (medium risk, depends on 1+2): Implement `GradingOrchestratorImpl` in
`graders/grading-orchestrator.ts` by moving the grading loop from `submit()` verbatim.
Both `AssignmentServiceImpl` (with old loop) and `GradingOrchestratorImpl` coexist
temporarily until Step 4.

**Step 4** (medium risk, depends on 3): Slim `AssignmentServiceImpl.submit()` to
delegate to `this.deps.orchestrator.gradeAssignment(...)`. Remove `registry` field.
Update `AssignmentServiceDeps`. Update construction sites and test helpers.

### Invariants preserved
- Public `AssignmentService` interface (`create`, `get`, `list`, `recordResponse`,
  `getResponses`, `submit`, `readGrade`) is unchanged — no IPC channel changes
- `submit()` atomicity: DB write stays in the facade, not in the orchestrator
- `notifyParentSession` fire-and-forget stays in `submit()`, not the orchestrator
- Per-item-type graders in `graders/` stay where they are
- `AssignmentItemSchema` and `validateItems` remain exported from `services/index.ts`
  via re-export chain

## Child stories

| # | Story id | Depends on | Risk |
|---|---|---|---|
| 1 | `...-step-1-extract-blending` | (none) | Low |
| 2 | `...-step-2-extract-schema-helpers` | Step 1 | Medium |
| 3 | `...-step-3-grading-orchestrator` | Steps 1, 2 | Medium |
| 4 | `...-step-4-wire-facade` | Step 3 | Medium |

Implementation wave order: Steps 1+2 in parallel → Step 3 → Step 4.
