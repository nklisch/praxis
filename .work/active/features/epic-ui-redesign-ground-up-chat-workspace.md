---
id: epic-ui-redesign-ground-up-chat-workspace
kind: feature
stage: drafting
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on:
  - epic-ui-redesign-ground-up-design-system
  - epic-ui-redesign-ground-up-app-shell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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
  view (distinct from the course-create entry flow). Draft on left,
  steering chat on right; resumable across sessions. **Replaces what
  was formerly called "Bootstrap" mode** — see backend rename below.

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

### Implementation outlook

Likely implementation stories:

- **Story:** convert `ChatTabBody` to Refined Bubbles shape (drop
  bubble outlines, switch to tint backgrounds, keep tab-body-isolation)
- **Story:** convert tool-call rendering to `<details>` one-line
  disclosure (verdict glyph + tool name + result preview + chevron)
- **Story:** convert sub-agent rendering to inline marginalia
  (`SubAgentBlock` re-style)
- **Story:** each per-mode tab body — 6 stories, one per mode
  (Quiz / Homework / Exam / Study-skills / Document / Course-create),
  each rewriting its tab body component
- **Story:** mode-switch flow polishing
- **Story:** assignment-spawn flow — the system-event card, the
  "calling-back" tab pulse, the system_note inline rendering
