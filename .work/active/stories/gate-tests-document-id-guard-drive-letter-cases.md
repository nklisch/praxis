---
id: gate-tests-document-id-guard-drive-letter-cases
kind: story
stage: implementing
tags: [testing, security]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
---

# `assertSafeDocumentId` lacks tests for lowercase / mixed-case Windows drive prefixes

## Priority
Low

## Spec reference
Bound item: `epic-security-hardening-round-2-image-store-path-guard`

Acceptance criterion (Unit 1 design): "Rule set: contains `/`, `\\`,
`..`, `\\0`, OR starts with `~`, OR matches `/^[A-Za-z]:/`." Tests for
each rule exist but no test for the lowercase `c:` partition.

## Gap type
Missing test for boundary / equivalence partition.

## Suggested tests

```typescript
// packages/core/src/ingestion/__tests__/embedded-images.test.ts (additions)

it("assertSafeDocumentId rejects lowercase Windows drive prefix (c:)", () => {
  expect(() => assertSafeDocumentId("c:foo")).toThrow(/Invalid documentId/);
});

it("assertSafeDocumentId rejects mixed-case Windows drive prefix (A: with trailing slash)", () => {
  expect(() => assertSafeDocumentId("A:")).toThrow();
});
```
