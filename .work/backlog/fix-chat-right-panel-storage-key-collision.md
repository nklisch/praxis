---
id: fix-chat-right-panel-storage-key-collision
created: 2026-05-18
tags: [ui, bug]
---

`ChatRoute`'s right-column panel (`ChatRightPanel`) was given `storageKey:
"praxis.panel.sidekick.width"` in `packages/ui/src/routes/chat.tsx` lines
132–138, with clamp range 220–380 px.

The same key was already owned by `QuizTabBody` / `HomeworkTabBody`
(`packages/ui/src/components/quiz-tab-body.tsx` line 42,
`homework-tab-body.tsx` line 40) with a different clamp range of 280–640 px,
deliberately shared so a width set in quiz carries to homework (both are
assignment-primary + slide-in-sidekick surfaces — same layout).

`ChatRightPanel` is a different affordance: a persistent outer column for
concepts + sidekick notes, not a slide-in assignment sidekick. Sharing the key
causes cross-contamination:

- User resizes quiz sidekick to 450 px → stored. Chat-route panel initialises,
  clamps 450 px to its max of 380 px.
- User resizes chat-route panel to 250 px → stored. Quiz sidekick initialises,
  clamps 250 px to its min of 280 px.

Fix: rename `ChatRoute`'s right-panel `storageKey` to
`"praxis.panel.chat-right.width"` (default 280, min 220, max 380) and update
the two related test assertions in
`packages/ui/src/__tests__/chat-route.test.tsx` (lines 453 and 460) from
`"praxis.panel.sidekick.width"` to `"praxis.panel.chat-right.width"`.

The quiz/homework sidekick key (`praxis.panel.sidekick.width`) remains
unchanged.

Origin: review of `epic-ui-redesign-ground-up-chat-workspace-side-panels-restyle`.
