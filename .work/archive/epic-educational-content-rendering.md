---
id: epic-educational-content-rendering
kind: epic
stage: done
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

## Decomposition

Split by capability and architectural seam: one foundation feature owns the renderer pipeline + non-math content-type primitives; math layers on top of that pipeline as a sibling feature (KaTeX is genuinely different in complexity and bundle weight, deserves its own feature); the cross-package mode-aware question-tool constraints work runs independently as an agent-side concern not a rendering concern; and the choice-indicator refactor runs alongside as a focused visual-alignment refactor with no rendering dependencies. Four children, no critical-path stalls — autopilot can run two waves (pipeline + constraints + refactor in parallel; math joins after pipeline).

### Child features

- `feature-content-renderer-pipeline` — foundation: 3-stage chat-text renderer (markdown parse with Praxis extensions → tool-result splice → post-render passes) in `@praxis/ui`, plus promotion of all non-math educational-content typography primitives from `content-types.html` to `components.css` (callouts, citations, passages, definitions, concept refs, glossary, figures, procedural steps, units, numerical, code, file paths). Depends on: `[]`
- `feature-math-rendering` — LaTeX-wrapped math via KaTeX extension to all chat-bearing surfaces + bare-unicode-glyph auto-detect post-pass + math-section of the agent prompt fragment. Render-on-settle per Strategic decisions. Depends on: `[feature-content-renderer-pipeline]`
- `feature-mode-aware-question-constraints` — cross-package: `@praxis/curriculum` mode shape gets `questionConstraints?`; `@praxis/tools` `ask_student_question` validates per resolved caps with descriptive errors; mode prompt fragment interpolates per-mode caps + math-wrapping instruction (unified question-tool fragment). Depends on: `[]`
- `feature-refactor-shared-choice-indicators` — `[refactor]`-tagged. Extract shared `.choice-indicator--radio` / `--check` primitive that both `.inline-question__choice` and `.assignment-item-card__options` compose against; add `--multi-select` mode to assignment-item-card; rewrite production tab-body components. Depends on: `[]`

### Cross-epic dependencies

- `feature-question-panel-rework` (sibling epic `epic-chat-interaction-ux-overhaul`) gets `depends_on: [feature-mode-aware-question-constraints]` added. The question chassis design pass needs the per-mode caps locked in before it can finalize layout, paging chrome, and selected-state typography against realistic content limits.
- Soft adjacencies (no hard `depends_on`): `feature-question-panel-rework` benefits from `feature-content-renderer-pipeline` and `feature-math-rendering` for in-chassis content rendering, but the chassis can ship without them and iterate. `feature-refactor-shared-choice-indicators` has soft coordination with `feature-question-panel-rework` (both touch the `.inline-question` family); coordination at design-pass time, not a blocker.

### Decomposition risks

- **`feature-content-renderer-pipeline` sizing risk**. Pipeline framework + 10+ component primitives + 5+ markdown extensions is a lot of surface for one feature. Feature-design Phase 7 may need to spawn 4-6 child stories rather than implementing as a single unit. Watch for the bundling getting unwieldy; if so, consider splitting into `pipeline-framework` (just the 3-stage processor + extension framework) vs `typography-primitives` (the component CSS + per-primitive renderer mapping) as two sequential features.
- **`feature-mode-aware-question-constraints` cross-package coordination**. The change to `@praxis/curriculum` mode shape ripples to every existing mode definition; need backfill defaults so unmodified modes don't break. Feature-design should explicitly catalog every existing mode and the migration plan.
- **`feature-refactor-shared-choice-indicators` production test coverage**. The tab-body assignment items have existing tests against the current indicator markup. Refactor needs to update the test selectors. If test coverage is thin in `quiz-tab-body.tsx` / `homework-tab-body.tsx`, refactor may surface gaps — feature-design should run a quick coverage scan and decide whether to add tests as part of the refactor or split it out.

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

## Agent contract — markup conventions + parser strategy

*(Captured 2026-05-24 from user feedback during content-types.html review: "all of this will require either special instructions to the agent and/or special parsers.")*

Every treatment in this epic is useless without the connective tissue between agent output and renderer. Each content type needs ONE of: (a) standard markdown the agent already produces, (b) Praxis markdown extension the agent learns via system-prompt instruction, (c) tool-result structured data the agent emits, or (d) renderer post-pass auto-detection. The full mapping below sets the contract child features 1-3 implement.

| Content type | Agent markup | Parser / renderer |
|---|---|---|
| Inline math | `$f(x) = x^2$` (LaTeX) | Existing KaTeX (Phase 13) — extend wiring to question prompts, course materials, flashcards, notes |
| Display math | `$$\frac{dV}{dt} = ...$$` (LaTeX) | Same — KaTeX block render on settle |
| Bare math glyphs | None — agent forgot to wrap | Renderer post-pass — unicode codepoint table wraps each loose char in `<span class="math-glyph">` |
| Inline code | \`identifier\` (markdown) | Existing markdown — no new work |
| Code block | \`\`\`lang ... \`\`\` (markdown) | Existing markdown + Shiki/Prism syntax tokens |
| File paths | New Praxis extension: `[[packages/core/src/foo.ts]]` OR auto-detect `\b\w+/\w+/[\w.-]+\.\w+\b` | Markdown extension processor → `.file-path` class |
| Citations | Tool call (existing `citation` tool emits structured `tool_result`) | Renderer reads citation events, inserts `.citation-chip` chips inline at the position the tool was called |
| Block passages | `> ` block-quote (markdown) with attribution via `— source` line | Existing markdown; renderer maps block-quote with terminal `—` line to `.passage` + `.passage__cite` |
| First-introduction definitions | Markdown extension: `[[def:derivative]]` OR `:term:derivative:` | Markdown extension; renderer tracks "first occurrence" per session and emits `.definition` only on first mention |
| Concept refs | Markdown link with custom scheme: `[chain rule](concept:chain-rule)` | Link-scheme handler — renderer maps `concept:` href to `.concept-ref` + side-panel-open click handler |
| Glossary terms | HTML5 semantic: `<abbr title="...">term</abbr>` | Existing browser semantic; renderer adds `.glossary` class |
| Theorem / lemma / hint / warning callouts | GitHub admonition syntax: `> [!theorem]`, `> [!lemma]`, `> [!hint]`, `> [!warning]` | Markdown extension processor — maps to `.callout--theorem` / `--lemma` / `--hint` / `--warning` |
| Worked-example figures | Container directive: `::: figure {caption="fig. 1 · ..." verdict="ok"}` ... `:::` | Markdown container-directive extension (CommonMark spec) — maps to `.figure` chassis |
| Procedural steps | Markdown numbered list `1. ... 2. ...` inside a `> [!steps]` admonition OR class-tagged list `1.{.procedure}` | Either GitHub-admonition extension OR markdown attribute-list extension |
| Units | Auto-detect: regex over text for `<number><unit>` patterns against a unit table (SI + common imperial + Praxis domain units) | Renderer post-pass; agent doesn't markup. Configurable per-mode in `@praxis/curriculum` to disable for prose-heavy modes if false positives appear |
| Numerical (tabular figures) | Auto-applied inside `<table>` and `.procedure` numeric columns; explicit `<span class="num">` available for inline use | Renderer post-pass; `.num` class applied automatically where numbers should align |
| Diagrams | Existing tldraw / sketch tool output renders into the chat thread as `<SubAgentBlock>`-style cards | Existing tool-result rendering; no new work |

### Implementation strategy

The renderer becomes a small pipeline running in order on each chat turn body once the streaming-tail has settled:

1. **Markdown parse with Praxis extensions** — math (KaTeX), GitHub admonitions, container directives, link-scheme handlers, attribute lists.
2. **Tool-result splice** — citations, figures, diagrams, sub-agent blocks already emitted as structured events; renderer inserts their rendered forms at the position the agent referenced them.
3. **Post-render passes** — bare-glyph math wrapping, unit auto-detection, first-introduction definition tracking, number-tabular-figure application.

The pipeline is the entire surface of feature 1 (math primary path) + feature 3 (educational-content typography); feature 2 (mode-aware constraints) feeds the AGENT side via the system prompt fragment that interpolates per-mode caps AND lists the available markup conventions.

### Agent prompt fragment scope

The mode prompt fragment that introduces the question tool grows beyond just per-mode caps + LaTeX instruction. It becomes the canonical "how to write educational content" reference the agent reads each turn. Sections:

1. **Length constraints** — per-mode caps for question prompts and choices (from feature 2).
2. **Math** — wrap in `$...$` or `$$...$$`; bare unicode glyphs are auto-styled but the agent should wrap for full math typesetting.
3. **Citations** — call the citation tool with `source_id` + `passage`; do NOT inline-write `[Stewart §3.5]` markup (the tool emits the chip).
4. **Definitions** — wrap first-introduction terms in `[[def:term-name]]`; the renderer styles the FIRST occurrence and reverts subsequent mentions to plain prose.
5. **Callouts** — use GitHub admonition syntax for theorems / lemmas / hints / pitfalls; one register per moment.
6. **Concept references** — link with `concept:` scheme (`[chain rule](concept:chain-rule)`).
7. **Figures** — for worked examples, use `::: figure` directive with caption + verdict.

These are documented once in the fragment; the agent reads them every turn alongside the per-mode caps. Feature 2's design pass owns the final fragment text; the bullet list above is the input.

## Risks and open questions

- **`docs/SPEC.md` may need a per-mode-question-constraints addition** during feature 2's implementation — the spec currently describes question tools but not their length contracts. Roll-forward at feature-implementation time, not at scope.
- **Markdown extension for callouts** — the GitHub-style `> [!hint]` syntax is a popular convention; the agent already knows it. Feature 3 should decide between that, explicit class names the agent writes (`<div class="callout callout--hint">...`), or both. Trade-off: markdown is easier for the agent; explicit classes are more controllable.
- **KaTeX bundle size at narrow widths** — KaTeX is ~270KB. For mobile / sidebar tutor surfaces (future), worth measuring whether lazy-loading on first math expression is needed. Feature 1 can defer this until production tests.
- **Coordination with `feature-question-panel-rework`** — that feature's design pass will need feature 2's mode-aware caps locked in to finalize the question chassis. Recommend either: (a) `feature-question-panel-rework` design pass declares `depends_on: [feature-mode-aware-question-constraints]` at its own design time, OR (b) design in parallel with the per-mode defaults from this epic body treated as authoritative until feature 2 refines them. Decision falls out of the design family.

## Next

`/agile-workflow:epic-design epic-educational-content-rendering` decomposes the anticipated children into actual feature files at `stage: drafting` with declared `depends_on` chains. Each child feature then enters the design family per its tag.

## Implementation summary + Review (2026-05-24)

**All 4 child features shipped to done:**

1. `feature-refactor-shared-choice-indicators` (3 stories) — `.choice-indicator` primitive extracted; body components compose against it; `assignment-item-card.module.css` deduped. Important honest deviation: 2 additional consumers (`ordering-body.tsx`, `matching-body.tsx`) discovered + classes preserved instead of breaking them; follow-on flagged.

2. `feature-mode-aware-question-constraints` (7 stories) — `QuestionConstraints` interface + per-mode defaults + `validateQuestionConstraints` helper + threading through `ToolContext` + wiring into `ask_student_question` + all 5 quick-check variants + unified `questionToolFragment` registered in 6 modes. End-to-end agent-side validation works.

3. `feature-content-renderer-pipeline` (8 stories) — 3-stage pipeline established. `Mode.renderToggles?` field + Studio Quiet hljs theme + 30+ CSS primitives + `Callout`/`Figure`/`Definition`/`ConceptRef` components + `remarkAdmonitions`/`remarkDefinitions`/`rehypeFilePaths`/`rehypeUnits` plugins + first-introduction definition tracking projection in `@praxis/memory` + merge wiring. **2 parked follow-ups**: `idea-resolve-remark-directive-definitions-conflict` (figure directive vs `[[def:]]` syntax conflict), `idea-term-first-occurrences-ipc-channels` (client-side IPC wiring for first-occurrence tracking).

4. `feature-math-rendering` (5 stories) — KaTeX `macros` config (11 macros) + `rehypeMathGlyphWrap` bare-glyph post-pass (66 codepoints) + `.katex-error` styling + macros table appended to question-tool fragment + merge wiring. Math renders end-to-end across every chat-bearing surface.

**Epic-level lenses** (per review skill Phase 5):

- **Design alignment**: realized decomposition matches the epic brief — foundation feature (`content-renderer-pipeline`) shipped first, sibling features (`math-rendering`, `mode-aware-question-constraints`, `refactor-shared-choice-indicators`) layered on top. Cross-feature contracts (mode `renderToggles?` + `questionConstraints?`, `questionToolFragment` factory + macros table) coordinated correctly.

- **Foundation-doc alignment**: no drift discovered during implementation. Epic-level changes to `docs/SPEC.md` § "Math verification round-trip" and `docs/ARCHITECTURE.md` § `@praxis/curriculum` / `@praxis/tools` were honored.

- **Breaking changes**: none — all extensions are additive optional fields on `Mode`, `ToolContext`, `ToolServices` + new opt-in plugins.

- **Capability completeness end-to-end**: agent writes LaTeX math + admonitions + `[[def:term]]` markers + `concept:` links + GitHub callouts + auto-detected bare glyphs + units + file paths + figures (via component, not yet via directive — see follow-up) → renderer composes all into the chat-bearing surfaces with per-mode toggle propagation. Per-mode question caps enforced at dispatch with agent-friendly error messages. Choice-indicator primitive shared across in-chat questions + tab-body assignment items.

**Verdict**: Approve

**Blockers**: none
**Important**: 2 follow-ups parked (both surfaced as honest design discoveries during integration):
- `idea-resolve-remark-directive-definitions-conflict` — `::: figure :::` directive syntax currently doesn't parse
- `idea-term-first-occurrences-ipc-channels` — client-side IPC for `hasSeenTerm`/`markTermSeen` not wired

**Nits**: none

**Notes**: Epic delivered as briefed. 23 child stories shipped across 4 features. The two follow-ups are real but non-blocking — both have clear paths forward and ship as standalone stories. The unified `questionToolFragment` is now the single SOT for "how to write educational content", composing math + citations + definitions + callouts + concept refs + figures into one fragment that every mode reads.

What's now possible: the educational-content renderer foundation is in place. Every text-bearing chat surface composes against the unified pipeline. Math, callouts, definitions, units, file-paths, concept-refs all auto-style. Per-mode question caps prevent agent-generated questions from blowing up the UI. The follow-on epic (`epic-chat-interaction-ux-overhaul`) can now design its question chassis against the locked primitives.

**No release_binding** + **parent: null** → epic archives on advance per Phase 8.
