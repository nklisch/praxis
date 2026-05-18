---
id: epic-backend-fills-for-redesign-snapshot-restore-ipc
kind: story
stage: done
tags: []
parent: epic-backend-fills-for-redesign-snapshot-restore
depends_on: [epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Snapshot restore — IPC channel + client method

## Scope

Lands Unit 6 from the parent feature
`.work/active/features/epic-backend-fills-for-redesign-snapshot-restore.md`:

1. `praxis.authoring.restoreAction` IPC channel (wrapped in the standard
   envelope per `ipc-envelope-handler`).
2. Extends `praxis.authoring.listActions` response shape to surface
   `restoredAt` and `originalActionId`.
3. `PraxisClient.authoring.restoreAction(...)` client method.
4. IPC-harness tests covering envelope shape on success and on invalid
   actionId.

Depends on
`epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore` —
the service-layer `restoreAction` and `configurator_snapshots` table
must exist.

## Implementation steps

1. **IPC handler**
   - Edit `packages/desktop/electron/main/authoring-channel.ts`
     (existing file per `per-domain-channel-module`).
   - Add a new `handle` registration for `praxis.authoring.restoreAction`
     via `wrapEnvelope` + `withSchema(zod, fn)` per
     `ipc-envelope-handler`. Zod schema:
     `z.object({ actionId: z.string() })`.
   - Handler delegates to
     `services.authoring.restoreAction({ actionId })` and returns the
     `RestoreResult` payload unchanged.
   - Extend the existing `listConfiguratorActions` response shape to
     include `restoredAt` (optional timestamp) and `originalActionId`
     (optional string). For non-restore action rows these are
     `undefined`; for restore-kind rows `originalActionId` is set; for
     restored-actions `restoredAt` is set.

2. **Client method**
   - Edit `packages/client/src/authoring.ts` (existing client surface).
   - Add `restoreAction(input: { actionId: string }): Promise<RestoreResult>`.
   - Use `unwrapEnvelope` per existing client conventions; propagate
     `IpcError` on envelope failure.
   - Update the `listConfiguratorActions` return type to include the
     new fields.

3. **Update client / core type files**
   - The new fields on the listConfiguratorActions response must be
     reflected in the shared types referenced by both client and core
     (`packages/core/src/types/configurator.ts` →
     `ConfiguratorActionRow` gains optional
     `restoredAt?: Timestamp | null` and `originalActionId?: string`).
     Adjust the service-layer reads to populate these fields by joining
     against `configurator_snapshots.restoredAt` and the
     `originalActionId` carried inside `actionJson` for restore-kind
     rows.

4. **Tests**
   - New `packages/desktop/electron/main/__tests__/authoring-channel-restore.test.ts`
     using `electron-ipc-test-harness`.
   - Cases:
     a. Valid actionId → envelope ok → RestoreResult.ok = true.
     b. Unknown actionId → envelope ok → RestoreResult.ok = false,
        reason = "no_snapshot".
     c. Already-restored actionId → envelope ok → RestoreResult.ok =
        false, reason = "already_restored".
     d. Invalid args (missing actionId) → envelope error via Zod schema
        guard.
   - Add a client-layer test (Vitest, no Electron) that mocks the IPC
     boundary and confirms `unwrapEnvelope` peels success and propagates
     errors.

5. **Quality checks**
   - `pnpm typecheck && pnpm lint && pnpm test` all green.

## Acceptance criteria

- [ ] `praxis.authoring.restoreAction` channel registered and tested via
      the IPC harness (success, not-found, already-restored, invalid
      args cases).
- [ ] `PraxisClient.authoring.restoreAction(...)` method available;
      returns `RestoreResult` peeled from the envelope.
- [ ] `listConfiguratorActions` response carries the new
      `restoredAt` and `originalActionId` fields where applicable.
- [ ] No regression on existing authoring channels — full
      `pnpm test` green.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- UI rendering of the ↶ revert button — separate feature
  `epic-backend-fills-for-redesign-drafter-configurator-chat`.
- Bulk restore / restore-multiple-at-once — not in design.
- Restore history endpoint beyond what `listConfiguratorActions`
  already surfaces.

## Implementation notes

### Files changed

- `packages/core/src/types/configurator.ts` — `ConfiguratorActionRow` extended
  with optional `restoredAt?: Timestamp | null` and `originalActionId?: string`.
- `packages/core/src/types/client.ts` — `AuthoringClient` interface gains
  `restoreAction(input: { actionId: string }): Promise<RestoreResult>`;
  `RestoreResult` import added.
- `packages/core/src/services/authoring-service.ts` — `listConfiguratorActions`
  now left-joins `configurator_snapshots` to populate `restoredAt` on action
  rows where a snapshot exists; `originalActionId` surfaced from `actionJson`
  for restore-kind rows.
- `packages/desktop/electron/main/ipc-server.ts` — registered
  `praxis.author.restoreAction` channel via `handleEnvelope` with
  `z.object({ actionId: z.string().min(1) })` Zod validation; delegates to
  `services.authoring.restoreAction` behind `requireUnlocked`.
- `packages/client/src/services/authoring-client.ts` — `AuthoringClientImpl`
  gains `restoreAction` method invoking `praxis.author.restoreAction` and peeling
  the envelope with `unwrapEnvelope`.

### Tests added

- `packages/desktop/electron/main/__tests__/authoring-channel-restore.test.ts`
  (8 cases): valid actionId → ok, no_snapshot, already_restored, missing
  actionId (VALIDATION_FAILED), empty actionId (VALIDATION_FAILED), service
  throws (INTERNAL), locked state (INTERNAL without service call), handler
  registration.
- `packages/client/src/__tests__/authoring-restore-client.test.ts`
  (7 cases): success envelope peel, no_snapshot passthrough,
  already_restored passthrough, VALIDATION_FAILED IpcError, IpcError.code
  verification, INTERNAL IpcError, correct channel+payload forwarding.

### Key decision

`listConfiguratorActions` uses a LEFT JOIN so non-snapshotted action kinds
(memory.export, memory.delete_all) continue to return rows without `restoredAt`.
Only rows with a matching `configurator_snapshots` row get the field populated;
`undefined` (absent key) indicates no snapshot, `null` indicates snapshot exists
but not yet restored, and a `Timestamp` indicates restored.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none (one blocker found and fixed inline — see Notes)
**Important**: none
**Nits**:
- Story scope text used `praxis.authoring.restoreAction` and `praxis.authoring.listActions` — the established convention is `praxis.author.*`. Implementation was correct; scope prose was wrong.

**Notes**: The `listConfiguratorActions` left-join null-guard was logically
incorrect. The code checked `r.snapshotRestoredAt !== undefined` to detect
join presence, but Drizzle returns `null` (not `undefined`) for all selected
columns when a left-join finds no matching row. This meant non-snapshotted
action kinds (`memory.export`, `memory.delete_all`) would erroneously receive
`restoredAt: null` — implying a snapshot exists but hasn't been restored, which
contradicts the `ConfiguratorActionRow` contract where absent `restoredAt` means
"not restorable". The comment in the code even noted the Drizzle null behavior
but the guard didn't account for it. Fix: added `snapshotActionId` (the PK,
`notNull`) to the select projection and gated `restoredAt` population on
`r.snapshotActionId !== null` instead. No consumers exist yet so no runtime
regression; all 15 tests pass after the fix. Fixed inline in
`packages/core/src/services/authoring-service.ts`.
