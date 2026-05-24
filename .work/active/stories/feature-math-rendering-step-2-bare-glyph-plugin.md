---
id: feature-math-rendering-step-2-bare-glyph-plugin
kind: story
stage: review
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

## Implementation notes (2026-05-24)

### Files created
- `packages/ui/src/lib/markdown-plugins/rehype-math-glyph-wrap.ts` — plugin + `MATH_GLYPHS` set
- `packages/ui/src/lib/markdown-plugins/__tests__/rehype-math-glyph-wrap.test.ts` — 35 tests

### Test results
35 tests pass; full `@praxis/ui` suite (1758 tests, 165 files) unaffected.

### Pattern adherence
Mirrors `rehype-citation-chips.ts` exactly: `visitParents` → collect `Replacement[]` → splice after walk. Character iteration uses `for (const ch of value)` (Unicode code point safe). Fast short-circuit via `Array.from(value).some(ch => MATH_GLYPHS.has(ch))` skips prose-only text nodes. Ancestor skip list extracted to a `SKIP_TAGS` module-level `Set` (7 tags: `code`, `pre`, `kbd`, `samp`, `math`, `a`, `abbr`).

### Deviations
None. Plugin is NOT wired into `REHYPE_PLUGINS` (per scope — that's step-5).

### Implementation discovery
No unexpected HAST node types encountered. The `_mathGlyphSpan` helper in the test file was scaffolded for potential use but ended up unused — biome renamed it with an underscore prefix rather than deleting it, keeping it as reference for test structure.
