---
id: gate-tests-configure-route-unmount-vs-reuse
kind: story
stage: done
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

## Review

**Verdict: approved (done)**

**Reviewer**: Claude Code (Sonnet 4.6) — 2026-05-23

### What was verified

- `session.end(...)` is fully removed from the unmount cleanup in `configure.tsx` (lines 291–295 of
  the post-fix file). The cleanup function now only sets `cancelled = true` — no IPC calls.
- The `handleClearRestart` path at line 310 is the correct and only intentional `session.end` call;
  it is not in a cleanup and is gated on explicit user confirmation.
- JSDoc comment updated accurately: describes the long-lived reuse contract and makes explicit that
  the only way to end the configure session is the "Clear / restart" control.
- The biome-ignore comment was updated to accurately describe why `session` is omitted from deps
  (no longer accessed in cleanup at all).
- Pinning test `"navigating away (unmount) does NOT end the session — reuse contract"` is correct:
  mounts, waits for `"Configure session active"` text, unmounts, asserts `client.session.end` was
  NOT called. Would have failed before the fix; passes after.
- Alignment with `feature-configure-mode-session-hygiene` confirmed: Unit 4 of that feature
  explicitly specifies `return () => { cancelled = true; }` with no `session.end`, and requires that
  the only intentional end is `handleClearRestart`. The fix brings the code into exact alignment.
- Sibling-pattern audit: grepped all UI source files for `session.end`. Only two hits — line 294
  (comment) and line 310 (`handleClearRestart`). No other route or tab-body component has a
  `session.end` call in a cleanup path. Pattern is isolated.
- 1707/1707 tests pass (re-verified in review run).

### Findings

None blocking. One nit noted for completeness:

**Nit**: The feature design (`feature-configure-mode-session-hygiene`) is marked `stage: done` but
its child story `story-configure-route-reuse-and-reset` acceptance criteria items are still listed
as unchecked `[ ]` (the feature body was not updated to check them off after the implementation
landed). Not a correctness issue — the implementation summary at the bottom of the feature body
confirms they all shipped — but the checklist is stale. Low priority; no follow-up filed.

**No important/blocking findings.** Release note consideration: this is a behavioral bug fix
(configure sessions were silently ended on every navigation away), but it shipped within the
`feature-configure-mode-session-hygiene` feature which is already bound to v0.1.4 and has its own
implementation summary. No separate release note item is warranted — the feature's summary is the
record.
