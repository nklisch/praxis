---
id: gate-tests-toolcall-entry-revert-correlation-collision
kind: story
stage: implementing
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
