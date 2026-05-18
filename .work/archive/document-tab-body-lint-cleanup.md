---
id: document-tab-body-lint-cleanup
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Implementation notes

- Rewrote both TreeWalker `while ((node = walker.nextNode()) !== null)` loops
  (in `buildTextNodeIndex` and `computeRangeOffset`) to the
  `let node = walker.nextNode(); while (node !== null) { ...; node = walker.nextNode(); }`
  form, eliminating `noAssignInExpressions` without any behavioural change.
  Also removed the pre-existing `biome-ignore` suppression comment on the
  `computeRangeOffset` loop since the rewrite made it unnecessary.
- The `useLiteralKeys` warning mentioned in the scope was already fixed in the
  source (`mark.dataset.sessionId` not `mark.dataset["sessionId"]`); no change
  needed there.
- Fixed a `noUnusedFunctionParameters` warning on `applyCitationMark`'s `root`
  parameter (unused because the function operates on the pre-built `index`);
  prefixed with `_root`.
- `pnpm biome check --write` confirmed no formatter divergence remained after
  the manual rewrites.
- All 1580 UI tests pass; pre-existing typecheck errors in unrelated files
  (`chat-tab-body.tsx`, `chat.tsx`, `notes-list.tsx`) are unchanged.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Textbook cleanup. Both TreeWalker loops rewritten identically to the prescribed pattern; semantics are unchanged. Removing the `biome-ignore` suppression comment on `computeRangeOffset` is correct — the rewrite makes it redundant. `_root` prefix on unused parameter follows the project convention cleanly. The scope item noted `useLiteralKeys` as a fix needed, but it was already clean in source; noted honestly in implementation notes. No logic change, no risk.
