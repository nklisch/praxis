---
id: gate-security-ipc-helpers-rethrow-redactor-gap
kind: story
stage: done
tags: [security]
parent: null
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-12-misc-and-domain-modules]
release_binding: v0.1.2
gate_origin: security
created: 2026-05-14
updated: 2026-05-14
---

# `ipc-helpers.handle` re-throws raw errors, bypassing envelope redactor on ~117 channels

## Severity
Medium

## Domain
Data Protection

## Location
`packages/desktop/electron/main/ipc-helpers.ts:48-51`

## Evidence
```ts
} catch (err) {
  const durationMs = Math.round(performance.now() - t0);
  channelLog.error("ipc.handle.error", { durationMs, err: serializeErrorRedacted(err) });
  throw err;
}
```

The same v0.1.2 diff that swapped `serializeError` → `serializeErrorRedacted`
for the **log** still re-throws the original unredacted `err` (line 50).
Electron propagates the thrown error's `.message` (and `.stack` in some
builds) to the renderer's `ipcRenderer.invoke` rejection. Only 12 of ~129
`handle(...)` registrations across the bundle are wrapped in `wrapEnvelope`
(which does map to a generic INTERNAL message); the remaining ~117 — most
`praxis.author.*`, `praxis.artifacts.*`, `praxis.assignments.*`,
`praxis.notes.*`, `praxis.flashcards.*`, `praxis.tabs.*`,
`praxis.sketches.*`, `praxis.documents.*`, `praxis.documentScopes.*`,
`praxis.memory.*`, `praxis.packs.*`, `praxis.session.spawnFromAssignment`,
`praxis.session.end`, `praxis.session.active`, and
`praxis.config.{unlock,isLocked,bootstrapConfig,…}` — propagate raw errors.
The bundle includes the round-2 IPC-boundary feature; this re-throw is the
last unfixed leg.

## Remediation direction

Either wrap the rethrow in a redactor that surfaces a generic message
plus a UUIDv7 request id (mirror `wrapEnvelope`'s INTERNAL mapping), or
roll out `wrapEnvelope` to every remaining `handle()` so renderers always
go through the envelope.

## Verification (subsumed by feature-mutating-ipc-channels-envelope-migration — partial)

**Date**: 2026-05-14

**Method**: Systematic grep of all `handle(...)` registrations in
`packages/desktop/electron/main/*.ts`, cross-referenced with
`handleEnvelope`/`wrapEnvelope` usage per file.

**Result: PARTIALLY CLOSED — residual gap remains.**

The envelope migration (`feature-mutating-ipc-channels-envelope-migration`)
wrapped the majority of invoke channels. The `throw err` in
`createIpcHelpers.handle` (line 84 of `ipc-helpers.ts`) is now unreachable
for all wrapped channels, because `wrapEnvelope`/`handleEnvelope` catch
internally and return `{ ok: false, error: {...} }` — a resolved promise,
never a rejection.

**Channels confirmed wrapped (safe):**

The final grep confirms only 4 bare `handle(...)` calls remain across all
`packages/desktop/electron/main/*.ts` files — and all 4 are legitimate
streaming handlers (subscriber-fanout-stream pattern, handled separately by
`gate-security-streaming-channel-error-push-redactor-gap`):

- `praxis.activity.events.start`
- `praxis.bootstrap.drafts.events.start`
- `praxis.quickCheck.events.start`
- `praxis.auth.claude.login.start`

All per-domain channel modules (`document-scopes-channel.ts`,
`ingest-channel.ts`, `subagent-channel.ts`, `activity-channel.ts`,
`quick-check-channel.ts`) use envelope wrappers on their invoke channels.

**Residual raw invoke channels in `ipc-server.ts` (13 channels):**

The following non-streaming `handle(...)` calls in `ipc-server.ts` were
NOT migrated to `handleEnvelope`/`wrapEnvelope` and still expose raw errors
to the renderer:

| Line | Channel |
|------|---------|
| 101 | `praxis.session.start` |
| 339 | `praxis.documents.pageImage` |
| 610 | `praxis.assignments.list` |
| 619 | `praxis.assignments.recordResponse` |
| 1207 | `praxis.notes.create` |
| 1277 | `praxis.notes.list` |
| 1313 | `praxis.flashcards.create` |
| 1337 | `praxis.flashcards.update` |
| 1372 | `praxis.flashcards.list` |
| 1398 | `praxis.flashcards.review` |
| 1597 | `praxis.session.list` |
| 1606 | `praxis.sketches.put` |
| 1718 | `praxis.conceptMaps.updateScene` |

These channels remain as raw async handlers. If the underlying service
throws (e.g., DB error, validation error), the raw error propagates to
the renderer via IPC rejection, potentially leaking internal details.

**Follow-up work**: Tracked and completed as `gate-security-ipc-server-raw-invoke-residuals`.

**Tests**: `pnpm typecheck`, `pnpm --filter @praxis/desktop test`, and
`pnpm --filter @praxis/client test` all pass clean (399 + 62 tests).

## Verification (re-verified 2026-05-14 — FULLY CLOSED)

**Date**: 2026-05-14

**Method**: Re-grep of all `handle(...)` registrations across
`packages/desktop/electron/main/*.ts` after `gate-security-ipc-server-raw-invoke-residuals`
landed. Cross-referenced `handleEnvelope`/`wrapEnvelope` usage against the
complete channel list.

**Result: FULLY CLOSED — zero raw invoke channels remain.**

`gate-security-ipc-server-raw-invoke-residuals` wrapped all 13 residual
non-streaming channels in `ipc-server.ts` with `handleEnvelope`. The final
grep of `ipc-server.ts` finds exactly 2 raw `async (_event, ...)` handler
bodies:

- `praxis.session.send.start` — streaming push channel (intentional)
- `praxis.auth.claude.login.start` — streaming push channel (intentional)

No bare `handle(...)` calls remain across any `packages/desktop/electron/main/*.ts`
file outside these two streaming channels. The `throw err` re-throw path in
`createIpcHelpers.handle` (ipc-helpers.ts line 84) is now unreachable for
every registered channel — all channels are wrapped and return resolved
envelopes, never rejections.

**Tests**: `pnpm typecheck`, `pnpm vitest run --project @praxis/desktop`,
and `pnpm vitest run --project @praxis/client` all pass clean
(421 desktop tests, 62 client tests).
