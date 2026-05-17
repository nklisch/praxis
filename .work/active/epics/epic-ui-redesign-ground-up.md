---
id: epic-ui-redesign-ground-up
kind: epic
stage: drafting
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

## Mockups

- Design system: `.mockups/design-system/` (to be created by
  `/ux-ui-design:palette` during decomposition)
- Per-surface and per-flow mocks land under
  `.mockups/screens/<child-feature-id>/` and
  `.mockups/flows/<flow-name>/` as child features advance
