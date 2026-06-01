---
id: bug-scan-auth-status-shape-trusted
kind: story
stage: review
tags: [bug, language-footgun]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: low
bug_domain: language-footgun
bug_location: packages/claude-cli-sdk/src/auth.ts:103
---

# Claude auth status trusts parsed JSON shape without validating loggedIn

**Location**: `packages/claude-cli-sdk/src/auth.ts:103` · **Severity**: low · **Pattern**: unchecked type assertion over external JSON

The code catches malformed JSON but not malformed shape, so valid JSON with missing or non-boolean `loggedIn` can flow downstream as auth truth. Parse to `unknown` and validate the expected shape before resolving.

```ts
try {
  const parsed = JSON.parse(stdoutBuf.trim()) as ClaudeAuthStatus;
  resolve(parsed);
} catch {
  resolve({ loggedIn: false, error: `Failed to parse auth status JSON: ${stdoutBuf}` });
}
```

## Implementation notes

- Changed `packages/claude-cli-sdk/src/auth.ts` to parse auth status JSON as `unknown` and require a boolean `loggedIn` before trusting the payload.
- Added coverage in `packages/claude-cli-sdk/src/__tests__/auth.test.ts` for valid JSON with a non-boolean `loggedIn`.
- Verification: `pnpm --filter @praxis/claude-cli-sdk typecheck`; `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/claude-cli-sdk/src/__tests__/auth.test.ts packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts packages/claude-cli-sdk/src/__tests__/query.test.ts packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts`.
