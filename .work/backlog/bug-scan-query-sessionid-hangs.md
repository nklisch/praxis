---
id: bug-scan-query-sessionid-hangs
created: 2026-06-01
tags: [bug, error-handling]
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
