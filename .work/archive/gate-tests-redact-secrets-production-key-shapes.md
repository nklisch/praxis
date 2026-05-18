---
id: gate-tests-redact-secrets-production-key-shapes
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
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

## Implementation notes

Two tests added at `packages/core/src/types/__tests__/errors.test.ts`, lines 144–161:

1. `"redacts a production-shaped Anthropic key with dashes and underscores in body"` — exercises the full `sk-ant-api03-...` shape (~108 chars with dashes and underscores throughout).
2. `"redacts a key embedded inside a stack trace line"` — exercises the Bearer-token path with a production-shaped `sk-ant-api03-abc...` key inside a simulated stack trace context.

**No regex change was needed.** The existing pattern `/sk-ant-[A-Za-z0-9_-]+/g` (line 52 of `errors.ts`) already handles dashes and underscores in the key body, so both tests passed on the first run (31/31 green). The gap was purely in test coverage — the adversarial input shape was unasserted, not actually broken.

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

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `8098e7b`. Two new tests in `errors.test.ts` — one for the full production-shape `sk-ant-api03-...` (~108 chars with dashes and underscores in body), one for a key embedded in a stack-trace line. Existing `/sk-ant-[A-Za-z0-9_-]+/g` regex covers both; no source change needed. Tests pass.
