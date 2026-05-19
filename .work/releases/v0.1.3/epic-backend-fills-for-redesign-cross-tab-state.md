---
id: epic-backend-fills-for-redesign-cross-tab-state
kind: feature
stage: done
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: v0.1.3
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

## Design decisions

- **Extract a generic `DirtyStateTracker` hook**, since the pattern
  recurs (configure surface AND workspace AND course-create).
- **Parent-child rendering reads directly from existing session
  shape.** `Tab.sessionId` is already there; the renderer pulls the
  matching session and asks whether `parentSessionId` is set. No new
  IPC channel.
- **`system_note` card lives as a new sibling component** rendered by
  `MessageList`'s event-type switch — not a Message variant.
- **No schema changes.** All three additions consume backend state
  that already exists.

## Architectural choice

Three discrete UI additions sharing one feature ship — they all land
in the chat-shell area and consume already-existing data:

1. `useDirtyState(key)` + `<DirtyStateProvider>` aggregating across
   keys for "N unsaved across M surfaces."
2. Parent-child tab UI: extends `<TabStrip>` to read
   `session.parentSessionId` and surface the "from {parentMode}" pill
   + "calling back" pulse on parent tabs when a child emits
   `system_note`.
3. `<SystemNoteCard>` rendered by `MessageList` on `system_note`
   events. Composition: kicker (child mode + glyph), body (mastery
   delta summary), footer ("review the assignment →" link).

## Implementation Units

### Unit 1: `useDirtyState` hook + provider

**Files**: `packages/ui/src/hooks/use-dirty-state.ts` (new),
`packages/ui/src/contexts/dirty-state-provider.tsx` (new)

```ts
export function useDirtyState(key: string): {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
};

export function useDirtyAggregate(): {
  dirtyCount: number;
  surfaceCount: number;
};
```

Wrap configure (and other multi-surface roots) in
`<DirtyStateProvider>`. Save bar reads `useDirtyAggregate()` and
shows the "N unsaved across M surfaces" string when
`surfaceCount > 0`.

### Unit 2: Parent-child tab decoration

**Files**: `packages/ui/src/components/tab-strip.{tsx,module.css}`
(modified)

- "from {parentMode}" pill on child tabs whose session has
  `parentSessionId`.
- Parent tab pulses for ~2s when a child session emits a
  `system_note`. CSS keyframe animation; restartable on rapid-fire.
- Clicking the pulse focuses the parent tab.

### Unit 3: `<SystemNoteCard>`

**Files**: `packages/ui/src/components/system-note-card.{tsx,module.css}`
(new), `packages/ui/src/components/message-list.tsx` (modified)

`MessageList` adds a branch for `system_note` events; renders the
card instead of an invisible default.

### Unit 4: Tests

- Hook + provider tests via `@testing-library/react`.
- Tab-strip tests using `makeFakeClient` overrides for
  parent-child session fixtures.
- `SystemNoteCard` snapshot + interaction tests.

## Implementation Order

Two independent stories (can run in parallel):

1. `epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker` —
   Unit 1 only.
2. `epic-backend-fills-for-redesign-cross-tab-state-parent-child-and-system-note` —
   Units 2 + 3.

## Acceptance Criteria

- [ ] `useDirtyState(key)` registers/clears; aggregate hook returns
      correct counts.
- [ ] Configure save bar renders the "N unsaved across M surfaces"
      string when multiple tabs are dirty.
- [ ] Child tabs with `parentSessionId` show "from {parentMode}" pill.
- [ ] Parent tabs pulse ~2s on `system_note` arrival.
- [ ] `system_note` events render as `<SystemNoteCard>`, not
      invisibly.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Risks

- **Pulse animation collision with rapid-fire events.** CSS-only
  animation; restart via key change. Test the rapid-fire case.
- **Dirty-state leak on tab unmount.** Provider cleans up keys when
  consumers unmount; tests cover.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Both child stories reviewed and approved individually. All six acceptance criteria confirmed from code:
- `useDirtyState(key)` / `useDirtyAggregate()` implemented with ref-based subscription (no provider re-renders).
- Configure save bar shows "Unsaved" (1 surface) or "N unsaved across N surfaces" (N > 1).
- Child tabs with `parentSessionId` show "from {parentMode}" pill via `ParentChildProvider`.
- Parent tab pulse driven by incrementing `pulseKey`; `key={pulse-${pulseKey}}` remount restarts CSS `tabPulse` keyframe on rapid-fire events.
- `system_note` events render as `<SystemNoteCard>` (green-border card with score %, elapsed time, "review answers" link).
- 1125 UI tests pass; lint clean; `@praxis/desktop` typecheck errors are pre-existing (in `courses-section.tsx` and `note-editor-page.tsx`, not touched by this feature).
- Foundation docs (`CONTRACT.md`, `ARCHITECTURE.md`, `CLAUDE.md`) already correctly describe `system_note`, `parentSessionId`, `notifySession`, and `spawnFromAssignment` — no drift.
