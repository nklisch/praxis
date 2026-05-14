---
id: feature-mutating-ipc-channels-envelope-migration-step-1-session
kind: story
stage: implementing
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: []
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.session.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe to the session invoke channels.

## Channels in scope
- `praxis.session.active` (no-payload getter)
- `praxis.session.end` (string payload)
- `praxis.session.spawnFromAssignment` (structured payload)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines 91, 110, plus spawnFromAssignment site)
- `packages/client/src/services/session-client.ts`
- `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts` (new — integration test)

## Recipe (from parent feature)
1. Replace `handle("praxis.session.X", async (_event, ...) => services.session.Y(...))` with the envelope-wrapped form (`handleEnvelope` for structured payloads, `wrapEnvelope` for no-payload).
2. Define a Zod schema for the structured-payload channels at the top of `ipc-server.ts` (or import from a shared location if already defined).
3. Update `SessionClientImpl` methods on the client side — call `unwrapEnvelope(result)`.
4. Add an integration test exercising one success path and one validation-failure path.
5. Run `pnpm --filter @praxis/desktop typecheck && pnpm --filter @praxis/client typecheck && pnpm --filter @praxis/desktop test && pnpm --filter @praxis/client test`.

## Acceptance
- All 3 listed channels use `handleEnvelope` or `wrapEnvelope`.
- All 3 corresponding client methods call `unwrapEnvelope`.
- Integration test asserts envelope shape (success + validation failure) for at least one structured-payload channel.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — `praxis.session.active` is polled frequently by the UI; an envelope-shape mismatch breaks the chat shell.
- **Rollback**: revert the commit; the previous raw-throw form is structurally simpler and the renderer's catch handlers were already lenient.
