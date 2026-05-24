---
id: epic-course-create-readiness-sidekick-fit-hide
kind: story
stage: implementing
tags: [ui, tutor-ux, course-authoring]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Hide sidekick rail in course-create mode

## Brief

The right rail (`ChatRightPanel`) crowds course-create's embedded steering
chat (`AuthoringChatPane`). Per the locked decision in the parent feature
(`epic-course-create-readiness-sidekick-fit`, collapsed to this single
story), suppress the right rail when the active tab is course-create
mode. The Concepts-active + Sidekick-placeholder sections add no value
during course-authoring.

## Scope

In `packages/ui/src/routes/chat.tsx` (around lines 236-273):

1. Determine the active tab's `modeId`. The `openTabs` array already
   carries `modeId` per tab summary; read from `useTabs()` and find the
   active tab.
2. When `activeTab.modeId === "course-create"`, suppress `ChatRightPanel`
   (and its accompanying `ResizeHandle`). Inline-note-panel branch
   (`note-tab-id` open) still applies — that's a user-initiated overlay,
   not the always-on rail.
3. Add a UI test in `chat-route.test.tsx` (or a focused sibling test
   file) confirming `ChatRightPanel` does not render when the active tab
   has `modeId: "course-create"`, and DOES render for other modes
   (e.g. teach).

## Acceptance Criteria

- [ ] Opening a course-create tab does not render the right-rail
  `ChatRightPanel` or its resize handle.
- [ ] Switching from a course-create tab to a teach tab restores the
  right rail.
- [ ] The user-initiated inline note overlay (the note-tab branch) still
  works in course-create.
- [ ] No layout regressions in non-course-create modes (the 3-column
  shell collapses cleanly to 2 columns: `[docsPanel | tab body]`).
- [ ] UI test added covering the mode-guard.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- Use the `useTabs()` hook to access the active tab; don't pass modeId
  down as a prop.
- Match the existing pattern in `chat.tsx` for conditional rendering
  (probably the same shape as the inline-note-panel branch).
- The `docsPanel` left rail is unrelated to this change — leave it.

## Out of scope

- Quiz / homework / other-mode right-rail audits. If similar crowding
  exists in other modes (quiz/homework have their own `SidekickPanel`
  slide-in chat), file separate stories.
- Redesigning the right rail in any mode.
