---
id: epic-agent-debugging-harness-trace-correlation-ipc-subagent
kind: story
stage: done
tags: []
parent: epic-agent-debugging-harness-trace-correlation
depends_on: [epic-agent-debugging-harness-trace-correlation-session-tools]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# IPC stream and sub-agent timeline correlation

## Scope

Make streamed IPC lifecycle evidence trace-aware and capture sub-agent timeline
summaries from the existing `SubAgentRegistry` path.

## Implementation notes

- Replace renderer stream ids based on a module counter with collision-resistant
  ids so reload-like client reinitialization cannot reuse `stream-1`.
- Extend the centralized stream handler with optional trace binding and event
  summary hooks.
- Bind session send streams to `sessionId` and sub-agent streams to
  `parentCallId`.
- Capture stream start/event/done/error/cancel summaries without changing
  cancellation semantics.
- Subscribe to `SubAgentRegistry` events for trace records; do not create a
  second source of truth for sub-agent state.

## Acceptance criteria

- [x] IPC stream logs and trace records include `streamId`, channel name,
      event count, and available `sessionId` or `parentCallId`.
- [x] Tests cover stream id uniqueness across client reinitialization.
- [x] Sub-agent trace records preserve `parentCallId`, phase/status, and step
      `callId` where present.
- [x] Existing session and sub-agent stream tests continue to cover
      cancellation and teardown.

## Implementation notes

- Replaced renderer stream ids with `crypto.randomUUID()` when available, with
  a per-module random-prefix plus monotonic fallback.
- Extended the shared stream handler with optional trace bindings and event
  summary hooks. It records compact `ipc_stream_event` records for
  start/event/done/error/cancel when a `sessionId` is known, and logs lifecycle
  fields with `streamId`, channel, event count, `sessionId`, `parentCallId`, and
  `callId` where available.
- Wired a shared `DebugTraceRegistryImpl` into desktop infra/services and
  `ServiceDeps.debugTrace`, so session/tool/IPC trace capture use the same
  registry instance.
- Bound `praxis.session.send` stream records to the session id and summarized
  engine events by type, tool `callId`, final reason, and error/interruption
  code.
- Bound `praxis.subAgent.events` streams to `parentCallId` and summarized
  `SubAgentRegistry` events. The channel seeds a small
  `parentCallId -> sessionId` correlation cache from snapshot/started events
  so later step/finish events can record trace entries without duplicating
  sub-agent state.

## Verification

- `pnpm vitest run packages/client/src/__tests__/ipc-transport.test.ts packages/desktop/electron/main/__tests__/subagent-channel.test.ts packages/desktop/electron/main/__tests__/session-channel-trace.test.ts`
- `pnpm --filter @praxis/client typecheck`
- `pnpm --filter @praxis/desktop typecheck`
- `pnpm biome check packages/client/src/transport/ipc.ts packages/client/src/__tests__/ipc-transport.test.ts packages/core/src/types/debug-trace.ts packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts packages/desktop/electron/main/stream-handler.ts packages/desktop/electron/main/session-channel.ts packages/desktop/electron/main/subagent-channel.ts packages/desktop/electron/main/services.ts packages/desktop/electron/main/services/build-infra-services.ts packages/desktop/electron/main/__tests__/subagent-channel.test.ts packages/desktop/electron/main/__tests__/session-channel-trace.test.ts`
- `pnpm vitest run packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation record includes green focused
verification; host reran the client/session/sub-agent stream tests, IPC cancel
and stream redaction tests, and `@praxis/client` plus `@praxis/desktop`
typechecks.
