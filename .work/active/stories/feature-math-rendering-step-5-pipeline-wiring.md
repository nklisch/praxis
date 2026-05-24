---
id: feature-math-rendering-step-5-pipeline-wiring
kind: story
stage: implementing
tags: [content, rendering, math]
parent: feature-math-rendering
depends_on: [feature-math-rendering-step-1-katex-macros, feature-math-rendering-step-2-bare-glyph-plugin, feature-math-rendering-step-3-error-handling, feature-content-renderer-pipeline-step-8-pipeline-wiring]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Wire macros + bare-glyph plugin + error handling into the pipeline

## Scope
The merge point. Update `markdown-content.tsx` to pass `{ throwOnError: false, macros: KATEX_MACROS }` to `rehype-katex`, and conditionally append `rehypeMathGlyphWrap` to `REHYPE_PLUGINS` (gated by `renderToggles.bareGlyphMath`). Plugin order: bare-glyph-wrap AFTER rehype-katex.

## Implementation
- Edit `packages/ui/src/components/markdown-content.tsx`:
  - Update the `rehypeKatex` plugin entry to pass options: `[rehypeKatex, { throwOnError: false, macros: KATEX_MACROS }]`
  - In the conditional `REHYPE_PLUGINS` build (per `feature-content-renderer-pipeline-step-8`):
    - Append `rehypeMathGlyphWrap` AFTER `rehype-katex` and AFTER citation-chips (post-render pass — runs once HAST is finalized)
    - Gated by `toggles.bareGlyphMath`
- Add integration test `packages/ui/src/__tests__/math-rendering-integration.test.tsx` (or extend `markdown-content.test.tsx`):
  - Render `$\R$` → assert KaTeX HTML for ℝ appears
  - Render bare `α` (no `$...$`) → assert it's wrapped in `.math-glyph`
  - Render `$\widebar{x}$` (malformed) → assert `.katex-error` styling appears + rest of message renders
  - Render `$$\frac{1}{2}$$` inside a list item → assert display block renders inside the `<li>`
  - Mode with `bareGlyphMath: false` → bare `α` is NOT wrapped
- Run full test suite: `pnpm typecheck && pnpm lint && pnpm test`

## Acceptance Criteria
- [ ] `rehype-katex` called with `throwOnError: false` and `macros: KATEX_MACROS`
- [ ] `rehypeMathGlyphWrap` appended to `REHYPE_PLUGINS` gated by `bareGlyphMath` toggle
- [ ] Plugin order: math-glyph-wrap runs AFTER rehype-katex
- [ ] Integration tests cover: macro render, bare-glyph wrap, error styling, display-in-list, toggle-off
- [ ] All existing `markdown-content.test.tsx` tests pass
- [ ] Full test suite green

## References
- Parent feature: `.work/active/features/feature-math-rendering.md` § Unit 5
- Depends on steps 1, 2, 3 (this feature) and step-8 of `feature-content-renderer-pipeline` (pipeline wiring)
