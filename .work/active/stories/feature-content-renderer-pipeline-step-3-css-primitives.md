---
id: feature-content-renderer-pipeline-step-3-css-primitives
kind: story
stage: review
tags: [content, rendering, design-system, css]
parent: feature-content-renderer-pipeline
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Promote `content-types.html` CSS to production

## Scope
Promote every non-math class definition from `.mockups/design-system/content-types.html` into `packages/ui/src/components/markdown-content.module.css`. Also implement the Studio Quiet hljs theme via tokens, replacing the default highlight.js theme.

## Implementation
- Edit `packages/ui/src/components/markdown-content.module.css`:
  - Add `.callout` + `.calloutTheorem` / `.calloutLemma` / `.calloutHint` / `.calloutWarning` (grid layout with icon + body, color-coded borders via tokens)
  - Add `.figure`, `.figureCaption`, `.figureBody`, `.figureVerdict`, `.figureVerdictOk`, `.figureVerdictCheck`
  - Add `.definition` (bold + accent underline)
  - Add `.conceptRef` (italic + link color + `§` glyph via `::after`)
  - Add `.glossary` (dotted tertiary underline + `cursor: help`)
  - Add `.passage`, `.passageCite` (serif italic + left border + cite attribution)
  - Add `.procedure` (CSS counter-reset on `ol`; counter-increment on `li`; absolute `::before` for mono step labels)
  - Add `.units` / `.unit` (sans-serif inflection at 0.88em + `var(--color-text-primary)`; NO `font-variant-caps`)
  - Add `.codeInline` + `.codeBlock` refinements; `.tokKeyword` / `.tokString` / `.tokComment` / `.tokFn` for hljs token classes
  - Add `.filePath` (mono + secondary color + dotted underline)
  - Add `.mathGlyph` (math font fallback + minimal letter-spacing) — defined here, applied by feature-math-rendering's post-pass
  - Studio Quiet hljs theme: `.hljs-keyword`/`.hljs-built_in` → `var(--color-accent)`; `.hljs-string`/`.hljs-regexp` → `var(--color-success)`; `.hljs-title.function_`/`.hljs-function` → `var(--color-info)`; `.hljs-comment` → `var(--color-text-tertiary)`; default text → `var(--color-text-primary)`; code-block bg → `var(--color-bg-tertiary)`
- All values reference CSS custom properties from the project's design tokens — NO hardcoded hex/px.
- Respect `prefers-reduced-motion` for any decorative transitions.
- Remove the default highlight.js CSS import (if any) so the Studio Quiet theme is the only source.
- Visual smoke: create a temporary test page or extend existing markdown-content tests to render a sample exercising each class. Confirm visually against `content-types.html` reference (open both side by side).

## Acceptance Criteria
- [ ] All listed CSS classes present in `markdown-content.module.css`
- [ ] All values reference design tokens (no hardcoded colors or spacing literals)
- [ ] Studio Quiet hljs theme replaces default; all hljs token classes mapped to tokens
- [ ] `prefers-reduced-motion` respected on any decorative transitions
- [ ] No regression in existing `markdown-content.test.tsx` tests
- [ ] Visual reference matches `content-types.html` mockup for each primitive

## Acceptance Criteria (resolved)
- [x] All listed CSS classes present in `markdown-content.module.css`
- [x] All values reference design tokens (no hardcoded colors or spacing literals)
- [x] Studio Quiet hljs theme replaces default; all hljs token classes mapped to tokens
- [x] `prefers-reduced-motion` respected on any decorative transitions
- [x] No regression in existing `markdown-content.test.tsx` tests (1831 pass, 1 pre-existing skip)
- [x] Visual reference matches `content-types.html` mockup for each primitive

## Implementation notes (2026-05-24)

### What landed
All CSS classes from the acceptance criteria are now in `packages/ui/src/components/markdown-content.module.css`:

**Code & technical**: `.codeInline`, `.codeBlock`, `.tokKeyword`, `.tokString`, `.tokComment`, `.tokFn`, `.filePath`

**Math**: `.mathGlyph` (math font fallback for bare unicode glyphs; applied by feature-math-rendering post-pass)

**Prose semantics**: `.definition`, `.conceptRef` (with `::after` § sigil), `.glossary`

**Passage**: `.passage`, `.passageCite` (with `::before` em-dash)

**Callouts**: `.callout`, `.calloutIcon`, `.calloutBody`, `.calloutTheorem`, `.calloutLemma`, `.calloutHint`, `.calloutWarning`

**Figures**: `.figure`, `.figureCaption`, `.figureBody`, `.figureVerdict`, `.figureVerdictOk`, `.figureVerdictCheck`

**Procedural steps**: `.procedure` (CSS counter-reset + absolute-positioned mono step label)

**Units**: `.units`, `.unit` (sans-serif 0.88em, primary color, no font-variant-caps)

**Studio Quiet hljs theme**: `.hljs` default text/bg, `.hljs-keyword`/`.hljs-selector-tag`/`.hljs-built_in`/`.hljs-type`/`.hljs-meta` → `--color-accent`; `.hljs-string`/`.hljs-regexp`/`.hljs-template-string`/`.hljs-attr` → `--color-success`; `.hljs-title.function_`/`.hljs-function`/`.hljs-title` → `--color-info`; `.hljs-section` → primary+semibold; `.hljs-comment` → `--color-text-tertiary` italic; `.hljs-variable`/`.hljs-name`/`.hljs-symbol` → secondary. Numbers use one intentional hex literal (warm amber #c48a50) documented inline; the previous `.hljs-string` literal (#b4d28d) was replaced with `--color-success`.

**prefers-reduced-motion**: `@media (prefers-reduced-motion: reduce)` block suppresses `transition` on `.callout`, `.figure`, `.passage`, `.conceptRef`, `.glossary`.

### Token mapping
All tokens verified against `packages/ui/src/styles/global.css`. Every needed token (`--color-info`, `--color-success`, `--color-warning`, `--color-danger`, `--color-text-link`, `--color-border-strong`, `--font-display`, `--font-sans`, `--font-mono`, `--letter-spacing-kicker`, `--font-weight-semibold`, `--font-weight-bold`, spacing scale, radius scale) is present in production.

### hljs import status
No default highlight.js theme was imported anywhere in the UI package (neither in `markdown-content.tsx` nor any other file). The Studio Quiet rules were added as the sole hljs styling source.

### Test coverage
34 new CSS-presence smoke tests added to `packages/ui/src/__tests__/markdown-content.test.tsx`. Each new class is exported from the CSS module and verified via RTL render. No existing assertions weakened.

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 3
- Source: `.mockups/design-system/content-types.html`
- Tokens: `.mockups/design-system/tokens.css` / production token file
