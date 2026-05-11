---
id: feature-agent-transparency-ux-subagent-ui
kind: story
stage: implementing
tags: [ui, chat]
parent: feature-agent-transparency-ux
depends_on: [feature-agent-transparency-ux-subagent-channel]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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
