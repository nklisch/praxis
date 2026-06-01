---
id: bug-scan-tool-result-value-unwrapped
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
bug_location: packages/claude-cli-sdk/src/conversation.ts:409
---

# Tool handler results with a natural value field are silently unwrapped

**Location**: `packages/claude-cli-sdk/src/conversation.ts:409` · **Severity**: medium · **Pattern**: structural trust of unknown tool output

A normal payload like `{ value: 42, unit: "kg" }` is indistinguishable from the wrapper shape and loses sibling fields. Use an explicit wrapper discriminator or only unwrap through a dedicated helper; otherwise preserve bare object results as returned.

```ts
if (result !== null && typeof result === "object" && "value" in (result as Record<string, unknown>)) {
  const r = result as { value: unknown; isError?: boolean };
  return { toolUseId: event.toolId, value: r.value, isError: r.isError };
}
```

## Implementation notes

- Changed `packages/claude-cli-sdk/src/conversation.ts` so automatic tool handlers only unwrap the explicit `{ value, isError? }` envelope when those are the only own enumerable keys.
- Bare payload objects such as `{ value: 42, unit: "kg" }` are now preserved as the tool result value.
- Added coverage in `packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts` for preserving value-bearing payloads while keeping the explicit envelope path working.
- Verification: `pnpm --filter @praxis/claude-cli-sdk typecheck`; `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/claude-cli-sdk/src/__tests__/auth.test.ts packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts packages/claude-cli-sdk/src/__tests__/query.test.ts packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts`.
