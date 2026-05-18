---
id: epic-ui-redesign-ground-up-configure
kind: feature
stage: done
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

## Design decisions

- **Six parallel stories** per the outlook: shell rebuild + 4
  subsurface canvases + entry-flow polish.
- **Configurator chat infrastructure delegated** to sibling
  `epic-backend-fills-for-redesign-drafter-configurator-chat` (5
  stories covering the chat pane, tool-call entry, sub-agent block,
  course-create body, prompt updates). This feature consumes those
  primitives — does not duplicate.
- **Dirty-state aggregation delegated** to sibling
  `epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker`.

## Implementation Units (one story each)

1. **`-canvas-side-chat-shell`** — Rebuild `configure.tsx` route as
   Canvas + Side Chat: sub-surface tab strip at top + center canvas
   + side chat panel + inspector strip beneath canvas. Mounts
   `<AuthoringChatPane>` from sibling backend feature.
2. **`-course-tab-canvas`** — Rebuild Course tab canvas: unit/lesson
   tree with drag-reorderable units + nested lessons + assessment
   pills (consumes
   `epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render`).
3. **`-gates-tab-canvas`** — React Flow polish with edge-label
   thresholds and warning-coloured unsaved-change edges.
4. **`-prompts-tab-canvas`** — Mode picker rail + composed prompt
   fragment document with per-fragment lock pills + knobs.
5. **`-memory-tab-canvas`** — Projection tabs (semantic /
   misconceptions / procedural / affective / episodic) with
   per-projection table + cards.
6. **`-configure-entry-flow`** — Unlock modal flow polish per
   `.mockups/flows/configure-entry/`.

## Implementation Order

Story 1 (shell) gates stories 2–5 (canvas mounts inside the shell).
Story 6 independent.

## Acceptance Criteria

- [x] Configure route renders Canvas + Side Chat with sub-surface
      tab strip.
- [x] Each of the four sub-surfaces renders its native canvas per
      locked mock.
- [x] Configure-entry / unlock flow matches its locked mock.
- [x] All quality checks green.

## Children complete (2026-05-18)

All 6 child stories at `stage: done`. Feature advanced `implementing → review`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none (all important findings were triaged at child-story level into backlog items)
**Nits**: none

**Notes**: All six child stories delivered and approved. The Canvas + Side Chat Option 5 decomposition was fully realized: shell rebuild, four sub-surface canvases (course / gates / prompts / memory), and entry-flow polish. Three important findings from child reviews are already tracked as backlog items — `configure-tab-button-change-dot-test-coverage`, `configure-gates-inspector-strip-pending-minscore`, `configure-memory-tab-local-empty-state`, and `fix-configure-prompt-tab-dirty-key-mismatch`. Feature delivered its brief: configurator-facing authoring surfaces in the Canvas + Side Chat layout with `AuthoringChatPane` on the right, per the locked Option 5 mock. Foundation docs not affected. Parent epic (`epic-ui-redesign-ground-up`) has 4 of 6 features still active — not ready to advance.
