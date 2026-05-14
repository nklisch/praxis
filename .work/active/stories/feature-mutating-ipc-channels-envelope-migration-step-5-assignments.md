---
id: feature-mutating-ipc-channels-envelope-migration-step-5-assignments
kind: story
stage: implementing
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-4-memory]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.assignments.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.assignments.get` (`{ assignmentId: string }`)
- `praxis.assignments.getResponses` (`{ assignmentId: string }`)
- `praxis.assignments.submit` (`{ assignmentId: string, ... }`) — mutation, security-relevant

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~489-540)
- `packages/client/src/services/assignments-client.ts`
- `packages/desktop/electron/main/__tests__/assignments-channel-envelope.test.ts` (new)

## Acceptance
- All 3 channels wrapped with `handleEnvelope` (structured payloads).
- Client methods unwrap.
- Integration test asserts envelope shape (success + validation failure on missing/empty assignmentId).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — `submit` is mutation-heavy; renderer hooks branch on success/failure.
- **Rollback**: revert the commit.
