---
id: epic-ui-redesign-ground-up-configure-canvas-side-chat-shell
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
  - epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] Configure renders Canvas + Side Chat shell with tab strip +
      chat pane + inspector strip.
- [ ] Save bar shows "N unsaved across M surfaces" when applicable.
- [ ] All quality checks green.
