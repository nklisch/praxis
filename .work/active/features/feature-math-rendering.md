---
id: feature-math-rendering
kind: feature
stage: implementing
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

## Architectural choice

Compose against the existing `rehype-katex` already wired in `markdown-content.tsx`. This feature contributes:
1. A KaTeX `macros` config object that extends `rehype-katex`'s call site
2. A new rehype post-pass plugin (`rehype-math-glyph-wrap`) shaped like `lib/rehype-citation-chips.ts` that walks text nodes and wraps unicode math glyphs in `.math-glyph` spans
3. A `.math-error` CSS class (the KaTeX error inline rendering — `throwOnError: false`)
4. An extension to the existing `questionToolFragment` factory (created by `feature-mode-aware-question-constraints`) — appending the available LaTeX macros list to the Math section so the agent knows what shortcuts are available

Render-on-settle is already the default behavior of `rehype-katex` — it runs once when the markdown re-renders post-stream. No special "wait until settled" wiring needed in this feature; the existing streaming-text pipeline already triggers a final render after the streaming-tail finishes.

Rejected alternatives:
- **Render KaTeX per-streamed-chunk** — explicitly rejected by the epic's Strategic decisions; wastes compositor time + flashes math twice.
- **Build a custom math parser** — KaTeX is mature and integrated; no benefit.
- **Use MathJax** — heavier than KaTeX, no benefit for our use case.
- **Auto-detect inline math as `digit*letter` etc.** — too many false positives in prose; explicit `$...$` markup is unambiguous.

## Implementation Units

### Unit 1: KaTeX macros configuration
**File**: `packages/ui/src/lib/katex-macros.ts` (NEW)
**Story**: `feature-math-rendering-step-1-katex-macros`

```typescript
// Exported as a frozen const so callers can pass directly to rehype-katex
export const KATEX_MACROS: Readonly<Record<string, string>> = Object.freeze({
  "\\R": "\\mathbb{R}",
  "\\Z": "\\mathbb{Z}",
  "\\N": "\\mathbb{N}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
  "\\pdv": "\\frac{\\partial #1}{\\partial #2}",
  "\\dv": "\\frac{d#1}{d#2}",
  "\\norm": "\\lVert #1 \\rVert",
  "\\abs": "\\lvert #1 \\rvert",
  "\\set": "\\{ #1 \\}",
  "\\given": "\\mid",
});

// Also exported in a human-readable form for the prompt fragment
export interface MacroDoc {
  shortcut: string;        // e.g. "\\R"
  expansion: string;       // e.g. "\\mathbb{R}"
  meaning: string;         // e.g. "real numbers ℝ"
}
export const KATEX_MACRO_DOCS: ReadonlyArray<MacroDoc> = [...];
```

**Implementation notes**:
- The macros object goes directly into `rehype-katex`'s options (wired in Unit 5).
- `KATEX_MACRO_DOCS` is consumed by the prompt-fragment extension (Unit 4) so the agent sees what's available.
- Curated minimal set per the feature's design decision (10-20 macros). Future additions = single-file edit.
- Verify each macro renders correctly via unit test (parse a representative LaTeX expression and assert no error).

**Acceptance criteria**:
- [ ] `KATEX_MACROS` exported with the 11 documented macros
- [ ] `KATEX_MACRO_DOCS` exported with shortcut + expansion + meaning per macro
- [ ] Unit test: each macro parses without KaTeX error
- [ ] No regression on existing markdown-content tests

---

### Unit 2: Bare-glyph auto-detect plugin
**File**: `packages/ui/src/lib/markdown-plugins/rehype-math-glyph-wrap.ts` (NEW)
**Story**: `feature-math-rendering-step-2-bare-glyph-plugin`

```typescript
// Codepoint table per the feature design
export const MATH_GLYPHS: ReadonlySet<string> = new Set([
  // Operators
  "∘", "∂", "∫", "∑", "∏", "∇", "≠", "≈", "≡", "≤", "≥",
  "∀", "∃", "∈", "∉", "⊂", "⊆", "∩", "∪", "→", "⇒", "⇔",
  "±", "×", "÷", "⋅",
  // Greek lowercase (full alphabet)
  "α","β","γ","δ","ε","ζ","η","θ","ι","κ","λ","μ","ν","ξ","ο","π","ρ","σ","τ","υ","φ","χ","ψ","ω",
  // Greek uppercase (typically italic subset)
  "Γ","Δ","Θ","Λ","Ξ","Π","Σ","Φ","Ψ","Ω",
  // Superscripts
  "¹","²","³","⁰","⁴","⁵","⁶","⁷","⁸","⁹",
  // Subscripts
  "₀","₁","₂","₃","₄","₅","₆","₇","₈","₉",
  // Blackboard bold
  "ℝ","ℤ","ℕ","ℚ","ℂ",
]);

export const rehypeMathGlyphWrap: () => (tree: Root) => void;
```

**Implementation notes**:
- Walk text nodes via `visitParents`; for each character in the text, if it's in `MATH_GLYPHS`, split the text into the surrounding text + a `<span class="math-glyph">char</span>` element.
- Skip ancestors with tag `code`, `pre`, `kbd`, `samp`, `math` (already-typeset by KaTeX), `a`, `abbr` — wrapping in those contexts would be wrong.
- Skip text inside an `$...$` or `$$...$$` block — but those are already handled before reaching this plugin (they get converted to `<math>` HAST by `rehype-katex`), so the ancestor-skip on `math` covers it.
- Same collect-replacements-then-splice pattern as `lib/rehype-citation-chips.ts`.
- Gated by `renderToggles.bareGlyphMath` at the wire-in site (Unit 5).

**Acceptance criteria**:
- [ ] `MATH_GLYPHS` set exports the documented codepoints
- [ ] Plugin wraps each math glyph in `<span class="math-glyph">`
- [ ] Plugin skips text inside `code`, `pre`, `kbd`, `samp`, `math`, `a`, `abbr`
- [ ] Plugin uses the visitParents + collect-then-splice pattern
- [ ] Unit tests cover: each codepoint category wraps; ancestor-skip rules hold; mixed text with multiple glyphs handled

---

### Unit 3: `.math-error` styling + `throwOnError: false`
**File**: `packages/ui/src/components/markdown-content.module.css` (extend) + Unit 5 wires the KaTeX option
**Story**: `feature-math-rendering-step-3-error-handling`

```css
.mathError {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: 0 var(--space-1);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  color: var(--color-danger);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.85em;
}
.mathError code {
  background: transparent;
  color: var(--color-text-secondary);
}
```

**Implementation notes**:
- `rehype-katex`'s `throwOnError: false` mode renders parse errors as inline `<span class="katex-error">` by default. We restyle that class (and its alias) via `.math-error`.
- KaTeX's output includes the error message inline. Our styling makes it scannable but doesn't break the rest of the message.
- All values reference design tokens.

**Acceptance criteria**:
- [ ] `.math-error` class added to `markdown-content.module.css` with design-token values
- [ ] KaTeX errors render with the styling (verify via test rendering malformed `$\unknown$`)
- [ ] Rest of the message renders normally despite the error

---

### Unit 4: Extend `questionToolFragment` with macros list
**File**: `packages/curriculum/src/modes/fragments/question-tool.ts` (extend — created in `feature-mode-aware-question-constraints-step-4`)
**Story**: `feature-math-rendering-step-4-prompt-fragment-extension`

**Implementation notes**:
- Append a subsection to the existing Math section in `questionToolFragment`'s template: "Available LaTeX macros:" followed by a markdown table generated from `KATEX_MACRO_DOCS`.
- Format: `| Shortcut | Expansion | Meaning |` rows; agent reads as a quick reference.
- Coordination: this story TOUCHES the same file as `feature-mode-aware-question-constraints-step-4-prompt-fragment`. The dependency edge enforces ordering — that story must land first; this story is an additive edit.

**Acceptance criteria**:
- [ ] `questionToolFragment` template includes the macros table generated from `KATEX_MACRO_DOCS`
- [ ] Table includes all 11 macros with shortcut + expansion + meaning
- [ ] Template still includes all other sections (length constraints, citations, definitions, etc.)
- [ ] Tests in `packages/curriculum/src/modes/fragments/__tests__/question-tool.test.ts` extended: assert macros table renders

---

### Unit 5: Wire macros + plugin + error handling into the pipeline
**File**: `packages/ui/src/components/markdown-content.tsx` (extend — pipeline-wiring story landed via `feature-content-renderer-pipeline-step-8`)
**Story**: `feature-math-rendering-step-5-pipeline-wiring`

**Implementation notes**:
- Update the `rehypeKatex` plugin call to pass `{ throwOnError: false, macros: KATEX_MACROS }`
- Append `rehypeMathGlyphWrap` to `REHYPE_PLUGINS` conditionally on `toggles.bareGlyphMath`
- Order: bare-glyph-wrap runs AFTER `rehype-katex` (so the `math` ancestor-skip works — KaTeX output is `<math>` HAST)
- Coordination: this story touches the same file as `feature-content-renderer-pipeline-step-8-pipeline-wiring`. Dependency edge enforces ordering — that story must land first; this is an additive edit.

**Acceptance criteria**:
- [ ] `rehype-katex` called with `throwOnError: false` and `macros: KATEX_MACROS`
- [ ] `rehypeMathGlyphWrap` added to `REHYPE_PLUGINS` gated by `bareGlyphMath` toggle
- [ ] Plugin order: math-glyph-wrap AFTER rehype-katex
- [ ] Integration test: render text with `$\R$` → KaTeX rendered ℝ; render text with bare `α` → wrapped in `.math-glyph`; render text with `$\unknown$` → `.math-error` styling
- [ ] All existing `markdown-content.test.tsx` tests pass
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

---

## Implementation Order

1. **step-1-katex-macros** (deps: `[]`)
2. **step-2-bare-glyph-plugin** (deps: `[]`)
3. **step-3-error-handling** (deps: `[]`)
4. **step-4-prompt-fragment-extension** (deps: `[step-1, feature-mode-aware-question-constraints-step-4-prompt-fragment]`)
5. **step-5-pipeline-wiring** (deps: `[step-1, step-2, step-3, feature-content-renderer-pipeline-step-8-pipeline-wiring]`)

Steps 1, 2, 3 ship in parallel without waiting. Step-4 waits for the sibling-feature fragment to land. Step-5 is the merge point, waiting for the sibling-feature pipeline-wiring story.

## Testing

### Unit tests
- `packages/ui/src/lib/__tests__/katex-macros.test.ts` — each macro parses
- `packages/ui/src/lib/markdown-plugins/__tests__/rehype-math-glyph-wrap.test.ts` — per-category wrap + ancestor-skip
- `packages/curriculum/src/modes/fragments/__tests__/question-tool.test.ts` (extend) — macros table presence

### Integration
- `packages/ui/src/__tests__/markdown-content.test.tsx` (extend): kitchen-sink test exercising LaTeX math, macros, bare glyphs, malformed math (error state), display math nested in a list item

## Risks

- **Plugin order dependency**: `rehype-math-glyph-wrap` MUST run after `rehype-katex`. Otherwise it'd wrap glyphs INSIDE LaTeX expressions before KaTeX gets to render them, which would break the parse. Mitigation: explicit ordering in `markdown-content.tsx` + an ordering assertion test.

- **Greek lowercase false positives**: `α` in a prose context like "alpha release" would wrap. The `.math-glyph` styling is subtle (font fallback + letter-spacing) so the false positive is harmless. Per-mode toggle (`bareGlyphMath: false`) escape hatch.

- **KaTeX bundle size on narrow surfaces**: KaTeX is ~270KB. Mobile / sidebar tutor surfaces may want lazy loading. Out of scope here — flag for future perf-design pass.

- **Cross-feature wire-in ordering**: this feature's step-4 and step-5 edit files that the sibling features (`feature-mode-aware-question-constraints` and `feature-content-renderer-pipeline`) create. Strict `depends_on` enforces landing order; the orchestrator respects it.

- **`KATEX_MACRO_DOCS` keep-in-sync**: the docs array must stay in sync with `KATEX_MACROS`. Mitigation: a small validation test asserts every macro in the docs array has a matching entry in `KATEX_MACROS` (and vice versa).
