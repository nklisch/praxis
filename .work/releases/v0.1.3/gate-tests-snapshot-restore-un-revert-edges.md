---
id: gate-tests-snapshot-restore-un-revert-edges
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-19
---

# `restoreAction` un-revert path has only one happy-path test

## Priority
Low

## Spec reference
Item: `epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore`

Acceptance criterion: feature body Unit 5 — "The new `restore` action itself
has a snapshot row, enabling un-revert." Existing coverage at
`snapshot-restore.test.ts:664` covers one un-revert flow ("restoring a
restore action re-applies the original mutation"). Edge cases not covered:
double-un-revert (re-revert after un-revert) and un-revert across an entity
that was later mutated by a different action (chain).

## Gap type
missing test for valid partitions

## Suggested test
```ts
it("un-revert is idempotent — restoring the same restore-action twice returns already_restored on second call", async () => { /* ... */ });
it("un-revert after an intermediate edit composes correctly (re-applies original-mutation state, not current state)", async () => { /* ... */ });
```

## Test location (suggested)
`packages/core/src/services/__tests__/snapshot-restore.test.ts`

## Implementation Notes

**Files changed:**
- `packages/core/src/services/__tests__/snapshot-restore.test.ts` — added 2 tests inside the existing `"restoreAction — un-revert"` describe block

**Tests added:**
1. `un-revert is idempotent — restoring the same restore-action twice returns already_restored on second call`
   - Setup: updateCourse (A1) → restoreAction(A1) → find restore-action row (R1) → restoreAction(R1) [first un-revert, succeeds] → restoreAction(R1) [second call, should return `already_restored`]
   - The restore-action's snapshot row is marked `restoredAt != null` after the first un-revert, so the second call hits the guard at the top of `restoreAction`.

2. `un-revert after an intermediate edit re-applies the snapshot captured at revert time, not current state`
   - Setup: updateCourse("A1 Title") → restoreAction(A1) → updateCourse("A2 Title") → restoreAction(R1)
   - Result: course title = "A1 Title", not "A2 Title".
   - The un-revert re-applies the snapshot captured at the moment of the revert (pre-restore state = "A1 Title"). A2's intermediate mutation is overwritten, not merged. This is the correct behavior per the implementation's snapshot-based design.

**Un-revert semantics discovery:**
The un-revert composes via snapshot: `captureCurrentStateForUnrevert` captures the entity state immediately before applying the reverse, not after any later mutation. When an intermediate edit (A2) changes the entity, the restore-action's snapshot still holds the pre-revert state (A1's mutation). Un-reverting R1 therefore overwrites A2's change, restoring the entity to A1's state. No composition with A2 occurs — the story description ("re-applies original-mutation state, not whatever-current-state") is exactly correct.

**Verification:**
- `pnpm vitest run packages/core/src/services/__tests__/snapshot-restore.test.ts` — 27/27 passed (25 pre-existing + 2 new)
- `pnpm typecheck` — pre-existing desktop error (`IndexerOrchestrator | undefined` in session-service.ts); unrelated to this story
- `pnpm lint` — failures in `.mockups/` HTML only; no packages/ errors; unrelated to this story
- `pnpm test` — 1 pre-existing failure in `citations-channel-envelope.test.ts` (inverted-range validation gap added by a different sub-agent); unrelated to this story

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Both tests have real assertions with clear in-test comments documenting each step. Agent investigated the actual un-revert semantics (snapshot captured at revert time, not merge with intermediate edits) and named the second test for what the implementation actually does — better than the story's original framing. 27/27 pass in the file. Stays in `active/` per `release_binding: v0.1.3`.
