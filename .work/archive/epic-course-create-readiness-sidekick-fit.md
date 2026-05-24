---
id: epic-course-create-readiness-sidekick-fit
kind: feature
stage: done
tags: [ui, tutor-ux, course-authoring]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-20
updated: 2026-05-23
---

# Sidekick fit in course-design

## Brief

The right rail of the chat workspace renders alongside course-create
mode's embedded steering chat, producing a visually crowded "two right
panels" surface. The user's observation: in course-design we have both
the steering chat AND a sidekick rail showing only placeholder text,
which doesn't add value.

## Design decision (2026-05-23, locked)

**Direction: hide the sidekick rail in course-create mode.**

Validation during `epic-design --only-questions` confirmed the problem
is real and the simplest fix is the right fix:

- `packages/ui/src/routes/chat.tsx:236-273` renders a 3-column shell
  `[docsPanel | tab body | ChatRightPanel]`. `ChatRightPanel` is
  rendered for **all modes**.
- `ChatRightPanel` (`packages/ui/src/components/chat-right-panel.tsx`)
  has two sections: "Concepts active" + "Sidekick" (placeholder
  text "Contextual notes will appear here during a session.").
- Course-create's tab body
  (`packages/ui/src/components/course-create-tab-body.tsx:151`) renders
  ITS OWN right pane — `AuthoringChatPane`, the steering chat — so
  ChatRightPanel competes for visual real estate with the actual chat.
- The Concepts-active section and the Sidekick placeholder both add no
  value during course-authoring (the user is steering a drafter, not
  learning concepts).

**Alternatives considered (and declined):**

- **Swap for a draft-state inspector** — substantial build; the
  AuthoringChatPane already shows draft progress via tool calls. The
  course-create-tab-body's draft canvas (left pane) is the live draft
  state surface; a second inspector would duplicate it.
- **Keep as-is** — does not address the observed crowding.

## Implementation shape (story-sized)

In `packages/ui/src/routes/chat.tsx`:

1. Determine the active tab's `modeId` via `useTabs()`.
2. When `activeTab.modeId === "course-create"`, suppress `ChatRightPanel`
   (and its `ResizeHandle`). The inline-note-panel branch still applies
   if the user opens a note from a course-create session — but that's a
   user-initiated overlay, not the always-on rail.
3. Add a UI test in `chat-route.test.tsx` confirming `ChatRightPanel`
   does not render when the active tab is course-create.

Out of scope for this feature: quiz/homework/other-mode right-rail
audits. If similar crowding exists in other modes (quiz/homework have
their own `SidekickPanel` slide-in chat), file separate fix stories.

## Design decisions (feature-design --only-questions, 2026-05-23)

- **Substrate shape: collapse to a single story.** Direction is locked
  (hide in course-create), implementation is ~30 lines (modeId guard +
  UI test), the feature shell adds no value. Next pass should:
  1. Spawn `epic-course-create-readiness-sidekick-fit-hide` (story,
     stage: implementing, parent: epic-course-create-readiness).
  2. Move this feature file to `.work/archive/` with stage: done and
     a closure note pointing at the story.
  Out of scope for this collapse: quiz/homework right-rail audit
  (file separately if needed).

## Closure (feature-design, 2026-05-23, autopilot)

Collapsed to a single story per the locked `--only-questions` decision.
Spawned `epic-course-create-readiness-sidekick-fit-hide` (story,
stage: implementing, parent: epic-course-create-readiness). The
implementation is ~30 lines (modeId guard in `chat.tsx` + UI test);
the feature shell adds no value. Archiving this feature wrapper as
done — the story carries the actual work and the epic's child set
now points at the story directly.
