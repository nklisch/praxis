---
id: story-session-active-mode-filter
kind: story
stage: done
tags: [core, sessions, ipc]
parent: feature-configure-mode-session-hygiene
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Extend `SessionService.active` with optional `modeId` filter

## Brief
Extend the existing `SessionService.active()` method, its IPC channel
(`praxis.session.active`), and the client method `client.session.active` to
accept an optional `{ modeId?: string }` filter. When `modeId` is provided,
the query returns the most-recent open session of that mode for the student,
or `null` if none. When omitted, behavior is unchanged.

Enables the configure-route reuse path (story-configure-route-reuse-and-reset)
to look up "the student's current open configure session" with one call.

## Implementation

### `packages/core/src/services/session-service.ts` — service method

Current (line ~293-312):

```ts
async active(): Promise<SessionHandle | null> {
  const studentId = getOrCreateDefaultStudentId(this.deps.db);
  const row = this.deps.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.studentId, studentId), isNull(sessions.endedAt)))
    .orderBy(desc(sessions.startedAt))
    .get();
  if (!row) return null;
  return { /* SessionHandle shape */ };
}
```

After:

```ts
async active(opts?: { modeId?: string }): Promise<SessionHandle | null> {
  const studentId = getOrCreateDefaultStudentId(this.deps.db);
  const predicates = [eq(sessions.studentId, studentId), isNull(sessions.endedAt)];
  if (opts?.modeId !== undefined) {
    predicates.push(eq(sessions.modeId, opts.modeId));
  }
  const row = this.deps.db
    .select()
    .from(sessions)
    .where(and(...predicates))
    .orderBy(desc(sessions.startedAt))
    .get();
  if (!row) return null;
  return { /* unchanged SessionHandle shape */ };
}
```

Also update the `SessionService` interface declaration (likely in
`packages/core/src/services/session-service.ts` or a sibling types module —
check by reading the file's top).

### `packages/desktop/electron/main/session-channel.ts` — IPC channel

The current registration at line ~48-49 uses `wrapEnvelope` paramless. Switch
to `handleEnvelope` with a Zod schema:

```ts
const sessionActiveSchema = z.object({ modeId: z.string().optional() }).optional();

ipc.handle(
  "praxis.session.active",
  handleEnvelope("praxis.session.active", log, sessionActiveSchema, async (opts) =>
    services.session.active(opts ?? undefined),
  ),
);
```

Match the `ipc-envelope-handler` pattern used by the surrounding channels in
the file.

### `packages/client/src/` — client method

Find the client's session API surface (likely a builder at
`packages/client/src/api/session.ts` or `packages/client/src/transport/ipc.ts`).
Update `active` to accept the optional payload and forward it through the IPC
invoke. Match the surrounding client API style.

## Acceptance

- [ ] `SessionService.active()` (no args) — returns the most-recent open
      session for the student, regardless of mode. **Unchanged behavior**.
- [ ] `SessionService.active({ modeId: 'configure' })` — returns the
      most-recent open configure session for the student.
- [ ] `SessionService.active({ modeId: 'configure' })` returns `null` when
      there are no open configure sessions (even if other-mode sessions are
      open).
- [ ] `SessionService.active({ modeId: 'configure' })` ignores ended
      configure sessions.
- [ ] When multiple open configure sessions exist (race-window artifact), the
      query returns the most recent by `startedAt`.
- [ ] IPC `praxis.session.active` accepts the optional `{ modeId }` payload
      via the envelope schema; invalid payloads (e.g. `{ modeId: 42 }`) are
      rejected with `VALIDATION_FAILED`.
- [ ] Client `client.session.active({ modeId: 'configure' })` round-trips
      the filter end-to-end.

## Tests

### `packages/core/src/services/__tests__/session-service.test.ts`
(or new `session-service-active.test.ts` if the existing file is large)

Add cases:
1. No sessions in DB → `active({ modeId: 'configure' })` returns null.
2. Only ended configure sessions → returns null.
3. One open configure session → returns it.
4. Multiple open configure sessions (insert with different `startedAt`) →
   returns the most recent.
5. Open session of a different mode (e.g., `teach`) → returns null.
6. Mix of open configure + open teach → `active({ modeId: 'configure' })`
   returns the configure session.
7. No-args `active()` still returns most-recent open regardless of mode
   (regression guard).

Use the `temp-db-test-helper` pattern (`useTempDb`) for isolated DB setup.

### `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts`
(if such a file exists; else create) — envelope test for the `modeId` payload
via the `electron-ipc-test-harness` pattern.

## Patterns
- `ipc-envelope-handler`: `handleEnvelope(channel, log, schema, fn)` is the
  wrapping shape.
- `temp-db-test-helper`: `useTempDb()` from `tests/helpers/db-setup.ts` for
  isolated SQLite test setup.
- `electron-ipc-test-harness`: stub `electron` at module boundary, capture
  handlers into a Map, invoke directly.

## Backward compatibility
- All existing callers of `active()` (no args) work unchanged.
- The IPC payload becomes optional — existing client calls that send no
  payload remain valid (`z.object({...}).optional()` accepts undefined).

## Implementation Notes

### Files changed
- `packages/core/src/types/session-client.ts` — `SessionService` interface: `active()` → `active(opts?: { modeId?: string })`
- `packages/core/src/services/session-service.ts` — `SessionServiceImpl.active()` implementation: predicates array pattern for optional modeId filter
- `packages/desktop/electron/main/session-channel.ts` — switched `praxis.session.active` from `wrapEnvelope` (paramless) to `handleEnvelope` with `sessionActiveSchema`; removed unused `wrapEnvelope` import; opts forwarded with spread to satisfy `exactOptionalPropertyTypes`
- `packages/client/src/services/session-client.ts` — `SessionClient.active()` accepts `opts?: { modeId?: string }` and forwards through `transport.invoke`
- `packages/core/src/services/__tests__/session-service.active.test.ts` — new file, 8 tests covering all 7 acceptance cases
- `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts` — 4 new tests covering: `{ modeId: 'configure' }` round-trip, omitted opts, invalid payload (`{ modeId: 42 }` → `VALIDATION_FAILED`), empty object opts

### Three-layer touchpoints
1. **Service interface + impl**: `packages/core/src/types/session-client.ts` (interface) + `packages/core/src/services/session-service.ts` (implementation)
2. **IPC schema**: `packages/desktop/electron/main/session-channel.ts` — `sessionActiveSchema = z.object({ modeId: z.string().optional() }).optional()`
3. **Client method**: `packages/client/src/services/session-client.ts` — `active(opts?)` forwards to `transport.invoke(..., opts)`

### Test count added
- 8 service tests (new file `session-service.active.test.ts`)
- 4 envelope tests (appended to `session-channel-envelope.test.ts`)
- Total: 12 new tests

### Verification status
- `pnpm test`: 4553 passed, 23 skipped — all pass
- `pnpm typecheck`: passes (one pre-existing error in `tests/configure-end-to-end.test.ts` unrelated to this story — `idea-fix-session-service-exactoptional-baseline` was already in backlog)
- `pnpm lint`: 522 pre-existing errors, none from changed files
