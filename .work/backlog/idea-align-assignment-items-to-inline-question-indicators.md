---
id: idea-align-assignment-items-to-inline-question-indicators
created: 2026-05-24
tags: [ui, design-system, refactor]
---

`.assignment-item-card` (the quiz / homework / exam item card rendered in the per-mode tab bodies, defined in `.mockups/design-system/components.css` and used in `packages/ui/src/components/{quiz,homework,exam}-tab-body.tsx`) currently has its own choice-rendering treatment that doesn't share visual language with the new `.inline-question` chassis introduced for the chat-UX overhaul (`feature-question-panel-rework`, 2026-05-24).

Inline questions now use `.inline-question__indicator--radio` (open circle, fills with accent dot when selected) for single-select and `.inline-question__indicator--check` (square, fills with accent ✓ when selected) for multi-select — same chassis, two indicator modifiers, distinguished by an optional `select all that apply` `.badge.badge--info` in the kicker.

Assignment items should adopt the same indicator primitives so a student moving between an in-chat quick-check (one question, inline) and a graded assignment tab (N questions, full tab body) feels the same affordance language. The "is this single or multi" mental model becomes universal across surfaces.

## What changes
- **Extract or share indicators**. Either lift `.inline-question__indicator--radio` / `--check` to a more generic name (e.g., `.choice-indicator--radio` / `--check`) that both `.inline-question__choice` and `.assignment-item-card__choice` compose against, OR have `.assignment-item-card` use the inline-question indicators directly. The renamed/extracted version is more honest about the shared concept.
- **Add `--multi-select` support to assignment-item-card**. Today the existing assignment-item-card pattern likely assumes single-select. Multi-select assignment items (quiz with "select all that apply" questions) need the same checkbox indicator and the same `select all that apply` kicker badge.
- **Match the selected-state visual** — accent-muted background, accent-colored indicator border, accent fill (dot or ✓). Currently these may differ.
- **Carry the resolved-state alignment too**. Inline question resolves to a `.thread-chip` summary; the assignment item resolves via `.assignment-item-card__answered-mark` (correct/incorrect glyphs). Different shapes are correct (chat conversation vs graded assignment), but they should share the same answered-state typography and the same "you chose X" verb pattern.

## What stays distinct
- **The card chassis itself.** `.inline-question` is a one-off mid-conversation card; `.assignment-item-card` is a list-of-items pattern with shared item numbering, type pill, concept tag. Different containers, same choice primitives.
- **Correctness feedback.** Assignment items carry `correctIndex`/`correctIndices` and render correct/incorrect after submit; inline structured questions don't (they're disambiguation, not assessment). The answered-mark stays assignment-specific.

## Why now
The chat-UX overhaul's question rework ships first. If assignment items don't adopt the same indicator language soon, students experience visual fragmentation — radio circles in chat quick-checks, something different in the homework tab. The pattern should land while the inline-question implementation is fresh, ideally as a sibling refactor in the same release.

## Scoping path
This is `[refactor]` — behavior-preserving, visual-alignment work. When promoted, route to `/agile-workflow:refactor-design`. Likely a single feature with 2-3 stories:
1. Extract / rename indicator primitives
2. Update `.assignment-item-card` markup + add `--multi-select` mode
3. Production component rewrite (`quiz-tab-body.tsx`, etc) to compose against the shared primitives

## Source
User feedback during 2026-05-24 components review of the chat-UX mockup pass: "we should align this in style to the questions you had before — radio circles for single choice, box checks for multi — mark in story/feature/backlog where appropriate to align quiz / exam items to this".
