# IPC Stream Died Or Missed Events

Use when a renderer/client stream starts but events stop, cancel does not land,
or the UI misses session/sub-agent events that the core service emitted.

## First Checks

- Find `streamId`, `sessionId`, and channel name.
- Check whether `.start`, `.events.<streamId>`, and `.cancel` events were all
  recorded.
- Compare core debug trace records with desktop IPC and client-side outcomes.

## Evidence To Gather

- IPC stream trace records and renderer outcome records.
- Pino log slice around stream start/cancel/finalization.
- Session/sub-agent event sequence from the replay bundle.
- Error thrown by the async iterator, if any.

## Commands

```bash
pnpm debug:bundle --out .praxis/debug/bundles --failure-class ipc --title "IPC stream died" --session <sessionId>
pnpm debug:replay --bundle <bundle-dir> --db <temp-db-path>
pnpm vitest run packages/desktop/electron/main/__tests__/session-channel-trace.test.ts
pnpm vitest run packages/desktop/electron/main/__tests__/subagent-channel.test.ts
```

## Likely Owners

- `packages/desktop/electron/main/stream-handler.ts`
- `packages/desktop/electron/main/session-channel.ts`
- `packages/desktop/electron/main/subagent-channel.ts`
- `packages/client/src/` stream helpers

## Next Debug Step

Reconstruct the stream lifecycle in order: start accepted, iterator opened,
event forwarded, cancel requested, iterator closed, final event recorded. The
first missing transition determines whether the owner is core, desktop IPC, or
client consumption.
