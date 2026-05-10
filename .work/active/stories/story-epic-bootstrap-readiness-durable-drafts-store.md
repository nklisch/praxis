---
id: story-epic-bootstrap-readiness-durable-drafts-store
kind: story
stage: implementing
tags: [bootstrap, persistence]
parent: epic-bootstrap-readiness-durable-drafts
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Drafts table + `DraftStore` port and SQLite adapter

## Scope

Land the foundation pieces of the durable-drafts feature: the schema, the
generated migration, and a self-contained `DraftStore` port + SQLite
adapter. No `BootstrapServiceImpl` changes in this story — that's the
sibling integration story.

## Units implemented

- **Unit 1** (`drafts` table schema + Drizzle migration). See the design
  in `epic-bootstrap-readiness-durable-drafts.md`.
- **Unit 2** (`DraftStore` interface + `SqliteDraftStore` impl).
- **Unit 5 partial** — store-level tests
  (`packages/core/src/__tests__/draft-store.test.ts`).

## Files touched

- `packages/core/src/schema.ts` — add `drafts` table; register in
  `coreSchema`.
- `drizzle/0009_<generated>.sql` — `pnpm db:generate` produces this.
- `packages/core/src/services/draft-store.ts` (new) — `DraftStore` port
  + `SqliteDraftStore` adapter.
- `packages/core/src/services/index.ts` — export `DraftStore` and
  `SqliteDraftStore` (the integration story consumes them).
- `packages/core/src/__tests__/draft-store.test.ts` (new) — round-trip,
  list, mark-confirmed-tx-rollback, mark-discarded, sweep-stale tests.

## Acceptance

- [ ] `pnpm db:generate` produces a clean migration adding only the
      `drafts` table + its indices.
- [ ] `pnpm db:migrate` applies cleanly against a fresh DB.
- [ ] `SqliteDraftStore.save(d)` then `load(d.draftId)` round-trips the
      `DraftCourseState` byte-equivalent (modulo the `lastTouchedAt`
      bump).
- [ ] `load()` returns null for rows with `confirmedAt` or
      `discardedAt` set.
- [ ] `listForStudent(studentId)` filters by student, excludes
      terminal rows, orders by `lastTouchedAt` DESC.
- [ ] `markConfirmedTx` inside a rolled-back transaction leaves the row
      active (verify with a deliberate tx rollback in the test).
- [ ] `markDiscarded` flips `discardedAt`; subsequent `load()` returns
      null.
- [ ] `sweepStale(cutoff)` discards rows where `lastTouchedAt < cutoff`,
      leaves fresher rows untouched, returns the swept ids.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- Any `BootstrapServiceImpl` modifications (sibling story consumes the
  store).
- `listActiveForStudent` on the public `BootstrapService` interface
  (sibling story exposes it).
- Restart-survival smoke test, confirm-atomicity test (sibling story —
  exercises the service end-to-end).

## Parent context

- Parent feature: `epic-bootstrap-readiness-durable-drafts`
- Parent epic: `epic-bootstrap-readiness`
- This story is unblocked from day one. Sibling story
  `story-epic-bootstrap-readiness-durable-drafts-integration` waits on
  this one's `done`.
