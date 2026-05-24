---
id: feature-refactor-course-create-service-decomposition
kind: feature
stage: review
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-24
---

# Decompose `CourseCreateServiceImpl` into focused modules

## Brief
`packages/core/src/services/course-create-service.ts` is 1155 lines owning the entire
drafting lifecycle in one class:
- Draft creation + caching
- Mutation dispatch (add/remove unit, lesson, concept, edge, assessment plan)
- Validation
- Serialization
- `persistDraft` (the multi-domain transaction that materialises units + lessons +
  assessment shells)
- Stale-draft sweep
- `confirmDraft` (lines 524–598) — multi-concern transaction handler

This is one of the most concept-dense services in the codebase and is touched by
basically every drafter-related change.

## Refactor target
Extract focused modules called by a thinner `CourseCreateServiceImpl`:
- `DraftStore` — in-memory draft cache + persistence boundary
- `DraftValidator` — confirmation-time validation rules (resolves references, minimum
  bar checks)
- `DraftPersister` — owns the `persistDraft` transaction (currently inlined as
  `persistDraftTx` in `./course-create/draft-persistence.js` but called from the
  service via private import; should become a first-class collaborator)
- Mutation handlers — group the `add*` / `remove*` / `set*` methods by target
  (units, lessons, concepts, edges, assessments)

`CourseCreateServiceImpl` becomes the orchestrator that wires these together and exposes
the existing service interface unchanged.

## Constraints
- The service's external interface (consumed by `course.draft_*` tools + IPC channels)
  must stay identical.
- `persistDraft` atomicity must be preserved — units + lessons + assessment shells land
  in one DB transaction or none.
- The drafter agent loop in `packages/curriculum/src/course-create/drafter.ts` calls
  into this service via tool dispatch — no changes there.
- `normalizeConceptName` is currently imported from `./course-create/helpers.js` as an
  internal helper; the leaky-abstraction finding (consumers reaching past a module's
  public API) should also resolve here.

## Discovery evidence
- File length: 1155 lines (verified)
- `confirmDraft` complexity: lines 524–598, multi-concern
- Internal helper imports: `normalizeConceptName` from `./course-create/helpers.js`,
  `persistDraftTx` from `./course-create/draft-persistence.js`

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-course-create-service-decomposition`
to enumerate the module split, public API for `helpers.js`, and migration sequence.

---

## Refactor Overview

After grounding in the full source (`course-create-service.ts` 1155 lines, three helper files,
`DraftStore` port, 2590 lines of tests), the extraction is organised into six parallel-eligible
module extractions followed by one integrative facade-cleanup step.

### Actual structure discovered

**Already-extracted modules** (the helpers referenced in the brief):
- `DraftStore` port + `SqliteDraftStore` → `packages/core/src/services/draft-store.ts` ✓
- `persistDraftTx` → `packages/core/src/services/course-create/draft-persistence.ts` ✓
- `validateProposed` + `Issue` → `packages/core/src/services/course-create/draft-validator.ts` ✓
- `normalizeConceptName` → `packages/core/src/services/course-create/helpers.ts` ✓

**Remaining inlined in the 1155-line service file:**

| Lines | Concern | Extraction target |
|---|---|---|
| 889–1155 (~270 lines) | `applyEdit` exhaustive switch + `buildSummary` pure helpers | `course-create/draft-mutations.ts` |
| 200–479 (~280 lines) | 9 incremental mutator methods | `course-create/draft-mutators.ts` |
| 725–857 (~133 lines) | 4 chunked read/query methods | `course-create/draft-queries.ts` |
| 524–598 (~75 lines) | `confirmDraft` orchestration | `course-create/draft-confirmer.ts` |
| 612–721 (~110 lines) | `createCourseFromPack` (pack, no draft) | `course-create/pack-course-creator.ts` |
| remainder | Lifecycle: init, subscribe, discard, sweep, shutdown | stays in service (~200–250 lines) |

**`normalizeConceptName` leaky abstraction:**
`course-create-service.ts` imports directly from `./course-create/helpers.js` (reaching into
a subdirectory's internal file). Fix: create `course-create/index.ts` as a module barrel and
update the service to import from the barrel boundary (`./course-create/index.js`).
The function itself does not need to move — just the import path in the consumer.

### No `DraftPersister` class needed
The brief proposed a `DraftPersister` class. The code shows `persistDraftTx` is already a
standalone function in `draft-persistence.ts` and the call-site in `confirmDraft` is compact
(two lines inside a `db.transaction` callback). Wrapping it in a class would add indirection
without benefit. Instead, `draft-confirmer.ts` imports `persistDraftTx` directly — same
atomicity, cleaner shape.

### No `DraftStore` changes
`DraftStore` (the port + `SqliteDraftStore`) is already a first-class collaborator. No step
touches it.

---

## Refactor Steps

### Step 1: Extract `applyEdit` + `buildSummary` → `draft-mutations.ts`
**Priority:** High | **Risk:** Low
Files: new `course-create/draft-mutations.ts`, modified `course-create-service.ts`.
Pure functions with no side effects. `applyEdit` imports `normalizeConceptName` from
`./helpers.js` and `validateProposed` from `./draft-validator.js` (both siblings).
Line reduction: ~270 lines.

### Step 2: Fix `normalizeConceptName` leaky abstraction via barrel
**Priority:** High | **Risk:** Low
Files: new `course-create/index.ts`, modified `course-create-service.ts`.
Create a module barrel re-exporting from all three existing helper files + new modules.
Service changes its three separate internal imports to one barrel import.
No logic change — import path only.

### Step 3: Extract incremental mutator logic → `draft-mutators.ts`
**Priority:** Medium | **Risk:** Low-Medium
Files: new `course-create/draft-mutators.ts`, modified `course-create-service.ts`.
9 mutator methods become pure functions `(DraftCourseState, input) → result`.
Service methods become thin load → call → timestamp-bump → saveAndEmitUpdate wrappers.
Line reduction: ~280 lines from the class.

### Step 4: Extract chunked read/query methods → `draft-queries.ts`
**Priority:** Medium | **Risk:** Low
Files: new `course-create/draft-queries.ts`, modified `course-create-service.ts`.
4 read methods become pure `(ProposedCourse) → T` projections.
Service methods become thin load → call wrappers.
Line reduction: ~133 lines.

### Step 5: Extract `confirmDraft` orchestration → `draft-confirmer.ts`
**Priority:** Medium | **Risk:** Medium
Files: new `course-create/draft-confirmer.ts`, modified `course-create-service.ts`.
`runConfirmDraft` opens the Drizzle transaction, calls `persistDraftTx` then
`store.markConfirmedTx` in the same tx (atomicity preserved), then handles
document-scope promotion (non-fatal, post-tx).
Line reduction: ~75 lines from the class.

### Step 6: Extract `createCourseFromPack` → `pack-course-creator.ts`
**Priority:** Low | **Risk:** Low
Files: new `course-create/pack-course-creator.ts`, modified `course-create-service.ts`.
Self-contained transaction; no draft state, no event emission.
Service method becomes a one-line delegation.
Line reduction: ~110 lines. Service may drop all `@praxis/artifacts/schema` imports.

### Step 7: Thin facade + barrel + full integration verification
**Priority:** High (integration gate) | **Risk:** Low
Files: modified `course-create-service.ts`, modified `course-create/index.ts`.
Verify service is ≤ 250 lines. Update barrel to include all new modules.
Run `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
Verify `export type { Issue }` still resolves for external tool-handler consumers.

---

## Implementation Order

```
Wave 1 (parallel — all independent pure extractions):
  Step 1: draft-mutations.ts
  Step 2: barrel + normalizeConceptName fix
  Step 3: draft-mutators.ts
  Step 4: draft-queries.ts
  Step 5: draft-confirmer.ts
  Step 6: pack-course-creator.ts

Wave 2 (sequential, after Wave 1 complete):
  Step 7: thin facade + barrel update + full integration check
```

Steps 1–6 are safe to implement in parallel — they extract non-overlapping regions of the
file with no cross-step dependencies. Step 7 gates on all six and performs the final
composition verification.
