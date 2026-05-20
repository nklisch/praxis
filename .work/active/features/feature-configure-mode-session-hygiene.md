---
id: feature-configure-mode-session-hygiene
kind: feature
stage: done
tags: [ui, ux, sessions]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Configure-mode session hygiene

## Brief
Configure-mode sessions are leaking into the library UI and/or spawning a
fresh session every time a configuration tab opens, which clutters session
listings with throwaway authoring sessions. The two possible fixes target the
same surface but have different UX consequences:

- **Suppress configure sessions from library views.** Library listings filter
  out sessions whose `mode.kind === "configure"` (or similar). Per-tab session
  creation behavior stays as-is. Cheaper; configure sessions remain ephemeral
  but no longer pollute the catalog.
- **Reuse a single configure session per scope.** Each configure target
  (course / lesson / etc.) gets at most one live configure session; opening
  another configure tab for the same scope re-attaches the existing session.
  Bigger behavioral change but cleaner long-term — fewer orphaned rows, and
  configure-mode episodic history stays cohesive per scope.

## Strategic decisions
- **Suppress-vs-reuse**: resolved below in `## Design decisions`.

## Design decisions
- **Approach**: Reuse a single global configure session per student — combined
  with library suppression. On configure-route mount, look up the latest
  active (not-ended) configure session for the student; if one exists,
  re-attach to it via `client.session.open`; if not, start a fresh one. The
  library `session.list` query filters out `modeId === "configure"` so the
  configure session never appears in the rolling history. Configure has no
  natural per-target scope key today (no `courseId`/`assignmentId`), so the
  reuse key is the student id.
- **Student-driven reset**: Add an explicit "Clear / restart configure session"
  control somewhere in the configure UI (header action or settings dropdown).
  When invoked, end the current configure session (`session.end`) and start a
  fresh one. This is the user's escape hatch for a polluted configure context
  (bad past turns, stale memory, etc.) — required because the auto-reuse
  collapses configure history into a single rolling thread that the user
  needs a way to break.
- **Existing dangling rows**: Hard-delete old configure sessions on first run.
  Add a startup migration (or one-shot service-init step) that issues
  `DELETE FROM sessions WHERE modeId = 'configure'`. Configure sessions have
  no preserved-history value (they're authoring scratchpads), and the user
  prefers a clean slate. The migration runs once; subsequent runs no-op via
  a `config_kv` flag or schema-version bump.

## Mockups
_Skip — the only net-new affordance is a "Clear / restart" button placed in
the existing configure-route header (minor composition reusing existing
button primitives). Library filtering and session reuse are behind the
existing list UI._

## Architectural choice

**Extend the existing `session.active()` and `session.list()` APIs with
optional mode filters, rather than introducing parallel methods.** Both
methods already filter by `studentId` and order by `startedAt desc`; adding
`opts.modeId` (for active) and `opts.excludeModeIds` (for list) keeps the
API surface flat and the query logic in one place. Configure-route reuse
becomes a one-line client call; library suppression becomes a one-line
hook update. Hard-delete of existing rows ships as a one-statement
Drizzle migration — no code-level flag needed because Drizzle's migration
table is the idempotency record.

Rejected alternatives:
- *New `getActiveByModeId(modeId)` method* — duplicates `active()`'s
  student-scoping and ordering. Two near-identical queries to maintain.
- *Client-side filter in the library hook* — works, but breaks pagination
  semantics (LIMIT applied before the filter). Server-side is the only
  correct place when `limit` is in play.
- *Code-level `config_kv` flag for the cleanup* — works, but adds a
  long-lived idempotency record for a one-shot delete that Drizzle's
  migration tracker already handles cleanly.

## Implementation Units

### Unit 1: Drizzle migration — delete existing configure sessions

**File**: `drizzle/0025_configure_session_cleanup.sql` (new)
**Story**: `story-configure-cleanup-migration`

```sql
-- Hard-delete legacy configure sessions accumulated before the reuse-per-student
-- + library-suppression behavior shipped. Configure sessions are authoring
-- scratchpads with no preserved-history value; a clean slate is preferred.
-- The `sessions` cascade rules clean up dependent rows (episodic_events,
-- mastery_*, etc.) — verify the FK cascade ON DELETE before assuming.
DELETE FROM sessions WHERE mode_id = 'configure';
```

**Implementation Notes**:
- Verify the cascade: `sessions` has dependents (episodic events, mastery
  projections, etc.). If those don't `ON DELETE CASCADE`, the migration
  must `DELETE FROM <child_table> WHERE session_id IN (SELECT id FROM
  sessions WHERE mode_id = 'configure')` first — implementer reads the
  schema and decides. The migration file may need additional DELETEs.
- Generate the migration via `pnpm db:generate` if the workflow expects
  it, or hand-author the SQL file and let the migrator pick it up. Match
  existing `drizzle/` style (look at `0024_rename-bootstrap-config-key.sql`
  for the hand-authored shape).
- Update `drizzle/meta/_journal.json` if `pnpm db:generate` doesn't.

**Acceptance Criteria**:
- [ ] `pnpm db:migrate` applies the migration without error
- [ ] After migration on a DB with prior configure rows: `SELECT COUNT(*)
      FROM sessions WHERE mode_id = 'configure'` returns 0
- [ ] No dangling FK rows remain (verify dependent tables)
- [ ] Migration is idempotent (Drizzle's `__drizzle_migrations` tracker
      handles re-runs)

---

### Unit 2: Extend `SessionService.active` with optional mode filter

**File**: `packages/core/src/services/session-service.ts`
**Story**: `story-session-active-mode-filter`

```ts
// Old
async active(): Promise<SessionHandle | null>

// New
async active(opts?: { modeId?: string }): Promise<SessionHandle | null>
```

Plus the IPC channel schema in
`packages/desktop/electron/main/session-channel.ts` (the
`praxis.session.active` registration at line ~48-49 currently uses
`wrapEnvelope` with no payload schema — switch to `handleEnvelope` with
a Zod schema accepting `{ modeId?: string }` or keep as-is and pass the
opts through, matching whatever wrapping pattern the channel already
uses for paramless RPCs that gain a param).

And the client method in `packages/client/src/`:

```ts
// Old
session.active(): Promise<SessionHandle | null>

// New
session.active(opts?: { modeId?: string }): Promise<SessionHandle | null>
```

**Implementation Notes**:
- Add an optional `and(eq(sessions.modeId, opts.modeId))` to the WHERE
  clause when `opts?.modeId` is provided. Keep the existing
  `studentId` + `isNull(endedAt)` predicates.
- `desc(startedAt) LIMIT 1` is implicit in `.get()` after the orderBy —
  preserve that order.
- Backward compatibility: calls without args behave exactly as today
  (most-recent open session for the student, regardless of mode).
- The optional payload changes the IPC schema. If the channel currently
  has no schema (paramless), introduce one with `z.object({ modeId:
  z.string().optional() }).optional()`. Use the `ipc-envelope-handler`
  pattern (`handleEnvelope` with `withSchema`) for validation.

**Acceptance Criteria**:
- [ ] `active()` returns the most-recent open session for the student
      (unchanged behavior)
- [ ] `active({ modeId: 'configure' })` returns the most-recent open
      configure session for the student, or `null` if none
- [ ] `active({ modeId: 'configure' })` ignores sessions of other modes
- [ ] `active({ modeId: 'configure' })` ignores ended (`endedAt != null`)
      configure sessions
- [ ] Unit test in `packages/core/src/services/__tests__/session-service.test.ts`
      (or new file) covers: no sessions → null; one ended configure session
      → null; one open configure session → that session; multiple open
      configure sessions → the most recent; open session of a different
      mode → null
- [ ] IPC envelope test in `packages/desktop/electron/main/__tests__/`
      covers the `modeId` filter round-trip
- [ ] No regression on existing `active()` callers

---

### Unit 3: Extend `SessionService.list` with `excludeModeIds` filter + wire library

**File**: `packages/core/src/services/session-service.ts` (list method),
`packages/desktop/electron/main/session-channel.ts` (list channel schema),
`packages/client/src/` (list client method),
`packages/ui/src/hooks/use-library.ts` (consumer)
**Story**: `story-session-list-exclude-modes`

```ts
// Old
async list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]>

// New
async list(opts?: {
  includeEnded?: boolean;
  limit?: number;
  excludeModeIds?: string[];
}): Promise<SessionSummary[]>
```

Library hook update:

```ts
// packages/ui/src/hooks/use-library.ts:41 (current)
client.session.list({ limit: 10, includeEnded: true })

// After
client.session.list({ limit: 10, includeEnded: true, excludeModeIds: ["configure"] })
```

**Implementation Notes**:
- Use Drizzle's `notInArray(sessions.modeId, opts.excludeModeIds)`
  predicate when `excludeModeIds` is non-empty. Compose into the existing
  `where` via `and(...)`.
- Server-side filtering matters because `limit` is applied at the DB
  level — client-side filtering would silently shrink the page below the
  caller's `limit`.
- Update the IPC `praxis.session.list` request schema to accept the
  optional array. Strings only — no need for a discriminated union.

**Acceptance Criteria**:
- [ ] `list()` without `excludeModeIds` returns everything (unchanged
      behavior)
- [ ] `list({ excludeModeIds: ["configure"] })` omits all configure
      sessions from results
- [ ] `list({ excludeModeIds: ["configure", "exam"] })` omits both
      (multi-mode exclusion works)
- [ ] `excludeModeIds: []` is a no-op (returns everything)
- [ ] Library UI session listing no longer shows configure sessions
- [ ] Unit tests in `session-service.test.ts` cover empty / single /
      multi exclusion paths
- [ ] UI test for `useLibrary` (via fake client) asserts the call
      includes `excludeModeIds: ["configure"]`

---

### Unit 4: Configure-route reuse on mount + "Clear / restart" control

**File**: `packages/ui/src/routes/configure.tsx` (mount logic + header
control), `packages/ui/src/routes/configure.module.css` (button styling
if needed)
**Story**: `story-configure-route-reuse-and-reset`
**depends_on**: `story-session-active-mode-filter`

```tsx
// On mount (replacing the unconditional spawn at ~line 267)
useEffect(() => {
  let cancelled = false;
  (async () => {
    const existing = await client.session.active({ modeId: "configure" });
    if (cancelled) return;
    if (existing) {
      setSession(existing);
      return;
    }
    const fresh = await client.session.start({ modeId: "configure" });
    if (cancelled) return;
    setSession(fresh);
  })();
  return () => { cancelled = true; };
}, []);
```

```tsx
// "Clear / restart" control — header button or menu item.
// Uses Modal primitive for the confirm dialog (modal-primitive pattern).
async function handleClearRestart() {
  if (!session) return;
  await client.session.end({ sessionId: session.sessionId });
  const fresh = await client.session.start({ modeId: "configure" });
  setSession(fresh);
}
```

**Implementation Notes**:
- The mount effect's `cancelled` guard prevents setState on an unmounted
  component if the user navigates away during the async lookup.
- The "Clear / restart" control should have a confirm step (it's
  destructive — ends a live session). Use the existing `<Modal>`
  primitive for the confirm dialog (per `modal-primitive` pattern).
- Place the button in the route header where existing route headers
  put their actions (look at adjacent routes for consistent placement).
- Reset clears the cached `setSession` state and replaces it with the
  fresh handle — no manual re-render needed.

**Acceptance Criteria**:
- [ ] On mount with no existing active configure session: a fresh
      session is started (current behavior preserved as fallback)
- [ ] On mount with an existing active configure session: the existing
      session is re-attached, no new session spawned
- [ ] Opening configure in two tabs back-to-back (same student): both
      tabs attach to the same configure session
- [ ] "Clear / restart" control is present in the configure route header
- [ ] Clicking it opens a confirm modal
- [ ] Confirming ends the current session and starts a fresh one;
      cancelling does nothing
- [ ] UI test (fake client) covers the reuse-vs-spawn branch on mount
      and the reset-control flow

---

## Implementation Order

The dependency graph:

```
story-configure-cleanup-migration       (no deps)
story-session-active-mode-filter        (no deps)
story-session-list-exclude-modes        (no deps)
story-configure-route-reuse-and-reset   (depends_on: story-session-active-mode-filter)
```

Wave 1 (parallel, 3 agents): cleanup-migration, active-mode-filter,
list-exclude-modes.

Wave 2 (1 agent): configure-route-reuse-and-reset.

## Testing

### Unit tests
- `packages/core/src/services/__tests__/session-service.test.ts` — new
  cases for `active({ modeId })` and `list({ excludeModeIds })`.
- `packages/desktop/electron/main/__tests__/session-channel-*.test.ts` —
  envelope tests for both updated channels.
- `packages/ui/src/components/__tests__/` or
  `packages/ui/src/routes/__tests__/` — `configure.tsx` mount-path
  branches and the reset control.

### Integration test (manual smoke)
1. Open the desktop app, navigate to `/configure`. Note the session id.
2. Navigate away and back. Confirm the same session id is attached
   (look at devtools / hover state on the URL).
3. Open the library. Confirm no configure session in the listing.
4. Click "Clear / restart" in configure header. Confirm modal appears.
   Confirm. Note the new session id (different from the previous).

## Risks

- **Race on simultaneous mount.** Two configure tabs opened in the same
  ~50ms window: both `active()` queries return null before either
  `start()` resolves, so both spawn fresh sessions for the same student.
  Result: two parallel configure sessions. Accepted for v1 — rare in
  practice; the next migration / cleanup-on-end can sweep. If it becomes
  observable, add a server-side `acquireOrStart` method that's atomic
  under SQLite's serializable transaction model.
- **Reuse attaches to a session mid-turn.** If the user opens a configure
  tab while a previous configure tab is streaming a turn, the new tab
  attaches to the live session. The engine-session-lifecycle pattern
  resumes naturally (the in-progress turn continues to stream); the
  tab-body-isolation pattern preserves per-tab state. Not a real risk —
  documented for clarity.
- **Migration cascade.** If `sessions` dependents don't have `ON DELETE
  CASCADE` configured at the FK level, the migration must explicitly
  delete child rows first or the FK constraints will error. Unit 1
  implementation notes flag this — the implementer must verify before
  writing the DELETE.

## Implementation summary (2026-05-19)

All 4 child stories landed and are at `stage: review`:
- `story-configure-cleanup-migration` — `drizzle/0025_configure_session_cleanup.sql` (single DELETE; FK cascade verified clean)
- `story-session-active-mode-filter` — extended `SessionService.active(opts?: { modeId? })` + IPC + client (commit `fb42c9a`)
- `story-session-list-exclude-modes` — extended `SessionService.list(opts?: { ..., excludeModeIds? })` + IPC + client + wired `useLibrary` to exclude configure (commit `2ee2ce8`)
- `story-configure-route-reuse-and-reset` — configure-route mount path now reuses-or-spawns; Clear / restart button in tab bar; confirm Modal (commit `64f35d8`)

Verification: 4579 tests pass, no regressions. The pre-existing `TS2741` in `tests/configure-end-to-end.test.ts` (`AuthoringServiceDeps.conceptMaps` missing) remains; tracked as `idea-configure-end-to-end-conceptmaps-missing` in backlog. Pre-existing lint failures in `.mockups/` HTML remain unchanged.
