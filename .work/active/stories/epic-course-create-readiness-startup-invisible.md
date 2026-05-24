---
id: epic-course-create-readiness-startup-invisible
kind: story
stage: review
tags: [ui, bug, sessions]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Course-create startup invisible

## Brief

The course-create startup handoff isn't surfacing the running chat to the
user. The underlying session does start (engine session opens, events
flow) but the visible chat workspace doesn't connect to it — the user sees
an empty or stale view while the agent is actually running behind the
scenes.

Likely a wiring gap between `session.start` returning its handle and the
chat tab body subscribing to the event stream, or a tab-not-active /
`display:none` isolation interaction (see the `tab-body-isolation` pattern)
where the new tab opens but doesn't auto-activate.

## Repro and fix path

1. Trace the `start → tab.open → navigate → subscribe` sequence (see the
   `session-tab-open-flow` pattern) and identify where the visible binding
   drops for freshly opened course-create sessions.
2. Verify the `activeTabId` / event-stream handoff — likely either the new
   tab id isn't set active before navigation, or the ChatTabBody's effect
   subscribes before the tab is mounted.
3. Add a focused test that opens a course-create session and asserts the
   chat tab body renders the first engine event.

This story is a load-bearing dependency of
`epic-course-create-readiness-unified-landing` — the pre-seed-and-start
flow that ships there assumes the visible chat surfaces when the engine
session opens.

## Implementation notes

**Root cause — two bugs in `openSessionInTab`:**

1. Called `client.tabs.open` directly, bypassing `TabsProvider`'s `setOpenTabs` /
   `setActiveTabId`. Since `chat.tsx` renders `openTabs.map(t => <ChatTabBody>)`, a
   tab not in `openTabs` never mounts its body — the event stream has nowhere to
   subscribe. Fixed by adding a required `openTab` parameter (the `useTabs().openTab`
   callback) and using it instead of calling `client.tabs.open` directly.

2. `initialMessage` was sent fire-and-forget via `client.session.send` before the tab
   body mounted, consuming all IPC events before the UI could subscribe. Fixed by
   storing the message in a module-level `Map<sessionId, string>` and exporting
   `consumeInitialMessage(sessionId)`. `CourseCreateTabBody` reads it on mount via a
   `useState` initializer and passes it as `prefillMessage` to `AuthoringChatPane`,
   which sends through its own `useStreamedSend` once mounted.

**Files changed:**
- `packages/ui/src/lib/open-session-in-tab.ts` — rewrote: added `openTab` param,
  `pendingInitialMessages` map, `consumeInitialMessage` export; removed fire-and-forget.
- `packages/ui/src/routes/course-create.tsx` — added `useTabs().openTab`, passes to helper.
- `packages/ui/src/routes/course-detail.tsx` — added `useTabs().openTab`, passes to helper.
- `packages/ui/src/routes/library.tsx` — added `openTab` to all 5 `openSessionInTab` calls.
- `packages/ui/src/components/course-create-tab-body.tsx` — reads `consumeInitialMessage`
  on mount; passes as `prefillMessage` to `AuthoringChatPane`.
- `packages/ui/src/__tests__/open-session-in-tab.test.tsx` — full rewrite: all tests use
  `openTab` callback; new tests for `consumeInitialMessage` store/consume semantics.
- `packages/ui/src/__tests__/course-create-route.test.tsx` — `useTabs` mock added; context-
  forwarding tests updated to assert `consumeInitialMessage` (not `session.send`).
- `packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx` — `useTabs` mock added.
- `packages/ui/src/__tests__/course-detail-route.test.tsx` — `useTabs` mock added.
