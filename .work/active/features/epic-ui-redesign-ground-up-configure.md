---
id: epic-ui-redesign-ground-up-configure
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

# Configure — Authoring Surfaces

## Brief

Redesign the configurator-facing authoring surfaces — the lock-gated
side of Praxis where parents, teachers, and self-directed learners build
courses, edit gates, customize prompts, and inspect memory. Audience and
posture differ sharply from the student surfaces: longer sessions, denser
information, deliberate edits over guided flow, and a willingness to
expose machinery the student never sees.

Current surface lives in `packages/ui/src/routes/configure.tsx` (the
four-tab workspace) with per-tab routes:

- **Course tab** (`configure/course-tab.tsx`) — course authoring: lessons,
  units, assessments
- **Gates tab** (`configure/gates-tab.tsx`) — React Flow gate editor with
  prerequisite graph, threshold knobs, override flags
- **Prompt tab** (`configure/prompt-tab.tsx`) — mode-prompt customization
  surface for the prompt-composition system
- **Memory tab** (`configure/memory-tab.tsx`) — student-model viewer,
  misconception list, recent episodic browser, controlled-edit
  affordances

Also includes the **UnlockModal** flow (lock-state gate transition) since
that's the configurator's entry point.

Includes the **configure-entry flow** (locked state → unlock modal →
configure surface, and the inverse). Internal navigation between the
four tabs is a discovery decision within this feature, not a flow.

What lands:

- `.mockups/screens/epic-ui-redesign-ground-up-configure/` — option set
  for the four-tab workspace and each tab's body (course / gates / prompt
  / memory)
- `.mockups/flows/configure-entry/` — multi-step walk through unlock →
  configure → re-lock

## Epic context

- Parent epic: `epic-ui-redesign-ground-up`
- Position in epic: **authoring-surface feature** — depends on
  design-system and app-shell; parallelizes with chat-workspace,
  discovery, and workspace.

## Foundation references

- `docs/UX.md` § "Surface map" → Configure mode — course / gates / prompt
  / memory surfaces
- `docs/ARCHITECTURE.md` § "UI architecture" → Configure surface
- `docs/UX.md` § "Onboarding flows" → Parent / teacher deliberate
  authoring — configure-mode posture
- Pattern `editorial-ui-primitives`

## Mockups

- Screens: `.mockups/screens/epic-ui-redesign-ground-up-configure/index.html`
- **Selected: Option 5 — Canvas + Side Chat** (2026-05-17)
  - **Center canvas is the artifact being edited** — for gates that's
    the gate graph (React Flow node diagram with mastery thresholds
    as edge labels); for course that's the unit/lesson tree; for
    prompts that's the fragment list; for memory that's the inspector
    table. Each subsurface owns its native visualisation.
  - **Sub-surface tab strip at top** (Course / Gates / Prompts /
    Memory) makes all four authoring systems visible and switchable;
    tabs carry **change-dots** so dirty state across surfaces is legible.
    Save bar lives in the strip with "N unsaved across M surfaces"
    summary.
  - **Inspector strip beneath the canvas** shows the selected node's
    editable fields with before/after for changed ones — for example,
    a gate node's `node.mastery_floor`, `edge.mastery_floor`,
    `node.adaptive_routing`.
  - **Side chat panel (380px) on the right** is the conversational
    configurator — already shipped as `ConfigureChatPane`
    (`packages/ui/src/components/configure-chat-pane.tsx`). Talking to
    the parent agent drives edits via existing authoring tools
    (`packages/tools/src/authoring/{course,gate,lesson,prompt}/`).
    Tool calls **execute immediately** and surface as "what was done"
    entries with **↶ revert** as the undo affordance (restore from
    pre-call snapshot). Cross-links back to the canvas
    ("↗ in graph", "↗ open prompts"). **No pre-execution staging or
    approval gate** — the Keep/Tweak/Revert framing in earlier mock
    revisions was wrong; the architecture is direct-call-with-undo.
  - Composer at the bottom of the chat panel; quick-action hints
    underneath ("+ undo last", "+ show diff", "+ preview as student")
- Considered: Four Books (tabbed surfaces), Editor + Live Preview
  (split-screen), Conversational (chat-only, no visible canvas),
  Inspector (flat searchable table) — in
  `.mockups/screens/.../option-{1,2,3,4}.html`

The configure-entry (unlock) flow spawns as a child story during
implementation. The four sub-surfaces (Course / Gates / Prompts /
Memory) each get their own implementation child story since each owns
its native canvas visualisation.

### Per-tab canvas mocks (locked)

The Canvas + Side Chat pattern from Option 5 applied to all four
subsurfaces, each showing how the pattern carries its native canvas.
Index: `.mockups/screens/epic-ui-redesign-ground-up-configure/tabs-applied.html`.

- **§ Course tab** (`tab-course.html`) — canvas is a unit/lesson tree
  with drag-reorderable unit blocks. Each unit shows its lessons
  nested with status badges (done / active / gated). Inspector strip
  below the tree shows the selected lesson's editable fields with
  before/after for changed ones.
- **‡ Gates tab** — already in Option 5; canvas is the gate-graph
  React Flow node diagram with mastery-threshold edge labels and
  warning-coloured edges for unsaved threshold changes.
- **¶ Prompts tab** (`tab-prompts.html`) — left rail is a mode picker
  (teach / quiz / homework / exam / bootstrap / study-skills /
  configure); canvas is a **composed prompt document** with ordered
  fragments. Each fragment carries its own lock-status pill
  (`locked` / `default` / `custom` / `added today`) and per-fragment
  knobs (scaffold, tone, formality, verbosity). Composed-prompt
  summary at the bottom shows the final fragment composition order.
- **‖ Memory tab** (`tab-memory.html`) — projection-tab strip
  (semantic / misconceptions / procedural / affective / episodic)
  switches the canvas view. Semantic shows the BKT-adjusted concept
  mastery table with per-row recompute action; misconceptions show
  as cards with evidence quotes + concept link + strength badge +
  inline address-or-clear actions.

The chat panel and inspector pattern are identical across tabs; only
the canvas representation changes shape per subsurface. Save bar in
the sub-surface tab strip summarises cross-surface dirty state ("N
unsaved across M surfaces").

### Course tab shows the full assessment plan

The Course tab canvas was extended to surface `LessonAssessment`
records with their `timing` (before / interleaved / after) and `purpose`
(readiness / practice / checkpoint), plus unit exams and midterms.
Per-lesson assessment pills are color-coded by mode:

- **QC** (quick check, inline / formative · grey)
- **READY** (readiness quiz · before · sage)
- **HW** (practice homework · interleaved · indigo)
- **QUIZ** (checkpoint quiz · after · slate)
- **EXAM** (unit exam / final · crimson)

Each unit block ends with a unit-exam row when present; midterms
display as a special row in the receiving unit's head. Legend strip
at top of the canvas names the vocabulary. This matches the
architectural reality (Phase 16 — `LessonAssessment` table, `Unit`
optional summative, `Course.assessmentPlan`) and replaces the earlier
mock's understatement ("1 check" per lesson). Same scaffolding visible
in the course-create-entry flow's draft-ready step.

### Naming rename (UI surfaces)

The Prompts tab's mode picker no longer lists "bootstrap" — it lists
**course-create**. The Configurator chat references the artifact
(course / draft / gate / prompt / projection), not a named agent.
Backend rename (mode id, agent class, tool names) parked at
`.work/backlog/idea-rename-bootstrap-and-explorer.md`.

### Implementation outlook

Likely implementation stories:

- **Story:** rebuild `configure.tsx` route as Canvas + Side Chat
  (sub-surface tab strip + canvas + side chat panel + inspector strip)
- **Story per subsurface:** rebuild each tab's canvas to its native
  visualization
  - Course tab — unit/lesson tree with lesson_assessments pills
  - Gates tab — React Flow polish with edge-label thresholds and
    warning-coloured unsaved-change edges
  - Prompts tab — composed prompt fragment document (mode picker
    rail + ordered fragments with per-fragment lock status + knobs)
  - Memory tab — projection tabs (semantic / misconceptions /
    procedural / affective / episodic) with table + cards per
    projection
- **Story:** Configurator chat infrastructure — the agentic loop that
  emits tool-call diffs into the chat as reviewable patches
  (keep / tweak / revert / cross-link to canvas)
- **Story:** configure-entry / unlock flow polishing
