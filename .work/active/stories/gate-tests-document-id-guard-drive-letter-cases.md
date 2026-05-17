---
id: gate-tests-document-id-guard-drive-letter-cases
kind: story
stage: review
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

## Implementation notes

Two new tests added to `packages/core/src/ingestion/__tests__/embedded-images.test.ts` via `store.dirFor(...)` (the existing indirection pattern — `assertSafeDocumentId` is not imported directly):

- Line 132: `"rejects documentId starting with lowercase Windows drive prefix (c:)"` — input `"c:foo"`
- Line 137: `"rejects documentId starting with mixed-case Windows drive prefix (A:)"` — input `"A:"`

No source changes needed; `assertSafeDocumentId` already implements `/^[A-Za-z]:/` and both new tests passed on first run (28 tests total, all green).
