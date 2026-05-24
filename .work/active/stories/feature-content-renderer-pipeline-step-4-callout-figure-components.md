---
id: feature-content-renderer-pipeline-step-4-callout-figure-components
kind: story
stage: implementing
tags: [content, rendering, ui]
parent: feature-content-renderer-pipeline
depends_on: [feature-content-renderer-pipeline-step-2-remark-plugins, feature-content-renderer-pipeline-step-3-css-primitives]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: `<Callout>` + `<Figure>` React components

## Scope
React components rendered via react-markdown's `components` map for the custom HAST elements emitted by the admonitions + directive plugins.

## Implementation
- Create `packages/ui/src/components/markdown/callout.tsx`:
  - Props: `type: "theorem" | "lemma" | "hint" | "warning"`, `children: ReactNode`
  - Renders `<aside class={styles.callout + " " + styles[`callout${cap(type)}`]}>` with icon glyph + body
  - Pure presentational
- Create `packages/ui/src/components/markdown/figure.tsx`:
  - Props: `caption?: string`, `verdict?: "ok" | "check"`, `children: ReactNode`
  - Renders `<figure>` with `__caption` + `__body` + optional `__verdict` glyph
  - Pure presentational
- Add tests `packages/ui/src/__tests__/markdown/callout.test.tsx` and `figure.test.tsx`:
  - Each callout type renders the right modifier class
  - Figure renders caption + body + optional verdict
  - RTL: assert `role="figure"` / `role="note"` for accessibility (or appropriate ARIA)

## Acceptance Criteria
- [ ] `<Callout type="hint">` renders `.callout` + `.calloutHint`
- [ ] `<Callout>` accepts and renders nested markdown children
- [ ] `<Figure caption="..." verdict="ok">` renders all three pieces
- [ ] Components have no state, no effects
- [ ] Tests cover each callout type + figure with/without caption/verdict
- [ ] Accessibility: callouts have appropriate `role` attribute

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 4
- Depends on step-2 (HAST element emission) and step-3 (CSS classes)
