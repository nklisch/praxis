---
id: idea-inline-question-density-layout-and-schema-caps
created: 2026-05-24
tags: [ui, design-system, tool-schema, refactor]
---

The 2026-05-24 question-panel mockup responsive showcase used a deliberately dense multi-select question (70-word prompt + 5 choices ranging 9-33 words, math notation throughout) to stress-test the layout. It surfaced three coupled problems that this idea consolidates for future scoping. The first (flex bug) was fixed inline during the same review; the rest need design work.

## 1. Layout bug (fixed 2026-05-24)

`.inline-question__choice` used `display: flex` with the indicator and label as children. Choice content with multiple inline elements (`<em>`, `<sup>`, plain text nodes between them — typical for math-heavy questions) caused each inline element to become its own flex item, breaking text into narrow vertical columns instead of flowing as normal inline text.

**Fix landed**: changed `.inline-question__choice` to `display: block` with absolutely-positioned indicator in the left padding zone. Text now flows as normal block content, regardless of how many inline children it contains. Also bumped `.inline-question__choices` gap from `--space-1` to `--space-2` and choice padding to `--space-3` for breathing room; line-height upgraded from `--line-height-base` to `--line-height-loose` for readability of dense content.

No further work needed on this specific bug; remediation is in `.mockups/design-system/components.css` `.inline-question__choice` definition.

## 2. Density still feels crowded — design problem

Even with the layout bug fixed, a dense 70-word + 5-multi-line-choice question is visually overwhelming. The card grows past 700px tall at narrow widths; reading and processing the question takes serious effort. The student has to hold the prompt context in mind while parsing 5 dense choices, each of which is its own multi-line paragraph.

Possible design moves to explore at feature-design time:

- **Typographic differentiation**: the prompt is currently same body weight as choices. Could be larger / lighter, with choices smaller / denser. Makes the "this is the question" vs "these are answers" hierarchy more pronounced.
- **Choice numbering**: prepend "A·" / "B·" / "C·" markers in a quiet mono so the eye can pick out individual choices in a wall of text.
- **Progressive disclosure for long choices**: very long choices (>20 words) could collapse to a one-line summary with "expand for full text" — but this fights the "all choices visible at once" principle. Probably wrong; reject.
- **Math rendering via KaTeX**: in production the math will render properly (not the ad-hoc `<em>` styling used in mocks). May help legibility considerably; revisit after Phase 13's editorial math pass interacts with this surface.
- **Indent / nested layout for long choices**: each choice gets a small left-margin chevron and the body text indented, creating clearer "block" boundaries. Could feel heavy.
- **Choice grouping**: when 5 choices, render in two columns (where horizontal space allows) so the visual scan is shorter. Risk: breaks the "answer is a vertical list" expectation.

## 3. Tool-schema constraints — **dynamic per mode** (input to `feature-question-panel-rework`)

The `ask_student_question` (and equivalent quick-check) constraints are NOT a single global cap — they should vary by the agent's current mode. A teach-mode quick-check pulled in mid-explanation is a different shape from a configure-mode disambiguation prompt, which is a different shape from a homework-mode assessment item. Each mode has different intent → different right-sized question density.

### Per-mode defaults (proposed starting values; refine at feature-design time)

| Mode | Prompt max | Choice max | Count | Multi cap | Rationale |
|---|---|---|---|---|---|
| **teach** (quick-check) | 30 words | 10 words | 4 | 4 | Concise formative probes — should slot into a tutor turn without breaking flow. Long prompts here mean the tutor should have explained more before asking. |
| **homework / quiz / exam** (assignment items) | 60 words | 25 words | 5 | 6 | Assessment items can be denser; they're the primary content of the tab, not interjections. Real exam-style questions need setup and full-clause choices. |
| **course-create / configure** (structured questions) | 50 words | 15 words | 5 | 6 | Disambiguation needs context but stays scannable. The user is in an authoring flow; reading-load tolerance is moderate. |
| **study-skills** | 40 words | 12 words | 4 | 4 | Reflection prompts; bias toward openness, not density. |

These are educated guesses against the current chain-rule mockup stress test. Final values land in `feature-question-panel-rework`'s design pass against the actual usage data once instrumented.

### Implementation shape

Three coupled pieces:

1. **Mode config carries the caps.** Add `questionConstraints?: { promptMaxWords, choiceMaxWords, choiceCount, multiSelectCap }` to the mode definition shape in `@praxis/curriculum`. Defaults per mode listed above; modes that don't override fall back to the structured-question defaults.
2. **Tool dispatch resolves and validates per-mode.** The `ask_student_question` tool handler reads the active mode from `ToolContext`, looks up the constraints, and runs validation against them. Validation errors are descriptive ("Choice text too long for teach mode — keep choices to ~10 words; longer reasoning belongs in the preceding tutor turn") so the agent learns the constraint from the error.
3. **System prompt fragment interpolates the per-mode caps.** The fragment that introduces `ask_student_question` to the agent reads the active mode's constraints and renders them inline: *"In the current mode (teach), keep question prompts to ~30 words, choice text to ~10 words, max 4 choices total (max 4 if multi-select). For longer setup, issue an explanatory chat turn before the question card."* Same pattern as the existing mode-tool-scoping shape — see `mode-prompt-fragment-composition` pattern.

Together these mean the agent reads the constraints for whichever mode it's currently in, validation enforces them at tool-dispatch time, and the schema's error messages teach the constraint when the agent overshoots.

### Why dynamic over static

A static global cap forces the wrong trade-off everywhere:
- Tight enough for teach quick-checks → exam items can't say what they need to
- Loose enough for exam items → teach quick-checks become walls of text

Dynamic caps mean each mode lives at its right density without compromising the others. The cost is one extra plumbing layer (mode → constraints lookup) and a richer system prompt fragment; both are local changes inside `@praxis/curriculum` + `@praxis/tools`.

## 4. Math rendering — explicit + auto-detect (input to `feature-question-panel-rework`)

The mocks currently use `<em>` for inline math (italic, no semantic treatment). Production already has KaTeX for chat-body math rendering per `docs/UX.md` § "Streamed messages" ("math expressions render via KaTeX"). The inline-question chassis needs the same pipeline, plus a layered auto-detect for bare unicode math characters the agent might forget to wrap.

### Recommended approach — explicit primary, auto-detect secondary

**Primary path (explicit, robust):** the agent wraps math in LaTeX delimiters — `$...$` for inline, `$$...$$` for display. The question rendering pipeline runs the same KaTeX pass that chat-body text already uses. Standard convention; predictable; no false positives; the agent has full control over what's math.

**Secondary path (auto-detect, defensive):** after KaTeX has rendered explicit wrappers, a second pass scans remaining text for bare unicode math characters (∘ ∂ ∫ ∑ ∇ ≠ ≈ ≤ ≥ → ⇒ ⇔ ± × ÷ ² ³ ⁰⁹ ₀₉ Greek lower α-ω etc.) and wraps each in a quiet `.math-glyph` span with a typographic treatment — math-family fallback chain, slight color or weight tweak so the eye registers "this is math notation" even when bare. Cheap; no parser needed; catches agent omissions without requiring them to wrap every standalone glyph.

**What we DON'T do — pattern-based auto-detect of full expressions.** Trying to regex-match "this looks like an expression" (`f(x)`, `a + b = c`, `e^x` without explicit wrappers) produces false positives in natural text ("for example: x is what we'll call the variable") and false negatives on anything novel. The unicode-glyph pass is the safe extent of auto-detection; full expression detection belongs to the agent via LaTeX wrappers.

### Agent instruction

The mode prompt fragment (the same one that interpolates per-mode question constraints from Section 3 above) should include a math-wrapping instruction:

> *"Wrap math expressions in LaTeX: `$inline$` for short inline math, `$$display$$` for set-off expressions. Variables and operator glyphs in plain text get auto-styled; only wrap when you want full math typesetting (fractions, integrals, matrices, indices). For function names with arguments (`f(x)`, `g(x)`), wrap to ensure consistent italics. Don't wrap things that aren't math — the renderer will throw on malformed LaTeX."*

This pairs with Section 3's per-mode constraint interpolation in the same fragment, so the agent reads both length caps and math-wrapping rules together.

### Cross-cutting note

Math rendering is not unique to questions — chat-body text, tutor turns, course materials, flashcards all need it. The right home for the rendering pipeline is the chat-text renderer (already KaTeX-equipped per Phase 13). What `feature-question-panel-rework` needs is to *compose against* that renderer rather than do its own thing.

Auto-detect (the bare-glyph pass) is more universal — applies to every text surface, not just questions. Could land as part of the chat-text renderer itself. Worth checking what Phase 13's KaTeX integration does today before scoping; might already exist.

## Scoping path

This is a mix:
- (1) is **done** — no work needed.
- (2) is **design exploration** for `feature-question-panel-rework`'s upcoming design pass; recommend adding a Design Decision capturing the typographic-differentiation direction once explored.
- (3) is **implementation work** spanning two packages — `@praxis/curriculum` (mode config gets `questionConstraints?`) and `@praxis/tools` (dispatch reads constraints, validates per-mode, system prompt fragment interpolates). Two-package scope is bigger than a single story; likely a child feature of `epic-chat-interaction-ux-overhaul` or a sibling refactor folded under `feature-question-panel-rework` with explicit child stories per package.
- (4) is a **smaller cross-cutting** piece. The primary path (compose against existing KaTeX pipeline) is likely a single-story polish on the inline-question chassis. The secondary path (bare-glyph auto-detect) is a broader chat-text renderer enhancement worth scoping separately if it doesn't exist today.

When promoted via `/agile-workflow:scope`, recommend:
- Fold (2) into `feature-question-panel-rework` as additional design decisions for the visual treatment.
- Spawn (3) as either child stories under `feature-question-panel-rework` (clean if the work is tightly bounded) OR as a sibling feature named `feature-question-tool-mode-aware-constraints` (if it grows to need its own design pass — the cross-package nature plus the mode-config schema change may push it that way). Decision falls out of the design pass.
- Fold (4)'s primary path into `feature-question-panel-rework`. The secondary path (bare-glyph auto-detect) gets its own backlog idea if the chat-text renderer doesn't already do it — first action when scoping is to read `packages/ui/src/` for the existing KaTeX integration and decide.

## Source

Mockup review on 2026-05-24 (responsive-showcase of dense multi-select question). User feedback: "the questions look pretty bad in this case, not sure what we should do — it's not just the overflow, it's crowded and hard to process."
