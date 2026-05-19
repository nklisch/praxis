---
id: gate-tests-document-scopes-passagerange-untested
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `DocumentScopesService.attach({ passageRange })` and `getPassageRange` are untested

## Priority
Critical

## Spec reference
Item: `epic-backend-fills-for-redesign-document-viewer-citations-and-spawn`

Acceptance criterion: from the parent feature Unit 3 — "Accept optional
`passageRange: { startOffset, endOffset }` on attach/upsert. Surface on
reads." Story body claims tests cover this, but
`grep "passageRange" packages/core/src/services/__tests__/document-scopes-service.test.ts`
returns zero hits.

## Gap type
missing test for acceptance criterion

## Suggested test
```ts
// packages/core/src/services/__tests__/document-scopes-service.test.ts
describe("attach with passageRange", () => {
  it("stores passageRange JSON on session-scoped attach", async () => {
    await svc.attach({
      scope: SESSION_SCOPE, documentId: "doc-1", source: "manual",
      passageRange: { startOffset: 100, endOffset: 200 },
    });
    const range = await svc.getPassageRange({
      scope: SESSION_SCOPE, documentId: "doc-1",
    });
    expect(range).toEqual({ startOffset: 100, endOffset: 200 });
  });

  it("upsert path: re-attaching with a new range updates the existing row", async () => {
    await svc.attach({ scope: SESSION_SCOPE, documentId: "doc-1", source: "manual",
                      passageRange: { startOffset: 0, endOffset: 50 } });
    await svc.attach({ scope: SESSION_SCOPE, documentId: "doc-1", source: "manual",
                      passageRange: { startOffset: 100, endOffset: 200 } });
    const range = await svc.getPassageRange({ scope: SESSION_SCOPE, documentId: "doc-1" });
    expect(range).toEqual({ startOffset: 100, endOffset: 200 });
  });

  it("getPassageRange returns null when scope row has no range (standard attach)", async () => {
    await svc.attach({ scope: SESSION_SCOPE, documentId: "doc-1", source: "manual" });
    expect(await svc.getPassageRange({ scope: SESSION_SCOPE, documentId: "doc-1" })).toBeNull();
  });

  it("getPassageRange returns null when no scope row exists", async () => {
    expect(await svc.getPassageRange({ scope: SESSION_SCOPE, documentId: "doc-unknown" })).toBeNull();
  });
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/document-scopes-service.test.ts`

## Implementation notes (2026-05-18)

Added a `describe("attach with passageRange")` block with four tests to
`packages/core/src/services/__tests__/document-scopes-service.test.ts`.

The service (`DocumentScopesServiceImpl`) was already fully implemented — both
`attach({ passageRange })` and `getPassageRange` existed and behaved as
specified. No production code changes were needed.

Test coverage added (all four pass):

1. **stores passageRange JSON on session-scoped attach** — attaches DOC_1 with
   `{ startOffset: 100, endOffset: 200 }`, then reads back with
   `getPassageRange` and asserts equality.

2. **upsert path: re-attaching with a new range updates the existing row** —
   attaches twice with different ranges; verifies the second range wins via a
   `getPassageRange` read-back.

3. **getPassageRange returns null when scope row has no range (standard attach)**
   — standard `attach()` (no `passageRange`); confirms `getPassageRange`
   returns `null`.

4. **getPassageRange returns null when no scope row exists** — queries an
   unknown document id with no scope row at all; confirms `null`.

No implementation divergence discovered (`attach` upserts correctly; standard
path leaves `passageRangeJson` null; `getPassageRange` returns `null` for
missing row or null JSON).

All 35 tests pass; `pnpm --filter @praxis/core typecheck` clean.
