---
id: story-refactor-remove-dead-verify-latex-export
kind: story
stage: done
tags: [refactor, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Remove dead `verifyLatex` public export until Phase 13 needs it

## Brief
`verifyLatex` is exported from `packages/tools/src/math/latex-verify.ts` and re-exported
from both `packages/tools/src/math/index.ts:2` and `packages/tools/src/index.ts:2`.
It's been in the tree since Phase 4 as the "Phase 13 vision OCR seam" but has zero
production consumers — only the test file imports it.

## Verification
```
grep -rn "verifyLatex\|latex-verify\|latexVerify" packages docs --include="*.ts" --include="*.tsx" --include="*.md"
```
Results:
- `packages/tools/src/math/latex-verify.ts` (definition)
- `packages/tools/src/math/__tests__/latex-verify.test.ts` (tests)
- `packages/tools/src/{math/,}index.ts` (top-level re-exports)
- `docs/designs/phase-4-verification-tools.md` (design ref; Phase 13 listed as future
  work but not currently in active phases)
- `packages/tools/dist/...` (build output; ignore)

Zero production callers.

## Options
1. **Conservative (recommended)**: Drop both top-level re-exports (`packages/tools/src/index.ts:2`
   and `packages/tools/src/math/index.ts:2`) but keep `latex-verify.ts` and its tests
   in place so Phase 13 can re-export when it lands. This removes the dead export from
   the public surface area without losing the implementation.
2. **Aggressive**: Delete `latex-verify.ts`, its tests, and the export lines. Phase 13
   would re-implement from the design doc. Saves ~80 LoC of test/impl now but costs
   re-implementation time later.

Pick option 1 unless the implementer has reason to prefer 2.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- `grep -rn "verifyLatex" packages/tools/src/index.ts packages/tools/src/math/index.ts`
  returns 0 hits (if option 1) or `latex-verify.ts` is deleted (if option 2)
- `docs/designs/phase-4-verification-tools.md` left untouched (it's the design record)

## Risk: Low
If Phase 13 needs `verifyLatex` before this is reversed, the implementation is one
re-export line away.

## Implementation notes
Chose option 1 (conservative): removed the `verifyLatex` re-export lines from `packages/tools/src/index.ts` (line 2) and `packages/tools/src/math/index.ts` (line 2) — one line each. The implementation (`latex-verify.ts`) and its test file remain intact; the test imports from the sibling `./latex-verify.js` directly and continues to pass. `pnpm typecheck` and the latex-verify test suite (4 tests) are green.

## Review
**Verdict: done** (2026-05-23)

Diff reviewed at commit `61a9a67`. Exactly two lines removed — one per index file — matching option 1 as designed. Grep confirms zero production consumers of `verifyLatex` outside the definition and test file. Test file imports directly from `../latex-verify.js`, not through any index, so it is completely unaffected. No blockers, no important findings, no nits. Clean removal of dead public surface area.
