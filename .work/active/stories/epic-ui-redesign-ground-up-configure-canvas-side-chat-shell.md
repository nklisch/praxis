---
id: epic-ui-redesign-ground-up-configure-canvas-side-chat-shell
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
  - epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Configure shell — Canvas + Side Chat layout

## Scope

Rebuild `configure.tsx` route per locked Option 5 — Canvas + Side Chat:
- Sub-surface tab strip at top (Course / Gates / Prompts / Memory)
  with change-dots and "N unsaved across M surfaces" save bar.
- Center canvas area (sub-surfaces fill this).
- Side chat panel (380px) on the right via `<AuthoringChatPane>`.
- Inspector strip beneath the canvas for selected-node fields.

## Implementation steps

1. Edit `packages/ui/src/routes/configure.tsx` to mount the new
   layout.
2. New `<ConfigureTabStrip>` showing tabs + change-dots + save bar;
   consumes `useDirtyAggregate()` from sibling tracker story.
3. Mount `<AuthoringChatPane mode="configure" />` in the right panel.
4. New `<InspectorStrip>` component beneath the canvas (initially
   empty — populated by per-tab canvases that pass selected-node
   props).
5. Wrap in `<DirtyStateProvider>` from sibling story.
6. Tests cover shell render + tab switching.
7. Quality checks green.

## Acceptance criteria

- [x] Configure renders Canvas + Side Chat shell with tab strip +
      chat pane + inspector strip.
- [x] Save bar shows "N unsaved across M surfaces" when applicable.
- [x] All quality checks green.

## Implementation notes

### What landed

- **`configure.tsx`** rebuilt as Canvas + Side Chat (Option 5):
  - Sub-surface tab strip (Course / Gates / Prompt / Memory) with
    per-tab change-dots via new `useDirtyStateObserver` hook.
  - All four tab panels mounted simultaneously; inactive panels use
    `display:none` (tab-body-isolation pattern).
  - Right panel (380px): `<AuthoringChatPane mode="configure" />` —
    shared chat promoted from inside individual tab layouts.
  - Inspector strip placeholder beneath the canvas (empty for now;
    per-tab canvas stories will populate it).
  - `DirtyStateProvider` wraps the workspace.
  - Save bar: "Unsaved" (1 surface) or "N unsaved across M surfaces"
    (multiple). Fixed a bug in the prior code where both N and M used
    `surfaceCount`, making them identical.

- **`CourseTab`** and **`GatesTab`**: removed embedded `<ConfigureChatPane>`
  (chat is now shared in the shell). Props interface preserves `sessionId`
  for future sub-surface canvas features.

- **`use-dirty-state.ts`**: added `useDirtyStateObserver(key)` — a
  subscribe-only hook that reads dirty state without owning (no
  `clearDirty` on unmount). Used by `TabButton` to avoid clobbering
  dirty state owned by the surface components.

### CSS layout

`configure.module.css`: new `.surface` grid (`1fr 380px`), `.canvasColumn`
flex-column, `.tabPanels` + `.tabPanel` for isolation, `.inspectorStrip`
placeholder, `.chatPanel` aside.

### Tests

`configure-route.test.tsx`: added 3 new tests — inspector strip present,
authoring chat pane present, all tab panels mounted simultaneously.
