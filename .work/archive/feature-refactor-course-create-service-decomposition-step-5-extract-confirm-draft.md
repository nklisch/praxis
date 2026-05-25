---
id: feature-refactor-course-create-service-decomposition-step-5-extract-confirm-draft
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Extract `confirmDraft` orchestration to `course-create/draft-confirmer.ts`

## Priority / Risk
Priority: Medium — `confirmDraft` (lines 524–598) is the most multi-concern method:
validate → transaction → document-scope promotion → emit. Extracting its orchestration
logic clarifies the service as a lifecycle coordinator.
Risk: Medium — touches the transaction boundary; atomicity must be preserved.

## Files affected
- **New**: `packages/core/src/services/course-create/draft-confirmer.ts`
- **Modified**: `packages/core/src/services/course-create-service.ts`

## Current state
`confirmDraft` (lines 524–598) in `CourseCreateServiceImpl`:
1. Loads draft from store, validates ownership.
2. Calls `validateProposed` — returns `{ ok: false, issues }` on failure.
3. Opens a Drizzle `db.transaction`: calls `persistDraftTx` then `store.markConfirmedTx` — atomic.
4. Calls `documentScopes.promoteScope` or `attachMany` (non-fatal, post-transaction).
5. Emits `finalized` event.

## Target state
Extract a `runConfirmDraft` function into `draft-confirmer.ts`:

```ts
export interface ConfirmDraftDeps {
  db: PraxisDb;
  documentScopes: DocumentScopesService;
  log: Logger;
}

export interface ConfirmDraftContext {
  draft: DraftCourseState;
  markConfirmedTx: (tx: PraxisDb, draftId: DraftId, courseId: CourseId) => void;
}

export async function runConfirmDraft(
  ctx: ConfirmDraftContext,
  deps: ConfirmDraftDeps,
): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }>
```

The service's `confirmDraft` method:
1. Loads + validates ownership (stays in service — these are lifecycle guards).
2. Calls `validateProposed` (stays in service or moved here — either works).
3. Calls `runConfirmDraft({ draft, markConfirmedTx: this.store.markConfirmedTx.bind(this.store) }, deps)`.
4. Emits `finalized` event (stays in service — event emission belongs to the orchestrator).

**Atomicity preserved**: `persistDraftTx` and `markConfirmedTx` both receive the same
Drizzle `tx` handle; this invariant is preserved by passing `markConfirmedTx` as a
callback that `runConfirmDraft` invokes inside the same `db.transaction(tx => ...)` call.

## Implementation notes
- `runConfirmDraft` opens the transaction internally: `deps.db.transaction(tx => { ... })`.
  It calls `persistDraftTx({ tx, draft, now })` then `ctx.markConfirmedTx(tx, draftId, courseId)`.
- Document-scope promotion remains inside `runConfirmDraft` (post-transaction, non-fatal).
- The `async` boundary from `promoteScope`/`attachMany` is preserved — `db.transaction` is
  synchronous in better-sqlite3 but the outer function is `async` for the document-scope calls.
- Import `persistDraftTx` from `./draft-persistence.js` (sibling).
- Import `validateProposed` from `./draft-validator.js` (sibling).
- The service method signature is unchanged; the public `CourseCreateService` interface is unchanged.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` pass.
- Transaction atomicity: `store.markConfirmedTx` still runs in the same `db.transaction` as `persistDraftTx`.
- Non-fatal `promoteScope`/`attachMany` error handling preserved.
- All existing tests (including `course-create-service.session-scope.test.ts` and
  `course-create-service.persist-units.test.ts`) pass without modification.

## Risk + Rollback
Risk: Medium — transaction boundary is load-bearing. Verify with integration tests.
Rollback: inline `runConfirmDraft` back into the service method.

## Implementation notes
- Created `packages/core/src/services/course-create/draft-confirmer.ts` (90 lines).
- `runConfirmDraft(ctx, deps)` opens the Drizzle transaction internally, calls `persistDraftTx` then `ctx.markConfirmedTx` in the same `tx` — atomicity preserved.
- `draft.draftId` (plain `string` on `DraftCourseState`) is branded via `brandId<"DraftId">(...) as DraftId` before passing to `markConfirmedTx`, matching the pattern in the service.
- Document-scope promotion (`promoteScope`/`attachMany`) is post-transaction and non-fatal, preserving the original error-handling semantics.
- `course-create-service.ts` is NOT modified (Step 7 handles wiring).
- `pnpm typecheck && pnpm --filter @praxis/core test` pass: 96 test files, 1164 tests.

## Review

Verdict: **done**.

- Transaction atomicity confirmed: `persistDraftTx` and `ctx.markConfirmedTx` both receive the same Drizzle `tx` handle inside a single `db.transaction(tx => { ... })` call in `runConfirmDraft`. If either throws, the entire transaction rolls back atomically.
- Document-scope promotion (`promoteScope` / `attachMany`) is correctly placed post-transaction in two distinct `try/catch` blocks — non-fatal, logs warn, course persisted regardless.
- `brandId<"DraftId">(draft.draftId) as DraftId` branding matches the service pattern exactly.
- `ConfirmDraftDeps` interface matches design spec.
- 1164 core tests + 4773 workspace tests pass.
