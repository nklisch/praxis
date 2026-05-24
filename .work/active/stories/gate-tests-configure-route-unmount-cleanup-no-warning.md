---
id: gate-tests-configure-route-unmount-cleanup-no-warning
kind: story
stage: review
tags: [testing, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-24
---

# Unmount-during-pending-`active()` cleanup is implicit — no console-warning assertion

## Priority
Medium

## Spec reference
Item: `story-configure-route-reuse-and-reset`
Acceptance criterion:
> The unmount cleanup (`cancelled` flag) prevents setState on an
> unmounted component if the user navigates away mid-async.

Story implementation notes say `(The "reuses existing session" test
also implicitly covers the unmount-cleanup path via the cancelled
flag — no extra unmount test was added because React Testing Library's
cleanup in afterEach exercises unmount.)` — but the absence of a
console warning isn't asserted, so a regression that removed the
`cancelled` guard would not fail the test.

## Gap type
missing test for spec-mandated behavior (assertion oracle is weak)

## Suggested test
```ts
it("unmounting during pending active() does not setState (no React warning)", async () => {
  const consoleError = vi.spyOn(console, "error");
  let resolveActive!: (v: SessionHandle | null) => void;
  const client = makeClient(lockClient, {
    active: vi.fn().mockReturnValue(new Promise(r => { resolveActive = r; })),
  });
  const { unmount } = renderRoute(client);
  unmount();
  resolveActive({ sessionId: brandId("x"), modeId: "configure", startedAt: 0 } as SessionHandle);
  await new Promise(r => setTimeout(r, 0));
  expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/unmounted/i));
});
```

## Test location (suggested)
`packages/ui/src/__tests__/configure-route.test.tsx`

## Implementation notes

Added test "unmounting during pending active() does not setState (no React warning)" to
`packages/ui/src/__tests__/configure-route.test.tsx` inside the existing `describe("ConfigureRoute")` block.

Approach:
- `vi.spyOn(console, "error")` captures React's unmounted-component state-update warning.
- `active()` is mocked to return a never-resolving Promise; `unmount()` fires while it is pending.
- The Promise is then resolved, exercising the post-unmount code path.
- A `setTimeout(0)` tick drains microtasks before asserting no `/unmounted/i` error was emitted.
- `consoleError.mockRestore()` cleans up the spy so it does not leak into other tests.

Verification: `pnpm vitest run packages/ui/src/__tests__/configure-route.test.tsx` — 21/21 pass.
The test passes against the current `cancelled = true` guard; removing that guard would cause it to fail.

## Review findings (blocker)

**Oracle is ineffective on React 19 — sends back to implementing.**

The test asserts `expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/unmounted/i))`.
This relies on React emitting a "Can't perform a state update on an unmounted component" warning, which
was present in React 16–18 but **removed in React 19**. The project runs React 19.2.5 (confirmed in
`packages/ui/package.json`). Grepping `react-dom@19.2.5`'s development build confirms no such warning
text exists.

Consequence: the `not.toHaveBeenCalledWith(/unmounted/i)` assertion passes trivially regardless of
whether the `cancelled` guard is present, because React 19 never emits that message. Removing
`cancelled = true` from `configure.tsx` would not cause the test to fail.

**Fix required:** replace the `console.error` spy approach with a direct observable side-effect. For
example, assert that `setSession` (or a wrapper observable) is never called post-unmount — either by
verifying the rendered component stays in its loading state after unmount+resolve, or by checking that
a spy on `client.session.start` is only called once (not again on re-resolve). Alternatively, verify
the component does not re-render (query the DOM for session-dependent content that would appear only
if setState fired). The oracle must fail when `cancelled = true` is removed from the source.

## Re-implementation notes (bounce #1)

### Chosen oracle: mock-call-count on `client.session.start`

The new test is titled `"unmounting during pending active() suppresses the subsequent start() call (cancelled guard)"`.

**Oracle shape:** assert `expect(startMock).not.toHaveBeenCalled()` after unmount + resolve of the pending `active()` promise.

**Regression-detection logic:**

The `useEffect` in `configure.tsx` has this structure:

```
const existing = await client.session.active(...)
if (cancelled) return;          // ← the guard under test
if (existing) { setSession(existing); return; }
const fresh = await client.session.start(...)  // ← must NOT be reached post-unmount
if (!cancelled) setSession(fresh);
```

Sequence in the test:
1. Mount → lock state resolves → `isAccessible` becomes true → effect runs → `active()` called but held pending.
2. Wait (via `waitFor`) until `activeMock` has been called — confirms the async chain is in-flight.
3. `unmount()` → cleanup closure sets `cancelled = true`.
4. `resolveActive(null)` → `await active(...)` resumes; `existing` is `null`.
5. **With guard**: `if (cancelled) return` → early return → `start()` never called → assertion passes.
6. **Without guard**: falls through → `start()` called → `expect(startMock).not.toHaveBeenCalled()` FAILS.

**Why the first re-implementation had the same flaw:** the original test unmounted immediately without waiting for `active()` to be called. Because `useLock` returns `loading: true` until its `isSet`/`isUnlocked` promises resolve, `isAccessible` is still `false` at the moment of unmount — the `useEffect` never fires and `active()` is never invoked. Thus `start()` was never called regardless of the guard, giving a vacuous oracle.

The fix is the `waitFor(() => expect(activeMock).toHaveBeenCalled())` step before `unmount()`, which ensures the lock state has resolved and the async chain is genuinely in-flight before the cancellation fires.

**Regression validation (gold standard performed):** guard temporarily removed from `configure.tsx`, tests run — the new test failed with `expected "spy" to not be called at all, but actually been called 1 times`. Guard restored — all 21 tests pass.
