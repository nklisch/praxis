---
id: bug-scan-ipc-stream-startup-hangs
kind: story
stage: done
tags: [bug, error-handling, high]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: high
bug_domain: error-handling
bug_location: packages/client/src/transport/ipc.ts:76
---

# Streaming IPC startup failures are swallowed and leave consumers waiting forever

**Location**: `packages/client/src/transport/ipc.ts:76` · **Severity**: high · **Pattern**: silent swallow / logged-but-not-propagated

If `ipcRenderer.invoke` rejects before a stream event can be emitted, the rejection is discarded and the iterator waits forever on an event channel that will never finish. Capture startup rejection into the iterator queue, wake pending readers, and unsubscribe.

```ts
bridge.invoke(startChannel, streamId, ...args).catch(() => {});

async next(): Promise<IteratorResult<T, undefined>> {
  while (queue.length === 0 && !done) {
    await new Promise<void>((resolve) => {
      wakeup = resolve;
    });
  }
}
```

## Implementation notes
- Files changed: `packages/client/src/transport/ipc.ts`, `packages/client/src/__tests__/ipc-transport.test.ts`
- Tests added: startup invoke rejection regression in `ipc-transport.test.ts`
- Discrepancies from design: none
- Adjacent issues parked: none
- Verification: `TMPDIR=$PWD/.tmp pnpm vitest run packages/client/src/__tests__/ipc-transport.test.ts packages/desktop/electron/main/__tests__/spawned-pid-registry.test.ts packages/desktop/electron/main/__tests__/walk-directory-for-ingest.test.ts`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
