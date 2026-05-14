---
id: feature-mutating-ipc-channels-envelope-migration-step-4-memory
kind: story
stage: review
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-3-artifacts]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.memory.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.memory.studentModel` (no-payload getter)
- `praxis.memory.misconceptions` (no-payload getter)
- `praxis.memory.procedural` (no-payload getter)
- `praxis.memory.affective` (no-payload getter)
- `praxis.memory.export` (no-payload — returns blob)
- `praxis.memory.delete` (no-payload — destructive)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~372-419)
- `packages/client/src/services/memory-client.ts`
- `packages/desktop/electron/main/__tests__/memory-channel-envelope.test.ts` (new)

## Acceptance
- All 6 channels wrapped (all no-payload — use `wrapEnvelope`).
- Client methods unwrap.
- Integration test asserts envelope-on-success and envelope-on-throw for at least one getter and the `delete` mutation.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — memory is read-mostly; `delete` is destructive but rarely invoked.
- **Rollback**: revert the commit.
