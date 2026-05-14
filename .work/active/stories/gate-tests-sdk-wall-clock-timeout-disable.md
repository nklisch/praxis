---
id: gate-tests-sdk-wall-clock-timeout-disable
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# Test coverage for SDK wall-clock timeout escape hatch (`timeout: 0` / `Infinity`)

## Priority
High

## Spec reference
Bound item: `story-fix-disable-sdk-wall-clock-timeout`

Acceptance criterion (from the story body): "gate the `setTimeout` call
in `streamEvents` so `timeout <= 0 || !isFinite(timeout)` skips the
timer entirely" + "doc comments on `OptionsBase.timeout` and `query()`
updated to document the `0` / `Infinity` escape hatch."

The story explicitly notes "Coverage exists at the seams — no new tests
added" but the contract IS a new behavior, and there's a genuine product
invariant: bootstrap explorer wall-clock kills are the symptom that
motivated the fix. A regression that re-introduces a default timeout
(or that adds a new SDK callsite forgetting to pass `timeout: 0`) would
re-introduce the silent failure mode.

## Gap type
Missing test for boundary value (a real product invariant).

## Suggested tests

```typescript
// packages/claude-cli-sdk/src/cli/__tests__/stream-timeout.test.ts (new)

it("streamEvents with timeout:0 does not schedule a timeout (no proc.kill)", async () => {});
it("streamEvents with timeout:Infinity does not schedule a timeout", async () => {});
it("streamEvents with timeout:300000 fires CLITimeoutError when stream exceeds it", async () => {});

// packages/engines/src/__tests__/claude-code.test.ts (additions)

it("ClaudeCodeAdapter.open passes timeout:0 to createConversation", () => {});

// packages/engines/src/__tests__/claude-code-vision.test.ts (additions)

it("ClaudeCodeVision.read passes timeout:0 to query", () => {});
```
