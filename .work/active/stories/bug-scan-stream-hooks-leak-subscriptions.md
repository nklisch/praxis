---
id: bug-scan-stream-hooks-leak-subscriptions
kind: story
stage: review
tags: [bug, resource-leak]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: resource-leak
bug_location: packages/ui/src/hooks/use-sub-agent.ts:33
---

# Streaming subscription hooks leave IPC/server subscriptions alive after unmount

**Location**: `packages/ui/src/hooks/use-sub-agent.ts:33` · **Severity**: medium · **Pattern**: AsyncIterable subscription teardown discarded

Several hooks use a cleanup boolean while the async iterator may be blocked in `next()`. When no event arrives, `return()` is never called and the renderer never sends stream cancellation, leaving main-process subscribers and AbortControllers alive. Capture iterators explicitly and call `return()` in cleanup, or make stream clients AbortSignal-aware.

```ts
for await (const event of client.subAgent.events({ parentCallId })) {
  if (cancelled) break;
  // ...
}
return () => {
  cancelled = true;
};
```

## Implementation notes

- Changed `packages/ui/src/hooks/use-sub-agent.ts` to retain the active sub-agent event iterator and call `return()` during cleanup.
- Kept the existing stale-event guard and last-good-state behavior for stream errors.
- Added coverage in `packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx` that unmounting returns the active iterator.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp/vitest pnpm vitest run packages/ui/src/__tests__/claude-auth-modal.test.tsx packages/ui/src/__tests__/use-streamed-send.test.tsx packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx packages/ui/src/__tests__/note-editor-feynman.test.tsx`; `pnpm --filter @praxis/ui typecheck`; `pnpm exec biome check <touched UI files>`.
