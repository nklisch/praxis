---
id: feature-math-rendering
kind: feature
stage: drafting
tags: [content, rendering, math]
parent: epic-educational-content-rendering
depends_on: [feature-content-renderer-pipeline]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Math rendering pipeline: KaTeX wiring + bare-glyph auto-detect

## Brief

Math rendering across every text-bearing surface in the app — chat-body tutor turns, question prompts, question choices, course materials, flashcards, notes. The agent writes math in LaTeX delimiters (`$inline$` for inline, `$$display$$` for set-off blocks); the renderer composes against the existing Phase 13 KaTeX integration to render them on turn settle. A secondary post-render pass auto-detects bare unicode math characters (∘ ∂ ∫ ∑ ≠ ≈ → ⇒ ± × ² ³ α β γ π, etc.) the agent forgot to wrap and applies the quiet `.math-glyph` typographic treatment so single loose glyphs in prose still read as math notation.

The agent prompt fragment grows a math-wrapping instruction: when to use `$inline$` vs `$$display$$`, that bare unicode glyphs get auto-styled but full math typesetting (fractions, integrals, matrices, indices) requires explicit wrapping.

Per the epic's locked strategic decision: math renders **once when the turn settles**, not progressively per chunk. KaTeX isn't cheap; re-running per chunk would waste compositor time. The student sees a small visible flip after the streaming-tail finishes — accepted trade-off.

In scope: KaTeX wiring extension to all chat-bearing surfaces; the `.math-glyph` class and unicode codepoint table for the auto-detect pass; the math-specific section of the mode prompt fragment. Out of scope: KaTeX library itself (already in production); the broader renderer pipeline (foundation in `feature-content-renderer-pipeline`); the per-mode question-tool caps that accompany the math-wrapping fragment (separate feature, sibling).

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **consumer of the pipeline** — extends `feature-content-renderer-pipeline`'s 3-stage processor with math-specific handling at the markdown-parse stage (KaTeX extension) and the post-render-passes stage (bare-glyph wrapping). Depends on the pipeline existing.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Proposed math treatments: `.mockups/design-system/content-types.html` § Math — three tiers (`.math-inline`, `.math-display`, `.math-glyph`) with examples; `.variable` for ad-hoc variable references in prose.
- Banner at top of `content-types.html` confirms direction: LaTeX wrappers primary, bare-glyph auto-detect secondary, agent-instruction in mode prompt fragment.

## Foundation references

- `docs/SPEC.md` § "Math verification round-trip" (line 84) — KaTeX is already in the production stack for re-rendering parsed LaTeX from handwritten math. This feature extends the same pipeline to agent-generated text math.
- `docs/UX.md` § "Streamed messages" — "math expressions render via KaTeX" already asserted; this feature realizes that for all surfaces, not just chat-body.
- Epic body § Strategic decisions — math renders on settle; agent-contract table § Inline math / Display math / Bare math glyphs.
