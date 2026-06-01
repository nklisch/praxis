---
id: epic-agent-debugging-harness-trace-correlation-renderer-outcomes
kind: story
stage: review
tags: []
parent: epic-agent-debugging-harness-trace-correlation
depends_on: [epic-agent-debugging-harness-trace-correlation-ipc-subagent]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Renderer-visible outcomes and browser replay handoff

## Scope

Record renderer-observed outcomes for streamed chat/tool/sub-agent events and
document the trace identifiers that browser replay and student simulation must
carry into later Playwright artifacts.

## Implementation notes

- Add a narrow best-effort client log/debug sink over the existing
  `praxis.log.record` IPC channel.
- Generate `rendererEventId` values in `useStreamedSend` for accepted events,
  rendered chat items, rendered tool calls/results, unmatched tool results,
  stream errors, and final completion.
- Renderer outcome records should include surface/component name, `sessionId`,
  available `callId`, available `streamId`, error summary, and outcome.
- Keep rendering non-blocking; the debug sink must not delay chat UI updates.
- Do not add Playwright in this story. Browser replay and student simulation
  consume the identifiers and add browser traces in their own features.

## Acceptance criteria

- [x] Renderer outcome records are emitted through a best-effort client sink
      without blocking streamed chat rendering.
- [x] `useStreamedSend` tests prove model/tool/error/final events create stable
      `rendererEventId` records tied to `sessionId` and `callId` where present.
- [x] Object-shaped tool/model content is normalized or guarded before reaching
      React children.
- [x] The implementation notes record the browser replay handoff fields:
      `runId`, `sessionId`, `turnId`, `streamId`, `rendererEventId`, and
      artifact path.

## Implementation notes

- Added `LogClientApi` to `@praxis/core/types` and wired `PraxisClient.log.record(record)` through `@praxis/client`.
- Added `ClientTransport.send(...)`, implemented it for IPC via `bridge.send(...)`, and kept the websocket stub explicit.
- Added a best-effort `LogClient` that sends `LogRecord` payloads to `praxis.log.record` and swallows local transport failures.
- `useStreamedSend` now emits `renderer.trace.outcome` records with bindings `{ component: "renderer-trace", surface: "chat" }`. Fields include `rendererEventId`, `sessionId`, `eventType`, `outcome`, and optional `callId`, `streamId`, and `errorSummary`.
- Renderer outcomes cover local user-message rendering, stream event acceptance, model message rendering, tool call rendering, matched and unmatched tool results, error events, thrown stream exceptions, interrupted cancel markers, final events, and stream finalization.
- Non-string model/thinking/system-note content is normalized to a string before it reaches chat items. Tool input/output remains structured `unknown` data and existing tool renderers stringify it inside `<pre>` details rather than passing objects as React children.

## Browser replay handoff

Downstream browser replay and student simulation artifacts should carry:

- `runId`: supplied or joined from session/debug-run trace records outside this renderer hook.
- `sessionId`: emitted here on every renderer outcome record.
- `turnId`: supplied or joined from session/debug-run trace records outside this renderer hook.
- `streamId`: emitted here only if a future renderer caller has it available; current `client.session.send` does not expose it, and the main-process IPC trace records remain the stream-id source for this story.
- `rendererEventId`: generated and emitted here for each renderer-observed outcome.
- Artifact path: supplied by downstream failure bundle / browser trace features when they write Playwright or replay artifacts.

## Verification

- `pnpm vitest run packages/client/src/__tests__/ipc-transport.test.ts packages/ui/src/__tests__/use-streamed-send.test.tsx`
- `pnpm --filter @praxis/client typecheck`
- `pnpm --filter @praxis/ui typecheck`
- `pnpm biome check packages/core/src/types/log-client.ts packages/core/src/types/client.ts packages/core/src/types/index.ts packages/client/src/services/log-client.ts packages/client/src/client.ts packages/client/src/transport/types.ts packages/client/src/transport/ipc.ts packages/client/src/transport/websocket.ts packages/client/src/__tests__/ipc-transport.test.ts packages/client/src/__tests__/client.test.ts packages/client/src/__tests__/config-client.test.ts packages/client/src/__tests__/drafts-client.test.ts packages/client/src/__tests__/authoring-restore-client.test.ts packages/client/src/__tests__/assignments-client.test.ts packages/client/src/__tests__/packs-client.test.ts packages/ui/src/hooks/use-streamed-send.ts packages/ui/src/hooks/use-interstitial-lifecycle.ts packages/ui/src/__tests__/use-streamed-send.test.tsx packages/ui/src/__tests__/helpers/fake-client.ts`
