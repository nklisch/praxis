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

## Design decisions

*(captured 2026-05-24 via `feature-design --only-questions`. These lock in directional choices so the full design pass inherits them.)*

- **LaTeX macros: small curated set (10-20)**. Define a small KaTeX `macros` config that the agent can use as shorthand for common notation. Starter set (refine at design time):

  | Macro | Expands to | Meaning |
  |---|---|---|
  | `\R` | `\mathbb{R}` | real numbers ℝ |
  | `\Z` | `\mathbb{Z}` | integers ℤ |
  | `\N` | `\mathbb{N}` | naturals ℕ |
  | `\Q` | `\mathbb{Q}` | rationals ℚ |
  | `\C` | `\mathbb{C}` | complex ℂ |
  | `\pdv{#1}{#2}` | `\frac{\partial #1}{\partial #2}` | partial derivative |
  | `\dv{#1}{#2}` | `\frac{d#1}{d#2}` | derivative |
  | `\norm{#1}` | `\lVert #1 \rVert` | norm ‖x‖ |
  | `\abs{#1}` | `\lvert #1 \rvert` | absolute value \|x\| |
  | `\set{#1}` | `\{ #1 \}` | set braces |
  | `\given` | `\mid` | "given" bar in conditionals |

  Macros load globally in KaTeX config; the unified prompt fragment lists the macro library so the agent knows what's available. Keeps common notation short and consistent; ~10-20 is small enough that the prompt-fragment listing stays scannable.

- **Bare-glyph auto-detect scope: common math operators + Greek + super/subscripts**. Codepoint table covers:

  - **Operators**: `∘ ∂ ∫ ∑ ∏ ∇ ≠ ≈ ≡ ≤ ≥ ∀ ∃ ∈ ∉ ⊂ ⊆ ∩ ∪ → ⇒ ⇔ ± × ÷ ⋅`
  - **Greek lower**: `α-ω` (all 24)
  - **Greek upper, typically-italic subset**: `Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω`
  - **Superscripts**: `¹ ² ³ ⁰ ⁴-⁹`
  - **Subscripts**: `₀-₉`
  - **Blackboard bold**: `ℝ ℤ ℕ ℚ ℂ`

  Each glyph in the table that appears OUTSIDE a `$...$` or `$$...$$` wrapper gets wrapped in `<span class="math-glyph">` by a custom rehype post-pass. Coverage matches what the tutor actually writes in calculus / linear algebra / probability. Greek lower runs SOME false-positive risk ("let α be a constant" → α gets the math-glyph treatment, which is fine; if α appears in a prose context like "alpha release", that's a rare false positive and the styling is subtle enough to be harmless). Expand the table in a follow-up if the project grows into domains needing additional symbol sets.

- **KaTeX error handling: render with inline error message, keep going**. Config: `throwOnError: false`. Failed expressions render with a quiet `.math-error` styling — a small red badge showing the parse error text + the raw source visible inline (e.g., `[KaTeX: Unknown function \widebar] $\widebar{x}$`). The rest of the message renders normally. The agent sees the error visually if dev-mode is on; the unified prompt fragment teaches: "malformed LaTeX renders as an error badge; check expression syntax against the available macro library."

- **Display math nested in markdown contexts: render as display where allowed**. `$$ $$` inside a list item, blockquote, or table cell renders as a block (centered, larger, with vertical breathing room). The containing block provides the indentation; the math block sits inside it. Matches how scholarly markdown typically handles nested display math. Most agent-friendly: the agent doesn't need to track "am I inside a list right now" to pick inline vs display — `$$` always means display.

## Cross-feature coordination

- The KaTeX `macros` config + the error-handling config + the available-macros list in the prompt fragment all need to land together. Coordinate with `feature-mode-aware-question-constraints` (which owns the unified prompt fragment) — this feature contributes the math section of that fragment.
- The bare-glyph post-pass runs in the 3-stage pipeline established by `feature-content-renderer-pipeline`. Strict `depends_on` because the post-pass slot doesn't exist until the pipeline does.
- The agent-contract section in the epic body lists this feature's commitments (LaTeX wrappers, bare-glyph auto-detect, macros, error treatment). Source of truth for what the agent reads about math in the prompt fragment.
