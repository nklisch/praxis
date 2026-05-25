---
id: feature-math-rendering-step-5-pipeline-wiring
kind: story
stage: review
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

## Implementation notes (2026-05-24)

### Changes made
- `packages/ui/src/components/markdown-content.tsx`:
  - Added imports for `KATEX_MACROS` (from `../lib/katex-macros.js`) and `rehypeMathGlyphWrap` (from `../lib/markdown-plugins/rehype-math-glyph-wrap.js`)
  - Changed `REHYPE_BASE` entry from bare `rehypeKatex` to `[rehypeKatex, { throwOnError: false, macros: KATEX_MACROS }]`
  - Added `bareGlyphMath` toggle read (`renderToggles?.bareGlyphMath ?? true`) alongside the other toggle defaults
  - Appended `rehypeMathGlyphWrap` to the `rehypePlugins` useMemo gated by `bareGlyphMath`, positioned AFTER all other plugins to ensure `<math>` HAST elements from rehype-katex exist when the glyph-wrap ancestor-skip fires
  - Updated JSDoc plugin order comment (REHYPE step 6)
- `packages/ui/src/__tests__/markdown-content.test.tsx`:
  - Added `DEFAULT_RENDER_TOGGLES` import from `@praxis/core/types`
  - Flipped the pre-existing `.skip` test active (with updated input — see below)
  - Added `describe("math rendering integration", ...)` with 5 new tests

### Design-flaw escape hatch triggered (`.katex-error` input)
The story specified `$\widebar{x}$` as the test input for `.katex-error`. In KaTeX 0.16.45, `\widebar` is an _unknown command_ that renders as colored inline text (red `style="color:#cc0000"`) but does NOT emit a `.katex-error` class element. The `.katex-error` class is produced only by genuine _parse errors_ (unclosed braces, mismatched environments, etc.).

Changed both the pre-existing `.skip` test and the new integration test to use `$\frac{$` (unclosed brace), which reliably triggers `.katex-error` in KaTeX 0.16.45. This is the correct behavior, not a regression — the story's escape hatch explicitly covers this case.

### Display math in list items
The story specified `- $$\frac{1}{2}$$` (tight list inline). remark-math parses `$$...$$` in a tight list item as _inline math_ (not block math), so `.katex-display` is not produced. Changed the test input to a loose list with properly-delimited block math on separate lines (`"- item\n\n  $$\n  \\frac{1}{2}\n  $$\n"`), which correctly produces `.katex-display` inside the `<li>`.

### Test results
All 5192 tests pass (1945 in `@praxis/ui`, rest in other packages). No new lint/typecheck errors introduced (pre-existing drizzle-orm type error in `@praxis/memory` is unrelated to this story).
