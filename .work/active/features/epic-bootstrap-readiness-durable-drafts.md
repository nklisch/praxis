---
id: epic-bootstrap-readiness-durable-drafts
kind: feature
stage: implementing
tags: [bootstrap, persistence]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Durable bootstrap drafts

## Brief

Today `BootstrapServiceImpl` holds the in-progress draft in
`private readonly drafts = new Map<string, DraftCourseState>()`
(`packages/core/src/services/bootstrap-service.ts:68`). The Map dies with the
process — close the app mid-bootstrap, crash the explorer agent, or hit a
timeout during a `course.start_exploration` re-run, and the student loses
every concept, edge, and lesson they've accumulated. With drafts often
30-90s of explorer work plus several rounds of human-driven refinement,
losing them in v0.1.0 is the difference between bootstrap feeling like
"authoring" and "Russian roulette."

This feature moves the draft store from in-memory to SQLite-backed durable
storage so partial courses survive restarts, crashes, and explorer
timeouts. The student can close the app, reopen, and resume the same draft
they were editing. The schema mirrors the existing `DraftCourseState`
contract (units, lessons, concepts, edges, assessment shells, plus draft
metadata: `draftId`, `createdAt`, `updatedAt`, `confirmedAt | null`,
`discardedAt | null`) and lives in `packages/core/src/schema.ts`. `persistDraft`
keeps its role at confirm time — flipping `confirmedAt` from null and
materialising the artifact tables in the same transaction — and adds a
discard path that flips `discardedAt`.

The feature does NOT add new draft-mutation ops (that's
`epic-bootstrap-readiness-expressive-draft-api`), does not change the
ergonomics of `course.show_draft` / `course.edit_draft` from the agent's
point of view (same shape, same calls), and does not touch the explorer
agent itself.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: foundation feature — the expressive-draft-api feature
  builds on top of this. Shipping durable drafts first means the new ops
  land on the persistent store directly, avoiding a Map→SQLite migration
  for ops that don't exist yet.

## Foundation references
- `docs/ARCHITECTURE.md:331-335` — bootstrap mode is agentic;
  `persistDraft` currently materialises units + lessons + assessment
  shells in one transaction on confirmation. After this feature,
  `persistDraft` continues to do that — but the source-of-truth draft
  store is the database, not a process-local Map.
- `packages/core/src/services/bootstrap-service.ts:68` — the Map to
  replace.
- `packages/core/src/services/bootstrap-service.ts:915-924` —
  `persistDraft` signature; preserve.
- Prior shipped feature: `feature-bootstrap-drafts-streaming` in
  `.work/releases/v0.1.0/` — established the streaming-events shape and
  the `DraftCourseState` contract that this feature persists.

## Originating backlog
- `idea-persist-partial-courses` — consumed by this feature; will be
  removed from `.work/backlog/` as part of epic-design.

## Architectural choice

**One row per draft, indexed columns + JSON blob for state.** Mirrors the
`sessions` table pattern at `packages/memory/src/schema.ts:19-54`:
indexed columns for the few queries we actually run
(student-scoped list, stale-draft sweep, confirmed-vs-discarded filter), and
the rest of `DraftCourseState` lives in a single `state_json` blob.

Alternatives considered:

- **Single-blob (no indexed columns).** Simplest, but loses the cheap
  `WHERE studentId = ? AND confirmedAt IS NULL` query that powers
  "list active drafts" and the sweep. Rejected.
- **Normalized tables** (`draft_concepts`, `draft_lessons`, …). Real
  queryability, but: `DraftCourseState` shape evolves through every
  feature in this epic (the next feature, `expressive-draft-api`, adds
  new ops), and re-migrating per ProposedCourse change is a migration
  treadmill. The whole-state blob isolates schema evolution to plain
  TypeScript types. Also: `editDraft(op: DraftEditOp)` is already
  whole-state-replace semantics in the in-memory Map, so the blob shape
  doesn't lose anything. Rejected for v1; revisit only if blob size
  measurably hurts.

The whole-state-replace pattern on mutation is fine at our scale (single
process, drafts ≤ ~100KB, mutations ≤ ~100 per explorer pass). If
sustained writes ever exceed ~10/s on a large draft we revisit, but
that's well above the agent's actual cadence.

## Implementation Units

### Unit 1: `drafts` table schema + migration

**File**: `packages/core/src/schema.ts` (extend) and a generated migration
in `drizzle/` (will be `0009_*.sql`).

**Story**: `story-epic-bootstrap-readiness-durable-drafts-store`

```typescript
// packages/core/src/schema.ts — new export

/**
 * Durable per-student draft course state for the bootstrap explorer.
 * One row per in-flight draft. Indexed columns support student-scoped
 * list and stale-draft sweep; `state_json` carries the
 * `DraftCourseState` shape so the schema is stable as ProposedCourse
 * evolves through the rest of this epic.
 *
 * Lifecycle:
 *   created       → row inserted; confirmedAt = null, discardedAt = null
 *   active edits  → lastTouchedAt bumped, state_json replaced atomically
 *   confirmed     → confirmedAt set; row retained for audit (gc later)
 *   discarded     → discardedAt set; row retained briefly then gc'd
 *
 * `confirmedAt` and `discardedAt` are mutually exclusive — at most one
 * is non-null. A row with both null is "active."
 */
export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    /** ms epoch — first creation time, immutable. */
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    /** ms epoch — last write or read access. Drives the stale sweep. */
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    /** Set by confirmDraft on successful persist. */
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    /** Set by discardDraft (manual or sweep). */
    discardedAt: integer("discarded_at", { mode: "timestamp_ms" }),
    /** Resulting course id when confirmed. */
    courseId: text("course_id"),
    /** JSON blob: { proposed: ProposedCourse, documentIds: DocumentId[] }. */
    stateJson: text("state_json", { mode: "json" }).notNull(),
  },
  (t) => ({
    studentTouchedIdx: index("drafts_student_touched_idx").on(t.studentId, t.lastTouchedAt),
    activeSweepIdx: index("drafts_active_sweep_idx").on(t.lastTouchedAt),
  }),
);
```

Register in `coreSchema`:
```typescript
export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
  configuratorActions,
  drafts, // ← new
};
```

Then `pnpm db:generate` → produces `drizzle/0009_<name>.sql`.

**Acceptance**:
- [ ] `pnpm db:generate` produces a clean migration containing only the
      `drafts` table + indices.
- [ ] `pnpm db:migrate` applies cleanly against a fresh DB.
- [ ] `drafts` is exported from `coreSchema` and reachable via
      `import { drafts } from "@praxis/core/schema"`.
- [ ] No other migration is touched.

---

### Unit 2: `DraftStore` port + `SqliteDraftStore` adapter

**File**: `packages/core/src/services/draft-store.ts` (new)

**Story**: `story-epic-bootstrap-readiness-durable-drafts-store`

```typescript
import type { PraxisDb } from "../db/index.js";
import type { DraftCourseState, StudentId } from "../types/index.js";

/**
 * Port: durable CRUD over the bootstrap draft store. BootstrapServiceImpl
 * stays the owner of mutation logic (pure functions on DraftCourseState);
 * this port handles the read/write halves so the service is a thin
 * read-mutate-write wrapper rather than a stateful Map.
 */
export interface DraftStore {
  /** Load a draft by id. Returns null if missing, confirmed, or discarded. */
  load(draftId: string): DraftCourseState | null;
  /** Insert or replace the draft state. Caller supplies the new state. */
  save(draft: DraftCourseState): void;
  /** Active drafts for one student, lastTouchedAt DESC. */
  listForStudent(studentId: StudentId): readonly DraftCourseState[];
  /** Active drafts for all students. Used by the IPC outline subscribers. */
  listActive(): readonly DraftCourseState[];
  /** Bump lastTouchedAt without re-serializing the blob. */
  touch(draftId: string): void;
  /** Mark confirmed in the SAME transaction as persistDraft (see Unit 3). */
  markConfirmedTx(tx: PraxisDb, draftId: string, courseId: string): void;
  /** Mark discarded (manual or sweep). Out-of-tx because no other write follows. */
  markDiscarded(draftId: string): void;
  /**
   * Sweep stale active rows (`lastTouchedAt < cutoff`). Marks each
   * discarded with `discardedAt = now`. Returns the ids that were swept
   * so the caller can emit `discarded` events.
   */
  sweepStale(cutoff: number): readonly string[];
}

export class SqliteDraftStore implements DraftStore {
  constructor(private readonly db: PraxisDb) {}
  // Implementations: drizzle queries against the `drafts` table.
  // load(): WHERE id = ? AND confirmedAt IS NULL AND discardedAt IS NULL
  // save(): INSERT ... ON CONFLICT(id) DO UPDATE state_json/lastTouchedAt
  // listForStudent(): WHERE studentId AND active, ORDER BY lastTouchedAt DESC
  // listActive(): WHERE active, ORDER BY lastTouchedAt DESC
  // touch(): UPDATE lastTouchedAt = now WHERE id = ? AND active
  // markConfirmedTx(tx): UPDATE confirmedAt = now, courseId = ?
  // markDiscarded(): UPDATE discardedAt = now WHERE id = ? AND active
  // sweepStale(): UPDATE discardedAt = now WHERE active AND lastTouchedAt < cutoff;
  //   RETURNING id (or SELECT-then-UPDATE on dialects without RETURNING)
}
```

**Implementation Notes**:
- The `state_json` column uses Drizzle's `mode: "json"` so the driver
  handles serialize/deserialize. The TS type narrowing back to
  `DraftCourseState` is `as DraftCourseState` at the read boundary —
  Drizzle returns `unknown` from json columns by default.
- `markConfirmedTx` takes a transaction handle because confirmDraft
  needs the markConfirmed write inside the same transaction as
  `persistDraft` (Unit 3 explains why).
- Other writes don't need to be transactional with anything else, so
  they take the bare `db` and run as auto-committed statements.

**Acceptance**:
- [ ] `save(d)` then `load(d.draftId)` returns a state byte-equivalent
      to the saved input (excluding `lastTouchedAt`, which is bumped).
- [ ] `load()` returns null for rows where `confirmedAt` or
      `discardedAt` is set.
- [ ] `listForStudent` filters by `studentId`, excludes terminal rows,
      orders by `lastTouchedAt` DESC.
- [ ] `markConfirmedTx` inside a rolled-back transaction leaves the row
      active.
- [ ] `markDiscarded` makes subsequent `load()` return null.
- [ ] `sweepStale(cutoff)` discards rows with `lastTouchedAt < cutoff`,
      leaves fresher rows untouched, and returns the swept ids.

---

### Unit 3: `BootstrapServiceImpl` swap from Map to `DraftStore`

**File**: `packages/core/src/services/bootstrap-service.ts` (modify)

**Story**: `story-epic-bootstrap-readiness-durable-drafts-integration`

Replace `private readonly drafts = new Map<...>()` with
`private readonly store: DraftStore`. Every mutator becomes a
read-mutate-write trio:

```typescript
async addConcept(input: {...}) {
  const d = this.store.load(input.draftId);
  if (!d) return { ok: false, reason: "draft not found or expired" };
  // ... pure mutation on d.proposed (same logic as before) ...
  d.lastTouchedAt = Date.now() as Timestamp;
  this.store.save(d);
  this.emit({ kind: "updated", draft: d });
  return { ok: true, conceptCount: d.proposed.proposedConcepts.length };
}
```

Three subtleties that the test suite must lock down:

1. **Transactional confirm.** `confirmDraft` already runs `persistDraft`
   in a `db.transaction((tx) => { … })`. The `confirmedAt` flip must
   happen inside the same `tx`, otherwise a failure between persist and
   flip leaves an orphan course OR an orphan active draft. Wire it:

   ```typescript
   const result = this.deps.db.transaction((tx) => {
     const r = persistDraftTx({ tx, draft: d, now });
     this.store.markConfirmedTx(tx, input.draftId, r.courseId);
     return r;
   });
   ```

   Requires updating `persistDraft` to accept a `tx` parameter rather
   than starting its own transaction. Backwards-compatible — keep a
   wrapper `persistDraft({db, …})` that starts a tx and delegates to
   `persistDraftTx({tx, …})` for any callers outside confirmDraft.

2. **TTL semantics change.** In-memory drafts expired after 2 hours of
   no touches. Durable drafts persist across restarts, so the sweep
   cutoff becomes 7 days. Update `DRAFT_TTL_MS = 2 * 60 * 60 * 1000` →
   `DRAFT_STALE_MS = 7 * 24 * 60 * 60 * 1000` and rename the constant
   for clarity. Sweep cadence stays at 60s (sweep is cheap — an
   indexed UPDATE).

3. **`shutdown()` must NOT clear the store.** The Map version did
   `this.drafts.clear()`. The durable version drops the in-process
   listeners + sweep timer ONLY. Drafts survive restarts by design.

**Implementation Notes**:
- `BootstrapServiceDeps` gains an optional `draftStore?: DraftStore`
  for test injection. Default is `new SqliteDraftStore(deps.db)`.
- `list()` (snapshot used by IPC subscribers) reads from
  `store.listActive()` instead of iterating the Map.
- `subscribe()` snapshot likewise — listeners get the current durable
  state on subscribe.

**Acceptance**:
- [ ] Every mutator method round-trips through the store
      (load → mutate → save). No code path keeps an in-process copy
      beyond the duration of a single method call.
- [ ] `confirmDraft` is atomic: a `persistDraft` failure in the
      transaction leaves `confirmedAt` null (verify by injecting a
      failing `courseDocuments.attachMany` after the tx and a separate
      injected failure inside the tx).
- [ ] `shutdown()` does NOT delete any draft rows.
- [ ] `sweepStale` fires every 60s, emits `discarded` events for swept
      drafts, never touches confirmed/discarded rows.

---

### Unit 4: Restart-survival smoke + listActiveForStudent

**File**: `packages/core/src/services/bootstrap-service.ts` (extend)

**Story**: `story-epic-bootstrap-readiness-durable-drafts-integration`

Add a public method:

```typescript
/**
 * List a student's active drafts. Powers resume-mid-flow UX: on app
 * start, the renderer can call this to show "you have a draft in
 * progress."
 */
listActiveForStudent(studentId: StudentId): readonly DraftCourseState[] {
  return this.store.listForStudent(studentId);
}
```

The pre-existing `BootstrapService` interface (in `packages/core/src/types/`)
gets this method added. Update both interface and impl.

**Acceptance**:
- [ ] `bootstrap.listActiveForStudent(studentId)` returns active drafts
      for that student, ordered by lastTouchedAt DESC.
- [ ] Smoke test: instantiate service A, create draft, dispose service
      A, instantiate service B over the same DB, call
      `listActiveForStudent` — returns the draft from service A.

---

### Unit 5: Tests

**Story**: `story-epic-bootstrap-readiness-durable-drafts-store` (store
tests) + `story-epic-bootstrap-readiness-durable-drafts-integration`
(service tests).

**Files**:
- `packages/core/src/__tests__/draft-store.test.ts` (new) — `SqliteDraftStore` round-trip tests.
- `packages/core/src/__tests__/bootstrap-service-durability.test.ts` (new) — restart-survival, atomic confirm, sweep behaviour.
- Existing `packages/core/src/__tests__/bootstrap-service.test.ts` keeps passing — the swap is internal-equivalent for its inputs (it uses
  `useTempDb()` already so the durable store works under the same fixture).

**Test approach for the store**:
- Save → load round-trip preserves the `DraftCourseState` shape exactly.
- Save with replacing content updates `lastTouchedAt`, keeps `createdAt`.
- `listForStudent` returns only active drafts for the asked student.
- `markConfirmedTx` rolled back via the tx leaves the row active.
- `markDiscarded` + subsequent `load()` returns null.
- `sweepStale(cutoff)` discards stale rows, leaves fresh rows, returns
  swept ids.

**Test approach for service integration**:
- All mutators: load → mutate → save with the durable store backing
  them produces the same outputs the Map-based version did.
- `confirmDraft` happy path: writes course rows AND flips `confirmedAt`
  atomically.
- `confirmDraft` failure inside tx: course rows NOT written AND
  `confirmedAt` stays null. (Inject a failing schema FK by passing a
  document id that's not in `documents` — `attachMany` will fail. Verify
  draft is still loadable.) Actually `attachMany` runs OUTSIDE the
  transaction today (post-persistDraft); the right injection point is
  inside `persistDraftTx` — pass a draft with an empty `proposedConcepts`
  but a lesson referencing a concept, which triggers a thrown error from
  the existing FK validation. Confirm the transaction rolls back and
  draft stays active.
- Restart survival: write → new service over same db → showDraft
  returns identical state.
- Sweep: pre-seed a draft with `lastTouchedAt` 8 days old → instantiate
  service → wait for one sweep cycle → draft is now discarded, event
  emitted.

## Implementation Order

1. **Unit 1** (schema + migration) — foundation, blocks everything.
2. **Unit 2** (`DraftStore` + `SqliteDraftStore`) — built against Unit 1.
3. **Unit 3** (service swap from Map to store) — built against Unit 2.
4. **Unit 4** (`listActiveForStudent`) — trivial, lands alongside Unit 3.
5. **Unit 5** (tests) — co-developed with each unit; store tests under
   Story 1 (with Units 1–2), service tests under Story 2 (with Units 3–4).

## Testing

### Unit Tests: `packages/core/src/__tests__/draft-store.test.ts`
- Round-trip save/load
- listForStudent ordering + filtering
- markConfirmedTx rollback semantics
- markDiscarded → load returns null
- sweepStale: stale rows discarded, fresh untouched

### Unit Tests: `packages/core/src/__tests__/bootstrap-service-durability.test.ts`
- Restart-survival: service A → service B over same DB → draft visible.
- confirmDraft atomicity: tx failure leaves draft active.
- sweep cycle emits `discarded` events for stale drafts.
- shutdown() does not delete draft rows.

### Integration: existing `bootstrap-service.test.ts`
- All existing tests pass unchanged. The temp-DB fixture they already
  use makes the durable swap transparent.

## Risks

- **JSON serialization cost on every mutation.** Each `addConcept` /
  `addLesson` / etc. now does one INSERT-OR-REPLACE with a full
  state_json blob. A 100KB blob × 100 mutations per explorer pass =
  ~10MB of serialization, mostly fine on better-sqlite3 (synchronous,
  ~1ms per write). If this bites in practice, mitigations: (a) batch
  mutations in the explorer adapter, (b) move to normalized tables in
  a future refactor. Not a v1 blocker; flag in tests if any test
  exceeds 100ms in the mutator path.
- **Multi-process concurrency.** SQLite handles last-writer-wins
  naturally, but if two processes ever write the same draft
  simultaneously one's mutation is lost. Praxis is single-process for
  v1; revisit if multi-process bootstrap becomes a thing.
- **TTL behaviour change.** In-memory drafts expired after 2 hours
  silently. Durable drafts hang around for 7 days and are visible in
  `listActiveForStudent` until then. This is the *intended* change —
  the student can resume. Document the new behavior in a `## Behavior`
  section of the bootstrap mode prompt fragment so it's discoverable.
  (Not a blocker; flag for the prompt-no-inline-outline story to pick
  up.)
