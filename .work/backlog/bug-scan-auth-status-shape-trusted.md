---
id: bug-scan-auth-status-shape-trusted
created: 2026-06-01
tags: [bug, language-footgun]
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
