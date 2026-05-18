---
id: refactor-course-create-service-extract-modules-step-1-extract
kind: story
stage: review
tags: [refactor]
parent: refactor-course-create-service-extract-modules
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: Move free functions out of course-create-service.ts

## Brief

Move 2 top-level free functions from `course-create-service.ts` (1479 LoC)
into focused per-domain files:

- `validateProposed` → `course-create/draft-validator.ts`
- `persistDraftTx` → `course-create/draft-persistence.ts`

The `CourseCreateServiceImpl` class stays in `course-create-service.ts`
and imports from the new files. Optionally also move `createCourseFromPack`
into the persistence file if it cleanly separates.

See parent feature body's "Step 1" section for the full design.

## Files

- NEW: `packages/core/src/services/course-create/draft-validator.ts`
- NEW: `packages/core/src/services/course-create/draft-persistence.ts`
- `packages/core/src/services/course-create-service.ts` (extract from)

## Free functions to move

### To `draft-validator.ts`

- `validateProposed(p: ProposedCourse): Issue[]` (line 921 of current file)
- `Issue` type (verify location — may be defined in this file or imported from elsewhere; if file-local, move with `validateProposed`)
- Any supporting validation helper functions used only by `validateProposed`

### To `draft-persistence.ts`

- `persistDraftTx(args: PersistDraftTxArgs): { courseId, lessonIds, conceptGraphId }` (line 1257)
- `PersistDraftTxArgs` interface (line ~1244 — defined just above the function)
- Any helper functions used only by `persistDraftTx`

### Optionally to `draft-persistence.ts` — judgment call

- `createCourseFromPack` (currently a class method at line 629, ~100 LoC). If it has structural alignment with `persistDraftTx` (similar Drizzle insert patterns, similar transaction shape), move alongside. If it's better left as a class method (because it uses `this.deps.*` heavily and would require dependency injection to extract), leave it. Document the choice in implementation notes.

## What stays in `course-create-service.ts`

- The `CourseCreateServiceImpl` class with ALL its lifecycle methods (initDraft, addConcept, removeConcept, addEdge, addLesson, removeLesson, addUnit, setAssessmentPlan, addLessonAssessment, setMetadata, summarize, showDraft, editDraft, confirmDraft, discardDraft, listUnits, listLessonsInUnit, getLessonDetail, listDanglingRefs)
- Subscribe/emit listener machinery
- `normalizeConceptName` helper (file-private, already extracted earlier in this session)
- `private saveAndEmitUpdate` helper
- Any other private class methods or file-private helpers that are tightly coupled to the class

## Approach

1. **Inventory all top-level functions** in `course-create-service.ts` (everything outside the class definition). Grep:
   ```bash
   grep -n '^function\|^export function' /home/nathan/dev/praxis/packages/core/src/services/course-create-service.ts
   ```
   This catches the free functions. Pair each with what calls it.

2. **Extract validator**:
   - Create `packages/core/src/services/course-create/draft-validator.ts`
   - Move `validateProposed` + `Issue` + any helpers ONLY used by validator
   - Imports: bring in `ProposedCourse` and any other types the validator needs (likely from `@praxis/core/types` or local types file)
   - Export: `validateProposed`, `Issue`

3. **Extract persistence**:
   - Create `packages/core/src/services/course-create/draft-persistence.ts`
   - Move `persistDraftTx` + `PersistDraftTxArgs` + any helpers ONLY used by persistence
   - Imports: Drizzle schemas (`conceptGraphs`, `concepts`, etc.), types, `uuidv7`, etc.
   - Export: `persistDraftTx`, `PersistDraftTxArgs`

4. **Update `course-create-service.ts`**:
   - Remove the moved functions
   - Add imports: `import { validateProposed, type Issue } from "./course-create/draft-validator.js";` and `import { persistDraftTx, type PersistDraftTxArgs } from "./course-create/draft-persistence.js";`
   - The class's `confirmDraft()` continues to call `validateProposed(...)` and `persistDraftTx(...)` exactly as before

5. **Decide on `createCourseFromPack`**:
   - Read the class method body (line 629, ~100 LoC)
   - If it can become a pure function that takes a `tx` and a few args (like `persistDraftTx`), move into persistence
   - If it requires `this.deps.*` access throughout, keep as a class method
   - Document the choice

## Critical: preserve Drizzle transaction semantics

`persistDraftTx` is called inside a Drizzle transaction in `confirmDraft()`. The function takes the open `tx` as a parameter — its move to a new file doesn't change that. The transaction continues to roll back on throw exactly as before. Verify by tracing the call site.

## Tests to verify

- `pnpm --filter @praxis/core typecheck`
- `pnpm --filter @praxis/core test` — especially:
  - `packages/core/src/__tests__/course-create-service.test.ts` (797 LoC)
  - `packages/core/src/__tests__/course-create-service.queries.test.ts` (599 LoC)
  - `packages/core/src/services/__tests__/course-create-service.draft-stream.test.ts`
  - `packages/core/src/services/__tests__/course-create-service.persist-units.test.ts`
  - `packages/core/src/services/__tests__/course-create-service.units.test.ts`
  - `packages/curriculum/src/course-create/__tests__/drafter.test.ts` (1260 LoC)
- `pnpm biome check packages/core/src/services/`

Pre-existing baseline: 3 UI typecheck errors, ~524 `.mockups/**` lint debt, one flaky test. Not your concern.

## Acceptance criteria

- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] `wc -l packages/core/src/services/course-create-service.ts` < 1200 (currently 1479)
- [ ] `packages/core/src/services/course-create/draft-validator.ts` exists, exports `validateProposed` and `Issue` (if local)
- [ ] `packages/core/src/services/course-create/draft-persistence.ts` exists, exports `persistDraftTx` and `PersistDraftTxArgs`
- [ ] All course-create-service tests pass unmodified (no test-file edits needed)
- [ ] `confirmDraft()` still rolls back cleanly on throw (Drizzle transaction preserved)
- [ ] No public `CourseCreateService` API change

## Risk

**Low** — free-function moves, caught by tsc. Strong test coverage (3500+ LoC of test code across the affected service).

## Rollback

`git revert <commit>` — clean single commit.

## Design-flaw escape hatch

If `validateProposed` or `persistDraftTx` turn out to have hidden coupling to file-private helpers that aren't obvious from a quick read, move those helpers along OR keep the function in place. If the move would require splitting a tightly-coupled helper cluster, document and adapt.

If `createCourseFromPack` looks like it should move but its `this.deps.*` usage is so pervasive that extracting requires significant restructure, keep it as a class method — that's a future refactor.

## Implementation notes

### Functions moved

**`validateProposed`** (75 LoC in source → `draft-validator.ts`, 85 LoC including imports and the `normalizeConceptName` helper):
- Moved with `Issue` interface and a local copy of `normalizeConceptName` (the validator needs it for unit/assessment concept name checks).
- `course-create-service.ts` re-exports `Issue` via `export type { Issue }` to preserve the existing public API.
- `applyEdit`'s `validate-draft` case still calls `validateProposed` — now imported from the new file.

**`persistDraftTx` + `PersistDraftTxArgs`** (~240 LoC in source → `draft-persistence.ts`, 252 LoC including imports):
- Moved with all Drizzle schema imports it required (`assignments`, `courses`, `courseUnits`, `gates`, `lessonAssessments`, `lessons`, `lessonUnits`, `conceptGraphs`, `concepts`, `prerequisiteEdges`).
- The inner `materializeShell` helper moved with the function (nested helper, only used by `persistDraftTx`).
- Transaction semantics unchanged: `persistDraftTx` still accepts `tx: PraxisDb` and is called inside `this.deps.db.transaction()` in `confirmDraft`.

### `createCourseFromPack` decision: stayed as class method

`createCourseFromPack` (line 629, ~104 LoC) was evaluated for extraction. It was kept as a class method because:
1. It reads from `this.deps.db` before opening the transaction (the pre-transaction `SELECT` for conceptRows uses `this.deps.db`).
2. The transaction block itself directly uses the `this.deps.db.transaction()` API.
3. Extracting it would require passing both a `db` instance and a `conceptGraphId` resolve path — equivalent restructuring to the persistence function, but with more ambient state from `this.deps`. The cost-benefit ratio is unfavorable for a refactor story scoped to free-function extraction.

This matches the story's explicit guidance: "if it requires `this.deps.*` access throughout, keep as a class method — that's a future refactor."

### File LoC deltas

| File | Before | After |
|---|---|---|
| `course-create-service.ts` | 1479 | 1157 (−322) |
| `course-create/draft-validator.ts` | — | 85 (new) |
| `course-create/draft-persistence.ts` | — | 252 (new) |

### Baseline confirmation

- `pnpm --filter @praxis/core typecheck` — clean (0 errors)
- `pnpm --filter @praxis/core test` — 1060 tests pass (86 test files)
- `pnpm biome check packages/core/src/services/course-create-service.ts` — clean
- `pnpm biome check packages/core/src/services/course-create/` — clean
