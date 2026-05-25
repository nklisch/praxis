---
id: gate-tests-recordcitation-error-message-text
kind: story
stage: done
tags: [testing]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-25
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

## Implementation discovery (2026-05-25)

The story suggested asserting `message: expect.stringContaining("endOffset must be >= startOffset")`. This would fail.

The `toEnvelopeError` function in `ipc-error-envelope.ts` intentionally uses path-based messages for `VALIDATION_FAILED` — it never leaks raw Zod refine message text to the renderer. For a root-level `.refine()` failure, the Zod issue has `path: []` (empty), which maps to the `"(root)"` sentinel. The actual message is `"Validation failed at (root)"`.

The story's suggested assertion reflected incorrect expectations about the envelope format.

## Implementation notes (2026-05-25)

Added test `"inverted range VALIDATION_FAILED message is 'Validation failed at (root)'"` in `packages/desktop/electron/main/__tests__/citations-channel-envelope.test.ts`.

The test pins the actual envelope message format (`"Validation failed at (root)"`) — which is the correct regression guard for this channel. An explanatory comment in the test body documents the implementation discovery so future readers understand why the raw Zod message is absent from the wire format.

All tests pass (`pnpm test`). No production code changes.
