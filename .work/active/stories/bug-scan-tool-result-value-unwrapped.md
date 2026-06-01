---
id: bug-scan-tool-result-value-unwrapped
kind: story
stage: implementing
tags: [bug, language-footgun]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
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
