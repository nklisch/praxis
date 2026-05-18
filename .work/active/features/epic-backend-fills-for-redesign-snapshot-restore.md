---
id: epic-backend-fills-for-redesign-snapshot-restore
kind: feature
stage: review
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Artifact snapshot / restore infrastructure

## Brief

The re-mocked drafter and configurator chat surfaces show every
agent-driven tool call landing with a **`↶ revert`** affordance — click
once, the artifact restores to its pre-call state. The architecture
was honestly re-framed away from pre-execution staging (Keep/Tweak/Revert)
toward **direct-call-with-undo**: tools execute immediately, but every
mutation is snapshot-backed and reversible.

This feature adds a **generic snapshot/restore layer** for artifact
mutations. Snapshot is captured before each agent-driven mutation
(course, gate, lesson, prompt, memory edits — anything the
configurator or drafter parent agents touch via authoring tools).
Restore rolls the artifact back to a named snapshot id. Generic enough
to work across all artifact tables; lightweight enough that snapshots
don't bloat storage.

What this feature does **not** cover: the chat-side UI rendering of
the ↶ revert button (that's the drafter-configurator-chat feature);
non-agent-driven mutations (manual edits from configure forms can
opt-in but aren't required to snapshot).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **foundation feature** — `drafter-configurator-chat`
  depends on this for the ↶ revert affordance. Lands first.
- UI co-ships with: none directly; consumed via
  `drafter-configurator-chat`.

## Foundation references

- `docs/ARCHITECTURE.md` § "Artifact lifecycle" — where mutations
  happen today; this feature wraps the agent-driven mutations
- `docs/ARCHITECTURE.md` § "Tool dispatch architecture" — current
  flow `agent → registry.dispatch → handler → mutate` becomes
  `agent → registry.dispatch → snapshot → handler → mutate`
- `packages/tools/src/authoring/` — the four authoring tool families
  that need snapshot wrapping (course / gate / lesson / prompt)
- `.mockups/flows/course-create-entry/03-explorer-running.html` and
  `04-draft-ready.html` — re-mocked surfaces showing the ↶ revert
  affordance on every tool entry

## Design decisions

- **Hook point: `AuthoringServiceImpl`, not `registry.dispatch`.** Every
  agent-driven authoring mutation already passes through
  `AuthoringServiceImpl.<mutate>()`, which already appends a
  `configurator_actions` audit row. Adding snapshot capture at this layer
  reuses the existing mutation-discriminator (`ConfiguratorAction['kind']`)
  and keeps the snapshot logic out of the generic tool dispatch path —
  non-authoring tools (sketch, notes, flashcards, quiz) don't need
  snapshots and shouldn't pay for them.
- **Capture pre-state, not deltas.** Snapshot stores the full pre-mutation
  shape of the affected entity (or batch of entities). Deltas would force
  the restore path to re-derive the old state, which is fragile when
  schemas evolve. Full-state snapshots are larger but trivially correct.
- **Snapshot keyed by action id, 1:1 with audit rows.** Every snapshotted
  mutation produces exactly one row in `configurator_snapshots`, with PK
  = `actionId` referencing `configurator_actions.id`. Restore is
  "restore-by-action-id"; the chat surface already knows action ids.
- **`memory.delete_all` and `memory.export` are not snapshotted.** Export
  is a read; delete-all is intentionally destructive and the UI surfaces
  it through a separate confirmation flow, not a one-click ↶ revert.
- **Restore appends a new action row.** A `restoreAction({ actionId })`
  call writes a `restore` action kind with `originalActionId` set. This
  makes restore itself audit-visible AND snapshot-able — re-restoring
  (un-revert) works the same way. Two restores of the same action are
  idempotent at the data level; the second is a no-op (snapshot still
  reflects pre-original-mutation state).
- **No retention policy in v1.** Snapshots persist for the life of the
  artifact. A future story can add a retention sweep when storage
  proves to be a problem; for course-create / configure sessions the
  mutation count is in the tens-to-hundreds range, not thousands.

## Architectural choice

**Capture-on-mutate at the service layer.** Wrap each mutating method in
`AuthoringServiceImpl` to:

1. Capture the affected entity's pre-state via a typed `Snapshotter`
   keyed on the action kind.
2. Execute the underlying mutation (existing behavior).
3. Append the action row (existing behavior) — receive the action id.
4. Insert the snapshot row keyed by that action id.

Step 4 is best-effort within a single transaction with Step 3, so a row
exists in `configurator_actions` IFF a row exists in
`configurator_snapshots` (excluding the un-snapshotted memory.* kinds).

`restoreAction({ actionId })` reads the snapshot row, dispatches a
**reverse-apply** based on `entityKind`, then appends a new
`restore` action + snapshot of the post-restore state (which equals the
pre-original-mutation state).

Considered and rejected:
- **`registry.dispatch` middleware.** Snapshotting at the tool-dispatch
  layer would require introspecting tool args to identify "is this a
  mutation? on which entity?" — coupling that already lives in the
  domain types of `ConfiguratorAction`. Re-deriving it is duplication.
  Also catches non-authoring tools that don't need it.
- **Tool decorator pattern.** Wrapping authoring-tool handlers
  (`packages/tools/src/authoring/**`) works, but the tools are thin
  delegations to `AuthoringServiceImpl`; the service is the actual
  mutation surface. Wrapping at the service layer is one hop closer to
  the truth.
- **Persistent event log + replay.** Storing the full action stream and
  rebuilding state from scratch would work, but it's heavy for a
  feature whose only consumer is a single-click revert button. The
  snapshot model maps directly onto the UI affordance.

## Implementation Units

### Unit 1: Schema — `configurator_snapshots` table

**File**: `packages/core/src/schema.ts` (additive)

```ts
export const configuratorSnapshots = sqliteTable(
  "configurator_snapshots",
  {
    /**
     * Foreign key to configurator_actions.id. Each snapshotted mutation
     * has exactly one row here; un-snapshotted kinds (memory.export,
     * memory.delete_all) have no row.
     */
    actionId: text("action_id").primaryKey(),
    /**
     * Entity kind affected by the original action. Drives the
     * reverse-apply dispatcher in restoreAction.
     */
    entityKind: text("entity_kind").notNull(), // SnapshotEntityKind union
    /**
     * Primary entity id when applicable (courseId / lessonId / gateId /
     * modeId+fragmentId composite). Stored as JSON for composite keys.
     * Null only for "create" sentinel snapshots where reverse-apply is
     * "delete the entity created by the original action."
     */
    entityKeyJson: text("entity_key_json", { mode: "json" }),
    /**
     * Pre-mutation entity shape — full row(s) as JSON. For create-kind
     * snapshots, this is the sentinel `{ kind: "create" }` so
     * reverse-apply knows to delete-by-id. For batch mutations (set_style)
     * this is an array of prior rows.
     */
    snapshotJson: text("snapshot_json", { mode: "json" }).notNull(),
    /**
     * Set when this snapshot is consumed by a restoreAction call. Null
     * means "available to restore." A second restore of the same actionId
     * is a no-op at the data layer (snapshot still describes the
     * pre-original state).
     */
    restoredAt: integer("restored_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    entityIdx: index("configurator_snapshots_entity_idx").on(t.entityKind),
    restoredAtIdx: index("configurator_snapshots_restored_at_idx").on(t.restoredAt),
  }),
);

// Add to coreSchema export.
```

**Migration**: `drizzle/<next>_configurator_snapshots.sql` via
`pnpm db:generate`.

**Acceptance**:
- [ ] Table created by `pnpm db:migrate` against a fresh DB.
- [ ] `pnpm db:show` includes the new table in its output.

### Unit 2: Snapshot domain types

**File**: `packages/core/src/types/configurator.ts` (additive)

```ts
/**
 * SnapshotEntityKind discriminates the reverse-apply path. One per
 * snapshottable mutation surface in AuthoringServiceImpl.
 */
export type SnapshotEntityKind =
  | "course"
  | "lesson"
  | "lesson.create"           // sentinel: reverse-apply = deleteLesson(lessonId)
  | "gate"
  | "gate.create"             // sentinel: reverse-apply = deleteGate(gateId)
  | "prompt_override"          // single fragment override
  | "prompt_override.create"   // sentinel: reverse-apply = clearFragmentOverride
  | "prompt_override_batch"    // setStyleSliders
  | "global_prompt"
  | "mode_append"
  | "memory.concept"
  | "memory.misconception";

export interface ConfiguratorSnapshotRow {
  actionId: string;
  entityKind: SnapshotEntityKind;
  entityKey: unknown; // JSON-decoded (string id, or { modeId, fragmentId }, etc.)
  snapshot: unknown;  // JSON-decoded full prior shape
  restoredAt: Timestamp | null;
}

/**
 * RestoreResult is returned by restoreAction; tells the UI what happened
 * so it can render a confirmation pill or refresh the affected surface.
 */
export type RestoreResult =
  | { ok: true; restoredEntity: SnapshotEntityKind; entityKey: unknown }
  | { ok: false; reason: "not_found" | "already_restored" | "no_snapshot" };
```

**Acceptance**:
- [ ] Types exported via `packages/core/src/types/index.ts`.
- [ ] No type errors on existing consumers of `ConfiguratorAction`.

### Unit 3: Capture helper — `SnapshotCapturer`

**File**: `packages/core/src/services/snapshot-capturer.ts` (new)

A thin per-entity reader that returns the pre-state JSON for a given
mutation. One method per `ConfiguratorAction['kind']`:

```ts
export class SnapshotCapturer {
  constructor(private readonly deps: SnapshotCapturerDeps) {}

  /** Capture pre-state for a course.edit. Returns null if the course
   * does not exist (the caller should still proceed — fail-fast at the
   * mutate step). */
  async forCourseEdit(courseId: CourseId): Promise<{
    entityKind: "course";
    entityKey: CourseId;
    snapshot: Course;
  } | null>;

  async forLessonCreate(): Promise<{
    entityKind: "lesson.create";
    entityKey: null;
    snapshot: { kind: "create" };
  }>; // sentinel — entityKey is filled in post-mutate with the new lesson id

  async forLessonEdit(lessonId: LessonId): Promise<{
    entityKind: "lesson";
    entityKey: LessonId;
    snapshot: Lesson;
  } | null>;

  async forLessonDelete(lessonId: LessonId): Promise<{
    entityKind: "lesson";
    entityKey: LessonId;
    snapshot: Lesson;
  } | null>;

  async forGateCreate(): Promise<{ entityKind: "gate.create"; ... }>;
  async forGateEdit(gateId: GateId): Promise<...>;
  async forGateDelete(gateId: GateId): Promise<...>;
  async forGateOverride(gateId: GateId): Promise<...>;

  async forPromptOverride(modeId: string, fragmentId: string): Promise<...>;
  async forPromptClear(modeId: string, fragmentId: string): Promise<...>;
  async forPromptSetStyle(): Promise<...>; // batch — reads all current overrides
  async forGlobalPromptSet(): Promise<...>;
  async forModeAppendSet(modeId: string): Promise<...>;

  async forMemoryResetConcept(studentId: StudentId, conceptId: ConceptId): Promise<...>;
  async forMemoryClearMisconception(misconceptionId: MisconceptionId): Promise<...>;
}
```

Each method reads the current shape and returns it. The capturer does
**not** write the snapshot row — that's the AuthoringServiceImpl's job
once it has the action id.

**Acceptance**:
- [ ] All capture methods round-trip: capture → mutate → restore via the
      captured value reproduces the pre-state byte-for-byte.

### Unit 4: Wire capture into `AuthoringServiceImpl`

**File**: `packages/core/src/services/authoring-service.ts` (modified)

The new pattern per mutation:

```ts
async updateCourse(input: {...}): Promise<Course> {
  const captured = await this.capturer.forCourseEdit(input.courseId);
  const result = await this.deps.artifacts.updateCourse(input);
  const actionId = this.appendAction({ kind: "course.edit", ... });
  if (captured) this.appendSnapshot(actionId, captured);
  return result;
}
```

For `lesson.create` / `gate.create`, the sentinel is recorded with the
new entity id (resolved post-mutate from `result.id`).

Refactor: `appendAction` becomes `appendAction(...): string` returning
the new action id.

**Acceptance**:
- [ ] Every existing mutation method captures a snapshot. Verified by
      unit tests asserting `configurator_snapshots` row exists after each.
- [ ] `memory.export` and `memory.delete_all` deliberately skip capture
      and do NOT produce a snapshot row.

### Unit 5: Restore API — `AuthoringServiceImpl.restoreAction`

**File**: `packages/core/src/services/authoring-service.ts` (additive)

```ts
async restoreAction(input: { actionId: string }): Promise<RestoreResult> {
  const snapshot = this.readSnapshot(input.actionId);
  if (!snapshot) return { ok: false, reason: "no_snapshot" };
  if (snapshot.restoredAt !== null) {
    return { ok: false, reason: "already_restored" };
  }

  // Reverse-apply dispatcher — switch on entityKind.
  switch (snapshot.entityKind) {
    case "course":
      await this.deps.artifacts.updateCourse({
        courseId: snapshot.entityKey as CourseId,
        patch: snapshot.snapshot as Course,
      });
      break;

    case "lesson.create":
      await this.deps.artifacts.deleteLesson({
        lessonId: snapshot.entityKey as LessonId,
      });
      break;

    case "lesson":
      // upsert: if currently deleted, re-create from snapshot;
      // if currently present, overwrite.
      await this.deps.artifacts.upsertLesson(snapshot.snapshot as Lesson);
      break;

    // ... one branch per SnapshotEntityKind ...

    default:
      const _exhaustive: never = snapshot.entityKind;
      throw new Error(`Unknown snapshot entityKind: ${snapshot.entityKind}`);
  }

  // Mark the original snapshot consumed.
  this.markRestored(input.actionId, new Date());

  // Append a "restore" audit action so the timeline shows the un-do.
  const restoreActionId = this.appendAction({
    kind: "restore",
    originalActionId: input.actionId,
  });
  // Capture the new post-restore state as a snapshot for the restore
  // action itself — enables re-restore (un-revert).
  await this.captureForRestoreReplay(restoreActionId, snapshot);

  return { ok: true, restoredEntity: snapshot.entityKind, entityKey: snapshot.entityKey };
}
```

Extend the `ConfiguratorAction` union with a new variant:
```ts
| { kind: "restore"; originalActionId: string }
```

Note: this requires the underlying artifact services to support a few
new entry points that aren't there today:
- `ArtifactsService.upsertLesson` (for re-create-after-delete)
- `ArtifactsService.upsertGate` (same)
- `MemoryService.upsertMastery` (for memory.reset_concept restore)
- `MemoryService.upsertMisconception` (for memory.clear_misconception restore)

These are additive — the existing create/update/delete trio doesn't cover
"restore to arbitrary prior shape including the row's existence flag." A
sub-task in Unit 5 adds these.

**Acceptance**:
- [ ] `restoreAction` rolls back every snapshottable action kind to the
      exact pre-mutation state, verified by per-kind round-trip tests.
- [ ] Calling `restoreAction` twice on the same actionId returns
      `{ ok: false, reason: "already_restored" }` the second time.
- [ ] After restore, a new `restore`-kind row appears in
      `configurator_actions` with `originalActionId` set.
- [ ] The new `restore` action itself has a snapshot row, enabling
      un-revert.

### Unit 6: IPC + client surface

**File**: `packages/desktop/electron/main/authoring-channel.ts` (modified)
**File**: `packages/client/src/authoring.ts` (modified)

Add channels following `ipc-channel-convention`:

- `praxis.authoring.restoreAction` — invoke(`{ actionId }`) →
  `RestoreResult` (wrapped in the standard envelope via
  `wrapEnvelope`).
- Existing `praxis.authoring.listActions` extended to surface the
  `restoredAt` and `originalActionId` fields so the UI can render
  "restored" pills and `restore`-kind rows.

Client method:
```ts
async restoreAction(input: { actionId: string }): Promise<RestoreResult>
```

**Acceptance**:
- [ ] Channel round-trips through the IPC layer; envelope error path
      tested with an invalid actionId.
- [ ] Client method threads the call end-to-end against a real
      desktop session via a Vitest IPC harness test.

## Implementation Order

The work splits along service-layer vs IPC-binding seams. Two stories,
sequential:

1. **Story A** —
   `epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore`:
   Units 1–5 (schema, types, capture helper, AuthoringServiceImpl
   integration, restoreAction). Lands the full snapshot infrastructure
   inside the service boundary. Tests cover round-trip per action kind.
2. **Story B** —
   `epic-backend-fills-for-redesign-snapshot-restore-ipc`: Unit 6 only.
   Depends on Story A. Lands the IPC channel + client method consumed
   by the drafter-configurator-chat feature.

## Testing

- **Per-kind round-trip** (Story A): for each `ConfiguratorAction['kind']`
  except `memory.export` / `memory.delete_all`, write a test that:
  (a) reads pre-state, (b) executes the mutation, (c) calls
  `restoreAction`, (d) asserts post-restore state matches pre-state via
  deep equality. Use `useTempDb` per `temp-db-test-helper`.
- **Double-restore idempotency**: call restore twice; second returns
  `already_restored`.
- **Un-revert**: restore the restore action — confirms the new
  `restore`-action snapshot supports re-applying the original mutation.
- **IPC harness** (Story B): use `electron-ipc-test-harness` to call
  `restoreAction` through the channel; assert envelope shape on success
  and on invalid actionId.

## Risks

- **`memory.reset_concept` restore is broader than expected.** Resetting
  a concept's mastery might cascade through misconceptions or BKT
  state. The capture must include every row the original `resetConcept`
  touched. Mitigation: read the resetConcept implementation during
  Story A and confirm the capture surface includes all affected rows;
  if it cascades into BKT history, document the limitation and
  consider not snapshotting that kind in v1.
- **Schema evolution invalidates snapshots.** Stored snapshot JSON is
  the shape of `Course` / `Lesson` / `Gate` at write-time. A breaking
  schema change later would mean stale snapshots can't restore cleanly.
  Mitigation: include a `schemaVersion` field in the JSON header; on
  restore, refuse with `{ ok: false, reason: "schema_drift" }` if the
  version doesn't match. Add this in Story A.
- **Snapshot row storage cost.** Each mutation doubles the audit-row
  cost (action + snapshot). For tens-to-hundreds of mutations per
  configurator session this is negligible. If it grows, add a
  retention sweep — out of scope for v1.

## Children complete (2026-05-18)

Both child stories reached `stage: done`. Feature advanced to `stage: review`.

- `epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore` — done
- `epic-backend-fills-for-redesign-snapshot-restore-ipc` — done (blocker fixed inline: left-join null-guard in `listConfiguratorActions`)
