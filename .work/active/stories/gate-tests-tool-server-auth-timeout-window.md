---
id: gate-tests-tool-server-auth-timeout-window
kind: story
stage: review
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
