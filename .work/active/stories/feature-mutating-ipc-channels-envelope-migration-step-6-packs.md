---
id: feature-mutating-ipc-channels-envelope-migration-step-6-packs
kind: story
stage: implementing
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-5-assignments]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.packs.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.packs.listAvailable` (no-payload)
- `praxis.packs.listImported` (no-payload)
- `praxis.packs.import` (string — packId)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~549-562)
- `packages/client/src/services/packs-client.ts`
- `packages/desktop/electron/main/__tests__/packs-channel-envelope.test.ts` (new)

## Acceptance
- All 3 channels wrapped.
- Client methods unwrap.
- Integration test covers list + import (success + validation failure on empty packId).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — packs are imported once at setup; UI surface is small.
- **Rollback**: revert the commit.
