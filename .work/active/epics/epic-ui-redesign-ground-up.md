---
id: epic-ui-redesign-ground-up
kind: epic
stage: implementing
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# UI Redesign — Ground-Up

## Brief

Praxis's UI has accreted across nineteen phases — editorial primitives, tab
isolation, the activity rail, sketch surfaces, concept maps, mode-specific tab
bodies, the chat workspace, the library, the progress map, configure mode.
The shell now reflects its build history more than a coherent design intent.
This epic re-examines the entire student-facing surface from the ground up:
a fresh design system (palette, typography, spacing tokens), reimagined
screens for every major surface, and rethought cross-screen journeys.

The work uses the `/ux-ui-design` plugin end-to-end before any production
rework:

- `/ux-ui-design:palette` redefines the visual system — color tokens,
  typography scale, spacing — and lands a `tokens.css` shared across every
  subsequent mock.
- `/ux-ui-design:screens` mocks each major surface with multiple options to
  align on: chat workspace, library, progress map, configure, and the
  per-mode tab bodies (quiz, homework, exam, bootstrap, study-skills).
- `/ux-ui-design:flows` walks the key journeys: opening a session, the
  bootstrap explorer, mode switching, the assignment spawn → parent
  notification handoff, the first-run / onboarding path.

Existing editorial primitives, tab isolation patterns, the activity rail,
and the side-panel composition are **inputs to question, not constraints to
honor**. Where the new direction preserves an existing pattern, that's a
deliberate choice; where it replaces one, the mockup is the alignment
artifact and the implementation feature does the swap.

Decomposition into child features happens at `/agile-workflow:epic-design`
time. The natural shape is one feature for the design system itself, one
feature per surface family (or per screen if the surface is rich enough),
and one feature per cross-screen flow. Each child feature owns its mocks in
`.mockups/screens/<feature-id>/` or `.mockups/flows/<flow-name>/` and its
implementation lands once the mocks are signed off.

This epic is alignment-first. No production code changes until child
features advance out of drafting with chosen mockup directions captured in
their `## Mockups` sections.

## Decomposition

Split into six child features along surface-posture seams: one foundation
(visual tokens), one chrome (root layout + ambient surface + first-run),
and four parallel surface features each owning their visual design **and
the flows that originate from them**. The alternative — a separate
"cross-screen flows" feature — was rejected because flows are inseparable
from the screens they compose; designing them apart from the surface
language would invite drift. Mode-switch and assignment-spawn live in
chat-workspace; session-open and bootstrap-entry live in
discovery-surfaces; review lives in workspace; configure-entry lives in
configure; first-run lives in app-shell.

The dependency chain has two sequential waves followed by a parallel wave
of four. After design-system locks `tokens.css` and app-shell defines the
root chrome, the four leaf features can run concurrently — autopilot will
naturally fan out at that point.

### Child features

- `epic-ui-redesign-ground-up-design-system` — palette, typography,
  spacing, `tokens.css` foundation — depends on: `[]`
- `epic-ui-redesign-ground-up-app-shell` — root layout, nav,
  ambient/activity surface, first-run flow — depends on:
  `[epic-ui-redesign-ground-up-design-system]`
- `epic-ui-redesign-ground-up-chat-workspace` — tabs, message rendering,
  per-mode tab bodies, item bodies, side panels, mode-switch +
  assignment-spawn flows — depends on:
  `[epic-ui-redesign-ground-up-design-system, epic-ui-redesign-ground-up-app-shell]`
- `epic-ui-redesign-ground-up-discovery-surfaces` — library, progress
  map, concept-maps index, session-open + bootstrap-entry flows —
  depends on:
  `[epic-ui-redesign-ground-up-design-system, epic-ui-redesign-ground-up-app-shell]`
- `epic-ui-redesign-ground-up-workspace` — notes, flashcards, sketch,
  review surfaces + review flow — depends on:
  `[epic-ui-redesign-ground-up-design-system, epic-ui-redesign-ground-up-app-shell]`
- `epic-ui-redesign-ground-up-configure` — course / gates / prompt /
  memory authoring surfaces + unlock/configure-entry flow — depends on:
  `[epic-ui-redesign-ground-up-design-system, epic-ui-redesign-ground-up-app-shell]`

### Decomposition risks · revisited

The original risks called at scope time, with current status:

- ~~**design-system is the critical path**~~ · **resolved** —
  Studio Quiet palette + System Editorial type locked in one round;
  `tokens.css` shipped; every downstream surface mock consumed it
  successfully with no missing tokens.
- ~~**app-shell decisions ripple**~~ · **resolved** — Option 3 (The
  Index) locked; top horizontal nav + near-invisible status strip
  pattern adopted by every downstream surface. Theme toggle added
  mid-design without disturbing the lock.
- ~~**Cross-surface pattern drift**~~ · **resolved** — locked shapes
  visible in the mockup index: editorial chrome (kicker + italic
  display + mono labels), tinted-not-outlined cards/bubbles, status
  pills with mode tints, side chat panel pattern consistent across
  configure tabs and course-create.
- ~~**Bootstrap straddles two features**~~ · **resolved and
  superseded** — the formerly-called "bootstrap" surface is now
  **course-create**. The in-session view lives in chat-workspace
  (`mode-course-create.html`); the entry path lives in discovery
  (course-create-entry flow). The UI naming bleed-through ("bootstrap"
  / "explorer") was caught and scrubbed; backend rename parked at
  `.work/backlog/idea-rename-bootstrap-and-explorer.md`.
- **Implementation is downstream** · **still active** — design is
  done; implementation hasn't started. Each feature lists its likely
  implementation stories in a "## Implementation outlook" section;
  these will be spawned per-feature when each advances to actual
  implementation work, ideally bound to a release.

### New risk surfaced during design

- **Mock-to-code translation accuracy** — the locked mocks are HTML
  with vanilla CSS; production is React + CSS modules with the existing
  editorial-primitive library. Implementation stories need to translate
  the visual contract without re-implementing primitives. Mitigation:
  per-feature implementation should start from the existing primitives
  (`RouteHeader`, `LibrarySection`, `Modal`, etc.) and update them
  to match locked tokens, not start from scratch.

## Mockup inventory · design pass complete

### Design system (locked)

`.mockups/design-system/`

- **`palette.html`** · Studio Quiet (warm off-white + true near-black
  + muted brick accent) — locked Option 3 of 5 explored
- **`typography.html`** · System Editorial (system serif chain;
  zero remote fetch) — locked Option A of 2 explored
- **`tokens.css`** · the single source of truth every downstream
  mock links via `<link rel="stylesheet">`; supports both
  `prefers-color-scheme` and `data-theme` override

### Surface screens (one locked direction per feature)

| Feature | Folder | Locked direction | Considered |
|---|---|---|---|
| app-shell | `screens/.../-app-shell/` | **Option 3 — The Index** (top nav, near-invisible status strip) | Atelier, Reading Room, Wing Chair |
| chat-workspace | `screens/.../-chat-workspace/` | **Option 4 — Refined Bubbles** (3-col, tinted-not-outlined turns, `<details>` tool calls) | Continuous Document, Bilateral Columns, Margin Annotations |
| discovery | `screens/.../-discovery-surfaces/` | **Option 4 — Workbench** (what's-next queue + lately timeline) | Table of Contents, Card Grid, Single Map |
| workspace | `screens/.../-workspace/` | **Option 3 — Catalogue** (search-first flat index) | Continuous Notebook, Studio, Course Companion |
| configure | `screens/.../-configure/` | **Option 5 — Canvas + Side Chat** (artifact in middle, conversational configurator on right) | Four Books, Editor + Live Preview, Conversational, Inspector |

### Per-mode tab bodies (chat-workspace · 6 mocked)

`screens/.../-chat-workspace/mode-bodies-index.html` plus per-mode files:

- `mode-quiz.html` · ‡ item-typed cards · no tutor mid-quiz · confidence band
- `mode-homework.html` · ❦ paginated · save/skip/flag · agent clarifies only
- `mode-exam.html` · † proctored · timer · rubric visible · clarification only
- `mode-study-skills.html` · ‖ structured reflection · pedagogy-pack prompts
- `mode-document.html` · † read-mostly · cited-passage highlights · selection-bar
- `mode-course-create.html` · ¶ in-session draft + steering chat (formerly Bootstrap)

### Per-format note editors (workspace · 5 mocked + 1 distinct)

`screens/.../-workspace/note-editors-index.html`:

- `note-cornell-editor.html` · 3-zone (cue · notes · summary) with ◆ anchors
- `note-feynman-editor-d-two-pass.html` · **LOCKED** (variant D of 4 — writing-mode → review-mode → margin-anchored gaps)
- `note-outline-editor.html` · hierarchical bullets · keyboard-first
- `note-free-editor.html` · typewriter page · slash-command · gutter
- `note-sketch-editor.html` · free canvas + `↗ convert to concept map` bridge
- `concept-map-editor.html` · DISTINCT primitive · canonical-hints panel · three-state nodes

### Per-tab configure canvases (configure · all 4 mocked)

`screens/.../-configure/tabs-applied.html`:

- `tab-course.html` · unit/lesson tree with **full lesson_assessments
  scaffold** (qc / readiness / homework / quiz / exam pills + timing
  + per-unit exam rows)
- Gates · in Option 5 (gate-graph React Flow with edge thresholds)
- `tab-prompts.html` · mode picker + composed fragment document with
  per-fragment lock status + knobs
- `tab-memory.html` · projection tabs · semantic mastery table +
  misconception cards with evidence

### Cross-feature flows (7 produced)

`.mockups/flows/index.html`. Each is a sequence of step pages with a
flow-meta header carrying prev/next nav.

| Flow | Steps | Spans |
|---|---|---|
| **session-loop** | 5 | app-shell · chat-workspace · discovery |
| **chat-to-workspace-note** | 5 | chat-workspace · workspace |
| **concept-map-link** | 4 | workspace |
| **note-to-tutor-brief** | 4 | workspace · chat-workspace |
| **course-create-entry** | 5 | discovery · chat-workspace (formerly bootstrap-entry) |
| **sketch-to-concept-map** | 4 | workspace |
| **assignment-spawn** | 5 | chat-workspace |

### Naming rename (UI surface complete · backend parked)

Mid-design, the user identified that internal jargon was bleeding into
UI surfaces:

- **"Bootstrap"** (a CS term) is now **"Create a course"** (action) /
  "Course create" (session label) in UI copy. Mode id stays as a
  session kind internally.
- **"Explorer"** (the agent that reads documents and drafts a course)
  is no longer named in the UI. Praxis is framed as the drafter (or
  tutor / coach as appropriate) — *frame the work, not the worker*.

All visible UI strings scrubbed across mocks and flows. The flow
folder `bootstrap-entry/` was renamed `course-create-entry/`. Backend
code, tool names (`course.start_exploration` → `course.start_drafting`),
mode id, agent class names, and prompt files (`bootstrap/explorer-prompt.ts`)
are tracked for renaming at
`.work/backlog/idea-rename-bootstrap-and-explorer.md`.

## Implementation handoff

Each child feature's body has an **"## Implementation outlook"**
section listing the likely implementation stories. When the epic
advances toward shipping (release-bind time), each feature should:

1. Advance from `stage:drafting` → `stage:implementing` (the design
   pass is done)
2. Spawn implementation child stories per the outlook
3. Convert mocks to production code, starting from existing
   editorial primitives rather than from scratch
4. Re-link the substrate item to the chosen mockup file in any
   ambiguous case (per-tab, per-mode, per-flow)

The mocks are throwaway HTML — alignment artifacts, not production
templates. The implementation translates the visual contract;
fidelity to the locked direction is what matters, not pixel-level
preservation.
