---
id: feature-content-renderer-pipeline-step-4-callout-figure-components
kind: story
stage: done
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

## Implementation notes (2026-05-24)

- Created `packages/ui/src/components/markdown/callout.tsx`:
  - `Callout` renders `<aside role="note">` with `.callout` + `.<type>` modifier class
  - `TYPE_LABEL` record drives the `<span class="calloutIcon" aria-hidden="true">` text (Theorem / Lemma / Hint / Warning)
  - `?? ""` fallbacks on CSS module key access satisfies `noUncheckedIndexedAccess`
  - Pure presentational — no state, no effects
- Created `packages/ui/src/components/markdown/figure.tsx`:
  - `Figure` renders `<figure>` with `.figureBody` always present; `<figcaption>` only when `caption` prop is provided
  - Verdict glyph is `<span role="img" aria-label="correct|check your work">` inside the figcaption
  - `?? ""` fallbacks on CSS module verdict-class key access
- Tests `packages/ui/src/__tests__/markdown/callout.test.tsx` (11 tests) and `figure.test.tsx` (17 tests): all pass
  - Each callout type modifier class verified; `calloutIcon` aria-hidden confirmed
  - Figure with/without caption, with/without verdict; aria-label on verdict span confirmed
- Also formatted `packages/ui/src/components/markdown/definition.tsx` (pre-existing, was failing biome format)

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 4
- Depends on step-2 (HAST element emission) and step-3 (CSS classes)

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: Two presentational components shipped via the bundle-agent. `Callout` uses `role="note"` + type-modifier class + `aria-hidden` icon span (correct — screen readers don't double-announce); `Figure` always renders body, conditionally caption + verdict (with `role="img"` + `aria-label` on verdict span — Biome `useAriaPropsSupportedByRole`). `?? ""` fallbacks on CSS module key access satisfy `noUncheckedIndexedAccess`. 11 + 17 tests cover all callout types, both figure shapes, accessibility attributes.
