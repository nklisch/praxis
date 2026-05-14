---
id: gate-patterns-migrate-mutating-ipc-channels-to-envelope
kind: story
stage: drafting
tags: [refactor, security]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: patterns
created: 2026-05-14
updated: 2026-05-14
---

# Migrate mutating IPC channels in `ipc-server.ts` to the `ipc-envelope-handler` pattern

## Existing pattern
`ipc-envelope-handler` (new, documented in this gate run at
`.claude/skills/patterns/ipc-envelope-handler.md`).

## Nature of divergence

Only ~11 of 67 invoke channels in `ipc-server.ts` use `wrapEnvelope` —
mostly `praxis.config.*`, `praxis.lock.*`, `praxis.update.checkLatest`,
and `praxis.shell.openExternal`. Every authoring mutation, every session
mutation, every tab mutation, every notes/flashcards/bootstrap mutation
still throws unwrapped `Error` across the IPC boundary, losing the
`code` + `requestId` discriminator and bypassing the secret-redactor on
the error path.

Channel families pending migration (illustrative, not exhaustive):
- `praxis.author.*` (~12 channels)
- `praxis.artifacts.*`
- `praxis.assignments.*`
- `praxis.session.spawnFromAssignment`, `praxis.session.end`, `praxis.session.active`
- `praxis.tabs.*`
- `praxis.documents.*`
- `praxis.documentScopes.*` (already in a per-domain module — straightforward to wrap)
- `praxis.notes.*`, `praxis.flashcards.*`
- `praxis.bootstrap.*`
- `praxis.sketches.*`
- `praxis.memory.*`
- `praxis.packs.*`
- `praxis.config.{unlock,isLocked,bootstrapConfig,...}` partially covered

## Overlap with security finding

This refactor and the `gate-security-ipc-helpers-rethrow-redactor-gap`
finding are two faces of the same gap: the security item is the *risk*
(raw `err.message` crossing the trust boundary), this one is the *pattern
discipline*. Implementing this story closes both.

## Suggested approach

Migrate by channel family in waves; each wave is a single PR.
Per wave:
1. Add the `ipc-envelope-handler` wrapper to every `handle(...)` call in
   the channel family.
2. Add `withSchema(...)` for channels that take structured payloads.
3. Update the client side (`@praxis/client/services/<domain>-client.ts`)
   to call `unwrapEnvelope` and catch `IpcError`.
4. Update tests using the `electron-ipc-test-harness` pattern to assert
   envelope shape on success + error paths.

Defer streaming channels (`*.events.start` / `.cancel`) — they use the
`subscriber-fanout-stream` pattern and have their own per-event envelope.

## Acceptance

- Every mutating invoke channel in `ipc-server.ts` is wrapped.
- Every client-side service method in `@praxis/client/services/` calls
  `unwrapEnvelope`.
- No regressions in renderer error handling (the renderer already calls
  `unwrapEnvelope` defensively for non-migrated channels via the
  passthrough behavior).
