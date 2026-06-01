---
id: bug-scan-double-send-bypasses-queue
kind: story
stage: review
tags: [bug, state, high]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: high
bug_domain: state
bug_location: packages/ui/src/hooks/use-streamed-send.ts:374
---

# Rapid double-send can start concurrent session streams instead of queueing

**Location**: `packages/ui/src/hooks/use-streamed-send.ts:374` · **Severity**: high · **Pattern**: React stale state used as an async lock

`isStreaming` is render state, not a synchronous lock. A second submit in the same render window can still see `false`, bypass the queue, and open another session stream. Add a ref-backed lock for concurrency control and keep React state as display state.

```ts
const send = async (sessionId: SessionId, message: string, sketchId?: string): Promise<void> => {
  if (isStreaming) {
    queue.enqueue(entry, setItems);
    return;
  }
  await sendInternal(sessionId, message, sketchId, null);
};
```

## Implementation notes

- Changed `packages/ui/src/hooks/use-streamed-send.ts` to use a ref-backed streaming lock for concurrency decisions while keeping `isStreaming` as render state.
- Preserved the lock across queued handoff windows so rapid sends during the `setTimeout(0)` queue drain still enqueue instead of opening a parallel stream.
- Added coverage in `packages/ui/src/__tests__/use-streamed-send.test.tsx` for two sends fired in the same render window.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp/vitest pnpm vitest run packages/ui/src/__tests__/claude-auth-modal.test.tsx packages/ui/src/__tests__/use-streamed-send.test.tsx packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx packages/ui/src/__tests__/note-editor-feynman.test.tsx`; `pnpm --filter @praxis/ui typecheck`; `pnpm exec biome check <touched UI files>`.
