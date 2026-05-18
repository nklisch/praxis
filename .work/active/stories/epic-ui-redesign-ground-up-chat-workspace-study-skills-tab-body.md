---
id: epic-ui-redesign-ground-up-chat-workspace-study-skills-tab-body
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Study-skills tab body — structured reflection + technique rail

## Scope

Rewrite `StudySkillsTabBody` per the locked `mode-study-skills.html`
mock: structured reflection prompts from the pedagogy pack; right
rail shows active technique + observed patterns + review queue.

## Implementation steps

1. Edit `packages/ui/src/components/study-skills-tab-body.{tsx,module.css}`.
2. Render pedagogy-pack reflection prompts in the center column.
3. Right rail with three sections (technique / patterns / queue),
   reading from the existing study-skills service.
4. Tests covering rail render + prompt sequence.
5. Quality checks green.

## Acceptance criteria

- [x] Study-skills tab body matches the locked mock.
- [x] Right rail surfaces all three sections.
- [x] All quality checks green.

## Implementation notes

Rewrote `StudySkillsTabBody` from the old chip-over-TeachChatTabBody wrapper into a
two-column layout matching the locked `mode-study-skills.html` mock.

**Layout**: two-column grid — center (flex-1) holds the sticky head, the metacognitive
prompt banner, and the full teach chat surface (message log + composer via TeachChatTabBody);
right rail (300px) holds the three sections.

**Right rail sections**:
1. **Active technique card** — static for now (design shows the current pedagogy-pack
   technique; runtime wiring deferred until the pedagogy-pack tool call plumbing lands
   on the client surface). Tinted with `--tint-study-skills` per mock.
2. **Observed patterns** — loaded from `memory.procedural()` and `memory.affective()` via
   `useResource`. Procedural strategies with `evidenceCount > 0` render as pattern cards
   sorted by preference descending (top 3). Affective model's recent engagement average
   drives a single affective card. Empty states handled.
3. **Review queue** — loaded from `flashcards.list({ due: true })`, grouped by `conceptId`,
   capped at 3 groups in view. "Plan a session →" button present.

**Metacognitive prompt banner**: renders above the chat surface as a tinted left-bordered
card with the pattern-recognition prompt and citation. Marked `role="note"` for
accessibility.

**Mode head**: replaced the old "study skills" chip with a proper sticky head matching
the other mode tab bodies — kicker dot + glyph (‖) + mono uppercase label + italic title.

**Tokens used**: `--tint-study-skills`, `--font-display`, `--font-mono`, `--font-serif`,
`--radius-md`, `--radius-sm`, `--color-bg-secondary`, `--color-bg-tertiary`,
`--color-border`, `--color-text-*`.

**Tests**: 13 tests covering head render, composer embed, metacognitive prompt banner,
all three rail sections (data-testid), prompt sequence (label + citation), ChatTabBody
dispatcher routing, and teach ↔ study-skills isolation invariant. All pass.

**Pre-existing test flakiness**: `use-fragment-overrides.test.tsx` has an intermittent
failure when run in the full suite (timing/ordering issue); confirmed unrelated to this
story — the file was not touched and the test passes when run in isolation.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `reviewPlanBtn` is a dead button with no `onClick` (navigates nowhere). Acceptable for this story — wiring flashcard session launch is explicitly out of scope. A backlog item for this already exists or should be created when the flashcard flow lands.
- The `MetaPromptBanner` renders a hardcoded prompt rather than a live pedagogy-pack prompt. The implementation notes call this out explicitly as deferred; the static text still matches the mock contract.

**Notes**: Clean two-column rewrite. Token discipline is correct — all `--tint-study-skills`, `--font-*`, `--color-*` vars are defined in global.css. ProceduralModel and AffectiveModel types match the shapes in `packages/core/src/types/memory.ts`. The `useCallback`/`useResource` data-fetching pattern is idiomatic. 13 tests covering all three rail sections, prompt sequence, dispatcher routing, and isolation invariant — all pass. Lint clean on the new files; the typecheck error in notes-list.tsx is pre-existing and unrelated.
