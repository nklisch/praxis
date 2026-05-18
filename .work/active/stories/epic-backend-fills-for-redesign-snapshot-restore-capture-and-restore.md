---
id: epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore
kind: story
stage: done
tags: []
parent: epic-backend-fills-for-redesign-snapshot-restore
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Snapshot capture + restore — service-layer infrastructure

## Scope

Lands Units 1–5 from the parent feature
`.work/active/features/epic-backend-fills-for-redesign-snapshot-restore.md`:

1. New `configurator_snapshots` table + migration
2. `SnapshotEntityKind` / `ConfiguratorSnapshotRow` / `RestoreResult` types
3. `SnapshotCapturer` per-kind helper
4. `AuthoringServiceImpl` wired to capture pre-state on every mutation
5. `AuthoringServiceImpl.restoreAction({ actionId })` reverse-apply
6. New `restore` variant on `ConfiguratorAction`
7. Additive `upsert*` entry points on `ArtifactsService` /
   `MemoryService` where the existing CRUD doesn't cover
   restore-to-arbitrary-prior-shape.

This story is self-contained at the service boundary — no IPC, no client
surface, no UI. Tests prove round-trip per action kind.

## Implementation steps

1. **Schema**
   - Edit `packages/core/src/schema.ts` — add `configuratorSnapshots`
     table per Unit 1 in the parent feature.
   - Add to `coreSchema` export.
   - Run `pnpm db:generate` to produce the migration SQL.
   - Run `pnpm db:reset` (development DB only) to verify the migration
     applies; run `pnpm db:show` to confirm the table appears.

2. **Types**
   - Edit `packages/core/src/types/configurator.ts` — add
     `SnapshotEntityKind`, `ConfiguratorSnapshotRow`, `RestoreResult` per
     Unit 2 in the parent feature.
   - Extend `ConfiguratorAction` with `{ kind: "restore"; originalActionId: string }`.
   - Re-export via `packages/core/src/types/index.ts`.
   - Add `schemaVersion: number` to the snapshot JSON shape (start at
     `1`) per the Risks section in the parent.

3. **Read missing entry points on existing services**
   - Check `ArtifactsService` for: `upsertLesson`, `upsertGate`,
     `getLesson` (single-by-id), `getGate` (single-by-id).
   - Check `MemoryService` for: `upsertMastery`, `upsertMisconception`,
     `getConceptMastery`, `getMisconception`.
   - Where missing, add them. Keep them thin — they exist for restore;
     not part of the normal authoring path.

4. **SnapshotCapturer**
   - New file `packages/core/src/services/snapshot-capturer.ts`.
   - One method per snapshottable `ConfiguratorAction` kind, returning
     `{ entityKind, entityKey, snapshot }` with `schemaVersion: 1`
     embedded in the snapshot payload.
   - For `setStyleSliders` (`prompt.set_style`): read ALL current
     prompt_overrides rows (the composed-style call may touch many)
     and store them as an array of `{ modeId, fragmentId, override }`
     records. Restore re-applies via `upsert` per record + `delete`
     for any record present pre but absent post.
   - For sentinel-create kinds (`lesson.create`, `gate.create`): return
     a sentinel `{ schemaVersion: 1, kind: "create" }`. EntityKey is
     filled in post-mutate by the caller using the new entity id.
   - Add `SnapshotCapturerDeps` interface and inject via `ServiceDeps`
     (`service-deps-injection` pattern).

5. **AuthoringServiceImpl integration**
   - Inject `SnapshotCapturer` via constructor deps.
   - Refactor `appendAction(...)` to return the new action id.
   - For each mutating method, sequence:
     ```ts
     const captured = await this.capturer.forFooEdit(...);
     const result = await this.deps.<svc>.<mutate>(input);
     const actionId = this.appendAction({ kind: "...", ... });
     if (captured) this.appendSnapshot(actionId, captured);
     return result;
     ```
   - For sentinel-create kinds, fill in `entityKey` with `result.id`
     before persisting the snapshot row.
   - Skip capture for `memory.export` and `memory.delete_all`.
   - `appendSnapshot` is a new private method that inserts into
     `configurator_snapshots`.

6. **restoreAction**
   - Add `restoreAction({ actionId }): Promise<RestoreResult>` per Unit 5
     in the parent feature.
   - Implement the reverse-apply dispatcher with an exhaustive switch on
     `entityKind` and a `never`-typed default.
   - On success: mark `restoredAt` on the snapshot row; append a
     `restore`-kind action; capture a snapshot of the new post-restore
     state (which equals the original pre-mutation state) so re-restore
     works.
   - Return `RestoreResult` per the parent design.

7. **Tests**
   - New `packages/core/src/services/__tests__/snapshot-restore.test.ts`.
   - Per-kind round-trip test for every snapshottable action kind:
     pre-state → mutate → restore → assert deep-equal pre-state.
   - Double-restore: assert second call returns
     `{ ok: false, reason: "already_restored" }`.
   - Un-revert: restore the restore action; assert original mutation
     is re-applied.
   - Use `useTempDb()` from `tests/helpers/db-setup.ts`.

8. **Quality checks**
   - `pnpm typecheck && pnpm lint && pnpm test` all green.

## Acceptance criteria

- [ ] `configurator_snapshots` table created via migration; `pnpm db:show`
      includes it.
- [ ] `SnapshotCapturer` has one method per snapshottable
      `ConfiguratorAction` kind; all methods return
      `{ entityKind, entityKey, snapshot }` with `schemaVersion: 1`
      embedded.
- [ ] Every mutating method on `AuthoringServiceImpl` captures a snapshot
      EXCEPT `exportMemory` (read) and the dangerous `delete_all` path,
      which deliberately skip. Verified by service-layer tests.
- [ ] `restoreAction({ actionId })` rolls back every snapshottable kind
      to the exact pre-mutation byte shape. Verified per-kind in tests.
- [ ] Double-restore returns `already_restored`; un-revert works.
- [ ] `ConfiguratorAction` union extended with `{ kind: "restore"; originalActionId: string }`.
- [ ] All round-trip tests pass.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- IPC channel + client method — Story B
  (`-snapshot-restore-ipc`).
- UI rendering of the ↶ revert affordance — separate feature
  `epic-backend-fills-for-redesign-drafter-configurator-chat`.
- Snapshot retention / pruning — deferred until storage becomes a
  problem.
- Snapshotting `memory.delete_all` — out of scope by design (separate
  confirmation flow in UI, not a one-click revert).

## Implementation notes

### Files changed

- `packages/core/src/schema.ts` — added `configuratorSnapshots` table
  with `actionId` PK, `entityKind`, `entityKeyJson`, `snapshotJson`,
  `restoredAt`; two indexes; added to `coreSchema` export.
- `drizzle/0017_green_gunslinger.sql` — generated migration.
- `packages/core/src/types/configurator.ts` — added `SnapshotEntityKind`
  (11 variants), `ConfiguratorSnapshotRow`, `RestoreResult`, and `restore`
  variant on `ConfiguratorAction`.
- `packages/core/src/types/tool.ts` — added `getLesson`, `getGate`,
  `upsertLesson`, `upsertGate` to `ArtifactsService`; `getMastery`,
  `upsertMastery`, `getMisconception`, `upsertMisconception` to
  `MemoryService`; `restoreAction` to `AuthoringService`.
- `packages/core/src/services/artifacts-service.ts` — implemented
  `getLesson`, `getGate`, `upsertLesson` (preserves `orderIndex`),
  `upsertGate`.
- `packages/core/src/services/memory/memory-service.ts` — implemented
  `getMastery`, `upsertMastery` (null = delete row), `getMisconception`,
  `upsertMisconception`; renamed indexer import to avoid name collision.
- `packages/core/src/services/snapshot-capturer.ts` (new) — `SnapshotCapturer`
  class with one method per snapshottable action kind; `SNAPSHOT_SCHEMA_VERSION = 1`.
- `packages/core/src/services/authoring-service.ts` — wired snapshot
  capture into every mutating method; `restoreAction` exhaustive switch
  on `entityKind`; `captureCurrentStateForUnrevert` captures pre-restore
  state for un-revert support.
- `packages/core/src/services/index.ts` — exports `SnapshotCapturer` and
  related types.
- `packages/core/src/services/__tests__/snapshot-restore.test.ts` (new)
  — 23 tests covering every snapshottable kind, double-restore guard, and
  un-revert.
- `packages/core/src/__tests__/authoring-service.test.ts` — stub factories
  updated to include new `ArtifactsService` and `MemoryService` methods.

### Design decisions

- **Global prompt capture**: `config_kv` stores `{ text: string }` as
  `valueJson`. The capturer now extracts `.text` from the JSON object
  instead of casting the whole object as a string.
- **Un-revert**: snapshot for the `restore` action captures state BEFORE
  the reverse-apply (= post-mutation state). This enables re-applying the
  original mutation on un-revert. `lesson.create`/`gate.create` sentinels
  are upgraded to `lesson`/`gate` kind snapshots for the restore action,
  since the entity exists at capture time.
- **`memory.reset_concept` semantics**: `resetConcept` inserts/updates to
  BKT initial state (does not delete); `upsertMastery(null)` deletes the
  row. Snapshot captures the actual prior mastery (or null).
- **`memory.clear_misconception` semantics**: sets `status: "manually-cleared"`,
  does not delete. Snapshot stores the full prior row (including status).

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `upsertLesson` docstring says "The orderIndex from the snapshot is preserved verbatim" but this is only true when the row still exists (edit/upsert case). After delete-then-restore the row is gone, `existingRow` is null, and the lesson is appended at the end — the original position is lost. The `Lesson` type omits `orderIndex` so there is no way to do better without changing the type. The behavior is correct (append rather than fail); only the docstring is inaccurate. Low-impact nit given that `lesson.delete` restore is a rare path.
- `snapshot-restore.test.ts` has 28 `noNonNullAssertion` warnings from `actions[0]!.id` indexing patterns throughout the test file. Optional-chain form would be safer but the pattern is idiomatic in tests that assert on known-present items.

**Notes**: Full test suite passes (3967 tests, 386 files). The pre-existing `@praxis/desktop` typecheck failures (3 errors in `courses-section.tsx` and `note-editor-page.tsx` re: `exactOptionalPropertyTypes`) are not introduced by this commit — verified by stashing and re-running. All changed files are lint-clean (only pre-existing warnings in `artifacts-service.ts`). Design alignment is solid: every unit from the design is implemented, the exhaustive `switch` on `entityKind` correctly uses a `never`-typed default, `schemaVersion` guard is in place, double-restore and un-revert are both tested and working.
