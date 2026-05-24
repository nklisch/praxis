---
id: feature-content-renderer-pipeline-step-3-css-primitives
kind: story
stage: implementing
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

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 3
- Source: `.mockups/design-system/content-types.html`
- Tokens: `.mockups/design-system/tokens.css` / production token file
