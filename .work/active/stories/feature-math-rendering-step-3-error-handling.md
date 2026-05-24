---
id: feature-math-rendering-step-3-error-handling
kind: story
stage: implementing
tags: [content, rendering, math, css]
parent: feature-math-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: `.math-error` styling for KaTeX parse failures

## Scope
Add CSS for `.math-error` (and the `.katex-error` alias KaTeX emits when `throwOnError: false`) so malformed LaTeX renders inline as a quiet red badge showing the parse error + raw source. The actual `throwOnError: false` wiring happens in step-5.

## Implementation
- Edit `packages/ui/src/components/markdown-content.module.css`:
  - Add `.mathError` (CSS Modules version) with design-token values:
    - Inline-flex container with baseline alignment
    - Background: `color-mix(in srgb, var(--color-danger) 8%, transparent)`
    - Color: `var(--color-danger)`
    - Border: `1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)`
    - Border-radius, padding, font-family: mono, size 0.85em
  - Nested rule for `.mathError code`: transparent bg, secondary text color
- Add a `:global(.katex-error)` selector composing the same `.mathError` rules (or directly applying them) — KaTeX's error output uses the unhashed class name
- Add a small render test in `packages/ui/src/__tests__/markdown-content.test.tsx`:
  - Render `$\widebar{x}$` (an undefined macro)
  - With `throwOnError: false` (wired in step-5; here we just verify the CSS rule exists), assert a `.katex-error` element appears with the styling
  - (If step-5 is not landed yet, skip the assertion but commit the CSS)

## Acceptance Criteria
- [ ] `.mathError` class in `markdown-content.module.css` with token-only values
- [ ] `:global(.katex-error)` alias applies the same styling (for KaTeX's emitted class)
- [ ] No hardcoded color / dimension literals
- [ ] No regression on existing markdown-content tests
- [ ] Build / lint pass

## References
- Parent feature: `.work/active/features/feature-math-rendering.md` § Unit 3
- File: `packages/ui/src/components/markdown-content.module.css`
