---
id: gate-tests-interrupt-fanout-ui-observability
kind: story
stage: done
tags: [testing, refactor]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
---

# Interrupt fanout tests are tautological at the registry layer — UI observability is untested

## Priority
Low

## Spec reference
Bound item: `epic-tutor-session-feel-cancellation-propagation-engine-and-subagent`

Cancellation propagation contract: items transition `running →
interrupted`; UI fanout observes terminal event.

## Gap type
Tautological-rework. The existing tests assert internal registry state
transitions but skip the end-to-end "UI receives a terminal event from
the subscriber-fanout-stream" property — the spec's "UI is informed via
existing subscriber-fanout pattern" claim from the review.

## Suggested test

```typescript
// packages/desktop/electron/main/__tests__/subagent-channel.test.ts (if exists,
// otherwise wire into session-service abort test)

it("after interruptAllForSession, a UI subscriber receives a finished event for every previously-running item", async () => {
  // Set up: registry with two running items in session-A; subscribe via the channel
  // abort sess-A; await terminal events
  // Assert events.length === 2 and all kind === 'finished' with status 'interrupted'
});
```

## Implementation notes

New test file: `packages/desktop/electron/main/__tests__/subagent-channel.test.ts`

- Line 98: `"after interruptAllForSession, a UI subscriber receives a finished event for every previously-running item"` — uses a real `SubAgentRegistryImpl` to exercise the subscribe → fanout → terminal-event pipeline through the IPC channel. Subscribes via `praxis.subAgent.events.start`, starts two sub-agents for session-A, calls `interruptAllForSession`, cancels the stream, then asserts two `{ kind: "finished", status: "interrupted" }` pushes were received by the fake `webContents.send` spy.

- Line 163: `"interruptAllForSession does not emit finished events for items in a different session"` — complementary guard confirming session isolation: only session-A items are interrupted, session-B item stays running.

Both tests pass (`pnpm --filter @praxis/desktop test subagent-channel`). Full `pnpm typecheck` clean.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `de69ade`. New test file `packages/desktop/electron/main/__tests__/subagent-channel.test.ts` exercises the full subscribe → fanout → terminal-event pipeline end-to-end using a real `SubAgentRegistryImpl`, not a mock — exactly the property the gate identified as untested at the channel layer. Includes an isolation guard (session-B unaffected when session-A is interrupted). Follows the `electron-ipc-test-harness` pattern.
