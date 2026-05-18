---
id: epic-ui-redesign-ground-up-configure-canvas-side-chat-shell
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
  - epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker
release_binding: v0.1.3
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

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: `configure-tab-button-change-dot-test-coverage` — `TabButton` change-dot behavior and `useDirtyStateObserver` subscription semantics have no test coverage; the 3 new tests cover structural presence only.
**Nits**:
- `TabButton` buttons have `role="tablist"` on the container but no `role="tab"` / `aria-selected` on each button — ARIA tab pattern is incomplete. Acceptable for v1 but worth a polish pass.
- `hidden` attribute and `style={{ display: "none" }}` are both set on inactive tab panels — redundant but harmless.
- `useDirtyStateObserver` starts `false` regardless of current dirty state; the code comment explains the accepted limitation correctly.

**Notes**: The Canvas + Side Chat shell is well-structured. `DirtyStateProvider` wraps the workspace, `AuthoringChatPane` is correctly shared via the right panel at 380px, and the tab-body-isolation pattern is applied correctly to all four canvas panels. The `useDirtyStateObserver` hook design (observer doesn't clear on unmount, avoiding clobbering surface ownership) is the right call. Save bar bug fix (`dirtyCount` vs `surfaceCount` for N) is correct — since one key = one surface, both aliases are equivalent but the distinction matters semantically. Main gap is test coverage for the change-dot behavior.
