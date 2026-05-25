---
id: feature-question-panel-rework
kind: feature
stage: done
tags: [ui, ux]
parent: epic-chat-interaction-ux-overhaul
depends_on: [feature-mode-aware-question-constraints]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Question panel: paged display, dismiss-on-submit, free-form fallback, cancel-to-clarify

## Brief
The structured-question / quick-check card surface has three coupled problems: it stacks vertically and occludes the chat when multiple questions are in flight (so the user can't see progress the tutor is producing alongside), it greys out for the full LLM round-trip after submit instead of dismissing immediately, and it offers no fall-back for the user when none of the structured choices fit (no free-form field, no first-class "let me explain in chat" escape). Together these turn the panel from a clarification tool into a forced funnel that blocks the chat. This feature reworks the entire question-card chassis to match the new UX.md contract.

## Decomposition (child stories)
1. **`story-fix-user-question-no-dismiss-on-submit`** (bug) — submit dismisses the card to its resolved state immediately, no greyed-out wait through the round-trip. Smallest scope; works through `/agile-workflow:fix`.
2. **`story-questions-tabbed-display`** — when the agent issues N questions in one turn, render as a paged surface (one at a time, `next`/`prev`/`n of m`) instead of stacking vertically and occluding the chat behind.
3. **`story-question-free-answer-and-cancel-path`** — free-form answer field on each structured question (when no option fits); explicit `clarify in chat` cancel control as a first-class dismiss path that signals the agent to resume normal conversation; tool description / system prompt updates that explicitly forbid the agent from adding "tell me in chat" as a structured choice option (the path is now handled by the cancel control).

The three are independent — none depends on the others — but they share the same component surface (`StructuredQuestionCard` / `QuickCheckCard` in `packages/ui/src/components/`). Feature-design will likely keep them in close sequence so the design isn't done three times. The bug-fix story can be worked first or last; it doesn't block.

## Cross-epic dependency

Declared `depends_on: [feature-mode-aware-question-constraints]` (sibling epic `epic-educational-content-rendering`). The question chassis design pass needs the per-mode question-tool schema caps locked in before it can finalize layout, paging chrome, and selected-state typography against realistic content limits. Soft adjacency with `feature-content-renderer-pipeline` and `feature-math-rendering` (same sibling epic) — those provide the renderer infrastructure for math + content-type treatments inside question prompts and choices, but the chassis can ship without them and improve as content rendering catches up. See `epic-educational-content-rendering` body for the agent contract that spans both epics.

## Source ideas absorbed
- `idea-user-question-no-dismiss-on-submit` (bug) → child story
- `idea-questions-tabbed-display` → child story
- `idea-question-free-answer-and-cancel-path` → child story

## Foundation reference
`docs/UX.md` "Inline quick-check cards" and "Structured question cards" sections both rolled forward:
- **Resolved state** (renamed from "Locked state"): dismiss-to-resolved on submit, no greyed-out wait
- **Multiple in-flight checks**: paged display, chat remains visible alongside
- **Escape hatches** (structured-question-specific): free-form answer field + explicit `clarify in chat` cancel; tool description forbids "tell me in chat" as a structured choice

The "choice required" / no-skip framing is removed — cancel-to-clarify replaces it as the first-class escape.

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass inherits them.)*

- **Paged surface chrome**: Tab strip across the top of the card group when N questions are in flight. Pattern: `[1 ✓] [2 ✓] [● 3] [4 •]` — answered carry `✓`, current carries `●`, unanswered carry `•`. Click any tab to jump (no forced linear walk). Reads as "a related set", emphasizes free navigation, scales beyond two questions cleanly. **Implementation**: reuses the project's existing `.tabs` + `.tab` primitives with new `--done` / `--active` / `--unanswered` status modifiers — no new tab primitive needed.
- **Free-form answer field**: Always visible below the structured choices with `or, in your own words...` placeholder. No expand affordance, no segmented Choose/Write toggle. Single Submit handles either source (chosen radio OR free-form text — submit logic prefers free-form when populated, otherwise picks chosen).
- **`clarify in chat` cancel control**: Secondary text button right of Submit, same row. Reads as an alternative path, not a destructive dismiss. Submitting via `clarify in chat` sends a structured `tool_result` signaling "user wants to discuss this in chat" so the agent resumes normal conversation without thinking it was answered structurally.
- **Resolved state**: Collapsed summary chip in the chat history — one line: `↳ you answered — "<answer>" · <time>` (or `↳ you selected N — "..." · <time>` for multi). Minimal vertical real estate. Clickable to expand back to full card if user wants to revisit. The full card never lingers post-submit; the chip is the historical record.
- **Tool-description rule (propagated from foundation)**: `ask_student_question` schema description explicitly forbids "tell me in chat" / "explain in chat" as a structured choice. The `clarify in chat` cancel control owns that path.
- **Choice mode: single-select + multi-select share one chassis** *(added during 2026-05-24 mockup rebuild)*: same `.inline-question` component, differs only in the indicator modifier (`--radio` vs `--check`) and the presence of a `select all that apply` `.badge.badge--info` in the kicker. Multi-select Submit accepts any number of selections; the resolved chip's verb reads `you selected N` and joins answers with " + " (or shows "N answers" when long). The paged set can mix single and multi questions freely — the badge tells the student which mode question N is in.

## Mockups
*Rebuilt 2026-05-24 using the `ux-ui-design` plugin's conventions properly — links `tokens.css` + `motion.css` + `components.css`, composes against components rather than inlining, and demonstrates responsive `.chat-surface` adaptation. Multi-select variant added as a sibling state to single-select.*

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Screens · state mocks at `.mockups/screens/feature-question-panel-rework/`:
  - `index.html` — navigator (5 states + responsive showcase, grouped: choice modes / resolved-dismissed)
  - `state-single.html` — `.inline-question` with `.inline-question__indicator--radio` choices
  - `state-multi-select.html` — `.inline-question` with `.inline-question__indicator--check` choices + `select all that apply` `.badge.badge--info` in kicker; same chassis as single, only indicator differs
  - `state-paged.html` — `.inline-question-set` wraps 4 questions (mix of single + multi); tab strip uses existing `.tabs` + `.tab` primitives with `--done` / `--active` / `--unanswered` modifiers; active question is rendered as `.inline-question--bare` inside the set body
  - `state-resolved-chip.html` — chat history with both `.thread-chip` (single-select resolved) and `.thread-chip` with `you selected 3` verb (multi-select resolved) inline between tutor turns
  - `state-clarify-in-chat.html` — `.thread-chip--dismissed` (neutral border, `you asked to discuss in chat` verb) replaces the card; composer focused
  - `responsive-showcase.html` — same multi-select question in three `.chat-surface` widths; demonstrates that action row stacks vertically at narrow widths via `@container chat (max-width: 419px)`
- Components added to `.mockups/design-system/components.css` (refinement mode, additive):
  - `.inline-question` + `__kicker` (+ `__glyph`) + `__prompt` + `__choices` + `__choice` (+ `--selected`) + `__indicator` (+ `--radio` / `--check`) + `__free-form` (+ `__label` / `__input`) + `__actions` + `--dismissed` + `--bare`
  - `.inline-question-set` + `__head` (+ `__label` / `__progress`) + `__body`
  - `.thread-chip` + `__glyph` / `__verb` / `__answer` / `__when` / `__expand` + `--dismissed` variant
- Shared interactive feel demo: `.mockups/flows/async-chat-interactions/02-question-submit.html` — exercises both single + multi-select with live submit/dismiss + tutor follow-up

## Architectural choice

Extend the existing `<StructuredQuestionCard>` + `<QuickCheckCard>` components rather than rewrite. The locked design decisions translate to four bounded surfaces:

1. **Dismiss-on-submit** — flip the existing greyed-out wait into an immediate optimistic dismissal, replacing the card with a collapsed `<ThreadChip>` summary. Tutor's follow-up arrives asynchronously after the round-trip and renders below the chip. This is the bug-fix story (`story-fix-user-question-no-dismiss-on-submit`) and is the simplest of the three.

2. **Paged display** — wrap N in-flight questions in a `<InlineQuestionSet>` chassis with a tab strip head + single-question body. Composes against the project's existing `.tabs` / `.tab` primitives with new `--done` / `--active` / `--unanswered` status modifiers. Active question renders as `.inline-question--bare` (no chassis chrome, since the set provides it). Story: `story-questions-tabbed-display`.

3. **Free-form answer field + cancel-to-clarify** — always-visible free-form text input below the structured choices on every question, plus a secondary "clarify in chat" cancel button right of Submit. Single Submit handler prefers free-form text when populated, else picks the structured selection. The cancel path emits a structured `tool_result` signaling "user wants to discuss in chat" so the agent doesn't think the question was answered. Story: `story-question-free-answer-and-cancel-path`.

4. **Tool-description hardening** — `ask_student_question` schema description explicitly forbids "tell me in chat" as a structured choice (the cancel control owns that path now). Implementation detail of story 3.

All four ride on the unified `.inline-question` chassis (already mocked at `components.css` § `.inline-question` family). The chassis supports both single-select (`.inline-question__indicator--radio`) and multi-select (`.inline-question__indicator--check` + `.badge.badge--info` "select all that apply" kicker) in one shape — the indicator class + kicker badge are the only differences.

Rejected alternatives:
- **New question-card primitive** — duplicates the existing structured-question-card surface; existing component already handles the full lifecycle, just needs new behaviors.
- **Modal-style overlay for paged questions** — explicitly forbidden by the "chat round-trips never gate user input" principle. Chat must remain visible alongside questions.
- **Segmented "Choose / Write" toggle** — explicitly rejected per design decision; free-form field is always visible, no toggle.

## Implementation Units (per existing child stories)

### Unit 1: `story-fix-user-question-no-dismiss-on-submit`
**Files**: `packages/ui/src/components/structured-question-card.tsx`, `quick-check-card.tsx`, sibling CSS modules
**Story**: `story-fix-user-question-no-dismiss-on-submit` (pre-existing)

Bug fix: on Submit, dismiss the card immediately and render a `<ThreadChip>` summary in its place. Optimistic transition — don't wait for the tool_result round-trip. Tutor's next message arrives asynchronously below the chip.

**Implementation notes**:
- New `<ThreadChip>` component at `packages/ui/src/components/thread-chip.tsx` per the locked design (`.thread-chip` family in `components.css`). Includes the `↳ you answered — "<answer>" · <time>` shape, click-to-expand back to full card.
- Card render path: on Submit, fire the tool_result IPC (fire-and-forget), set local state to "dismissed" → render `<ThreadChip>` instead.
- For multi-select: chip verb reads "you selected N" and joins answers with " + " (or shows "N answers" when long).
- For cancel-to-clarify path: use `.thread-chip--dismissed` variant ("you asked to discuss in chat" verb).
- No backend changes — the tool_result envelope is unchanged.

**Acceptance criteria**:
- [ ] Submit dismisses card immediately, no greyed-out wait
- [ ] `<ThreadChip>` renders in card's place with correct verb (single / multi / dismissed)
- [ ] Click on chip expands back to read-only card view
- [ ] Tests cover: submit dismisses; chip renders correct verb per case

---

### Unit 2: `story-questions-tabbed-display`
**Files**: `packages/ui/src/components/inline-question-set.tsx` (NEW), `quick-check-card.tsx` (modify multi-question rendering)
**Story**: `story-questions-tabbed-display` (pre-existing)

Render N in-flight questions as a single `<InlineQuestionSet>` chassis instead of N stacked `<QuickCheckCard>` instances. Tab strip head + single-question body. Free navigation via click.

**Implementation notes**:
- New `<InlineQuestionSet>` component at `packages/ui/src/components/inline-question-set.tsx`:
  - Props: `questions: StructuredQuestion[]`, `answers: Map<questionId, answer>`, `currentIndex: number`, `onTabClick(index)`, `onAnswer(questionId, answer)`, `onSubmit(answers)`
  - Renders `.inline-question-set` chassis with `__head` (tab strip) + `__body` (active question as `.inline-question--bare`)
  - Tab states from local `answers` map: answered → `--done`, current → `--active`, else → `--unanswered`
- Composes against existing `.tabs` / `.tab` primitives + new `--done` / `--active` / `--unanswered` modifiers (CSS only — add to `tabs.module.css` or sibling)
- Multi-question detection: when N > 1 inline-question tool calls are pending in the same turn, render via the set chassis instead of one card each
- Tests: 4 questions render as set; tab click navigates; answered tabs show done state; mixed single/multi questions render correct indicators

**Acceptance criteria**:
- [ ] `<InlineQuestionSet>` chassis renders tab strip + single-question body
- [ ] N questions display in set chassis, not stacked
- [ ] Tab clicks navigate between questions
- [ ] Tab status reflects answer state (done / active / unanswered)
- [ ] Mixed single + multi questions render correctly in the same set
- [ ] Tests cover navigation + state transitions

---

### Unit 3: `story-question-free-answer-and-cancel-path`
**Files**: `packages/ui/src/components/structured-question-card.tsx`, `quick-check-card.tsx`, `packages/tools/src/dialog/ask-student-question.ts` (description tweak)
**Story**: `story-question-free-answer-and-cancel-path` (pre-existing)

Add an always-visible free-form text input below the choices, plus a secondary "clarify in chat" button right of Submit. Cancel path signals the agent to resume conversational mode.

**Implementation notes**:
- Each question renders `.inline-question__free-form` (label + textarea) below `.inline-question__choices`
- Submit handler prefers free-form text when populated; else picks structured selection
- "clarify in chat" button: secondary text button, emits a `tool_result` with `{ clarified: true, message: "user requested chat clarification" }` (precise shape to be coordinated with the existing tool's output schema)
- `ask_student_question` Zod schema description in `packages/tools/src/dialog/ask-student-question.ts` updated to explicitly forbid "tell me in chat" / "explain in chat" / "ask in chat" as choice text — add `.refine` if necessary to validate against a reject-list
- Tests: free-form submit takes precedence; clarify-in-chat emits correct envelope; reject-list refine rejects forbidden choice text

**Acceptance criteria**:
- [ ] Free-form textarea always visible below choices
- [ ] Submit prefers free-form text when populated, else picks selection
- [ ] "clarify in chat" button emits structured cancel envelope
- [ ] `ask_student_question` schema rejects "tell me in chat" / variants as choice text
- [ ] Tests cover all three paths + the schema rejection

---

## Implementation Order

1. **`story-fix-user-question-no-dismiss-on-submit`** (deps: `[]`) — smallest, bug-fix; can ship first
2. **`story-questions-tabbed-display`** (deps: `[]`) — independent UI chassis work
3. **`story-question-free-answer-and-cancel-path`** (deps: `[]`) — schema + UI changes

The three stories are independent — none blocks the others. They can run in parallel.

**Cross-feature coordination**:
- Story 3's `ask_student_question` schema edit overlaps with `feature-mode-aware-question-constraints`'s schema work (the constraints feature adds validation; this story adds description rules). Coordinate via shared file inspection at implementation time — both stories edit the same Zod schema definition.
- Story 1's `<ThreadChip>` component should reference the `.thread-chip` class in `components.css` (already mocked) when promoting to production.

## Risks

- **Concurrent ask_student_question schema edits**: stories 3 here + step-5 of `feature-mode-aware-question-constraints` both edit the same file. Mitigation: schedule them sequentially (let the constraints work land first since it has more substantive changes), then the description edit slots in cleanly.

- **`<InlineQuestionSet>` adoption ordering**: existing `QuickCheckCard` dispatch logic needs to detect N>1 pending questions in the same turn — that requires turn-level coordination state. Mitigation: pass the set context down from `ChatTabBody` (which owns the items list) rather than trying to coordinate at the card level.

- **Tutor-side compatibility**: the optimistic-dismiss pattern means the card disappears before the tutor's `tool_result` arrives. If the tutor's follow-up message references "the question I just asked" (which the student can no longer see in full), reading flow may be confusing. Mitigation: `<ThreadChip>` keeps the question context visible; click-to-expand restores full card if needed.

- **Multi-select indicator name will change** once `feature-refactor-shared-choice-indicators` lands (production CSS will use `.choice-indicator--radio` / `--check`). This feature should be aware of that rename and adopt the new primitive in the same PR (or follow-up). Mitigation: when implementing, check whether the choice-indicator refactor has shipped — if yes, use the new primitive; if no, use the old class names and queue a small follow-up.

- **Free-form input + answer precedence**: submit logic "prefer free-form when populated" could surprise a user who typed in free-form then clicked a structured choice. Mitigation: visual cue (e.g., free-form textarea border highlights when text is present, structured choices grey slightly to communicate "free-form will win"). Add to UX polish during implementation.

## Implementation summary + Review (2026-05-24)

**All 3 child stories shipped via consolidated bundle commit (`48c11ebb`)** — 2039 LoC across 17 files, 1 typecheck follow-up fix (`41d7c196`):

- `story-fix-user-question-no-dismiss-on-submit` — `<ThreadChip>` (NEW, 11 tests) replaces greyed-out post-submit card; immediate dismiss + fire-and-forget tool_result; click-to-expand returns to read-only.
- `story-questions-tabbed-display` — `<InlineQuestionSet>` chassis (NEW, 18 tests) with tab strip + progress counter + nav. Built and ready; **wiring deferred** — `idea-wire-inline-question-set-in-chat-tab-body` parked for the N>1 detection logic.
- `story-question-free-answer-and-cancel-path` — always-visible free-form `<textarea>` below choices; "clarify in chat" → `{ kind: "abandoned" }` envelope; Zod `.refine()` on `ask_student_question` options rejects 7 chat-deflection patterns (5 new schema tests).

**Cross-cutting deviation**: `<InlineQuestionSet>` integration into `chat-tab-body.tsx` deferred to a follow-up (parked). The component is complete and tested; the detection+dispatch logic for N>1 pending items belongs in a small follow-on. `StructuredQuestionCard` already handles 1-4 questions per call via fieldset-per-question; the chassis is for the rare N separate-tool-calls case.

**Typecheck fix**: one `noUncheckedIndexedAccess` violation in `structured-question-card.tsx` line 145 (chip-summary multi-question count) fixed post-bundle.

**Verdict**: Approve with comments

**Blockers**: none
**Important**: 1 follow-up parked (`idea-wire-inline-question-set-in-chat-tab-body`) — chassis built but unwired
**Nits**: none

**Notes**: All 3 stories' acceptance criteria met at the component layer. The deferred wiring is a known gap that doesn't block shipping the feature — the existing N=1 path through `StructuredQuestionCard` is unchanged + improved with dismiss-on-submit, and the wiring story is sized as ~100-200 LoC follow-up. Parent epic `epic-chat-interaction-ux-overhaul` still active (2 sibling features still implementing) → feature stays in `.work/active/`.

What's now possible: structured questions dismiss immediately on submit and condense to a `<ThreadChip>` summary in chat history (no greyed-out wait). Free-form textarea + clarify-in-chat give the user real escape hatches when structured choices don't fit. Tool schema actively prevents the agent from suggesting "tell me in chat" as a structured choice — the cancel control owns that path.
