---
id: refactor-course-create-service-extract-modules
kind: feature
stage: drafting
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
