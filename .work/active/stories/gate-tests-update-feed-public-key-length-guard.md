---
id: gate-tests-update-feed-public-key-length-guard
kind: story
stage: implementing
tags: [testing, refactor]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `importUpdateFeedPublicKey` length-rejection branch is not exercised — current test is tautological

## Priority
High

## Spec reference
Item: `epic-v1-security-hardening-sign-update-feed` (Unit 1)
Acceptance criterion: "`importUpdateFeedPublicKey()` rejects malformed base64 / wrong length."

## Gap type
Tautological-rework — existing `update-feed-public-key.test.ts:51-61` asserts only that "decoded.length !== 32 === true". It never invokes `importUpdateFeedPublicKey()` with a tampered constant, so the function's actual length-guard branch is not exercised.

## Suggested test
```ts
// Use vi.doMock to set UPDATE_FEED_PUBLIC_KEY_BASE64 to a 31-byte base64 value,
// then call importUpdateFeedPublicKey() and assert the actual throw.
it("rejects a constant that decodes to wrong byte length", async () => {
  vi.doMock("../update-feed-public-key.js", async (orig) => {
    const real = await orig();
    return { ...real, UPDATE_FEED_PUBLIC_KEY_BASE64: Buffer.alloc(31, 0x42).toString("base64") };
  });
  const { importUpdateFeedPublicKey: importFn } = await import("../update-feed-public-key.js");
  await expect(importFn()).rejects.toThrow(/must decode to 32 bytes/);
});
```

Delete or replace the existing tautological assertion in the same file.

## Test location (suggested)
`packages/core/src/services/__tests__/update-feed-public-key.test.ts`
