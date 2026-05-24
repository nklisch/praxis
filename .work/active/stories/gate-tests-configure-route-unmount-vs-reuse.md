---
id: gate-tests-configure-route-unmount-vs-reuse
kind: story
stage: implementing
tags: [testing, bug, sessions]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Configure route's `session.end` in unmount cleanup may contradict the reuse contract

## Priority
High

## Spec reference
Item: `feature-configure-mode-session-hygiene` (cross-cuts
`story-configure-route-reuse-and-reset`)
Acceptance criterion (Design decisions):
> On configure-route mount, look up the latest active (not-ended)
> configure session for the student; if one exists, re-attach to it via
> `client.session.open`; if not, start a fresh one.

The whole point of reuse is that a long-lived configure session
persists across mounts.

## Gap type
adversarial-spec-silent — investigate-before-test

`configure.tsx:288-294` calls `client.session.end(session.sessionId)`
in the effect cleanup function. That means navigating away from
`/configure` ends the very session the next mount is supposed to
reuse. No test verifies whether reuse actually delivers session
persistence across navigation.

This is gate-flagged as a potential bug masquerading as a missing
test. **Investigate first**: confirm whether `session.end` in unmount
is intentional (each mount creates a fresh session that lives only as
long as the route is mounted) or a real regression.

- If intentional: amend feature/story body to make this explicit, and
  add a test that pins the contract (e.g. "navigating away ends the
  session; the next mount starts fresh").
- If unintentional: file as a bug; remove the `session.end` from the
  unmount cleanup; add the test below.

## Suggested test
```ts
it("navigating away from /configure does NOT end the session if reuse is the contract", async () => {
  // Mount configure → assert session.start called → unmount → assert
  // session.end was NOT called (so the session survives for next mount).
});
```

## Test location (suggested)
`packages/ui/src/__tests__/configure-route.test.tsx`
