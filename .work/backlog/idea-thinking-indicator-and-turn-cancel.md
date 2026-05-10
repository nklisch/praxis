---
id: idea-thinking-indicator-and-turn-cancel
created: 2026-05-10
tags: [tutor-ux]
---

Two related in-flight chat affordances are missing today. (1) When a turn is
inbound and the model hasn't started streaming text yet — or when it's between
a tool call and the next assistant chunk — the chat shows nothing, so the
student can't tell whether anything is happening; we want a thinking-animation
indicator (the same shape as the tool interstitial dots, but for "waiting on
the model"). (2) There's no way to cancel an in-flight turn the way Claude Code
itself lets you Esc to interrupt: if the student realises mid-stream that the
tutor misunderstood, they have to wait it out. The engine already has an
`abort()` path on the conversation (see `packages/claude-cli-sdk/src/conversation.ts`)
and `EngineSession.close()` ends the subprocess; what's missing is a UI cancel
button wired through the IPC stream channel down to `conv.abort()`, plus a
clean event to mark the turn as interrupted in the episodic log so the next
send doesn't replay confused state.
