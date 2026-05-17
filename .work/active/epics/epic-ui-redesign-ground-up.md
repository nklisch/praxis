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

### Decomposition risks

- **design-system is the critical path** — every other feature waits on
  it. Mitigation: `/ux-ui-design:palette` produces multiple palette and
  type options up front; lock in one round if possible.
- **app-shell decisions ripple** — if the chrome design drops or
  repositions the ActivityRail, every surface mock must honor the new
  ambient affordance. Mitigation: app-shell sequences before the leaf
  features (it's the second wave); leaf features consume its
  decisions, not the inverse.
- **Cross-surface pattern drift** — four leaf features designed in
  parallel could diverge on shared shapes (cards vs tables vs lists,
  modal vs inline edit). Mitigation: design-system and app-shell
  together carry the shared patterns; reviewer of each surface flags
  drift; the `## Mockups` body section per feature captures chosen
  patterns explicitly.
- **Bootstrap straddles two features** — the bootstrap *conversation*
  lives in chat-workspace (as BootstrapTabBody, one of the mode
  bodies); the bootstrap *entry/exit* flow lives in discovery (library
  affordance → session → draft confirmation → first session).
  Mitigation: explicit assignment documented in both feature briefs;
  the chat-workspace mock for BootstrapTabBody and the
  discovery-surfaces flow mock for bootstrap-entry must be reviewed
  together before either is signed off.
- **Implementation is downstream** — this epic is design-first.
  Production rework only happens after a child feature's mocks are
  signed off and an implementation child story is spawned from that
  feature's design pass. If implementation lags far behind sign-off,
  the mocks may rot. Each feature's design pass should spawn its
  implementation child stories at sign-off time, not later.

## Mockups

Per-feature mocks land under
`.mockups/screens/<child-feature-id>/` and
`.mockups/flows/<flow-name>/` as each child feature's design pass runs.
Design-system mocks land at `.mockups/design-system/` and are referenced
via `<link rel="stylesheet" href="../../design-system/tokens.css">` by
every downstream mock.
