---
id: epic-ui-redesign-ground-up-app-shell
kind: feature
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on: [epic-ui-redesign-ground-up-design-system]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Mockups

- Screens: `.mockups/screens/epic-ui-redesign-ground-up-app-shell/index.html`
- **Selected: Option 3 — The Index** (2026-05-17)
  - Top horizontal nav reads as a journal's running head — wordmark,
    five surface links (Library / Workspace / Concept maps / Progress /
    Configure), and open session tabs as italic deck lines on the right
  - Near-invisible status strip directly under nav surfaces ambient
    work (indexing progress, version updates) — appears when there's
    work, fades when there isn't
  - No left sidebar — full-width content
  - Theme toggle (auto · light · dark) lives at the right edge of the
    running head; drives `data-theme` attribute on `<html>`
- Considered: Atelier (no nav, cmd-K palette), Reading Room (left rail),
  Wing Chair (right rail, large editorial wordmark) — all available
  in `.mockups/screens/.../option-{1,2,4}.html`

The first-run / onboarding flow will spawn as a child story in this
feature's implementation pass and produce a `.mockups/flows/first-run/`
deliverable then. Top-nav choice doesn't constrain the first-run flow,
so flow design is deferred to implementation time.

### Theme toggle (added during the design pass)

Mid-design, the requirement for a light/dark/auto toggle surfaced. The
toggle ended up as a small 3-state segmented control at the right edge
of the running head, using mono kicker type:

```
auto · light · dark
```

Drives `data-theme` attribute on `<html>`. `tokens.css` was extended
(in the design-system feature) to support the explicit override path
in addition to the existing `@media (prefers-color-scheme: dark)`
system-follow path. Visible in all four app-shell option mocks plus
every downstream surface mock that inherits the shell.

### Design alignment · done

- Locked Option 3 — The Index (top horizontal nav, near-invisible status
  strip) inherited by every downstream surface mock; chrome is consistent
  across the seven mode tab bodies (chat-workspace), Workbench
  (discovery), Catalogue (workspace), Canvas + Side Chat (configure).
- Status strip pattern proves out the ambient-progress replacement for the
  legacy `<ActivityRail>` — work that's running surfaces inline; idle
  state fades to invisible.
- Tab strip lives in the running head as italic deck lines next to the
  primary nav (`Open · Calc · L3 · Quiz · deriv`). Open/held/closed
  states are visible in the session-loop and assignment-spawn flows.

### Implementation outlook

## Design decisions

- **Five parallel stories** along the locked design's natural seams
  (top-nav, status strip, theme toggle, tabs strip, first-run flow).
- **Theme toggle owned by `ui-completion-bundle-theme-persistence`**
  (sibling backend-fills story) — this feature's app-shell story
  mounts the toggle UI but the hook + storage lives in that sibling
  story to avoid duplication. Declare a `depends_on` on it.
- **First-run flow** lands last; needs a separate `.mockups/flows/first-run/`
  pass once the chrome is solid.

## Implementation Units (one story each)

1. **Root layout rebuild** — swap left-rail for top-nav Index shape.
   - File: `packages/ui/src/router.tsx` (RootLayout component).
2. **Status strip + ambient progress** — drop the blocking-modal
   `<ActivityRail>` mount in favor of an inline near-invisible
   status strip beneath the running head; folds existing activity
   events into the strip.
   - Files: `router.tsx` (mount), new
     `packages/ui/src/components/status-strip.{tsx,module.css}`.
3. **Theme toggle UI mount** — uses
   `useTheme` from the ui-completion-bundle sibling story; renders
   the 3-state segmented control at the right edge of the running
   head. (Hook + storage live in the bundle story.)
   - File: `router.tsx` mount the existing
     `<ThemeToggle>` from the sibling story.
4. **Open-tabs italic deck-line strip** — render the tab strip in the
   running head per the locked mock; italic deck-line typography;
   active state mapped to the locked palette.
   - Files: `packages/ui/src/components/tab-strip.{tsx,module.css}`
     restyle; `router.tsx` mount in the running head.
5. **First-run flow rework** — after a mockup pass produces
   `.mockups/flows/first-run/`, rebuild `OnboardingFlow` to match.
   - Files: `packages/ui/src/components/onboarding-flow.tsx`,
     possibly extracts to per-step components.

## Implementation Order

Stories 1 + 2 + 4 in parallel; Story 3 after design-system token
swap (depends on `tokens.css` adoption); Story 5 after Story 1 (uses
the new chrome).

## Acceptance Criteria

- [ ] Root layout uses top horizontal nav with five surface links + tabs strip.
- [ ] Status strip surfaces ambient progress; idle = invisible.
- [ ] Theme toggle visible in the running head; switching applies
      `data-theme` to `<html>` and persists.
- [ ] Open-tabs strip renders next to nav as italic deck lines.
- [ ] First-run flow matches its locked mock.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Risks

- **Activity rail consumers** — removing the rail removes the
  blocking-modal behavior. Confirm no consumer depends on the
  modal interaction; status strip only surfaces inline updates.
- **First-run flow mock pass** is an additional design step; the
  story can be deferred without blocking the rest.

## Children complete (2026-05-18)

Seven child stories at `stage: done`:
- `root-layout-top-nav` (archived) — Approve (pass 2)
- `status-strip` (archived) — Approve with comments
- `tabs-strip` — Approve (pass 2)
- `tabs-strip-fix-ux-doc-drift` — Approve
- `theme-toggle-mount` — Approve
- `first-run-flow` — Approve with comments
- `root-layout-top-nav-doc-drift` — Approve

One child parked to backlog (non-blocking):
- `first-run-flow-engine-select-label` — a11y fix for onboarding engine picker
  fields; parked at `stage: implementing` in `.work/backlog/`. Not a blocker
  for feature delivery; the flow works and is visually correct.

Feature advanced `implementing → review`.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- **`first-run-flow-engine-select-label` remains open** — the engine `<select>` and API key `<input>` in `OnboardingFlow`'s `EngineStep` lost their programmatic label association when `<label>` wrappers were replaced with `<div>` + `<span>` for mono-kicker styling. The item is in backlog at `stage: implementing` with a clear fix path (`htmlFor` + `id`). Should be resolved before the next a11y audit. Tracked in `epic-ui-redesign-ground-up-app-shell-first-run-flow-engine-select-label`.

**Nits**:
- Feature acceptance criteria checkboxes remain unchecked in the feature body; individual story reviews confirm all criteria are met in code. Minor documentation gap only.

**Notes**: All seven stories were individually reviewed and approved (two required two passes to clear foundation-doc drift blockers — both cleared cleanly by companion doc-drift stories). The aggregate feature delivers: top horizontal nav (five surface links + tabsSlot), near-invisible status strip (ambient progress, fades when idle), italic deck-line tabs strip in the running head, theme toggle (auto/light/dark, `data-theme` on `<html>`, persisted), and first-run flow rebuild (welcome → engine picker → course picker, Studio Quiet tokens, step-progress indicator). No cross-cutting concerns visible across the seven stories. `ActivityRail` removal from `RootLayout` was correctly handled: it was removed in the root-layout-top-nav story, and both `ARCHITECTURE.md` and `UX.md` were rolled forward by dedicated doc-drift stories. Feature is clean to advance to done.
