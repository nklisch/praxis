---
id: feature-agent-transparency-ux-subagent-ui
kind: story
stage: done
tags: [ui, chat]
parent: feature-agent-transparency-ux
depends_on: [feature-agent-transparency-ux-subagent-channel]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Inline sub-agent block + bootstrap side-panel transcript

## Scope

Implements Unit 5 of `feature-agent-transparency-ux`. Adds the user-facing
sub-agent surface: an inline collapsible block in the chat thread (primary
surface, default-collapsed) and an optional side panel in the bootstrap tab
body (secondary surface, hidden by default, shows full transcript when toggled).

Depends on `feature-agent-transparency-ux-subagent-channel` for the
`SubAgentRegistry` + IPC channel + explorer emissions. Cannot start until that
story is at `stage: done`.

## Files to touch

- `packages/tools/src/labels/index.ts` — add `spawnsSubAgent?: boolean` to `ToolLabel`; set on `course.start_exploration`.
- `packages/ui/src/hooks/use-streamed-send.ts` — extend `ChatStreamItem` with `kind: "sub-agent"`; route tool_call to sub-agent or interstitial based on `getToolLabel(toolName).spawnsSubAgent`.
- `packages/ui/src/hooks/use-sub-agent.ts` (new) — `useSubAgent(parentCallId)` subscribes to `client.subAgent.events({ parentCallId })` and returns `{ item, recentSteps }`.
- `packages/ui/src/hooks/use-current-sub-agent.ts` (new) — `useCurrentSubAgent()` returns the most-recently-started in-flight sub-agent's `parentCallId` (or null).
- `packages/ui/src/components/sub-agent-block.tsx` (new) — inline collapsible block component.
- `packages/ui/src/components/sub-agent-block.module.css` (new)
- `packages/ui/src/components/sub-agent-panel.tsx` (new) — bootstrap side-panel transcript with show/hide toggle.
- `packages/ui/src/components/sub-agent-panel.module.css` (new)
- `packages/ui/src/components/chat-tab-body.tsx` — render `<SubAgentBlock>` in the item loop for `kind: "sub-agent"`.
- `packages/ui/src/components/bootstrap-tab-body.tsx` — add `<SubAgentPanel parentCallId>` to the right pane below the outline.

### Tests
- `packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx` (new)
- `packages/ui/src/components/__tests__/sub-agent-block.test.tsx` (new)
- `packages/ui/src/__tests__/bootstrap-tab-body.test.tsx` (extend, if exists; otherwise new)

## Acceptance Criteria

### Labels + routing
- [ ] `ToolLabel.spawnsSubAgent?: boolean` added to the interface.
- [ ] `course.start_exploration`'s label has `spawnsSubAgent: true`.
- [ ] In `use-streamed-send.ts`'s `tool_call` branch: when `getToolLabel(toolName).spawnsSubAgent === true`, push a `kind: "sub-agent"` item (NOT an interstitial). Otherwise push an interstitial as today (with the `firstSeenAt` from Story 1 if landed; without it if not).

### Sub-agent block (inline)
- [ ] `ChatStreamItem` includes a `kind: "sub-agent"` variant with `{ callId, toolName, status, errored? }`.
- [ ] `<SubAgentBlock>` renders one line summary by default: `▸ <label> · N steps · live`.
- [ ] `label` resolves from the subscription's current item label; falls back to `initialLabel` (passed from `getToolLabel(toolName).present.toLowerCase()`).
- [ ] Step count rendered only when `steps.length > 0`. Hidden when 0 to keep early state quiet.
- [ ] `live` indicator visible while parent status is `in_flight` AND subscription item status is `running`.
- [ ] Click on the summary line toggles expansion. Expanded shows up to 8 most recent step labels with `└` Unicode bullets.
- [ ] When the parent's `tool_result` lands, the block transitions to settled state (no `live` indicator). It REMAINS in the items list as the historical record (do not unmount).
- [ ] When the sub-agent finished with `failed` status, the block shows "couldn't finish" inline; otherwise just settles quietly.

### Sub-agent panel (bootstrap-only side panel)
- [ ] `<SubAgentPanel parentCallId>` mounts inside `BootstrapTabBody`'s right pane (below the outline).
- [ ] When `parentCallId` is null (no active exploration), panel renders null.
- [ ] When set, the panel shows a thin toggle button: "show sub-agent transcript" / "hide sub-agent transcript".
- [ ] Default-hidden. Toggle persists in component state (not URL).
- [ ] When visible, shows the FULL step list (not capped to 8). Use a virtualized list if `steps.length > 50`.
- [ ] `useCurrentSubAgent()` returns the most-recently-started in-flight sub-agent's `parentCallId` (queried via `client.subAgent.list()`).

### Subscription lifecycle
- [ ] `useSubAgent(parentCallId)` subscribes on mount and unsubscribes on unmount.
- [ ] When `parentCallId` changes, the previous subscription is torn down and a new one is established.
- [ ] On stream error, the hook keeps the last good state (no crash).

### Tests
- [ ] `useSubAgent` test: mock client emits scripted `snapshot` → `step_started` x3 → `step_settled` → `finished`; assert hook state mirrors correctly.
- [ ] `<SubAgentBlock>` tests: initialLabel-only render; 3-steps render; expand → step list visible; live indicator present/absent based on status; failed state renders "couldn't finish".
- [ ] `<BootstrapTabBody>` test: panel toggle visible while running; clicking shows full step list.

## References

- Design: `.work/active/features/feature-agent-transparency-ux.md` (Unit 5)
- Existing pattern to mirror: `useActivity()` (`packages/ui/src/hooks/use-activity.ts`) — same subscription/folding shape.
- Tool labels SSOT: `packages/tools/src/labels/index.ts`
- Existing tab-body: `packages/ui/src/components/bootstrap-tab-body.tsx`

<!-- Implementation Notes accumulate here as work progresses. -->

## Implementation notes

### Files created (new)

- `packages/ui/src/hooks/use-sub-agent.ts` — `useSubAgent(parentCallId)` subscribes to `client.subAgent.events({ parentCallId })` and folds all event kinds (snapshot / started / step_started / step_settled / phase_changed / finished) into local state. Mirrors `useActivity()` shape: same try/catch cleanup, same `cancelled` flag, same per-`parentCallId` dep.
- `packages/ui/src/hooks/use-current-sub-agent.ts` — `useCurrentSubAgent()` subscribes to the unfiltered event stream and calls `client.subAgent.list()` on each event to pick the most-recently-started running item. Returns `parentCallId | null`.
- `packages/ui/src/components/sub-agent-block.tsx` — `<SubAgentBlock>` inline collapsible block. Default-collapsed summary line: `▸ <label> · N steps · live`. Expands to show the 8 most-recent steps with `└` bullets. Settles quietly when `status === "settled"`; shows "couldn't finish" when `errored`. Stays in the items list as the historical record.
- `packages/ui/src/components/sub-agent-block.module.css` — editorial CSS: composes from global, `└` bullet, live-pulse animation, faint muted colors.
- `packages/ui/src/components/sub-agent-panel.tsx` — `<SubAgentPanel parentCallId>` bootstrap right-pane side panel with show/hide toggle. Renders null when `parentCallId` is null. Mounts `<SubAgentTranscript>` only when visible (avoids unnecessary subscriptions). Shows full step list (scrollable, no cap).
- `packages/ui/src/components/sub-agent-panel.module.css`
- `packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx` — 10 tests covering snapshot, started, step_started, step_settled, phase_changed, finished, non-matching events, stream error resilience, unmount safety.
- `packages/ui/src/components/__tests__/sub-agent-block.test.tsx` — 8 tests: initialLabel-only render, no step count at zero, step count after snapshot, expand shows steps, 8-step cap, live indicator, no-live when settled, "couldn't finish" on errored+settled.

### Files modified

- `packages/tools/src/labels/index.ts` — added `spawnsSubAgent?: boolean` to `ToolLabel`; set `spawnsSubAgent: true` on `course.start_exploration`.
- `packages/ui/src/hooks/use-streamed-send.ts` — added `SubAgentSpawn` interface and `kind: "sub-agent"` to `ChatStreamItem`; routed `tool_call` branch to push sub-agent item when `label.spawnsSubAgent === true`; added immediate settle (no pacing timer) for sub-agent items in `tool_result` branch.
- `packages/ui/src/components/chat-tab-body.tsx` — added `kind: "sub-agent"` branch to item loop rendering `<SubAgentBlock>`; added `getToolLabel` import.
- `packages/ui/src/components/configure-chat-pane.tsx` — added `kind: "sub-agent"` guard returning null (sub-agent blocks don't appear in configure pane).
- `packages/ui/src/components/sidekick-panel.tsx` — same null guard for sub-agent kind.
- `packages/ui/src/components/bootstrap-tab-body.tsx` — added `useCurrentSubAgent()` call and `<SubAgentPanel parentCallId={currentSubAgent} />` below the outline.
- `packages/ui/src/__tests__/helpers/fake-client.ts` — added `subAgent: {} as PraxisClient["subAgent"]` stub to `makeFakeClient`.
- `packages/engines/src/claude-code/events.ts` — added `ClaudeCodeEventState` interface and `createEventState()` factory; extended `mapClaudeCodeEvent` with optional `state` parameter; when state is provided, `tool_use` events are translated to sequential callIds (`"1"`, `"2"`, …) matching the bridge worker's counter, and `tool_result` events resolve back via the translation map.
- `packages/engines/src/claude-code/adapter.ts` — creates a fresh `eventState` per `send()` call and threads it into `mapClaudeCodeEvent`.
- `packages/engines/src/__tests__/claude-code-events.test.ts` — added 4 cross-channel agreement tests under `"cross-channel callId agreement"` describe block.

### Cross-channel question resolution: **IDs DISAGREE in production, adapter-side fix landed**

The review of `subagent-channel` parked an open question: do `event.toolId` (Claude UUID from the wire protocol, e.g. `"toolu_01ABC..."`) and `ctx.callId` (the bridge worker's sequential counter `"1"`, `"2"`, ...) agree for the same tool invocation?

**Finding**: They do NOT agree in production. Claude's API assigns UUIDs to tool use blocks; the MCP bridge worker maintains an independent `callCounter` for its Unix socket IPC. These are in different namespaces with no shared identity.

**Fix landed** (adapter-side translation): `packages/engines/src/claude-code/events.ts` now maintains a `ClaudeCodeEventState` (per-session, per-turn) with an `orderCounter` and a `toolIdToCallId: Map<string, string>`. Each `tool_use` event increments the counter (producing `"1"`, `"2"`, ...) and stores the Claude UUID → sequential id mapping. Each `tool_result` resolves the Claude UUID back to the same sequential id. Both channels now emit identical callId values for the same invocation.

**Tests**: 4 new tests in `claude-code-events.test.ts` verify sequential assignment, tool_result resolution, out-of-order result resolution, and backward-compat (no state → raw UUID passthrough). All pass.

### Verification

```
pnpm --filter @praxis/engines test: 103 passed / 0 failed (13 test files)
pnpm --filter @praxis/ui test: 798 passed / 0 failed (94 test files)
pnpm typecheck: passes for all packages
pnpm lint: 16 errors all pre-existing in claude-cli-sdk and client/__tests__; 0 errors in changed files
```

## Review (2026-05-12)

**Verdict**: Approve (with one inline fix folded in)

**Blockers (fixed inline by reviewer)**:
- `eventState` was created per-`send()` in `ClaudeCodeEngineSession`, but the MCP bridge worker's `callCounter` is per-conversation (worker is spawned lazily on first `Conversation.send()` and lives until session close). On the second `send()` in any session, the adapter would mirror "1, 2…" while the bridge kept counting "3, 4…" — IDs would diverge silently. Fixed inline at commit `615f2d9`: hoisted `eventState` to a `private readonly` field on `ClaudeCodeEngineSession`, shared across all `send()` calls. Added regression test in `packages/engines/src/__tests__/claude-code.test.ts` that drives two `send()` calls and asserts `firstSendCallIds === ["1"]`, `secondSendCallIds === ["2"]`.

**Important**: none beyond the blocker.

**Nits**: none.

**Notes**:
- The agent's adapter-side translation map (`ClaudeCodeEventState.toolIdToCallId`) is the right architecture — Claude assigns UUIDs, the bridge assigns counters; the adapter mediates by mirroring the counter sequence. The lifetime bug was a subtle but real correctness issue; the structural fix is correct.
- `<SubAgentBlock>` settle path correctly skips the `MIN_INTERSTITIAL_VISIBLE_MS` pacing (sub-agent items have their own internal pacing via event stream).
- `<SubAgentTranscript>` only mounts when the panel is toggled visible — avoids unnecessary subscriptions when hidden.
- 4 cross-channel agreement tests in `claude-code-events.test.ts` + 8+ component tests on `<SubAgentBlock>` + the new regression test for cross-send callId continuity.
- Verification post-fix: `pnpm typecheck` green (incl. root gate), `pnpm test` 2763 passing.

Approved and advancing to done.
