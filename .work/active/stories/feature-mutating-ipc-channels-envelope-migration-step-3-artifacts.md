---
id: feature-mutating-ipc-channels-envelope-migration-step-3-artifacts
kind: story
stage: review
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

## Implementation

### Files modified

- `packages/desktop/electron/main/ipc-server.ts` — all 10 channels wrapped: 2 no-payload with `wrapEnvelope` (courses, progress); 8 string-payload with `handleEnvelope + courseIdSchema`. A single `courseIdSchema = z.string().min(1, "courseId")` is defined at the top of the section and shared across all 8 string-payload channels.
- `packages/client/src/services/artifacts-client.ts` — added `IpcEnvelope` + `unwrapEnvelope` import; all 10 methods converted to `async` with `unwrapEnvelope` call; return type unions extended (`IpcEnvelope<T> | T`) for backward compat during rollout.
- `packages/desktop/electron/main/__tests__/artifacts-channel-envelope.test.ts` — new test file with 32 tests covering all 10 channels: success paths, VALIDATION_FAILED on empty/undefined/non-string courseId, INTERNAL on service throw, path-leakage guard (courses, course, concepts).
- `packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts` — added 3 control tests for step-3 no-payload channels (courses success, courses INTERNAL, progress success); updated channel list in file header.

### Results

- `pnpm --filter @praxis/desktop typecheck` — pass
- `pnpm --filter @praxis/client typecheck` — pass
- `pnpm --filter @praxis/desktop test` — 206/206 pass (17 files)
- `pnpm --filter @praxis/client test` — 62/62 pass (7 files)
- New test file: 32 tests, all pass
