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

<!-- The design pass will produce option mocks for each configure surface
and a flow mock for the configure-entry / unlock journey. Implementation
child stories land once mocks are captured. -->
