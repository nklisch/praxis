---
id: epic-ui-redesign-ground-up-chat-workspace
kind: feature
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on:
  - epic-ui-redesign-ground-up-design-system
  - epic-ui-redesign-ground-up-app-shell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Chat Workspace — Tabs, Messages, Mode Bodies, Side Panels

## Brief

Redesign the central student-facing session surface: the tab system, the
message bubbles, tool-call and sub-agent rendering, the per-mode tab
bodies (Teach / Quiz / Homework / Exam / Bootstrap / StudySkills / Document),
the item-body family (single-choice, multi-select, math, code,
free-response, etc.), the side panels (document list, concept side panel,
sidekick), and the in-session modals.

Current surface lives in `packages/ui/src/routes/chat.tsx`,
`packages/ui/src/components/chat-tab-body.tsx`, `tab-strip.tsx`,
`message.tsx`, the `item-bodies/` directory, the various
`*-tab-body.tsx` files for each mode, and the resizable side panels. The
`tab-body-isolation` pattern (all tab bodies mounted, inactive use
`display:none`) is an input to question — if the new direction unmounts
inactive tabs and accepts the recompute cost, that's a deliberate
re-architecture. The same goes for sub-agent block rendering, sticky
mode headers, and the composer surface.

This feature also owns the **mode-switching flow** (how the student moves
between teach / quiz / homework / exam in a session arc) and the
**assignment-spawn flow** (parent teach session → child assignment tab
appears via `useAssignmentIssuedSpawn` → submission → parent receives
`system_note`). Those flows live inside the chat workspace surface, so the
design pass treats them as in-feature journeys.

What lands:

- `.mockups/screens/epic-ui-redesign-ground-up-chat-workspace/` — option
  set for the session surface (chat + tabs + side panels) and per-mode
  body variants
- `.mockups/flows/mode-switch/` — multi-step walk for mode transitions
- `.mockups/flows/assignment-spawn/` — multi-step walk for parent → child
  assignment handoff

## Epic context

- Parent epic: `epic-ui-redesign-ground-up`
- Position in epic: **primary surface feature** — depends on design-system
  and app-shell; can parallelize with discovery / workspace / configure
  features.

## Foundation references

- `docs/UX.md` § "Tutor workspace (tabs)" — tab body shape per mode
- `docs/UX.md` § "Editorial language" — mode tints and glyphs
- `docs/VISION.md` § "Sessions are named arcs, not infinite chat" — session
  posture, parallel tabs principle
- `docs/ARCHITECTURE.md` § "UI architecture" / "Session data flow" — chat
  + selected tool I/O, sub-agent surfacing via `SubAgentRegistry`
- Pattern `tab-body-isolation` (`.claude/skills/patterns/tab-body-isolation.md`)
- Pattern `resizable-side-panel-hook`
- Pattern `session-tab-open-flow`
- Pattern `modal-primitive`

## Mockups

- Screens: `.mockups/screens/epic-ui-redesign-ground-up-chat-workspace/index.html`
- **Selected: Option 4 — Refined Bubbles** (2026-05-17)
  - Three-column layout: documents (left, 240px) · session (center,
    flexible) · concepts + sidekick (right, 280px)
  - Familiar bubble shape kept but **outlines dropped** — tutor turns
    on `--color-bg-secondary` tint, student turns right-aligned on
    `--color-bg-tertiary` tint, no borders
  - Tool calls render as one-line `<details>` disclosures with verdict
    glyph + tool name + result preview; expand to show full I/O
  - Sub-agent blocks render inline beneath the originating turn as
    italic marginalia with mono kicker (`sub-agent · grader · 800ms`)
  - Sticky session-head carries kicker + title + progress bar
  - Composer at the bottom of the center column — italic-text serif,
    accent button, mono hints below
- Considered: Continuous Document (no bubbles, lecture-style),
  Bilateral Columns (tutor-left / student-right), Margin Annotations
  (tutor main / student marginalia + floating composer) — available
  in `.mockups/screens/.../option-{1,2,3}.html`

The mode-switch and assignment-spawn flows will spawn as child stories
during implementation; the Refined Bubbles base sets the surface
language for both flows.

### Per-mode tab bodies (all 6 mocked)

The `ChatTabBody` dispatches by `session.modeId` to a per-mode body.
All six are now mocked alongside the locked Teach surface (Option 4):
index at
`.mockups/screens/epic-ui-redesign-ground-up-chat-workspace/mode-bodies-index.html`.

- **§ Teach** — Refined Bubbles (Option 4 above). Chat surface with
  side panels.
- **‡ Quiz** (`mode-quiz.html`) — item-typed cards (math-expression,
  single-choice, etc.); **no tutor scaffolding mid-quiz**; confidence
  band per item (formative signal for indexers); item-status rail.
- **❦ Homework** (`mode-homework.html`) — paginated multi-item batch;
  per-item save state with skip / flag; agent answers item-meaning
  questions but never solutions; work-area with typed / show-work /
  sketch tabs; final submit gates the whole set; feedback delayed
  until submission.
- **† Exam** (`mode-exam.html`) — proctored. Chrome reduced (other
  nav dimmed); exam-mode strip + timer in header; pre-committed
  rubric visible per free-response (per-criterion + weighted sum);
  strict tool subset (clarification tool only); auto-submit at time.
- **‖ Study skills** (`mode-study-skills.html`) — structured
  reflection (not improvised chat); pedagogy-pack metacognitive
  prompts with citations; right rail shows active technique + observed
  patterns + review queue.
- **† Document** (`mode-document.html`) — read-mostly viewer. Cited
  passages highlighted; floating selection-bar on selection
  (note · ask · cite · flashcard); scope-aware "ask Praxis" affordance.
- **¶ Course-create** (`mode-course-create.html`) — the **in-session**
  view. Same shape as configure mode (Canvas + Side Chat) because the
  configure-mode parent agent + tool-calling pattern is identical;
  only the artifact differs. Chat is just the parent-agent chat; tool
  calls execute immediately, with `↶ revert` as the undo affordance
  (restore from pre-call snapshot). Explorer is a sub-agent the parent
  invokes via `course.start_exploration` — renders inline in the chat
  as a `<SubAgentBlock>` with live step events. **Replaces what was
  formerly called "Bootstrap" mode** — see backend rename below.

### Naming rename (UI surfaces)

UI mocks no longer use `bootstrap` or `explorer`:

- "Bootstrap" → **"Create a course"** (action) / "Course create"
  (session label). The mode id stays internally but the UI never says it.
- Named "explorer" agent → **dropped**. Praxis is framed as the
  drafter / tutor / coach as appropriate; no personified internal
  agent name surfaces.

Backend rename (mode id, agent class, tool name, prompt files) parked
at `.work/backlog/idea-rename-bootstrap-and-explorer.md`. Until the
backend rename lands, mode tints stay as `--tint-bootstrap` etc. in
`tokens.css`.

### Flows landing here

- **session-loop** (`.mockups/flows/session-loop/`) — Workbench →
  resume → mid-session → tab switching (state held) → session end.
  Demonstrates `tab-body-isolation` and the open-tabs strip behavior
  across daily use.
- **chat-to-workspace-note** (`.mockups/flows/chat-to-workspace-note/`)
  — mid-session insight capture; format-picker popover from composer
  rail → inline Cornell panel (right side) → saved while chat keeps
  running. Cross-feature integration into `workspace`.
- **assignment-spawn** (`.mockups/flows/assignment-spawn/`) — teach
  issues a quick check → child quiz tab spawns with "from L3" pill →
  student takes it → system_note returns to parent → tutor responds
  grounded in the result. Demonstrates parent/child session linkage
  visible across the open-tabs strip.

## Design decisions

- **Many parallel stories.** Each tab body, the chat-shell, tool-call,
  sub-agent renderer, and the two flows are independent visual
  contracts; spawning one story each maximizes parallel fan-out.
- **Course-create tab body delegated to backend-fills epic** —
  `epic-backend-fills-for-redesign-drafter-configurator-chat-course-create-tab-body`
  owns the Canvas + Side Chat rebuild for course-create. This feature
  doesn't duplicate.
- **Tool-call entry renderer delegated** to
  `epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry`
  for the configure / course-create surfaces. Teach mode reuses the
  same primitive (it's mode-agnostic).
- **Mode-switch flow** is light implementation; folds into the chat
  shell rebuild story.
- **Assignment-spawn flow** parent-child tab UX is delegated to
  `epic-backend-fills-for-redesign-cross-tab-state-parent-child-and-system-note`.

## Implementation Units (one story each)

1. **`-chat-shell-refined-bubbles`** — Convert `ChatTabBody` to
   Refined Bubbles shape: drop bubble outlines, tint backgrounds,
   keep tab-body-isolation. Restyle `Message` accordingly. Sticky
   session-head with kicker + title + progress bar.
2. **`-quiz-tab-body`** — Rewrite `QuizTabBody` to item-typed card
   layout (no tutor mid-quiz; confidence band per item; item-status
   rail). Note: confidence band lands via
   `ui-completion-bundle-quiz-confidence`; this story is the surface
   restyle.
3. **`-homework-tab-body`** — Rewrite `HomeworkTabBody` to paginated
   multi-item batch with save/skip/flag; agent answers clarifications
   only.
4. **`-exam-tab-body`** — Rewrite `ExamTabBody` to proctored chrome
   (dimmed nav, exam strip, timer); timer + auto-submit added by
   `ui-completion-bundle-exam-timer` sibling story.
5. **`-study-skills-tab-body`** — Rewrite `StudySkillsTabBody` for
   structured reflection with right-rail technique + observed
   patterns + review queue.
6. **`-document-tab-body`** — Rewrite `DocumentTabBody` for read-mostly
   viewer; cited-passage highlights + selection bar lands via
   `epic-backend-fills-for-redesign-document-viewer` sibling stories.
7. **`-side-panels-restyle`** — Three-column layout (documents left,
   session center, concepts + sidekick right) with the new tokens
   per the locked mock.
8. **`-tool-call-disclosure`** — Convert tool-call rendering to
   `<details>` one-line disclosure (verdict glyph + tool name +
   result preview + chevron). Generic — used by all chat surfaces.
9. **`-sub-agent-marginalia`** — Sibling restyle work to
   `drafter-configurator-chat-sub-agent-block-inline`; this story
   covers the teach-mode surface mount (the chat-workspace cell that
   embeds the block).
10. **`-composer-restyle`** — Italic serif composer with accent
    button + mono hints below.

## Implementation Order

Stories 1–10 in parallel where possible. Internal sequencing:
- Story 1 (shell) gates 2-6 (per-mode bodies — they consume the shell).
- Story 8 (tool-call) is independent of the rest.
- Stories 7 + 10 independent.

Cross-feature dependencies (per parent epic) handled via per-story
`depends_on`.

## Acceptance Criteria

- [ ] All chat surfaces render with the locked Refined Bubbles base.
- [ ] Per-mode tab bodies match their locked variants.
- [ ] Tool calls render as `<details>` disclosures.
- [ ] Sub-agent blocks render inline as marginalia.
- [ ] Three-column layout + composer + side panels match the mock.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Risks

- **Per-mode tab body rewrites are large.** Each is its own story so
  failures isolate; orchestrator can wave them in groups of 3.
- **tab-body-isolation pattern preserved** — every per-mode story
  must keep the `display:none` isolation; tests verify.
- **Course-create tab body lives in sibling backend feature** —
  ensure no duplicate work; integration test exercises both surfaces.

## Children complete (2026-05-18)

All 9 child stories advanced to `stage: done`. Feature advanced to `stage: review`.
