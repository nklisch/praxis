---
id: gate-tests-configure-route-unmount-vs-reuse
kind: story
stage: review
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

## Implementation notes

### Investigation outcome: BUG

The `session.end(...)` call in the unmount cleanup at `configure.tsx:291-293` (prior to fix)
directly contradicts the reuse contract defined in `feature-configure-mode-session-hygiene`:

> "Reuse a single global configure session per student. On configure-route mount, look up
> the latest active (not-ended) configure session for the student; if one exists, re-attach."

The code implemented the reuse-on-mount path (calling `client.session.active({ modeId: "configure" })`
first), but then the unmount cleanup called `client.session.end(session.sessionId)`, ending the
session that the next mount was supposed to find and re-attach to. The stale-closure comment in
the code even acknowledged `session` was captured only for the cleanup — making the bug structurally
intentional-looking but semantically wrong relative to the design.

The JSDoc comment in the component also contradicted the feature spec, stating "Each navigation
to /configure is a fresh session (no sharing across navigations)" — the opposite of what was designed.

### Action taken

**Bug fixed** — removed `client.session.end(...)` from the unmount cleanup in `configure.tsx`.

**Files changed**:
- `packages/ui/src/routes/configure.tsx` — removed `session.end` from effect cleanup (lines 291-293
  before fix); updated JSDoc comment on session lifecycle; updated biome-ignore comment to reflect
  that `session` is no longer read in cleanup at all.
- `packages/ui/src/__tests__/configure-route.test.tsx` — added pinning test
  "navigating away (unmount) does NOT end the session — reuse contract" that mounts the route,
  waits for the session to become active, unmounts, and asserts `client.session.end` was NOT called.

**Test added**: `"navigating away (unmount) does NOT end the session — reuse contract"` — would
have failed before the fix (session.end was called in cleanup); passes after.

**Verification**: `pnpm typecheck` PASS; `pnpm --filter @praxis/ui test --reporter=basic` 1707/1707 PASS.
