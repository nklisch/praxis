---
id: gate-tests-authoring-audit-log-no-prompt-content
kind: story
stage: review
tags: [testing, security]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `ConfiguratorAction` audit-log does not assert text content is NOT stored for prompt sets

## Priority
Medium

## Spec reference
Item: `feature-prompt-customization-layers-compose-wiring` (Unit 5)
Acceptance criterion: "Audit log entry only records char count, not content, so secrets typed into prompts don't end up in the audit log forever." (Risks section #5 — explicit security-by-design property.)

## Gap type
Missing test for security boundary

## Suggested test
```ts
// packages/core/src/__tests__/authoring-service.test.ts (extend "setGlobalPrompt writes...")
it("setGlobalPrompt audit row does NOT contain the prompt text — only the char count", async () => {
  const secretText = "API_KEY_LEAKED_INTO_PROMPT_xyzzy_12345";
  await svc.setGlobalPrompt(secretText);
  const rows = db.select().from(configuratorActions).all();
  const allActionJson = JSON.stringify(rows);
  expect(allActionJson).not.toContain("xyzzy");
  expect(allActionJson).not.toContain(secretText);
});
```

## Test location (suggested)
`packages/core/src/__tests__/authoring-service.test.ts`

## Implementation notes

Added two tests to `/packages/core/src/__tests__/authoring-service.test.ts`:

1. **`setGlobalPrompt` security boundary** — appended to the `setGlobalPrompt / getGlobalPrompt` describe block. Uses a deliberately searchable secret string (`"sk-API_KEY_LEAKED_INTO_PROMPT_xyzzy_12345"`), serializes ALL `configurator_actions` rows to JSON after the write, and asserts the secret is not present anywhere. Bonus assertion confirms the audit row carries `chars` (trimmed length) rather than text content.

2. **`setModeAppend` security boundary** — appended to the `setModeAppend / getModeAppend` describe block. Same pattern with a distinct secret string (`"sk-API_KEY_LEAKED_INTO_MODE_APPEND_xyzzy_67890"`); also asserts `modeId` is correctly recorded alongside the char count.

**Security verification result**: the service correctly stores only `chars` (trimmed length) in both cases — no regression found. The `appendAction` payload for `setGlobalPrompt` is `{ kind: "prompt.set_global_fragment", chars: number }` and for `setModeAppend` is `{ kind: "prompt.set_mode_append", modeId: string, chars: number }`.

Note: the spec mentioned a `charCount` field but the implementation uses `chars`. Tests were written to match the actual implementation.

Test count: 30 → 32 (2 new tests). All 32 pass. Typecheck clean.
