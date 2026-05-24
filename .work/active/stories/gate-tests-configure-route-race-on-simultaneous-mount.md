---
id: gate-tests-configure-route-race-on-simultaneous-mount
kind: story
stage: review
tags: [testing, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Two-tab configure-route mount race regression test missing

## Priority
Medium

## Spec reference
Item: `feature-configure-mode-session-hygiene`
Acceptance criterion:
> Opening configure in two tabs back-to-back (same student): both tabs
> attach to the same configure session.

## Gap type
adversarial-spec-silent / e2e-seam — the feature `## Risks` section
explicitly documents the race ("Two configure tabs opened in the same
~50ms window: both `active()` queries return null before either
`start()` resolves") and accepts the duplicate-session outcome for v1.
The current configure-route test only covers single-mount paths.

## Suggested test
```ts
it("two configure-route mounts back-to-back attach to the same session", async () => {
  // Mount 1: active returns null, start returns sessionA.
  // Mount 2 (after a beat): active returns sessionA, start should NOT be called.
  // Assert mount 2's local state attaches to sessionA.
});
```

## Test location (suggested)
`packages/ui/src/__tests__/configure-route.test.tsx`

## Implementation notes

Added two tests to `packages/ui/src/__tests__/configure-route.test.tsx` (20 tests total, all passing):

**Test 1 — "second mount after first session established: reuses session, does NOT call start again"**
The happy-path sequential race: Mount 1 calls `active()` → null → `start()` → sessionA, then unmounts. Mount 2 calls `active()` → sessionA (server now has it), so `start()` is NOT called a second time. Asserts `startMock` called exactly once and "Configure session active" is visible on Mount 2. This is the reuse-contract test the story originally asked for.

**Test 2 — "true simultaneous mounts: known limitation — both may call start (duplicate-session race accepted for v1)"**
Documents the known v1 limitation explicitly in test form. Two independent renders fire `active()` simultaneously; both see null; both call `start()`. The test asserts `start` is called exactly twice and includes a comment: if this ever fails (only 1 call), the race has been fixed upstream and the test should be updated to assert once.

**Design insight**: `sessionStartedRef` is a `useRef` local to each component instance, so it only prevents a single mount from double-starting itself — it provides zero cross-instance coordination. Two simultaneous mounts will always race. This is by-design for v1 per the feature's Risks section.
