---
id: epic-tutor-session-feel-composer-queue
kind: feature
stage: drafting
tags: [ui, chat, tutor-ux]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Composer queue while streaming — keep typing, send when it's your turn

## Brief

The composer locks while the tutor is streaming
(`packages/ui/src/components/chat-tab-body.tsx:325`:
`disabled={isStreaming || examLockdown}`), so a follow-up thought is lost
unless the user remembers to retype it after the turn ends. There's no
queue, no draft preservation across the lock, no visual signal that "the
tutor is busy, but I can still type."

This feature decouples typing+submission from `isStreaming`. The composer
is typable any time. Submitting during a streaming turn enqueues the
message instead of locking it out: queued messages render in the thread
as pending bubbles (visually distinct from sent / delivered), the user can
see and (at design time TBD) edit or cancel them while pending, and the
queue flushes automatically when the engine turn ends. The exam-mode
lockdown still locks the composer hard — that's a different concern.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent UI/state feature — wave 1, parallelizable
  with the three other children.

## Foundation references

- `docs/ARCHITECTURE.md:343` — chat surface description; this feature
  changes the composer's interaction model within the existing surface.

## Anchors

- Composer component — `packages/ui/src/components/composer.tsx:44-132`
  (`disabled` prop; send button gated at line 125)
- Streaming state — `packages/ui/src/hooks/use-streamed-send.ts:127-537`
  (the hook that owns `isStreaming`)
- Composer mount in tab body —
  `packages/ui/src/components/chat-tab-body.tsx:80` (`useStreamedSend`)
  and line 325 (`disabled={isStreaming || examLockdown}`)
- Send entry — `useStreamedSend.send()` (line 140-157)
- User message persistence (server-side) —
  `SessionServiceImpl.send → recordUserMessage` at
  `packages/core/src/services/session-service.ts:195-205`
- Episodic recording —
  `packages/core/src/session/episodic.ts:94-105` (`type:
  "user_message"`)

## Design notes for feature-design

- Queue state: lives in `useStreamedSend` or a sibling hook?
- Rendering: queued messages appear inline in the thread as pending
  bubbles. Visual treatment (faded, "pending" tag, animated dot)?
- Flush semantics: send queued messages one-at-a-time after the turn
  ends (each as its own turn), or combine into one super-message? Latter
  loses temporal structure; former is more natural for tutoring.
- Cancellation: can the user remove a pending message before it flushes?
- Edit-while-pending: same question — allowed or not? Latter is simpler.
- Exam-mode lockdown: continues to lock hard; the queue is a teach/quiz
  affordance.
- Server-side: nothing to change. Each flush is just a `session.send`
  call the queue triggers.
