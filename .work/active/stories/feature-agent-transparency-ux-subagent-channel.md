---
id: feature-agent-transparency-ux-subagent-channel
kind: story
stage: implementing
tags: [ui, chat, core]
parent: feature-agent-transparency-ux
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# SubAgentRegistry + IPC channel + explorer emission

## Scope

Implements Units 3 + 4 of `feature-agent-transparency-ux`. Adds a
`SubAgentRegistry` service (mirrors `ActivityRegistry`), an IPC channel for
the UI to subscribe to its events, threads `callId` through tool dispatch,
and wires the bootstrap explorer to emit step-by-step events as it runs.

These two units MUST land together: the registry is meaningless without a
producer; the producer has nowhere to publish without the registry.

## Files to touch

### Core types + service
- `packages/core/src/types/subagent.ts` (new) — types: `SubAgentItem`, `SubAgentStep`, `SubAgentEvent`, `SubAgentStartInput`, `SubAgentHandle`, `SubAgentListener`, `SubAgentRegistry`.
- `packages/core/src/services/subagent-registry.ts` (new) — `SubAgentRegistryImpl` (mirrors `ActivityRegistryImpl`, but keyed by `parentCallId`, no quiet-period, ~30s linger after finish).
- `packages/core/src/types/tool.ts` — extend `ToolContext` with `callId?: string`; extend `ToolServices` with `subAgent?: SubAgentRegistry`.
- `packages/core/src/services/index.ts` (or whichever barrel) — re-export the new types.

### Tool dispatch
- `packages/tools/src/registry.ts` — extend `dispatch(name, args, meta?: { callId?: string })`; construct a per-call ToolContext copy with `callId` set.

### Engine adapters
- `packages/engines/src/mcp/tool-bridge.ts` — pass the MCP request id (from the `tool()` callback context) as `{ callId }` into `registry.dispatch`.
- `packages/engines/src/direct/tool-conversion.ts` — pass Vercel's `toolCallId` as `{ callId }`.

### IPC + client
- `packages/desktop/electron/main/subagent-channel.ts` (new) — IPC fanout following the activity-channel pattern. Channels: `praxis.subAgent.events.<streamId>` (push, supports `parentCallId` filter), `praxis.subAgent.list`.
- `packages/desktop/electron/main/services.ts` — instantiate `SubAgentRegistryImpl`, pass to `ServiceDeps.subAgent`, mount the IPC channel.
- `packages/client/src/sub-agent.ts` (new) — `SubAgentClient` exposing `events({ parentCallId? })` and `list()`.
- `packages/client/src/index.ts` — register `subAgent` on `PraxisClient`.

### Producer (explorer)
- `packages/curriculum/src/bootstrap/explorer.ts` — extend `RunConceptExplorerInput` with `subAgentHandle?: SubAgentHandle`; emit `stepStarted`/`stepSettled` from the for-await loop; emit `setLabel` on phase transitions; `finish` on exit (done / failed).
- `packages/tools/src/course/start-exploration.ts` — `ctx.services.subAgent?.start({ parentCallId: ctx.callId, sessionId: ctx.sessionId, label })`; pass the handle to `runConceptExplorer`; finish on result.

### Tests
- `packages/core/src/services/__tests__/subagent-registry.test.ts` (new)
- `packages/tools/src/__tests__/registry.test.ts` — extend with callId-threading test
- `packages/engines/src/__tests__/direct.test.ts` and `mcp-tool-bridge.test.ts` — assert dispatch is called with `{ callId }`
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` — extend with sub-agent handle assertions

## Acceptance Criteria

### Types + registry
- [ ] `SubAgentItem`, `SubAgentStep`, `SubAgentEvent`, `SubAgentHandle`, `SubAgentRegistry` types exported from `@praxis/core/types`.
- [ ] `SubAgentRegistryImpl.start({ parentCallId, sessionId, label })` returns a handle keyed by `parentCallId`.
- [ ] `handle.stepStarted({ callId, toolName })` emits `step_started` event with the step appended to the item.
- [ ] `handle.stepSettled({ callId, ok })` emits `step_settled` event; finds the matching step and sets `ok`/`endedAt`.
- [ ] `handle.setLabel(label)` emits `phase_changed` event with the new label.
- [ ] `handle.finish("done" | "failed", err?)` emits `finished` event; item lingers ~30s in `list()` then is removed.
- [ ] `subscribe(listener)` receives a `snapshot` event immediately.
- [ ] `subscribe(listener, { parentCallId })` filters all subsequent events to that parentCallId only.

### Dispatch + adapters
- [ ] `ToolContext.callId` is optional string.
- [ ] `InProcessToolRegistry.dispatch(name, args, { callId: "abc" })` populates `ctx.callId === "abc"` in the handler.
- [ ] `dispatch(name, args)` without meta → handler receives `ctx.callId === undefined`.
- [ ] Direct adapter passes `toolCallId` from Vercel's `execute` callback as `{ callId }`.
- [ ] MCP bridge passes the per-request id as `{ callId }`. (If the MCP SDK does not surface this through the `tool()` callback, fall back to generating a uuidv7 inside the bridge and propagating both ways — see Risk 2 in the parent feature.)

### IPC channel
- [ ] `praxis.subAgent.events.<streamId>` IPC channel established following the `subscriber-fanout-stream` pattern.
- [ ] Optional filter parameter in subscribe payload constrains events to one `parentCallId`.
- [ ] `client.subAgent.events()` is an `AsyncIterable<SubAgentEvent>`.
- [ ] Subscribe sends initial `snapshot` of current items (filtered if applicable).
- [ ] Hold-open via AbortController; unsubscribes cleanly when iterator is dropped.

### Explorer emission
- [ ] When `course.start_exploration` is dispatched with `ctx.callId`, a sub-agent item is registered with `parentCallId === ctx.callId`.
- [ ] Each `tool_call` inside the explorer's `for await` loop produces a `stepStarted` call on the handle.
- [ ] Each `tool_result` produces a matching `stepSettled` call.
- [ ] On phase transitions (`reading` → `shaping` → `finalizing`), the handle's `setLabel` is called with the user-facing phrase: "reading your materials" / "drafting an outline" / "finalizing the draft".
- [ ] Successful explorer exit calls `handle.finish("done")`.
- [ ] Failed explorer exit (engine_error or no_draft_init) calls `handle.finish("failed", { message })`.
- [ ] When `ctx.callId` is `undefined` (test stubs without an engine), `subHandle` is undefined and all emissions are no-ops; existing explorer tests pass unchanged.

### Tests
- [ ] Registry tests cover snapshot, start, step_started, step_settled, setLabel, finish, linger removal, filtered subscribe.
- [ ] Registry dispatch test asserts callId threading.
- [ ] Direct and MCP-bridge tests assert dispatch is called with `{ callId }`.
- [ ] Explorer test asserts step emission sequence matches scripted tool calls.

## References

- Design: `.work/active/features/feature-agent-transparency-ux.md` (Units 3 + 4)
- Patterns to mirror: `ActivityRegistryImpl` (`packages/core/src/services/activity-registry.ts`), activity-channel IPC, `service-deps-injection`, `subscriber-fanout-stream`, `ipc-channel-convention`.
- Existing producer pattern: `ctx.services.activity?.start(...)` in `packages/tools/src/course/start-exploration.ts:139–169`.

<!-- Implementation Notes accumulate here as work progresses. -->
