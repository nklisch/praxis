---
id: gate-cruft-misplaced-noexplicitany-suppression-client-test
kind: story
stage: implementing
tags: [cleanup]
parent: feature-release-v0.1.0-cruft-findings
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# Misplaced/unused `noExplicitAny` suppression in client.test.ts

## Confidence
High

## Category
stale comment

## Location
`packages/client/src/__tests__/client.test.ts:310`

## Evidence

```ts
it("courseDocuments.detach() routes to praxis.courseDocuments.detach with courseId + documentId", async () => {
  const { transport, invokedChannels } = makeTransport();
  const client = createPraxisClient(transport);
  // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough  ← line 310, unused
  await client.courseDocuments.detach({
    courseId: "course-1" as any,
    documentId: "doc-1" as any,
  });
```

Compare to the preceding `attach` test (lines 295-305) where each `as any`
has its own immediately-preceding `biome-ignore` comment. Here a single
suppression sits before the `await` call, so it doesn't apply to the
`as any` casts on lines 312/313. Biome flagged it as `suppressions/unused`.

## Removal

- Delete line 310 (the `// biome-ignore` line).
- Add inline `// biome-ignore lint/suspicious/noExplicitAny: branded string passthrough`
  comments immediately before each `as any` use (lines 312 and 313) to
  match the established style of the `attach` test directly above. Both
  `as any` casts are still currently warning-flagged by Biome — the
  inline ignores will silence them.
