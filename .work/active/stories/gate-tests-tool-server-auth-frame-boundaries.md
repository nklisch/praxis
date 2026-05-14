---
id: gate-tests-tool-server-auth-frame-boundaries
kind: story
stage: drafting
tags: [testing, security]
parent: null
depends_on: []
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
