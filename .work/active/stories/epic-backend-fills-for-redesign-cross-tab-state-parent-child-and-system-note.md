---
id: epic-backend-fills-for-redesign-cross-tab-state-parent-child-and-system-note
kind: story
stage: review
tags: [ui]
parent: epic-backend-fills-for-redesign-cross-tab-state
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Parent-child tab decoration + `<SystemNoteCard>` rendering

## Scope

Units 2 + 3 from parent feature:

- Parent-child tab UI:
  - "from {parentMode}" pill on child tabs whose session has
    `parentSessionId` set.
  - "Calling back" pulse on the parent tab when a child session
    emits a `system_note`.
  - Click on the pulse focuses the parent tab.
- `<SystemNoteCard>` component rendered by `<MessageList>` on
  `system_note` events (replaces invisible default).

See parent feature
`.work/active/features/epic-backend-fills-for-redesign-cross-tab-state.md`
for architectural choices and composition contracts.

## Implementation steps

1. Edit `packages/ui/src/components/tab-strip.tsx` +
   `tab-strip.module.css`:
   - Resolve the session for each tab; if `parentSessionId` is set,
     render the "from {parentMode}" pill (resolve `parentMode` via
     a session lookup; cache to avoid waterfalls).
   - Subscribe to `system_note` events from child sessions; when
     one arrives, set a transient `pulsing` flag on the parent tab.
     Use a CSS keyframe animation; restart via key change on
     rapid-fire.
   - Click handler on the pulse focuses the parent tab.

2. New `packages/ui/src/components/system-note-card.tsx` +
   `system-note-card.module.css`:
   - Renders kicker (child mode + glyph), body (mastery delta
     summary from the event payload), footer ("review the assignment
     →" link with `onClick` opening the child session).

3. Edit `packages/ui/src/components/message-list.tsx`:
   - Add a branch in the event-type switch for `system_note` that
     renders `<SystemNoteCard>` instead of falling through.

4. Tests:
   - `tab-strip` tests with `makeFakeClient` overrides seeding
     parent-child session fixtures + a synthesized `system_note`
     event.
   - `system-note-card.test.tsx` covering snapshot + click-handler.
   - `message-list.test.tsx` covering the new dispatch branch.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Child tabs with `parentSessionId` show a "from {parentMode}"
      pill.
- [ ] Parent tabs pulse for ~2s on `system_note` arrival; rapid-fire
      restarts the animation.
- [ ] Clicking the pulse focuses the parent tab.
- [ ] `system_note` events render as `<SystemNoteCard>` in the chat
      message list (not invisibly).
- [ ] Mastery delta and review link in the card resolve from the event
      payload and child session id.
- [ ] All quality checks green.

## Out of scope

- Optional "peek read-only" link from child back to parent (mentioned
  in the feature brief but not in the locked mocks); can be added in
  a follow-up if the user requests.
- Any backend change. This story is UI-only.

## Implementation notes

### Architecture decisions

- `ParentChildProvider` in `src/context/parent-child-context.tsx` is the
  in-memory registry for two pieces of state:
  - `childToParent` (ref, no re-render) — child sessionId → parent sessionId.
    Populated by `useAssignmentIssuedSpawn` when `activity.events()` fires an
    `assignment.issued` metadata event.
  - `pulseKeys` (state map) — parent sessionId → monotonically-increasing counter.
    Each `triggerPulse()` call increments it, which drives tab-strip re-renders.
  The provider mounts at app-shell level in `app.tsx` (above `TabsProvider`).

- Pulse animation restart: the pulse dot uses `key={pulse-${pulseKey}}` on a
  `<span>` (not a `<button>` — avoids nested-button HTML violation). React
  unmounts and remounts the element on each key change, restarting the CSS
  `tabPulse` keyframe animation (~2s ease-out). Rapid-fire `system_note` events
  each increment the counter; the last committed re-render shows the dot with the
  freshest key.

- `onSystemNote` callback: `useStreamedSend` accepts an optional
  `opts.onSystemNote` callback, called once per `system_note` event. In
  `TeachChatTabBody`, this calls `parentChild?.triggerPulse(sessionId)` so
  the tab strip pulses when the teach session receives the note.

- `system_note` rendering: `useStreamedSend` and `episodicToItems` both push a
  `SystemNoteItem` (`kind: "system-note"`) when a `system_note` event arrives.
  `TeachChatTabBody` renders a `<SystemNoteCard>` for these items. The card:
  - Returns `null` for `kind: "system"` origins (framework-internal; invisible).
  - For `kind: "assignment_submission"` shows a green-left-border card with score
    percentage, elapsed time, and a "↗ review answers" button that calls
    `client.tabs.open({ sessionId: childSessionId })`.

- `configure-chat-pane.tsx` and `sidekick-panel.tsx` also handle `system-note`
  items by returning `null` — those contexts don't surface the card.

### Files changed

- `packages/ui/src/context/parent-child-context.tsx` (new) — registry + hooks
- `packages/ui/src/components/tab-strip.tsx` — pill + pulse decoration
- `packages/ui/src/components/tab-strip.module.css` — `.fromPill`, `.pulseDot`, `@keyframes tabPulse`
- `packages/ui/src/components/system-note-card.tsx` (new) — card component
- `packages/ui/src/components/system-note-card.module.css` (new) — green-border card styles
- `packages/ui/src/hooks/use-streamed-send.ts` — `SystemNoteItem` type, `system_note` branch, `onSystemNote` opt
- `packages/ui/src/hooks/episodic-to-messages.ts` — `system_note` replay branch
- `packages/ui/src/hooks/use-assignment-issued-spawn.ts` — calls `recordSpawn` after successful spawn
- `packages/ui/src/components/chat-tab-body.tsx` — renders `<SystemNoteCard>` for `system-note` items; wires `onSystemNote`
- `packages/ui/src/components/configure-chat-pane.tsx` — `system-note` → null guard
- `packages/ui/src/components/sidekick-panel.tsx` — `system-note` → null guard
- `packages/ui/src/app.tsx` — wraps tree in `<ParentChildProvider>`

### Tests

- `src/components/__tests__/tab-strip-parent-child.test.tsx` (9 tests) — pill + pulse + click-to-switch
- `src/components/__tests__/system-note-card.test.tsx` (6 tests) — card render + review button
- `src/components/__tests__/message-list-system-note.test.tsx` (5 tests) — dispatch branch + tabs.open integration
