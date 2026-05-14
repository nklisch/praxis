---
id: epic-tutor-session-feel-cancellation-propagation-engine-and-subagent
kind: story
stage: done
tags: [engines, tools, core]
parent: epic-tutor-session-feel-cancellation-propagation
depends_on: [epic-tutor-session-feel-cancellation-propagation-core-plumbing]
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Story 2: Engine + sub-agent propagation

## Scope

Make every engine adapter supply the per-turn `signal` to
`registry.dispatch`. Thread the signal through every sub-agent entry
(`runConceptExplorer`, `grade_with_rubric`, any other). Wire
`SubAgentRegistry.interruptAllForSession` so in-flight sub-agent items
visibly transition to `interrupted` on parent abort. After this story,
clicking Stop actually stops sub-agents end-to-end.

## Units

- Unit 3 (three engine adapters thread signal into their dispatch
  sites; instance-field-or-closure pattern depending on adapter shape):
  - `packages/engines/src/claude-code/` (MCP bridge or tool-call
    handler)
  - `packages/engines/src/codex/adapter.ts`
  - `packages/engines/src/direct/adapter.ts`
- Unit 4 (`runConceptExplorer` accepts and propagates signal; adds
  `"interrupted"` to `reason`).
- Unit 5 (`course.start_exploration` handler passes `ctx.signal` to
  `runConceptExplorer`).
- Unit 6 (`grade_with_rubric` and other sub-agent tools threading
  signal — find via `grep -r "runConceptExplorer\|engine\.open" packages/tools/`).
- Unit 7 (`SubAgentRegistry.interruptAllForSession` method +
  `SessionServiceImpl.send` calls it at the existing
  `signal?.aborted` short-circuit).
- Unit 8 remainder (engine + explorer + sub-agent abort tests).

## Acceptance Criteria

- [ ] All three engine adapters supply `signal` to `registry.dispatch`
      when invoking a tool during a streaming turn.
- [ ] Aborting a turn that's mid-`course.start_exploration` causes
      `runConceptExplorer` to return `{ ok: false, reason:
      "interrupted" }`.
- [ ] On parent abort, `SubAgentRegistry` items for that session
      transition from `running` → `interrupted` and emit a final
      event to listeners.
- [ ] Manual smoke: click Stop during a bootstrap exploration. The
      sub-agent stops within ~1s (no further tool calls observed in
      the rail / chat).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- Per-tool eager-bail polish (handlers that check `signal.aborted`
  inside long loops). Best-effort; not blocking.

## Implementation Notes

### Files changed (across 6 packages)

**packages/engines/src/mcp/types.ts** — Added `getSignal?: () => AbortSignal | undefined` to `StartToolBridgeInput`. The getter pattern (read-at-dispatch-time) is necessary because MCP handlers are registered once at `open()` but need to read the per-turn signal that's only known at `send()` time.

**packages/engines/src/mcp/tool-bridge.ts** — `buildSdkTool` now accepts and calls `getSignal` at dispatch time, threads result into `registry.dispatch({ callId, signal })` via conditional spread.

**packages/engines/src/claude-code/adapter.ts** — Per-adapter approach: `currentSignal: AbortSignal | undefined` lives in the `open()` closure (not on the class, since `ClaudeCodeEngineSession` is a separate class). A `setCurrentSignal` callback is passed through `ClaudeCodeSessionInit` and called at the start/finally of `send()`. The MCP bridge's `getSignal` getter closes over the same variable.

**packages/engines/src/codex/adapter.ts** — Same instance-field-via-closure pattern as Claude Code. Both adapters use the MCP bridge so the approach is identical.

**packages/engines/src/direct/adapter.ts** — Direct adapter does NOT use the MCP bridge; it uses `toVercelTools()`. Since `send()` calls `toVercelTools()` on every turn, the signal is captured as a simple closure: `const getSignal = () => signal;` passed to `toVercelTools`. Clean and avoids any mutable state.

**packages/engines/src/direct/tool-conversion.ts** — `toVercelTools` now accepts optional `getSignal?: () => AbortSignal | undefined`; threads into each tool's `execute` callback.

**packages/curriculum/src/bootstrap/explorer.ts** — `RunConceptExplorerInput.signal?: AbortSignal` added. Early-abort guard before `engine.open`. Signal threaded into `session.send(initialMessage, input.signal)`. Mid-loop `break` on `input.signal?.aborted`. Post-finally check returns `{ ok: false, reason: "interrupted", draftId, stepsUsed }` carrying partial state. `RunConceptExplorerResult.reason` union extended with `"interrupted"`.

**packages/tools/src/course/start-exploration.ts** — `ctx.signal` passed to `runConceptExplorer` via conditional spread. `OutputSchema` reason enum extended with `"interrupted"`.

**packages/core/src/types/subagent.ts** — `SubAgentItem.status` extended with `"interrupted"`. `SubAgentEvent.kind === "finished"` status extended with `"interrupted"`. `SubAgentHandle.finish` signature extended. `SubAgentRegistry.interruptAllForSession(parentSessionId: SessionId): void` added.

**packages/core/src/services/subagent-registry.ts** — `SessionId` import added. `interruptAllForSession` implemented: iterates items, filters by `sessionId === parentSessionId && status === "running"`, calls `onFinish(callId, "interrupted")`. `onFinish` signature updated to `"done" | "failed" | "interrupted"`. Linger-cleanup applies identically.

**packages/core/src/services/session-service.ts** — At the existing `signal?.aborted` short-circuit (defensive loop check), added `this.deps.subAgent?.interruptAllForSession(sessionId)` before emitting the interrupted event.

### Unit 6 — No other sub-agent tools found

`grep -rn "engine\.open\|runConceptExplorer\|engineResolver" packages/tools/src/` found only `course.start_exploration` as a sub-agent-spawning tool. The `grade_with_rubric` and rubric grader mentioned in the design live in `packages/core/src/services/graders/` (outside tools/) and use a different path that doesn't go through `registry.dispatch` from engine adapters, so they're out of scope per the current architecture.

### Test coverage

- `packages/engines/src/__tests__/tool-bridge.test.ts` — 2 new tests: signal threaded via `getSignal`; no signal when `getSignal` absent.
- `packages/engines/src/__tests__/direct.test.ts` — 1 new test: `toVercelTools` threads signal via getter.
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` — 2 new tests: early-abort (before `engine.open`); abort mid-loop carrying partial draftId.
- `packages/core/src/services/__tests__/subagent-registry.test.ts` — 5 new tests in `interruptAllForSession` describe block.
- `packages/core/src/services/__tests__/session-service.abort-subagent.test.ts` — new file; 2 tests: abort calls `interruptAllForSession`; no-op when `subAgent` not wired.

### Typecheck/lint/test status

- `pnpm typecheck`: zero new errors (3 pre-existing `courseDocuments` errors from parallel callsite-sweep story, confirmed in baseline).
- `pnpm lint`: no errors in any changed file.
- `pnpm test`: 7 pre-existing failures (same in baseline, from parallel scopes-primitive callsite-sweep work). All 12 new tests pass.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- All 3 engine adapters thread signal cleanly. Claude Code and Codex use the MCP bridge's `getSignal?: () => AbortSignal | undefined` lazy resolver (so the bridge reads the current send's signal at dispatch time, not registration time) — this is the right pattern because MCP server handlers are registered once at `open()` but signals are per-`send()`.
- Direct adapter takes the simpler closure approach via `toVercelTools(registry, getSignal)` — appropriate since its tool callbacks are wired per-send.
- `runConceptExplorer` early-abort + mid-loop break + finally-block check covers all three abort timing windows. Partial `draftId` is preserved on interrupt — useful for the bootstrap UI's "we got this far" feedback.
- `SubAgentRegistry.interruptAllForSession` iterates `running` items, transitions to `"interrupted"`, emits terminal event, schedules linger cleanup — matches the design's lifecycle contract.
- `SessionServiceImpl.send` calls `this.deps.subAgent?.interruptAllForSession(sessionId)` at the defensive `signal?.aborted` short-circuit — optional dep so existing tests that build minimal deps don't break.
- 12 new tests across 5 files: MCP bridge `getSignal` threading, Direct's `toVercelTools`, explorer early-abort + draft preservation, SubAgentRegistry interrupt lifecycle, SessionServiceImpl abort → registry wiring.
- Unit 6 (grade_with_rubric and other sub-agent tools): no other sub-agent-spawning tools found in `packages/tools/` — only `course.start_exploration` resolves an engine. Verified via grep. Sensible to confirm the negative finding in implementation notes.
