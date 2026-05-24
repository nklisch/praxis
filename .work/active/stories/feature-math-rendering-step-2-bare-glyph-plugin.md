---
id: feature-math-rendering-step-2-bare-glyph-plugin
kind: story
stage: implementing
tags: [content, rendering, math, markdown]
parent: feature-math-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: `rehype-math-glyph-wrap` plugin

## Scope
Custom rehype plugin that walks text nodes and wraps bare unicode math glyphs (operators, Greek lower/upper, super/subscripts, blackboard bold) in `<span class="math-glyph">`. Skips ancestors `code`/`pre`/`kbd`/`samp`/`math`/`a`/`abbr` to avoid wrapping in raw-text contexts or inside KaTeX-rendered math.

## Implementation
- Create `packages/ui/src/lib/markdown-plugins/rehype-math-glyph-wrap.ts`:
  - Export `MATH_GLYPHS: ReadonlySet<string>` per the design table (operators, Greek lowercase a-ω, Greek uppercase italic subset, super/subscripts, blackboard bold)
  - Export `rehypeMathGlyphWrap: () => (tree: Root) => void`
  - Walk text nodes via `visitParents`; for each character in the table, split text + emit `<span class="math-glyph">char</span>`
  - Skip ancestors: `code`, `pre`, `kbd`, `samp`, `math`, `a`, `abbr`
  - Use the collect-replacements-then-splice pattern from `lib/rehype-citation-chips.ts`
- Add tests `packages/ui/src/lib/markdown-plugins/__tests__/rehype-math-glyph-wrap.test.ts`:
  - Each codepoint category wraps (operators, Greek, supers, subs, blackboard)
  - Ancestor-skip rules hold: text in `<code>`, `<a>`, `<math>` is untouched
  - Mixed text with multiple glyphs all wrap correctly
  - Plain prose without glyphs is untouched
  - HAST tree mutation is safe (no infinite loops, no duplicate wraps)

## Acceptance Criteria
- [ ] `MATH_GLYPHS` set exports the documented codepoints
- [ ] `rehypeMathGlyphWrap` plugin wraps each math glyph in `<span class="math-glyph">`
- [ ] Plugin skips all 7 ancestor tags listed
- [ ] Plugin uses visitParents + collect-then-splice pattern
- [ ] Unit tests cover all codepoint categories + ancestor-skip + mixed text
- [ ] Plugin is NOT yet wired into REHYPE_PLUGINS (that's step-5)

## References
- Parent feature: `.work/active/features/feature-math-rendering.md` § Unit 2
- Template: `packages/ui/src/lib/rehype-citation-chips.ts`
