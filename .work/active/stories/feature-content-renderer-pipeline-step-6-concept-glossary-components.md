---
id: feature-content-renderer-pipeline-step-6-concept-glossary-components
kind: story
stage: review
tags: [content, rendering, ui]
parent: feature-content-renderer-pipeline
depends_on: [feature-content-renderer-pipeline-step-3-css-primitives]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Concept-ref link scheme + glossary `<abbr>` styling

## Scope
Two small additions: a `concept:` link-scheme handler that renders `<ConceptRef>` for those links, and a styling pass for HTML5 `<abbr>` semantic so the glossary class applies automatically.

## Implementation
- Create `packages/ui/src/components/markdown/concept-ref.tsx`:
  - Props: `conceptSlug: string`, `children: ReactNode`, `onOpen?(slug: string): void`
  - Renders `<a href="#" className={styles.conceptRef} onClick={...}>` that calls `onOpen(slug)` if provided
  - Defaults to no-op when `onOpen` not provided
- Extend the `a` component override in `markdown-content.tsx` (in step-8 wiring, but the component itself ships here):
  - When `href?.startsWith("concept:")`, render `<ConceptRef conceptSlug={href.slice(8)} onOpen={conceptOpen}>{children}</ConceptRef>` instead of normal `<a>`
- For glossary: wire the `abbr` component override (also in step-8):
  - `components.abbr` → `({ children, title }) => <abbr className={styles.glossary} title={title}>{children}</abbr>`
- Tests:
  - `packages/ui/src/__tests__/markdown/concept-ref.test.tsx` — renders ConceptRef; click fires onOpen with slug
  - Integration test: `[chain rule](concept:chain-rule)` renders `<ConceptRef conceptSlug="chain-rule">`
  - Glossary: `<abbr title="...">term</abbr>` renders with `.glossary` class

## Acceptance Criteria
- [ ] `<ConceptRef>` component implemented; click fires `onOpen(slug)` if provided
- [ ] When `onOpen` is undefined, click is no-op (no error)
- [ ] Tests cover render, click, slug extraction
- [ ] Glossary class applies to `<abbr>` elements (verify via integration test in step-8)
- [ ] Non-concept `<a>` hrefs preserve existing behavior (external target=_blank, etc.)

## Implementation notes (2026-05-24)

- Created `packages/ui/src/components/markdown/concept-ref.tsx`:
  - `ConceptRef` renders `<a href="#" className={styles.conceptRef} onClick={handleClick}>`
  - `handleClick` calls `e.preventDefault()` then `onOpen?.(conceptSlug)` — safe no-op when `onOpen` absent
  - `biome-ignore lint/a11y/useValidAnchor` applied with justification: `concept:` links are intentional in-app anchors
- Wiring of `concept:` href detection and `abbr` override deferred to step-8 per spec — this story ships the component only
- Tests `packages/ui/src/__tests__/markdown/concept-ref.test.tsx` (9 tests): all pass
  - Renders `<a href="#">`; applies `.conceptRef` class; click fires `onOpen(slug)`; no-op without handler; slug passed exactly; rich children supported

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 6
- Depends on step-3 CSS
