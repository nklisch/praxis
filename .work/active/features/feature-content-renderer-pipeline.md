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

## Existing production stack (grounding — 2026-05-24)

`packages/ui/src/components/markdown-content.tsx` is the existing chat-body renderer. Already wired:

- `react-markdown` (built on `unified`/`remark`/`rehype` ecosystem)
- `remark-gfm` — GFM tables, task lists, autolinks
- `remark-math` + `rehype-katex` — math via KaTeX (Phase 13)
- `rehype-highlight` — code syntax highlighting (highlight.js, default theme)
- `rehype-citation-chips` — local custom plugin for inline `[N]` citation chips
- `balanceFences` — handles streaming-partial unclosed code fences and `$$` blocks gracefully
- Custom regex normalization for `\(...\)` → `$...$` and `\[...\]` → `$$...$$`

This feature **extends** the existing pipeline; it does NOT introduce a new markdown library or replace the existing one. New plugins layer onto `REMARK_PLUGINS` and `REHYPE_PLUGINS` arrays in `markdown-content.tsx`. Same surface, same streaming-partial safety, same component overrides API.

## Design decisions

*(captured 2026-05-24 via `feature-design --only-questions`. These lock in directional choices so the full design pass inherits them.)*

- **Plugin strategy**: mix of community + custom. Use `remark-directive` (community, CommonMark-spec) for container directives like `::: figure ... :::` — worth the dependency for spec compliance and ecosystem maturity. Write a small **custom remark plugin** for GitHub admonition syntax (`> [!hint]` etc.) — the syntax is simple enough that a few-line custom plugin gives full control over AST shape and avoids the community admonition packages' assumptions. Custom local plugins for the project-specific concerns: bare-glyph math wrapping, unit auto-detect, first-introduction definition tracking, concept-link-scheme handler. Keep existing community plugins (`remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`, `rehype-citation-chips`) as-is.

- **First-introduction definition tracking — memory-backed with optional out-of-band LLM lookup**: definitions track via `@praxis/memory` (persistent projection — survives session restart, semantically correct: the student really HAS seen this term before across their course history). The renderer reads the memory projection per render to know "is this the student's first-ever introduction to this term?" and emits `.definition` styling only on the genuine first occurrence within the student's history. *Stretch / follow-on*: when the agent writes `[[def:term]]` for a term that has no memory record AND no prior introduction in the current turn, the renderer can issue an **out-of-band one-shot LLM call** to generate the definition on-demand (gives the agent a way to introduce terms it didn't explicitly define — e.g., "the **derivative** is..." with the renderer pulling the definition from a one-shot call). Implementation detail for feature-design Phase 5; flagged here so it's not lost. Mode prompt fragment teaches the agent that definitions are tracked persistently — they don't need to redefine terms across sessions.

- **Per-mode toggles for post-render treatments**: configurable. `@praxis/curriculum` mode definitions get an optional `renderToggles?: { bareGlyphMath?, unitAutoDetect?, firstIntroDefinitions?, callouts?, ... }` shape. Defaults: all treatments on. Modes that are prose-heavy and would suffer from false positives (a future literature-tutor mode disabling unit auto-detect, for instance) can opt out per-treatment. Same plumbing pattern as `questionConstraints` from sibling feature `feature-mode-aware-question-constraints` — mode config drives renderer behavior. Both features touch the mode definition shape; coordinate at design-pass time.

- **Code-block syntax theme**: keep `rehype-highlight` (already in production); write a custom Studio Quiet theme via CSS that uses our tokens — `--color-accent` for keywords, `--color-success` for strings, `--color-info` for function names, `--color-text-tertiary` for comments, `--color-text-primary` for default text, `--color-bg-tertiary` for the block background. Drop the default highlight.js theme. Tight control over how syntax tokens compose with the editorial voice without migrating to a heavier alternative (Shiki).
