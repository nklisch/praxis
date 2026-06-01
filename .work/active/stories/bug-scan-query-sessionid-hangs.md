---
id: bug-scan-query-sessionid-hangs
kind: story
stage: review
tags: [bug, error-handling]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: error-handling
bug_location: packages/claude-cli-sdk/src/query.ts:104
---

# query.sessionId remains pending when the CLI fails before init

**Location**: `packages/claude-cli-sdk/src/query.ts:104` · **Severity**: medium · **Pattern**: partial error propagation leaves companion promise unresolved

On spawn or stream errors before `system:init`, `result` is rejected but `sessionId` is neither rejected nor resolved, so callers awaiting `query.sessionId` can hang indefinitely. Reject `sessionId` in the catch path when init has not arrived.

```ts
const sessionId = createDeferredPromise<string>();
const result = createDeferredPromise<ResultEvent>();
// ...
} catch (err) {
  result.reject(err instanceof Error ? err : new Error(String(err)));
  throw err;
}
```

## Implementation notes

- Changed `packages/claude-cli-sdk/src/query.ts` to track whether `system:init` has resolved `sessionId` and reject `query.sessionId` on pre-init build/spawn/stream failures.
- Added coverage in `packages/claude-cli-sdk/src/__tests__/query.test.ts` for a CLI failure before init rejecting both `result` and `sessionId`.
- Verification: `pnpm --filter @praxis/claude-cli-sdk typecheck`; `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/claude-cli-sdk/src/__tests__/auth.test.ts packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts packages/claude-cli-sdk/src/__tests__/query.test.ts packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts`.
