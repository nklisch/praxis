---
id: epic-backend-fills-for-redesign-cross-tab-state-parent-child-and-system-note
kind: story
stage: implementing
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
