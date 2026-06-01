---
id: bug-scan-tool-result-json-stringify
created: 2026-06-01
tags: [bug, language-footgun]
bug_origin: scan
bug_severity: medium
bug_domain: language-footgun
bug_location: packages/claude-cli-sdk/src/conversation.ts:530
---

# Tool results can lose content or crash when JSON.stringify receives non-JSON values

**Location**: `packages/claude-cli-sdk/src/conversation.ts:530` · **Severity**: medium · **Pattern**: JSON.stringify drops fields / throws on BigInt

Tool result values are `unknown`, but `JSON.stringify(undefined)` omits content, `BigInt` throws, and functions/symbol fields silently disappear. Normalize through a JSON-safe encoder and surface serialization failures as tool errors instead of crashing or emitting invalid tool results.

```ts
content: results.map((r) => ({
  type: "tool_result",
  tool_use_id: r.toolUseId,
  content: JSON.stringify(r.value),
  is_error: r.isError ?? false,
})),
```
