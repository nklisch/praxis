---
id: story-session-list-exclude-modes
kind: story
stage: done
tags: [core, ui, sessions, ipc]
parent: feature-configure-mode-session-hygiene
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Extend `SessionService.list` with `excludeModeIds` + wire library to hide configure sessions

## Brief
Extend the existing `SessionService.list` method, its IPC channel
(`praxis.session.list`), and the client method `client.session.list` to
accept an optional `excludeModeIds?: string[]` filter. When non-empty, the
query excludes sessions whose `mode_id` is in the array. Then wire
`use-library.ts:41` (the library route's session listing) to pass
`excludeModeIds: ['configure']` so configure sessions stop appearing in the
library catalog.

Server-side filtering is required (not client-side) because `limit` is
applied at the DB layer; client-side filtering would silently shrink the
page.

## Implementation

### `packages/core/src/services/session-service.ts` — list method

Current (line ~314-329):

```ts
async list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]> {
  const studentId = getOrCreateDefaultStudentId(this.deps.db);
  const limit = opts?.limit ?? 100;
  const includeEnded = opts?.includeEnded ?? true;

  const where = includeEnded
    ? eq(sessions.studentId, studentId)
    : and(eq(sessions.studentId, studentId), isNull(sessions.endedAt));

  const rows = this.deps.db
    .select()
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();
  // ...mapping...
}
```

After:

```ts
async list(opts?: {
  includeEnded?: boolean;
  limit?: number;
  excludeModeIds?: string[];
}): Promise<SessionSummary[]> {
  const studentId = getOrCreateDefaultStudentId(this.deps.db);
  const limit = opts?.limit ?? 100;
  const includeEnded = opts?.includeEnded ?? true;
  const excludeModeIds = opts?.excludeModeIds ?? [];

  const predicates = [eq(sessions.studentId, studentId)];
  if (!includeEnded) {
    predicates.push(isNull(sessions.endedAt));
  }
  if (excludeModeIds.length > 0) {
    predicates.push(notInArray(sessions.modeId, excludeModeIds));
  }

  const rows = this.deps.db
    .select()
    .from(sessions)
    .where(and(...predicates))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();
  // ...mapping unchanged...
}
```

Import `notInArray` from `drizzle-orm`.

Also update the `SessionService` interface signature.

### `packages/desktop/electron/main/session-channel.ts` — IPC schema

Find the `praxis.session.list` registration. Update its Zod schema to add
`excludeModeIds: z.array(z.string()).optional()`:

```ts
const sessionListSchema = z.object({
  includeEnded: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  excludeModeIds: z.array(z.string()).optional(),
});
```

### `packages/client/src/` — client method

Update `client.session.list` to accept the optional `excludeModeIds` in its
input type and forward through the IPC invoke. Match the surrounding client
API style.

### `packages/ui/src/hooks/use-library.ts:41` — consumer

Current:

```ts
client.session.list({ limit: 10, includeEnded: true })
```

After:

```ts
client.session.list({ limit: 10, includeEnded: true, excludeModeIds: ["configure"] })
```

## Acceptance

- [ ] `list()` (no args) — unchanged: returns up to 100 most-recent sessions
      for the student, including ended.
- [ ] `list({ excludeModeIds: ["configure"] })` — omits all configure sessions
      from results.
- [ ] `list({ excludeModeIds: ["configure", "exam"] })` — omits both.
- [ ] `list({ excludeModeIds: [] })` — no-op; returns everything (same as
      omitting the param).
- [ ] `list({ limit: 10, excludeModeIds: ["configure"] })` — applies the
      exclusion at the DB level, so the returned page has up to 10
      non-configure sessions (not "up to 10 sessions of which some are
      filtered out").
- [ ] IPC `praxis.session.list` rejects invalid payloads (e.g.,
      `excludeModeIds: [42]`) with `VALIDATION_FAILED`.
- [ ] The library UI session listing no longer shows configure sessions
      after this lands.

## Tests

### `packages/core/src/services/__tests__/session-service.test.ts`

Add cases:
1. No `excludeModeIds` → returns everything (regression guard).
2. `excludeModeIds: ["configure"]` → configure sessions absent from results.
3. `excludeModeIds: ["configure", "exam"]` → both modes absent.
4. `excludeModeIds: []` → returns everything.
5. `limit: 5, excludeModeIds: ["configure"]` → returns up to 5
   non-configure sessions, with the filter applied before the LIMIT (insert
   8 configure + 5 teach sessions; expect 5 teach back).

### `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts`

Envelope test: send `{ excludeModeIds: ["configure"] }`, assert the service
receives the param correctly.

### `packages/ui/src/hooks/__tests__/use-library.test.ts` (if exists, else add)

Via the `ui-test-helper` pattern (`makeFakeClient`):
1. Mock `client.session.list` to record its call args.
2. Render `useLibrary` via `<PraxisClientProvider>`.
3. Assert the recorded call includes `excludeModeIds: ["configure"]`.

## Patterns
- `ipc-envelope-handler`: validate payloads with `handleEnvelope` +
  `withSchema`.
- `temp-db-test-helper`: `useTempDb()` for service tests.
- `ui-test-helper`: `makeFakeClient(overrides)` for hook tests.

## Backward compatibility
- Existing `list()` calls without `excludeModeIds` work unchanged.
- The library route's existing behavior is *intentionally* changing —
  configure sessions disappear from the listing. This is the user-facing
  change this story ships.

## Implementation Notes

### Files changed

- `packages/core/src/services/session-service.ts` — switched `where` to predicates-array; added `notInArray` predicate for `excludeModeIds`; imported `notInArray` from `drizzle-orm`.
- `packages/core/src/types/session-client.ts` — updated `SessionService.list` interface signature to include `excludeModeIds?: string[]`.
- `packages/desktop/electron/main/session-channel.ts` — added `excludeModeIds: z.array(z.string()).optional()` to `sessionListSchema`; forwarded via conditional spread.
- `packages/client/src/services/session-client.ts` — updated `list` method signature to include `excludeModeIds?: string[]`.
- `packages/ui/src/hooks/use-library.ts` — wired `excludeModeIds: ["configure"]` in the library loader call.

### Tests added

- `packages/core/src/services/__tests__/session-service.list.test.ts` — 5 service tests (no args regression, single exclude, multi-exclude, empty exclude no-op, filter-before-limit).
- `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts` — 4 envelope tests appended: valid excludeModeIds forwarding, combined opts, VALIDATION_FAILED for `[42]`, undefined payload.
- `packages/ui/src/__tests__/use-library.test.tsx` — updated existing assertion + added dedicated `excludeModeIds: ["configure"]` test. Total 7 tests (was 5 before).

**Total new tests: 5 + 4 + 2 = 11 new test cases.**

### Library-hook wiring confirmed

`use-library.ts:41` now passes `excludeModeIds: ["configure"]`; configure sessions no longer appear in the Library catalog.

### Verification status

All checks pass:
- `pnpm typecheck` — passes (pre-existing error in `tests/configure-end-to-end.test.ts` is unrelated to this story).
- `pnpm lint` — no errors in changed files (pre-existing repo-wide lint errors unrelated).
- `pnpm test` — 4572 tests pass, 429 files, 0 failures.
