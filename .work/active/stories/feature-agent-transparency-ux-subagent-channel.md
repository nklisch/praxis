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
updated: 2026-05-12
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

## Implementation notes

### Files changed (new)
- `packages/core/src/types/subagent.ts` — full type contract: `SubAgentItem`, `SubAgentStep`, `SubAgentEvent` (kind discriminator), `SubAgentHandle`, `SubAgentListener`, `SubAgentRegistry`, `SubAgentStartInput`
- `packages/core/src/services/subagent-registry.ts` — `SubAgentRegistryImpl` with 30s linger, 200 step cap, filtered subscribe, dep-injected `resolveLabel`
- `packages/core/src/services/__tests__/subagent-registry.test.ts` — 15 tests covering all registry behaviors
- `packages/client/src/services/sub-agent-client.ts` — `SubAgentClient` with `events(input?)` and `list()`
- `packages/desktop/electron/main/subagent-channel.ts` — IPC fanout following subscriber-fanout-stream pattern

### Files changed (modified)
- `packages/core/src/types/tool.ts` — `ToolContext.callId?: string`, `ToolServices.subAgent?: SubAgentRegistry`
- `packages/core/src/types/engine.ts` — `ToolDispatchMeta { callId?: string }`, extended `ToolRegistry.dispatch` signature
- `packages/core/src/types/client.ts` — `SubAgentClientApi` interface, `PraxisClient.subAgent`
- `packages/core/src/types/index.ts` — re-exports for all SubAgent types + `SubAgentClientApi`
- `packages/core/src/services/index.ts` — exports `SubAgentRegistryImpl` and `SubAgentRegistryDeps`
- `packages/core/src/services/types.ts` — `toolServices.subAgent?` and top-level `ServiceDeps.subAgent?`
- `packages/core/src/services/session-service.ts` — threads `subAgent` into tool context construction
- `packages/tools/src/registry.ts` — `dispatch(name, args, meta?: DispatchMeta)`, per-call context shallow-copy with `callId`
- `packages/tools/src/index.ts` — exports `DispatchMeta`
- `packages/engines/src/mcp/tool-bridge.ts` — generates `uuidv7()` per invocation as callId fallback (MCP SDK doesn't surface per-request id through tool callback)
- `packages/engines/src/direct/tool-conversion.ts` — passes Vercel's `toolCallId` from execute callback as `{ callId }`
- `packages/desktop/electron/main/services.ts` — instantiates `SubAgentRegistryImpl` with `resolveLabel` from `@praxis/tools/labels`
- `packages/desktop/electron/main/ipc-server.ts` — registers sub-agent IPC handlers
- `packages/client/src/client.ts` — mounts `SubAgentClient` as `subAgent` on `PraxisClient`
- `packages/curriculum/src/bootstrap/explorer.ts` — `subAgentHandle?` on input, step emissions, phase transition labels
- `packages/tools/src/course/start-exploration.ts` — creates sub-agent handle from `ctx.callId`, passes to explorer, calls `finish`
- `packages/tools/src/__tests__/registry.test.ts` — added callId threading tests
- `packages/engines/src/__tests__/tool-bridge.test.ts` — added uuidv7 callId uniqueness test, updated existing dispatch assertion
- `packages/engines/src/__tests__/direct.test.ts` — added `toVercelTools callId threading` describe, updated existing dispatch assertion
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` — added `subAgentHandle emissions` describe (5 tests)

### MCP callId resolution
Risk 2 from the parent feature design materialized: the MCP SDK worker script (`@praxis/claude-cli-sdk/src/tool-server.ts`) forwards only `name` and `input` to the parent process callback — not the per-request id. Resolution: `buildSdkTool` in `tool-bridge.ts` generates a `uuidv7()` per invocation and passes it as `{ callId }` to `registry.dispatch`. Each call still gets a unique, sortable id; it just doesn't correlate back to the MCP protocol layer.

### Pre-existing issues (not fixed, out of scope)
- `packages/tools/src/runtime/ingestion/__tests__/vision-pdf-ingestor.test.ts` — missing `dirFor` property on `PageImageStore` mock; typecheck error in `@praxis/tools` predates this story
- `packages/claude-cli-sdk/` — 4 lint errors (`noNonNullAssertion`, `noUnusedVariables`, `noGlobalIsFinite`, `useLiteralKeys`) all pre-existing

### Verification
- `pnpm test`: 2651 passed / 21 skipped / 0 failed (303 test files)
- `pnpm typecheck`: passes for all packages except `@praxis/tools` (pre-existing `dirFor` error)
- `pnpm lint`: 4 errors all in `claude-cli-sdk` (pre-existing); 0 errors in changed files

## Review (2026-05-12)

**Verdict**: Request changes — sending back to implementing.

**Blockers**:

- **MCP-side callId propagation incomplete.** The bridge at `packages/engines/src/mcp/tool-bridge.ts:42-48` generates `const callId = uuidv7()` for `registry.dispatch`, but the Claude Code adapter at `packages/engines/src/claude-code/events.ts:47` separately emits `tool_call` events with `callId: event.toolId` (the SDK's sequential `callCounter` value from `packages/claude-cli-sdk/src/tool-server.ts:249`). These IDs never match. The story's acceptance criterion called for the fallback to be "propagated on both sides" (see Risk 2 in the parent feature); only the registry/handler side is done. Result: under the Claude Code engine (the default), the upcoming sub-agent UI will subscribe with `parentCallId = "1" | "2" | ...` (the SDK toolId) while the registry stores under `parentCallId = "<uuidv7>"`. Subscription delivers nothing. The Direct adapter path is unaffected (Vercel's `toolCallId` is used consistently for both event mapping and dispatch).

  **Fix direction (recommended)**: surface the SDK's `callCounter` value through the `tool()` callback in `@praxis/claude-cli-sdk/src/tool-server.ts` so the bridge can reuse it as `callId` rather than generating its own uuid. The forked SDK is owned by Praxis (per `CLAUDE.md`: "Praxis is the only consumer, so it's owned and modified freely — refactor it like any other workspace package").

  **Alternative**: maintain a synchronized `sdkToolId → bridgeUuid` map in the adapter and translate `event.toolId → bridgeUuid` inside `claude-code/events.ts`'s `tool_use` case.

  **Test to add**: drive a `tool_call` end-to-end through the Claude Code adapter (mocked SDK) and assert that the engine event's `callId` equals the `ctx.callId` the handler observes. Currently no test covers this cross-channel agreement; that's why the gap shipped.

**Important**: none beyond the blocker.

**Nits**: none.

**Notes on what landed cleanly (carry forward; do not redo)**:
- Types contract (`packages/core/src/types/subagent.ts`) — solid.
- `SubAgentRegistryImpl` (`packages/core/src/services/subagent-registry.ts`) — mirrors `ActivityRegistryImpl` correctly, with the appropriate differences (no quiet-period, ~30s linger, `parentCallId`-keyed, MAX_STEPS=200, filtered subscribe). The orchestrator's integration follow-up (`ed9c1e7`) fixed an `exactOptionalPropertyTypes` issue with `{ filter: undefined }`.
- `ToolContext.callId` extension + `dispatch(name, args, meta)` extension — solid.
- Direct adapter path — correct end-to-end; tests pass.
- Explorer emission — wired correctly.
- IPC channel + client — wired correctly.
- 15+ registry tests + 5 explorer tests + adapter dispatch-threading tests.

The Claude Code path is the only thing missing. Do not redo the rest.
