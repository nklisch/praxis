---
id: story-epic-bootstrap-readiness-durable-drafts-integration
kind: story
stage: implementing
tags: [bootstrap, persistence]
parent: epic-bootstrap-readiness-durable-drafts
depends_on: [story-epic-bootstrap-readiness-durable-drafts-store]
release_binding: null
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

- [ ] Every mutator round-trips through the store
      (load → mutate → save). No method retains an in-process copy
      beyond the duration of one call.
- [ ] `confirmDraft` is atomic: simulate a failure inside the
      `persistDraft` transaction; draft row remains with
      `confirmedAt: null` and no course rows are written.
- [ ] Restart-survival smoke: BootstrapServiceImpl A creates a draft,
      `shutdown()`s; a fresh BootstrapServiceImpl B over the same DB
      returns the draft via `showDraft(id)` and `listActiveForStudent`.
- [ ] `shutdown()` does NOT delete any draft rows (verify by
      `SELECT count(*) FROM drafts` before/after).
- [ ] `sweepStale` runs every 60s, emits one `discarded` event per
      swept draft, never touches confirmed/discarded rows.
- [ ] `DRAFT_TTL_MS` renamed/replaced with `DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000`.
- [ ] `BootstrapService.listActiveForStudent(studentId)` returns the
      student's active drafts ordered by lastTouchedAt DESC.
- [ ] All existing `bootstrap-service.test.ts` tests pass.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

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
