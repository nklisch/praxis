---
id: gate-security-ipc-helpers-rethrow-redactor-gap
kind: story
stage: implementing
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
