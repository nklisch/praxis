---
id: gate-tests-authoring-audit-log-no-prompt-content
kind: story
stage: drafting
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
