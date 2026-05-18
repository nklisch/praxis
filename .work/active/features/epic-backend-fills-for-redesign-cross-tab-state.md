---
id: epic-backend-fills-for-redesign-cross-tab-state
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Cross-tab state + parent-child + system-event UI

## Brief

A bundle of UI-plumbing additions that surface what the data model
already supports but the current UI doesn't:

- **Cross-tab dirty-state tracking.** The configure surface shows
  "N unsaved across M surfaces" — requires a tracker that aggregates
  unsaved-change state across the four configure tabs (course /
  gates / prompts / memory). Current `useConfigureState` holds only
  `selectedCourseId`; this extends it.
- **Parent-child tab visualization.** `spawnFromAssignment` already
  sets `parentSessionId` on the child; the UI doesn't surface this.
  Adds the "from L3" pill on child tabs in the open-tabs strip, the
  "calling back" pulse on the parent tab when the child submits, and
  the optional "peek read-only" link from the child back to the
  parent.
- **`system_note` distinct card rendering.** The `system_note` event
  exists; the chat renders it invisibly today. This adds a
  recognizable inline card (green left-border, mastery-delta display,
  link back to child session for review).

No schema changes. All three are UI/UX additions consuming existing
backend data.

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: `epic-ui-redesign-ground-up-app-shell` (for the
  open-tabs strip pill rendering) and
  `epic-ui-redesign-ground-up-chat-workspace` (for system_note
  rendering and cross-tab dirty state).

## Foundation references

- `packages/core/src/services/session-service.ts:510+` —
  `spawnFromAssignment` sets parent_session_id; this feature surfaces it
- `packages/core/src/types/engine.ts:226` — `system_note` event type
- `packages/ui/src/hooks/use-configure-state.ts` — extension point
  for cross-tab dirty tracking
- `.mockups/flows/assignment-spawn/` — the 5-step flow demonstrating
  parent-child + system_note rendering
- `.mockups/screens/.../-configure/option-5.html` — "N unsaved across
  M surfaces" save bar in the sub-surface tab strip

<!-- The design pass will decide whether to extract a generic
DirtyStateTracker primitive (likely yes; cross-tab dirty tracking
recurs in workspace too) and the system-event card composition
contract. -->
