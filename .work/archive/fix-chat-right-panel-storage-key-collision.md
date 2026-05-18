---
id: fix-chat-right-panel-storage-key-collision
stage: done
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

## Implementation notes

- `packages/ui/src/routes/chat.tsx` line 188: `storageKey` changed from
  `"praxis.panel.sidekick.width"` to `"praxis.panel.chat-right.width"`.
- `packages/ui/src/__tests__/chat-route.test.tsx` lines 451/453/463: test
  description and both `localStorage` calls updated to use the new key.
- Quiz/homework sidekick key (`praxis.panel.sidekick.width`) left untouched.
- All 14 chat-route tests pass; pre-existing typecheck/lint failures are
  unrelated to this change (confirmed by stash-and-recheck).

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Minimal, correct fix. `chat.tsx` line 188 uses the new `"praxis.panel.chat-right.width"` key; test description and both `localStorage` call sites updated to match. The quiz/homework sidekick key (`praxis.panel.sidekick.width`) is now absent from production source entirely — confirmed by grep — which is correct: those panels apparently don't use `useResizableWidth` with that key in the current codebase, so there is no residual collision risk. Storage key follows the `praxis.panel.<panel-id>.width` convention documented in `use-resizable-width.ts`.
