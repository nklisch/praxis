---
id: feature-mutating-ipc-channels-envelope-migration-step-6-packs
kind: story
stage: done
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

## Review

Approved. Mechanical migration, correctly applied.

**Lenses checked:**

- `wrapEnvelope` used for both no-payload list channels; `handleEnvelope` with `z.string().min(1, "packId")` used for `import` — correct assignment per pattern.
- Client methods use the `IpcEnvelope<T> | T` union type with `unwrapEnvelope` — backward-compat pattern matches prior steps.
- Channel name constants extracted into `C` object in `packs-client.ts` — consistent with earlier steps.
- Path-leakage guard test verifies the INTERNAL error message does not expose filesystem paths — good.
- 11 tests (3 for listAvailable, 3 for listImported, 5 for import): success with data, INTERNAL on throw, VALIDATION_FAILED for empty string, VALIDATION_FAILED for wrong type, path-leakage guard.
- Typecheck: clean. Tests: 11/11 pass.

**Minor nit (no action):** The test file header comment says "Test count: 10" but there are 11 tests. Item frontmatter is correct; the comment is stale. Not a blocker.
