---
id: bug-scan-draft-stream-unhandled-reject
kind: story
stage: review
tags: [bug, async]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: async
bug_location: packages/ui/src/components/course-create-tab-body.tsx:153
---

# Draft finalization stream can reject as an unhandled promise

**Location**: `packages/ui/src/components/course-create-tab-body.tsx:153` · **Severity**: medium · **Pattern**: unhandled promise rejection / fire-and-forget async

The fire-and-forget stream listener has no outer `try/catch`, so an IPC stream error rejects the IIFE as an unhandled promise in the renderer. Wrap the stream loop in `try/catch` and pair it with explicit stream cancellation on cleanup.

```ts
(async () => {
  for await (const event of client.drafts.events()) {
    if (cancelled) break;
    if (event.kind === "finalized") {
      // ...
    }
  }
})();
```

## Implementation notes

- Changed `packages/ui/src/components/course-create-tab-body.tsx` to consume `client.drafts.events()` through an explicit iterator with cleanup-time `return()`.
- Wrapped the draft finalization loop in `try/catch`; non-cancelled stream failures now settle the confirm action as failed instead of leaking an unhandled rejection.
- Added coverage in `packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx` that verifies the finalization stream is returned during teardown.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp/vitest pnpm vitest run packages/ui/src/__tests__/claude-auth-modal.test.tsx packages/ui/src/__tests__/use-streamed-send.test.tsx packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx packages/ui/src/__tests__/note-editor-feynman.test.tsx`; `pnpm --filter @praxis/ui typecheck`; `pnpm exec biome check <touched UI files>`.
