---
id: feature-content-renderer-pipeline
kind: feature
stage: drafting
tags: [content, rendering, design-system]
parent: epic-educational-content-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Content renderer pipeline + educational typography primitives

## Brief

The foundation feature for this epic. Establishes the 3-stage chat-text renderer pipeline (markdown parse with Praxis extensions → tool-result splice → post-render passes) in `@praxis/ui`, and promotes the educational-content typography primitives from `.mockups/design-system/content-types.html` into `components.css` as Tier-2 widgets sibling to the existing chat-surface family.

In scope: callout primitives (`--theorem` / `--lemma` / `--hint` / `--warning`), citation chips, passage blocks, definitions (first-introduction tracking), concept refs (with `concept:` link-scheme handler), glossary terms, figures (caption + body + verdict), procedural step lists, numerical (units + tabular figures), code primitives (inline + block with syntax tokens), file paths. Plus the markdown extension framework: container directives (CommonMark spec), GitHub admonition syntax, link-scheme handlers, attribute-list extension.

Out of scope: math rendering (separate feature, depends on this pipeline existing); per-mode question-tool schema caps (separate feature, agent-side concern not renderer concern); shared indicator primitive refactor (separate feature, scoped to choice indicators).

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **foundation feature** — every other feature in this epic composes against this pipeline. `feature-math-rendering` adds the math layer to it; `feature-mode-aware-question-constraints` adds agent-prompt-side instruction for it; `feature-refactor-shared-choice-indicators` rides alongside without touching it.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Proposed treatments: `.mockups/design-system/content-types.html` — every primitive in every state with proposed CSS treatment. Design pass on this feature promotes them to `components.css`.
- Components showcase context: `.mockups/design-system/components.html` § Chat surface (existing chat primitives; new content-type primitives append as a sibling Tier-2 section).

## Foundation references

- `docs/UX.md` § "Streamed messages" — the existing chat-text rendering surface this pipeline extends.
- `docs/UX.md` § "Citations are first-class" — citation chip behavior contract.
- `docs/ARCHITECTURE.md` § `@praxis/ui` — the package this feature touches.
- Epic body § "Agent contract — markup conventions + parser strategy" — full mapping table per content type; this feature implements the renderer side for every row that isn't math, schema-caps, or indicator-refactor.
