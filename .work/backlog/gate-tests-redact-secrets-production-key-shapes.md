---
id: gate-tests-redact-secrets-production-key-shapes
kind: story
stage: backlog
tags: [testing, security]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# `redactSecrets` lacks assertion for production-shape Anthropic keys

## Priority
Low

## Spec reference
Bound item: `epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor`

Acceptance criterion: "`redactSecrets("apiKey=sk-ant-abc123")` returns
`"apiKey=sk-ant-[REDACTED]"`". Existing test uses short demo keys;
production Anthropic keys have a distinct 7-segment shape
(`sk-ant-api03-...` with dashes and underscores in the body) that the
existing regex pattern could miss if it's anchored to specific characters.

## Gap type
Adversarial-spec-silent (boundary on a security-critical regex).

## Suggested tests

```typescript
// packages/core/src/types/__tests__/errors.test.ts (additions)

it("redacts a production-shaped Anthropic key with dashes and underscores in body", () => {
  expect(redactSecrets("API_KEY=sk-ant-api03-AbCdEfG_HiJkL-MnOpQ_RsTuV-WxYz1234567890_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AAAAAAAA"))
    .toContain("sk-ant-[REDACTED]");
});

it("redacts a key embedded inside a stack trace line", () => {
  expect(redactSecrets("    at fetch (file:///x.js:42:1) [Authorization: Bearer sk-ant-api03-abc...]"))
    .toContain("[REDACTED]");
});
```
