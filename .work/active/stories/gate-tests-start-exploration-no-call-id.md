---
id: gate-tests-start-exploration-no-call-id
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `course.start_exploration` without `ctx.callId` not exercised — sub-agent registration must be skipped

## Priority
Medium

## Spec reference
Item: `feature-agent-transparency-ux-subagent-channel` (Unit 4)
Acceptance criterion: "When `course.start_exploration` is dispatched with a `ctx.callId`, a sub-agent item is registered with `parentCallId === ctx.callId`."
Inverse (untested): when callId is absent, no item should be registered, but the explorer should still complete its work (test-mode and direct-invocation path).

## Gap type
Missing test for valid partition (absence-of-callId case)

## Suggested test
```ts
// packages/tools/src/course/__tests__/start-exploration.test.ts
it("start_exploration without ctx.callId: explorer runs to completion, no sub-agent registered", async () => {
  const subRegistry = makeSpySubAgentRegistry();
  const ctx = makeToolContext({ services: { subAgent: subRegistry, ... }, callId: undefined });
  await startExplorationTool.handler(args, ctx);
  expect(subRegistry.start).not.toHaveBeenCalled();
  // Explorer still completes; result is returned normally.
});
```

## Test location (suggested)
existing curriculum explorer test or `packages/tools/src/course/__tests__/start-exploration.test.ts`
