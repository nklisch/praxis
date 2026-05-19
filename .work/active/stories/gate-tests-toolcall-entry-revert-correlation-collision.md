---
id: gate-tests-toolcall-entry-revert-correlation-collision
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `<ToolCallEntry>` revert correlation under multiple same-kind tool calls in one turn

## Priority
High

## Spec reference
Item: `epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry`

Acceptance criterion: "Revert button visible when `actionId` is set; calls
`restoreAction` and surfaces success/failure."

Story body implementation note: "Correlation is by kind
(`toolName === action.kind`) and time order (n-th settled entry of a kind
maps to n-th action row of that kind, sorted by `ts`). This is reliable for
authoring sessions because tool calls in a single turn are not concurrent."

That's a behavioral assumption with no test pinning it. If two `gate.create`
calls execute in a turn and only one succeeds, the correlation could attach
the wrong actionId to the wrong tool-call entry — and the revert button
would roll back the wrong row.

## Gap type
adversarial-spec-silent (behavioral invariant declared in implementation
notes but not tested)

## Suggested test
```ts
// packages/ui/src/components/__tests__/authoring-chat-pane.test.tsx
it("correlates multiple same-kind tool calls in a turn to actionIds in time order", async () => {
  const actions = [
    { id: "a-1", kind: "lesson.create", ts: 1000 },
    { id: "a-2", kind: "lesson.create", ts: 1100 },
  ];
  const client = makeFakeClient({
    author: { listConfiguratorActions: vi.fn().mockResolvedValue(actions) },
  });
  // Render with two tool_call events of kind lesson.create in episodic order.
  // Assert the first ToolCallEntry has actionId=a-1; second has actionId=a-2.
});

it("does not attach an actionId when there are more tool_call entries than actions of that kind", async () => {
  // Three lesson.create entries, two actions — third entry's revert button is hidden.
});
```

Better long-term remediation: persist the engine-level `callId` on
`configurator_actions` so correlation is a direct join, removing the
n-th-by-time assumption entirely.

## Test location (suggested)
`packages/ui/src/components/__tests__/authoring-chat-pane.test.tsx`

## Implementation notes (2026-05-18)

Added two tests to `packages/ui/src/components/__tests__/authoring-chat-pane.test.tsx` in a new
`describe("AuthoringChatPane — revert correlation (same-kind tool calls)")` block.

**Approach**: Tests feed pre-settled episodic events (via a mock `client.memory.episodic` async
generator) and a matching list of `ConfiguratorActionRow` objects (via `client.author.listConfiguratorActions`).
`AuthoringChatPane` calls `loadHistory` on mount, which runs the events through `episodicToItems` —
this creates `tool-entry` items with `firstSeenAt: 0`. The `buildCallIdToActionMap` function then
zips the sorted `tool-entry` items (by `firstSeenAt` asc, stable at 0 → preserves episodic order)
against the sorted action rows (by `ts` asc).

**Test 1 — correlation in time order**: Two `lesson.create` tool_call/tool_result pairs in episodic
order; two action rows with ascending `ts`. After history loads, both revert buttons appear. Clicking
the first and confirming calls `restoreAction({ actionId: "a-1" })`; clicking the second calls
`restoreAction({ actionId: "a-2" })`. This directly exercises the real correlation path through the
component (no mocking of `buildCallIdToActionMap`).

**Test 2 — no actionId for excess entries**: Three `lesson.create` entries, only two action rows.
Asserts exactly 2 revert buttons appear — the third entry renders without a revert button.

**Discovery**: No bugs found. The correlation works correctly as documented. The only subtlety:
`episodicToItems` sets `firstSeenAt: 0` for all history entries, so the sort in `buildCallIdToActionMap`
is stable and preserves the order the events appear in the episodic stream. If two events had different
non-zero `firstSeenAt` values (which can't happen in history replay), the sort would use those instead.
This is the expected behavior and matches the implementation notes in the story.
