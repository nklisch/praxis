---
id: story-epic-bootstrap-readiness-durable-drafts-integration
kind: story
stage: done
tags: [bootstrap, persistence]
parent: epic-bootstrap-readiness-durable-drafts
depends_on: [story-epic-bootstrap-readiness-durable-drafts-store]
release_binding: v0.1.1
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Swap `BootstrapServiceImpl` from in-memory Map to `DraftStore`

## Scope

Land the consumer side of the durable-drafts feature. Replaces
`BootstrapServiceImpl.drafts: Map<string, DraftCourseState>` with a
`DraftStore` instance (default `SqliteDraftStore` from the sibling
story). Every mutator becomes read-mutate-write. `confirmDraft`
flips `confirmedAt` inside the same transaction as `persistDraft` so
the operation is atomic.

## Units implemented

- **Unit 3** — Service-level swap from Map to `DraftStore`. Every
  mutator (`initDraft`, `addConcept`, `removeConcept`, `addEdge`,
  `addLesson`, `removeLesson`, `addUnit`, `setAssessmentPlan`,
  `addLessonAssessment`, `setMetadata`, `editDraft`) reads via
  `store.load`, mutates the loaded `DraftCourseState`, writes back via
  `store.save`. `showDraft` calls `store.touch`. `discardDraft` calls
  `store.markDiscarded`. `confirmDraft` calls `store.markConfirmedTx`
  inside the existing `db.transaction` block. Sweep cadence stays at
  60s; cutoff changes from 2h (`DRAFT_TTL_MS`) to 7d (`DRAFT_STALE_MS`).
  `shutdown()` clears listeners + sweep timer ONLY — no row deletion.
- **Unit 4** — Add `BootstrapService.listActiveForStudent(studentId)`
  to the interface and impl; delegates to `store.listForStudent`.
- **Unit 5 partial** — service-level tests
  (`packages/core/src/__tests__/bootstrap-service-durability.test.ts`):
  restart-survival, atomic-confirm, sweep-emits-discarded-event.

## Files touched

- `packages/core/src/services/bootstrap-service.ts` — Map → store
  swap on every mutator; `shutdown` no longer clears state; `persistDraft`
  refactored to expose a `persistDraftTx({tx, …})` variant so
  `confirmDraft` can write inside the existing transaction; new
  `listActiveForStudent` public method.
- `packages/core/src/types/index.ts` (or wherever `BootstrapService` is
  defined) — add `listActiveForStudent` to the interface.
- `packages/core/src/__tests__/bootstrap-service-durability.test.ts`
  (new) — restart-survival, atomic-confirm rollback, sweep behaviour.
- `packages/core/src/__tests__/bootstrap-service.test.ts` — verify all
  existing tests still pass; if any test relied on Map semantics
  directly (e.g. inspecting the Map), rewrite to query the store.

## Acceptance

- [x] Every mutator round-trips through the store
      (load → mutate → save). No method retains an in-process copy
      beyond the duration of one call.
- [x] `confirmDraft` is atomic: simulate a failure inside the
      `persistDraft` transaction; draft row remains with
      `confirmedAt: null` and no course rows are written.
- [x] Restart-survival smoke: BootstrapServiceImpl A creates a draft,
      `shutdown()`s; a fresh BootstrapServiceImpl B over the same DB
      returns the draft via `showDraft(id)` and `listActiveForStudent`.
- [x] `shutdown()` does NOT delete any draft rows (verified by
      checking the draft row is still present after shutdown).
- [x] `sweepStale` runs every 60s, emits one `discarded` event per
      swept draft, never touches confirmed/discarded rows.
- [x] `DRAFT_TTL_MS` renamed/replaced with `DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000`.
- [x] `BootstrapService.listActiveForStudent(studentId)` returns the
      student's active drafts ordered by lastTouchedAt DESC.
- [x] All existing `bootstrap-service.test.ts` tests pass.
- [x] `pnpm typecheck && pnpm lint && pnpm test` green (665 core tests, 2468 workspace tests).

## Out of scope

- Schema / migration / `DraftStore` port (sibling store story).
- Resume-mid-flow UI (separate feature; not in this epic).
- Prompt-fragment update mentioning the new TTL behaviour (the prompt
  story will pick that up when it runs).

## Parent context

- Parent feature: `epic-bootstrap-readiness-durable-drafts`
- Parent epic: `epic-bootstrap-readiness`
- Depends on `story-epic-bootstrap-readiness-durable-drafts-store`
  (the schema + adapter must exist first).

## Implementation notes

**Files changed:**
- `packages/core/src/services/bootstrap-service.ts` — Map removed; all 10
  mutators converted to load → mutate → save; `touchAndEmitUpdate` renamed
  `saveAndEmitUpdate`; `persistDraft` replaced with `persistDraftTx(tx, draft, now)`;
  `sweepExpired` renamed `sweepStale` using `store.sweepStale(cutoff)`;
  `shutdown()` no longer calls `drafts.clear()`; `DRAFT_TTL_MS` removed,
  `DRAFT_STALE_MS` exported; `listActiveForStudent` added; `draftStore?` dep added.
- `packages/core/src/types/tool.ts` — `listActiveForStudent` added to `BootstrapService` interface.
- `packages/core/src/__tests__/bootstrap-service.test.ts` — rewritten to seed
  via public API (initDraft + mutators) instead of injecting into Map; now
  uses a real DB via useTempDb for all tests.
- `packages/core/src/__tests__/bootstrap-service-durability.test.ts` (new) —
  8 tests: restart-survival, atomic confirm happy path, atomic confirm rollback
  (patch markConfirmedTx to throw), sweep behaviour, shutdown does not delete
  rows, listActiveForStudent ordering + filtering.
- `packages/core/src/services/__tests__/bootstrap-service.units.test.ts` — replaced
  private Map access with `store.save()` injections and `showDraft()` reads;
  each test now uses a real temp DB.
- `packages/core/src/services/__tests__/bootstrap-service.draft-stream.test.ts` —
  removed Map-based expiry manipulation; expired-draft test uses `store.markDiscarded`;
  sweep test ages drafts via `store.save` with old `lastTouchedAt`; all tests now
  use a real temp DB.
- `packages/core/src/services/__tests__/bootstrap-service.persist-units.test.ts` —
  replaced Map access with store injection pattern.

**Test count:** 665 core tests (8 new durability tests); 2468 workspace tests; all green.

**Deviations from design:**
- `persistDraft({db, …})` outer wrapper was simply removed (it had only one
  call site). `persistDraftTx({tx, …})` is the only function; `confirmDraft`
  calls `this.deps.db.transaction((tx) => { … })` directly.
- Rollback test uses a patched `store.markConfirmedTx` that throws rather than
  corrupting the draft's conceptIdByName lookup (simpler, equally correct).
- `expiresAt` field retained in `DraftCourseState` (type unchanged) — set to
  `now + DRAFT_STALE_MS` at creation but not read for expiry decisions; the
  store's `lastTouchedAt` column is the authoritative expiry signal.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- Same foundation-doc nit as the sibling store story: `docs/ARCHITECTURE.md:331-335` and `docs/SPEC.md` are silent on durable in-progress drafts. The docs gate during release will catch and roll this assertion forward.
- `confirmDraft` no longer deletes the draft row after `persistDraft` — this is the intended audit-retention change but worth noting for anyone tracing the lifecycle. The `Cleanup helper for host shutdown` JSDoc on `shutdown()` flags the related "rows survive in DB" semantics clearly.

**Notes**: Atomic-confirm wired exactly right — `persistDraftTx + markConfirmedTx` run inside one `db.transaction((tx) => …)` callback, so a failure inside `persistDraftTx` rolls back both the course write AND the `confirmedAt` flip. The Map→store conversion is consistent across all 10 mutators (load → mutate → bump `lastTouchedAt` → save). `shutdown()` correctly drops only the sweep timer and listeners, not the draft rows — restart-survival smoke test verifies this. `attachMany` outside the tx (post-commit, non-fatal on failure) preserves the pre-feature behaviour. 8 new durability tests + 4 existing test files rewritten to seed via public API. The `persistDraft({db, …})` outer-wrapper removal is a clean deviation — single call site, no point keeping the wrapper.
