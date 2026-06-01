---
id: bug-scan-tool-result-json-stringify
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

## Implementation notes

- Changed `packages/claude-cli-sdk/src/conversation.ts` to normalize tool result values through a JSON-safe encoder before putting them on the CLI/MCP wire.
- The encoder preserves fields that `JSON.stringify` would drop by converting `undefined` to `null`, `bigint` to decimal strings, functions/symbols to descriptive strings, cycles to `"[Circular]"`, and serialization exceptions to `is_error: true` tool results.
- Added coverage in `packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts` for non-JSON values, cycles, and serialization failure fallback.
- Verification: `pnpm --filter @praxis/claude-cli-sdk typecheck`; `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/claude-cli-sdk/src/__tests__/auth.test.ts packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts packages/claude-cli-sdk/src/__tests__/query.test.ts packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts`.
