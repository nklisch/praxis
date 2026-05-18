---
id: document-tab-body-lint-cleanup
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Fix lint errors in document-tab-body.tsx introduced by citation highlights

## Scope

`packages/ui/src/components/document-tab-body.tsx` has three biome lint issues
introduced by the citation-highlight implementation (story
`epic-backend-fills-for-redesign-document-viewer-citations-and-spawn`):

1. **`noAssignInExpressions` (error)** — `while ((node = walker.nextNode()) !== null)`
   at the `buildTextNodeIndex` TreeWalker loop. Rewrite using a `let`-assign loop
   or an iterator approach to avoid assignment in expression.

2. **`useLiteralKeys` (fixable info)** — `mark.dataset["sessionId"]` should be
   `mark.dataset.sessionId`.

3. **Formatter issue** — `buildTextNodeIndex` signature and `citationsLoader`
   callback formatting diverge from Biome's `lineWidth: 100` format.

All three are straightforward `pnpm lint:fix`-safe or trivial manual edits.

## Fix

```bash
pnpm biome check --write packages/ui/src/components/document-tab-body.tsx
# noAssignInExpressions is not auto-fixable — rewrite the while loop manually
```

Rewrite `buildTextNodeIndex` loop:

```ts
let node = walker.nextNode();
while (node !== null) {
  const text = node as Text;
  // ...
  node = walker.nextNode();
}
```
