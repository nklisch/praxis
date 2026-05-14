---
id: gate-tests-tool-server-auth-timeout-window
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# Tool-server auth 5-second timeout case is missing from `tool-server-auth.test.ts`

## Priority
Medium

## Spec reference
Bound item: `epic-security-hardening-round-2-tool-bridge-socket-auth`

Acceptance criterion (Unit 3 design + test list item 9): "Connection
that sends no frame within 5s is closed."

## Gap type
Missing test for boundary (time-based) / spec'd-but-omitted.

## Suggested test

```typescript
// packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts (addition)

it("no frame within auth timeout window → connection closed", async () => {
  vi.useFakeTimers();
  // connect, do not write any frame, advance timer past 5_000ms
  vi.advanceTimersByTime(5_001);
  // expect the socket to have been closed by the server
});
```

## Implementation

Added to `packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts` (lines 147–207), inside the `"startToolServer — auth gate"` describe block after the `"malformed auth frame"` test.

Implementation approach: `vi.spyOn(global, "setTimeout")` intercepts the single `5_000ms` auth-timeout timer that the server-side connection handler arms when a client connects. The callback is captured by reference; all other timers are passed through to the real `setTimeout`. After connecting (writing no frames), `spy.mockRestore()` is called so real I/O can proceed, the captured callback is fired to simulate the timeout expiring, and the test asserts the socket closes without data.

Added `vi` to the vitest import at line 11. All 8 tests pass; typecheck clean.

## Review

Approved. No blockers.

**Regression-pin validity**: The spy is installed after `startToolServer` but before the client connects. The server arms `AUTH_TIMEOUT_MS` (5000ms) inside the `'connection'` event handler (`tool-server.ts:148`), so the spy is live at the right moment. If the `setTimeout` call is removed from the production connection handler, `capturedAuthCallbacks.length` will be 0 and `expect(capturedAuthCallbacks.length).toBe(1)` fails immediately. The pin is sound.

**Spy selectivity**: The `delay === 5000` filter passes all other timers to the real implementation via the pre-captured `realSetTimeout`. The spy is restored before the callback fires so Node's internal I/O timers during socket teardown run normally. This is the correct approach when fake timers can't drive real socket I/O.

**Dummy Timeout return value**: The stub returns an object with `ref/unref/hasRef/[Symbol.toPrimitive]` — enough for `clearTimeout` on the happy path (which only calls `clearTimeout(authTimeout)`) to not throw. Adequate for this use case.

**`spy.mockRestore()` in finally**: Called in both the normal path and the `finally` block. The second call after a first `mockRestore()` is a no-op in Vitest, so the double-restore is harmless and ensures the spy never leaks into subsequent tests.

**Test suite ran clean**: `pnpm --filter @praxis/claude-cli-sdk test` — 8 tests in `tool-server-auth.test.ts`, 52 total across the package, all passing.

**Parallelism note for the next story** (`gate-tests-tool-server-auth-frame-boundaries`): that story adds 2 more tests to the same file. No conflict risk since this story is done; the dependency is satisfied before that one starts.
