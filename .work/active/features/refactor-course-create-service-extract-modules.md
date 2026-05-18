---
id: refactor-course-create-service-extract-modules
kind: feature
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract DraftValidator and DraftPersistence from course-create-service.ts

## Brief

`packages/core/src/services/course-create-service.ts` is **1471 lines** and
mixes three distinct responsibilities:

1. **Draft lifecycle orchestration** — load/save/sweep via `SqliteDraftStore`,
   subscriber fanout, public service methods.
2. **Validation** — `validateProposed`, `validateBeforeConfirm`, repeated
   concept-name normalization (`trim().toLowerCase()`) at ~7 sites for Set
   membership checks.
3. **Persistence** — `confirmDraft` (72 LoC) wraps `persistDraftTx` (51 LoC)
   plus document-scope promotion plus event emission in a Drizzle
   transaction; `createCourseFromPack` is a parallel persistence path.

The service-level facade is fine; what bloats the file is the inline
implementation of validation and persistence. Extracting both into
collaborating modules collapses the facade to ~400 LoC and lets each
extracted module be tested in isolation.

This is **pure refactor** — every method signature, event shape, and DB
write order must be preserved.

## Surface area

- `packages/core/src/services/course-create-service.ts` (1471) →
  - `course-create/draft-validator.ts` — pure functions over the draft
    state: `validateProposed`, `validateBeforeConfirm`,
    `normalizeConceptName` helper (extract — used in 7 sites today)
  - `course-create/draft-persistence.ts` — DB-side: `persistDraftTx`,
    `createCourseFromPack` Drizzle transaction body
  - `course-create-service.ts` itself — facade that orchestrates: draft
    store, validator, persistence, subscriber fanout, event emission
- Related extracts that may roll into this feature or stand alone:
  - `refactor-extract-normalize-concept-name-helper` (already filed as a
    standalone story — if landed first, this feature consumes it)
  - `refactor-subscriber-registry-base` (if landed first, this service's
    subscribe/emit scaffolding adopts it)

## Why a feature (not a story)

- 3 distinct concerns to separate with named module boundaries
- Module shape (one file vs split persistence further) is a design call
- Need to confirm the Drizzle transaction can be passed cleanly across a
  module boundary — `persistDraftTx(tx, draft, …)` is already
  transaction-scoped, so this should be straightforward, but verify in
  design

## Discovery findings to design against

- `confirmDraft()` at lines 535-607: 72 LoC mixing validation,
  transaction open, persistence call, document-scope attach, event
  emission, error recovery
- `persistDraftTx()` at lines 554-605: 51 LoC of nested for-loops
  materializing units → lessons → assessments with conditional inserts
- 7 sites doing `.trim().toLowerCase()` for concept-name set membership
  (lines 222, 275, 310, 371, 443, 446, 957) — extract helper
- Subscribe/emit pattern at lines 119-150 — candidate for
  `refactor-subscriber-registry-base` adoption

## Out of scope

- Changing the draft lifecycle protocol (no event-shape changes).
- Changing the materialization order of units → lessons → assessments.
- Modifying the `course.start_drafting` / `course.draft_*` tool surface.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (especially `course-create-service.test.ts`,
      `course-create-service.queries.test.ts` — both must pass without
      modification beyond import-path updates)
- [ ] `wc -l packages/core/src/services/course-create-service.ts` < 600
- [ ] `DraftValidator` and `DraftPersistence` are exported as testable
      units; their tests pass independently (may already be covered by
      existing service tests through the facade)
- [ ] Drizzle transaction semantics preserved — `confirmDraft` rolls back
      cleanly if `persistDraftTx` throws

## Risk

**Medium** — touches the materialization path that turns a draft into a
real course. Strong test coverage exists (`course-create-service.test.ts`
at 797 lines, `.queries.test.ts` at 599 lines, `drafter.test.ts` at 1260
lines), which de-risks the move.

## Rollback

`git revert <commit>` per extraction; the facade-only state and the post-
extract state are both fully working, so rollback is safe at either
boundary.

## Design correction (2026-05-18, refactor-design pass)

Pre-inspection of `course-create-service.ts` (currently 1479 LoC) reveals
that `validateProposed` (line 921) and `persistDraftTx` (line 1257) are
**already top-level free functions** in the file, not class methods. The
original "extract DraftValidator + DraftPersistence" framing was right
about the shape but doesn't quite match the implementation — it's a
file-split refactor, not a class extraction.

Plus, `normalizeConceptName` (originally part of the planned validator
extract) already shipped as a helper in commit `1ced879` earlier in this
session.

Honest scope for what remains:
- Move `validateProposed` (and helper free functions like `Issue` type
  +supporting validation logic) into `course-create/draft-validator.ts`
- Move `persistDraftTx` (and its `PersistDraftTxArgs` type) into
  `course-create/draft-persistence.ts`
- Update `confirmDraft()` in the class to import from the new files
- Move `createCourseFromPack` IF it cleanly separates — it's the other
  big persistence path (~100 LoC). If it imports a different set of
  schemas, move alongside persistDraftTx. Judgment call during
  implementation.

Result: course-create-service.ts shrinks from 1479 to ~900-1100 LoC
(depending on whether createCourseFromPack moves). Modest LoC win;
the responsibility separation is the real value.

## Refactor Overview

Single child story. Move 2-3 top-level free functions out of
`course-create-service.ts` into focused per-domain files. The class
stays in course-create-service.ts and imports from the new files.

## Refactor Steps

### Step 1: Move validator + persistence free functions
**Priority**: Medium (modest LoC win, clearer separation of validation vs persistence vs class lifecycle)
**Risk**: Low (free-function moves; tests catch any drift)
**Files**:
- NEW: `packages/core/src/services/course-create/draft-validator.ts`
- NEW: `packages/core/src/services/course-create/draft-persistence.ts`
- `packages/core/src/services/course-create-service.ts` (extract from)
**Story**: `refactor-course-create-service-extract-modules-step-1-extract`

**Extract → `draft-validator.ts`**:
- `validateProposed(p: ProposedCourse): Issue[]` (line 921)
- `Issue` type (verify where it lives — may be in this file or imported)
- Any supporting validation helper functions used only by `validateProposed`

**Extract → `draft-persistence.ts`**:
- `persistDraftTx(args: PersistDraftTxArgs): { courseId, lessonIds, conceptGraphId }` (line 1257)
- `PersistDraftTxArgs` type
- Any helper functions used only by `persistDraftTx`
- Optionally `createCourseFromPack` (class method at line 629) — if it's structurally aligned with persistence; judgment call during implementation

**Stays in `course-create-service.ts`**:
- The `CourseCreateServiceImpl` class with all its lifecycle methods
- Subscribe/emit listener machinery
- `confirmDraft()` (now imports `validateProposed` from validator and `persistDraftTx` from persistence)
- All add/remove/edit methods (initDraft, addConcept, removeConcept, addEdge, addLesson, removeLesson, addUnit, etc.)
- `normalizeConceptName` helper (file-private, stays — already extracted in commit `1ced879`)

**Implementation notes**:
- This is a per-function move (mirror the types-split shape from earlier in the session). Each function moves with its supporting types and any free helper functions it uses.
- Update the class methods that currently call `validateProposed(...)` or `persistDraftTx(...)` directly — they need `import { validateProposed } from "./course-create/draft-validator.js";` etc.
- Verify the target directory `course-create/` doesn't already exist with a different purpose. If it does, use a different name (e.g., `course-create-internals/`).
- If `createCourseFromPack` stays in the class, leave it as-is. If it moves, it becomes a free function that the class calls.
- Read the file's full free-function block (lines ~870-1479) to inventory ALL top-level functions before moving. There may be helpers between the class and `persistDraftTx` that also belong with one or the other.

**Acceptance criteria**:
- [ ] Typecheck/lint/test green from repo root (baseline preserved)
- [ ] `wc -l packages/core/src/services/course-create-service.ts` < 1100
- [ ] `packages/core/src/services/course-create/draft-validator.ts` exists, exports `validateProposed`
- [ ] `packages/core/src/services/course-create/draft-persistence.ts` exists, exports `persistDraftTx`
- [ ] All `course-create-service.test.ts` and `course-create-service.queries.test.ts` pass unmodified
- [ ] All `drafter.test.ts` (1260 LoC of test coverage) passes unmodified
- [ ] Drizzle transaction semantics preserved — `confirmDraft` still rolls back cleanly if persistence throws

**Risk**: Low — free-function moves, caught by tsc.
**Rollback**: `git revert <commit>` — clean.

---

## Implementation Order

1. Single step.

## Atomic-step acknowledgments

None. Public `CourseCreateService` interface unchanged.

## Out-of-scope follow-ups

- Class-level extraction (the lifecycle methods stay tightly cohesive)
- Renaming any export
