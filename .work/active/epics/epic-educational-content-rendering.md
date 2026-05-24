---
id: epic-educational-content-rendering
kind: epic
stage: drafting
tags: [content, rendering, design-system, cross-cutting]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Educational content rendering: math, typography, mode-aware question constraints, shared visual primitives

## Brief

Praxis text isn't plain prose — it carries math expressions, code, citations, definitions, theorems, hints, worked examples, units, and other educational-content shapes that each deserve distinct typographic treatment. Today these are handled inconsistently: math rendering happens via Phase 13's KaTeX wiring on chat-body text but isn't wired through to question prompts or other surfaces; question tools have no length caps so dense agent-generated questions blow up the layout; choice indicators in chat-inline questions don't share visual language with their tab-body assignment-item counterparts; bare unicode math glyphs in prose look like punctuation; the design system has no canonical treatment for callouts, definitions, citations, or worked-example figures.

This epic provides the cross-cutting infrastructure for educational content rendering across **every text-bearing surface in the app** (tutor turns, question prompts, course materials, flashcards, notes, assignment items, course-create drafts). It does not own any of those surfaces — they continue to live in their respective features. What it owns is the **shared rendering pipeline + the typographic vocabulary + the agent-facing instructions** that those surfaces compose against.

The work was sourced from a mockup-review session on 2026-05-24 that surfaced four coupled concerns (density / layout / schema caps / math rendering), then expanded when the educational-content typography mock (`content-types.html`) catalogued the broader set of treatments needed beyond math alone.

## Strategic decisions

*(captured 2026-05-24 via `/agile-workflow:scope` strategic-ambiguities pass; these set the framing the child features inherit)*

- **Math rendering during streaming**: render once when the turn settles, not progressively per chunk. KaTeX runs after the streaming-tail finishes; during streaming the body shows raw text with LaTeX delimiters visible. Cleaner; KaTeX isn't cheap and re-running per chunk would waste compositor time. Trade-off accepted: math materializes with a small visible flip after the turn settles. Matches how Phase 13's KaTeX integration likely already works for chat-body text.
- **Folded scope**: `idea-align-assignment-items-to-inline-question-indicators` (parked 2026-05-24) is absorbed into this epic — same theme of shared visual primitives across surfaces. The choice-indicator extraction lives as a child feature here (tagged `[refactor]`) rather than as a sibling concern.
- **Schema caps home**: dynamic per-mode question-tool constraints are a child of THIS epic, not the existing `epic-chat-interaction-ux-overhaul`. Rationale: the mode prompt fragment that interpolates per-mode caps ALSO carries the math-wrapping LaTeX instruction — both pieces of agent guidance for the same surface. Keeping them in one epic lets a single feature-design pass coordinate the cross-package interactions (`@praxis/curriculum` mode config + `@praxis/tools` validation + `@praxis/ui` rendering).
- **Renderer ownership**: the chat-text renderer in `@praxis/ui` is the single composition point for all content-type treatments. Question chassis, flashcard renderer, course material viewer, etc. compose against the same renderer — they don't carry their own KaTeX wiring, their own callout styling, their own citation chips. One pipeline, many composing surfaces.
- **Tier rule**: educational-content typography (`.callout`, `.definition`, `.citation-chip`, `.figure`, `.procedure`, `.units`, etc.) lives in `components.css` as Tier-2 widgets — a sibling tier to the existing chat-surface family. Every surface composes against components.css; no surface defines its own version of these primitives.

## Source ideas (absorbed)

- `.work/backlog/idea-inline-question-density-layout-and-schema-caps.md` — primary source, four sections covering layout bug (now fixed inline), density visual design (folds into `feature-question-panel-rework` design decisions), dynamic per-mode schema caps (child feature here), math rendering (child feature here)
- `.work/backlog/idea-align-assignment-items-to-inline-question-indicators.md` — folded in per Strategic decisions; child feature here

## Anticipated child features

*(decomposition sketched here as a planning aid; actual child files spawned by `/agile-workflow:epic-design`)*

1. **`feature-math-rendering-pipeline`** — wire LaTeX-wrapped math through KaTeX in the `@praxis/ui` chat-text renderer (compose against existing Phase 13 integration, don't duplicate it). Add the bare-unicode-glyph auto-detect secondary pass for unwrapped math characters. Surfaces affected: chat-body text, inline question prompts, inline question choices, course material rendering, flashcard fronts/backs, tutor-rendered notes. Add the `.math-glyph` class to components.css and the math font-fallback chain. Agent prompt fragment teaches LaTeX wrapping (paired with per-mode caps from feature 2). **Render-on-settle** per Strategic decisions.

2. **`feature-mode-aware-question-constraints`** — cross-package work: `@praxis/curriculum` mode definition shape gets `questionConstraints?: { promptMaxWords, choiceMaxWords, choiceCount, multiSelectCap }`. Per-mode defaults proposed (refine at feature-design): teach=30w/10w/4/4, homework-quiz-exam=60w/25w/5/6, course-create-configure=50w/15w/5/6, study-skills=40w/12w/4/4. `@praxis/tools` `ask_student_question` handler reads active mode from `ToolContext`, validates against the resolved caps, returns descriptive errors that teach the constraint. System prompt fragment interpolates the per-mode caps + math-wrapping instruction (one fragment, two pieces of guidance — both delivered to the agent for whichever mode it's in). Mode prompt fragment composition pattern already exists.

3. **`feature-educational-content-typography`** — promote the proposed treatments in `.mockups/design-system/content-types.html` to `components.css`: callouts (`--theorem` / `--lemma` / `--hint` / `--warning`), citations (`.citation-chip` + `.passage`), definitions (`.definition` first-introduction + `.concept-ref` + `.glossary`), figures (`.figure` + caption/body/verdict), procedural step lists (`.procedure`), numerical (`.units` with small-caps unit + `.num` tabular figures), file paths (`.file-path`), code (`.code-inline` + `.code-block` with syntax-token tints). Wire the chat-text renderer to apply these treatments based on agent markup (markdown extensions for `> [!hint]` etc., or explicit class names the agent writes). Agent prompt fragment teaches when to use each register.

4. **`feature-refactor-shared-choice-indicators`** — `[refactor]`-tagged. Extract `.inline-question__indicator--radio` / `--check` to a more universal name (e.g. `.choice-indicator--radio` / `--check`) that BOTH `.inline-question__choice` AND `.assignment-item-card__options` compose against. Add `--multi-select` mode to `.assignment-item-card`. Production component rewrites in `packages/ui/src/components/{quiz,homework,exam}-tab-body.tsx` to use the shared primitives + the new selected-state visuals. Match resolved-state typography across surfaces (`.thread-chip` for chat-inline; `.assignment-item-card__answered-mark` for graded — different correctness semantics, same visual language).

## What stays out of scope

- **Visual density design for `feature-question-panel-rework`** (typographic differentiation between prompt/choice text, choice numbering for long sets, etc.) — section 2 of the absorbed `idea-inline-question-density-layout-and-schema-caps`. Folds into the question chassis design pass as additional Design decisions, NOT a child here. That work is the question chassis's responsibility; this epic provides the primitives it composes against.
- **The streaming hook itself** — owned by Phase 13's already-shipped chat-text-streaming work in `@praxis/ui`. This epic composes against the existing hook; doesn't rewrite it.
- **KaTeX integration foundation** — already shipped per `docs/SPEC.md` § "Math verification round-trip" (line 84). Child feature 1 composes against the existing integration, doesn't re-introduce KaTeX.

## Foundation references

- `docs/VISION.md` — editorial restraint (italic display serif paired with uppercase mono kicker; real typographic ornaments instead of icons; quiet intelligence beats loud engagement) — every content treatment in this epic respects that voice.
- `docs/SPEC.md` § "Math verification round-trip" — KaTeX is already in the production stack for math verification rendering. Child feature 1 extends this pipeline to general inline math, not just verification.
- `docs/ARCHITECTURE.md` § `@praxis/ui`, `@praxis/curriculum`, `@praxis/tools` — the three packages that child features touch. No new bounded contexts; no new package needed.
- `docs/UX.md` § "Streamed messages" + "Citations are first-class" + "Inline quick-check cards" — the surfaces and signals that this epic provides infrastructure for.

## Mockups

- `.mockups/design-system/content-types.html` — proposed treatments for every content type this epic covers (math, code, citations, passages, definitions, concepts, glossary, callouts, figures, diagrams, procedures, units, numerical). Each treatment is preview-only in the mock; child feature 3 promotes them to `components.css`. Banner at top confirms the math direction (LaTeX wrappers primary, bare-glyph auto-detect secondary, agent-instruction in mode prompt fragment).
- `.mockups/design-system/components.html` § Chat surface — existing components the new treatments will sit alongside. No changes here in this epic; the new content-type primitives append.
- `.mockups/design-system/streaming.html` — locked direction for chat-text streaming (medium pace × word chunks × gentle 480ms fade). Math renders post-settle per Strategic decisions; child feature 1 implements that interaction.

## Risks and open questions

- **`docs/SPEC.md` may need a per-mode-question-constraints addition** during feature 2's implementation — the spec currently describes question tools but not their length contracts. Roll-forward at feature-implementation time, not at scope.
- **Markdown extension for callouts** — the GitHub-style `> [!hint]` syntax is a popular convention; the agent already knows it. Feature 3 should decide between that, explicit class names the agent writes (`<div class="callout callout--hint">...`), or both. Trade-off: markdown is easier for the agent; explicit classes are more controllable.
- **KaTeX bundle size at narrow widths** — KaTeX is ~270KB. For mobile / sidebar tutor surfaces (future), worth measuring whether lazy-loading on first math expression is needed. Feature 1 can defer this until production tests.
- **Coordination with `feature-question-panel-rework`** — that feature's design pass will need feature 2's mode-aware caps locked in to finalize the question chassis. Recommend either: (a) `feature-question-panel-rework` design pass declares `depends_on: [feature-mode-aware-question-constraints]` at its own design time, OR (b) design in parallel with the per-mode defaults from this epic body treated as authoritative until feature 2 refines them. Decision falls out of the design family.

## Next

`/agile-workflow:epic-design epic-educational-content-rendering` decomposes the anticipated children into actual feature files at `stage: drafting` with declared `depends_on` chains. Each child feature then enters the design family per its tag.
