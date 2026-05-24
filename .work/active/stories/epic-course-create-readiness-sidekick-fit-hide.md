---
id: epic-course-create-readiness-sidekick-fit-hide
kind: story
stage: review
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

## Implementation notes

**Guard location**: `packages/ui/src/routes/chat.tsx` lines 60-62 (the derived
`isCourseCreateMode` boolean) and lines 265-281 (the conditional render
wrapping the `ResizeHandle` + `ChatRightPanel` / `InlineNotePanel` block).

**Guard logic**: derives `activeTab` from `openTabs.find(t => t.id === activeTabId)`
(both already available via `useTabs()`), then checks
`activeTab?.kind === "session" && activeTab.modeId === "course-create"`. When
true, the right column (`ResizeHandle` + either `InlineNotePanel` or
`ChatRightPanel`) is entirely omitted, collapsing the shell to a clean 2-column
layout: `[docsPanel | workspace]`. The left docs panel and its resize handle are
unaffected.

**Layout post-guard**: the flex container in `chat.module.css` already distributes
remaining space via `flex: 1` on the center workspace column, so removing the
right column requires no CSS changes — the workspace expands naturally.

**Test file updated**: `packages/ui/src/__tests__/chat-route.test.tsx` — three
new tests appended under the existing `ChatRoute shell` describe block:
1. suppresses `ChatRightPanel` (aria: "Concepts and sidekick") when active tab
   has `modeId: "course-create"`
2. renders `ChatRightPanel` when active tab has `modeId: "teach"`
3. renders `ChatRightPanel` when no tabs are open (no active tab → no guard)
