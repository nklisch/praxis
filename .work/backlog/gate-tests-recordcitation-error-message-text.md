---
id: gate-tests-recordcitation-error-message-text
kind: story
stage: backlog
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# `recordCitation` inverted-range error message text not pinned by a test

## Priority
Low — from gate-tests on release v0.1.4.

## Spec reference
Item: `story-citation-schema-inverted-range-refine`
Acceptance criterion:
> `recordSchema` rejects payloads where `endOffset < startOffset` with
> a clear validation error.

Story's chosen message is `"endOffset must be >= startOffset"`.

## Gap type
complementary coverage — the test asserts code `VALIDATION_FAILED`
but doesn't pin the human-readable message. A regression that
silently changed the message would not fail.

## Suggested test
```ts
it("inverted range error message is 'endOffset must be >= startOffset'", async () => {
  const result = await handler?.({}, {
    documentId: "doc-1", citingSessionId: "sess-1",
    startOffset: 50, endOffset: 10,
  });
  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: expect.stringContaining("endOffset must be >= startOffset"),
    },
  });
});
```

## Test location (suggested)
`packages/desktop/electron/main/__tests__/citations-channel-envelope.test.ts`
