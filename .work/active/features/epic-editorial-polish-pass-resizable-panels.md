---
id: epic-editorial-polish-pass-resizable-panels
kind: feature
stage: drafting
tags: [ui, editorial]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Resizable side panels — drag handles + persisted widths

## Brief

The side panels (sidebar, documents pane, workspace rail) are fixed-
width today, forcing one-size-fits-all density on every workflow.
Students and authors have different content density needs — a wider
documents sidebar helps during reading-heavy sessions; a narrower one
maximizes chat space during back-and-forth tutoring. The fixed widths
optimize for neither.

This feature adds **drag handles** to each resizable panel boundary,
**persists the chosen width per panel** across sessions, and **respects
min/max bounds** so a user can't accidentally drag a panel to zero or
to fullscreen. The persistence call is the one substantive choice —
`config_kv` (syncs across machines if/when we have sync) vs.
localStorage (per-device). Feature-design picks the right home for
this kind of preference.

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — cross-cutting layout primitive.
  Touches every panel host but each host adopts independently. Runs
  in parallel.

## Scope absorbed from backlog

- `idea-resizable-side-panels` — drag handles + per-panel persisted
  widths + min/max bounds for sidebar / documents pane / workspace
  rail.

## Foundation references

- `docs/ARCHITECTURE.md` — UI shell, panel layout
- `CLAUDE.md` — pattern `config-kv-store` (one candidate persistence
  home); `editorial-ui-primitives`

## Anchors (current implementation)

- Side panels — search `packages/ui/src/` for the sidebar, documents
  pane, and workspace rail components. Likely candidates:
  - Sidebar host — probably in the chat workspace shell
  - Documents pane — inline in `packages/ui/src/routes/chat.tsx`
    around lines 48-148 (the chat-scoped documents sidebar)
  - Workspace rail — search for "WorkspaceRail" or "workspace-rail"
- Width persistence — `config_kv` accessors in
  `packages/core/src/services/config-service.ts` (or equivalent); OR
  localStorage utilities (feature-design picks)
- Drag-handle primitive — none today; this feature introduces it.
  Consider whether it lives in `packages/ui/src/components/editorial/`
  to be reused across panels, or as a hook that any panel host can
  adopt
