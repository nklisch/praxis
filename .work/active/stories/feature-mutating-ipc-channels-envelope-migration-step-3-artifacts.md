---
id: feature-mutating-ipc-channels-envelope-migration-step-3-artifacts
kind: story
stage: implementing
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-2-documents]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.artifacts.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe. Largest of the read-only families.

## Channels in scope
- `praxis.artifacts.courses` (no-payload getter)
- `praxis.artifacts.course` (string — courseId)
- `praxis.artifacts.lessons` (string — courseId)
- `praxis.artifacts.gates` (string — courseId)
- `praxis.artifacts.progress` (no-payload getter)
- `praxis.artifacts.gateView` (string — courseId)
- `praxis.artifacts.evaluateGates` (string — courseId)
- `praxis.artifacts.markGatesViewed` (string — courseId)
- `praxis.artifacts.newlyUnlockedCount` (string — courseId)
- `praxis.artifacts.concepts` (string — courseId)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~314-364, plus 541)
- `packages/client/src/services/artifacts-client.ts`
- `packages/desktop/electron/main/__tests__/artifacts-channel-envelope.test.ts` (new)

## Acceptance
- All 10 channels wrapped.
- Client methods unwrap.
- Integration test covers at least one no-payload getter and one string-payload channel.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — artifacts API is read-only; only renderer-display impact.
- **Rollback**: revert the commit.
