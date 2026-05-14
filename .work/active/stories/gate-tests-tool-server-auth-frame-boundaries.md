---
id: gate-tests-tool-server-auth-frame-boundaries
kind: story
stage: review
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
