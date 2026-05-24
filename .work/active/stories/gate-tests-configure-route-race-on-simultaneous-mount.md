---
id: gate-tests-configure-route-race-on-simultaneous-mount
kind: story
stage: drafting
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
