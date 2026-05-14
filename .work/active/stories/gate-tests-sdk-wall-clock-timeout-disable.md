---
id: gate-tests-sdk-wall-clock-timeout-disable
kind: story
stage: review
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

## Implementation

### Files created / extended

**New file**: `packages/claude-cli-sdk/src/cli/__tests__/stream-timeout.test.ts`

3 new tests covering the `streamEvents` gate predicate (`timeout > 0 && isFinite(timeout)`):

- `timeout:0 does not schedule a setTimeout (proc.kill is never called)` — spies on `globalThis.setTimeout` with fake timers; asserts no call with a positive delay was made and `proc.kill` was never invoked.
- `timeout:Infinity does not schedule a setTimeout (proc.kill is never called)` — same strategy, Infinity path.
- `timeout:300000 fires CLITimeoutError when the stream does not complete in time` — uses `vi.advanceTimersByTimeAsync(300_001)`; asserts `proc.kill("SIGTERM")` and that the generator throws `CLITimeoutError` with `timeoutMs === 300_000`.

Uses real `PassThrough` streams (not EventEmitter fakes) so `readline.createInterface` works without errors.

**Extended**: `packages/engines/src/__tests__/claude-code.test.ts`

1 new test added after the `tools: "none"` test:

- `open() passes timeout:0 to createConversation to disable the SDK wall-clock kill` — inspects `vi.mocked(createConversation).mock.calls[0]?.[0]` and asserts `timeout === 0`.

**Extended**: `packages/engines/src/__tests__/claude-code-vision.test.ts`

1 new test added before the `noSessionPersistence` test:

- `passes timeout:0 to query() to disable the SDK wall-clock kill` — captures options via a `mockImplementation` and asserts `timeout === 0`.

### Total new tests: 5 (3 in new file, 1 + 1 in existing files)

### Divergence from story suggestions

- **Gate predicate**: the story suggested the predicate would be `timeout <= 0 || !isFinite(timeout)`. The actual predicate in `stream.ts` is the logically equivalent `timeout > 0 && isFinite(timeout)` (positive guard style — schedule the timer only when it makes sense, rather than skip it). Tests match the actual behavior, not the story's phrasing.
- **Test names**: lightly adjusted for clarity; meaning is the same.
- **Vision method name**: story said `ClaudeCodeVision.read`; the actual method is `describe`. Test targets `describe` correctly.
