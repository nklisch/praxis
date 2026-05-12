---
id: gate-tests-start-exploration-no-call-id
kind: story
stage: review
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

## Implementation notes

Added `packages/tools/src/course/__tests__/start-exploration.test.ts` with two tests:

1. **`does not call subAgent.start() when ctx.callId is absent`** — the primary coverage gap. Wires a spy `SubAgentRegistry`, builds a `ToolContext` without setting `callId` (so it is naturally `undefined`), runs the handler with a real `BootstrapServiceImpl` + inline scripted engine, and asserts `subAgent.start` is never called while the explorer completes successfully.

2. **`calls subAgent.start() when ctx.callId is present`** — positive-path counterpart confirming the branch fires correctly when `callId` is supplied, registered with `parentCallId === ctx.callId`.

The handler already had the correct guard (`ctx.callId !== undefined ? ctx.services.subAgent?.start(...) : undefined`) — no production code changes were needed. The test simply exercises the absent-`callId` partition that was previously untested.

Implementation details:
- Uses a real `BootstrapServiceImpl` with `useTempDb()` (same pattern as the explorer tests in `packages/curriculum`).
- Inline scripted engine (no dependency on the curriculum test helper `ScriptedEngine`) to keep the test self-contained within `@praxis/tools`.
- Explicit `bootstrapConfigResolver: () => ({ maxSteps: 200 })` passed to avoid the proxy auto-stub returning a truthy non-callable value for the optional resolver.
