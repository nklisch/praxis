---
id: gate-tests-tool-server-auth-frame-boundaries
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: [gate-tests-tool-server-auth-timeout-window]
release_binding: v0.1.2
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# Tool-server auth frame split / coalesced cases are missing

## Priority
Medium

## Spec reference
Bound item: `epic-security-hardening-round-2-tool-bridge-socket-auth`

Acceptance criteria (Unit 3 design, test list items 7 and 8):
- "Auth frames split across chunks (partial-then-complete arrival) authenticate correctly."
- "Auth frame coalesced with a subsequent tool call in one chunk — both processed correctly (auth then call)."

## Gap type
Missing test for boundary (TCP-level frame coalescing/splitting —
load-bearing for the design's state-machine claim).

## Implementation

Added 2 tests to `packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts` after the existing "no frame within auth timeout window" test:

1. **"auth frame split across two write chunks authenticates correctly"** — splits the auth JSON at its midpoint and sends the two halves as separate `socket.write()` calls with a 10ms delay between them, then sends a tool call frame. Asserts the call returns `{ success: true, value: { echoed: "split" } }`, proving the line-buffer correctly accumulates partial chunks before processing.

2. **"auth frame coalesced with tool call in one chunk → both processed (auth then call)"** — sends `auth_json\ncall_json\n` in a single `socket.write()` call. Asserts the call returns `{ success: true, value: { echoed: "coalesced" } }`, proving the `while (newlineIdx !== -1)` loop processes the auth frame first, sets `authenticated = true`, then dispatches the tool call in the same data event.

All 10 tests pass (`pnpm vitest run`). Typecheck clean.

## Suggested tests

```typescript
// packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts (additions)

it("auth frame split across two write chunks authenticates correctly", async () => {
  // Write `{"type":"auth","tok` then a 50ms delay then `en":"<hex>"}\n{...call frame...}\n`
  // Assert the call gets a response (auth succeeded across the split)
});

it("auth frame coalesced with tool call in one chunk → both processed (auth then call)", async () => {
  // Write `<auth_json>\n<call_json>\n` in one socket.write; assert response
});
```

## Review

Approved. Verdict: **done**.

Both tests pass (10/10) and correctly pin the two distinct line-buffer behaviors.

**Split test**: Splits the auth JSON at its midpoint via two `socket.write()` calls separated by a 10ms delay, then sends the tool call in the same timer callback. Directly exercises the line-accumulator — a parser that cleared the buffer on each `data` event without waiting for a newline would break this.

**Coalesced test**: Sends `authFrame\ncallFrame\n` in a single `socket.write()`. Directly pins the `while (newlineIdx !== -1)` loop — dropping the loop to a single-line-per-event model would silently discard the tool call frame, failing this assertion.

Both acceptance criteria from the design (items 7 and 8) are covered. The assertions (`result.success === true`, `result.value === { echoed: "..." }`) are tight: they verify the full round-trip, not just the absence of an error.

**Nit (non-blocking)**: In the split test, the tool-call write is queued immediately after the second auth-half write in the same `setTimeout` callback. On loopback these may land in a single TCP segment, so what is actually tested is the auth-line accumulation half of the split; the tool-call frame arriving as a separate chunk is not forced. The comment overstate this slightly. This is fine — the accumulation behavior is what needs pinning, and the test does pin it.
