---
id: feature-mutating-ipc-channels-envelope-migration-step-11-sketches-concept-maps
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-10-tabs]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.sketches.*` and `praxis.conceptMaps.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.sketches.get` (string — sketchId)
- `praxis.sketches.getSummary` (string — sketchId)
- `praxis.conceptMaps.create` (`{ courseId: string; title: string }`)
- `praxis.conceptMaps.get` (string — id)
- `praxis.conceptMaps.list` (`{ courseId: string }`)
- `praxis.conceptMaps.rename` (`{ id: string; title: string }`)
- `praxis.conceptMaps.delete` (string — id)
- `praxis.conceptMaps.listVersions` (string — id)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~1219-1280)
- `packages/client/src/services/sketches-client.ts`
- `packages/client/src/services/concept-maps-client.ts`
- `packages/desktop/electron/main/__tests__/sketches-concept-maps-channel-envelope.test.ts` (new)

## Acceptance
- All 8 channels wrapped.
- Client methods unwrap.
- Integration test covers a get + a structured-payload mutation, with success + validation failure paths.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — sketches and concept maps are workspace-side; failure is recoverable.
- **Rollback**: revert the commit.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- Test file header comment says "Test count: 18" but the file has 26 `it()` calls (early draft estimate was stale). Does not affect correctness.

**Notes**:
- All 8 channels confirmed wrapped with `handleEnvelope` in `ipc-server.ts` (lines ~1618-1729).
- `praxis.conceptMaps.updateScene` intentionally left on raw `handle` — deferred per story brief; confirmed present and unmodified.
- Image-encoding logic (`sketch.image.toString("base64")`) preserved verbatim inside the `handleEnvelope` callback at line 1628.
- Both client files (`sketch-client.ts`, `concept-map-client.ts`) correctly import and apply `unwrapEnvelope`; backward-compat union types (`IpcEnvelope<T> | T`) keep WS transport working.
- 26 tests across 8 `describe` blocks, all passing (378 total in package). Typecheck clean across workspace.
