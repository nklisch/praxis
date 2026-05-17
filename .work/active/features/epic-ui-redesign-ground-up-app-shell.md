---
id: epic-ui-redesign-ground-up-app-shell
kind: feature
stage: drafting
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on: [epic-ui-redesign-ground-up-design-system]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# App Shell — Root Chrome, Navigation, Ambient Surface, First-Run

## Brief

Redesign the persistent application chrome: the root layout, the global
navigation, the ambient `<ActivityRail>` (or whatever replaces it), the
update banner, and the first-run / onboarding flow. The shell is what every
student and configurator sees the moment the app opens and on every
surface transition — it sets the posture for everything underneath.

Current surface lives in `packages/ui/src/router.tsx` (RootLayout),
`packages/ui/src/components/nav.tsx`, `activity-rail.tsx`,
`update-banner.tsx`, `onboarding-flow.tsx`, and the shared `modal.tsx`
primitive. The activity rail and tab isolation patterns are inputs to
question — if the new direction replaces or repositions them, this feature
owns the call (and the implementation child stories surface accordingly
once the chosen mocks land).

Includes the first-run flow as a cross-screen journey because OnboardingFlow
is mounted at the root and the welcome → engine-picker → course-picker
sequence is global chrome, not a per-surface concern. The Claude Code
signin modal is part of this flow.

What lands:

- `.mockups/screens/epic-ui-redesign-ground-up-app-shell/` — option set for
  root layout + nav (with the design-system tokens applied)
- `.mockups/flows/first-run/` — multi-page walk through the first-run
  onboarding journey

## Epic context

- Parent epic: `epic-ui-redesign-ground-up`
- Position in epic: **chrome feature** — depends on the design system;
  every surface feature depends on the chrome (for nav placement, ambient
  surface anchoring, modal primitive). Lands second.

## Foundation references

- `docs/ARCHITECTURE.md` § "UI architecture" — ActivityRail at router root,
  student vs configure surface split
- `docs/UX.md` § "Surface map" — lock state, student vs configure routing
- `docs/UX.md` § "Onboarding flows" — three onboarding paths (parent /
  student-class / self-directed)
- `docs/designs/activity-rail.md` — current ambient-progress design

<!-- The design pass will produce screen mocks for the root layout +
options, and a flow mock for first-run. Implementation child stories will
swap out the existing RootLayout/nav/ActivityRail once mocks are
signed off. -->
