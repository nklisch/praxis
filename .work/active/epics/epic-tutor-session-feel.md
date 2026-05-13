---
id: epic-tutor-session-feel
kind: epic
stage: drafting
tags: [ui, chat, tutor-ux]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tutor session feel — the chat tab is a tutoring session, not a chatbot

## Brief

The "chat" tab is the surface where the student actually meets the tutor, but
today it borrows shape and language from generic LLM chat products: the tab
is literally called "chat," the composer locks while the model is streaming
(so a follow-up thought is lost unless the user remembers to retype it), tool
calls flash by faster than a human can read, and the stop button visibly
returns control while sub-agents keep running behind it. The v0.1.1
`feature-agent-transparency-ux` ship made tool calls and sub-agent activity
visible — this epic is the next layer up: making the *session* feel like
tutoring rather than chat.

This epic polishes the chat-thread session feel along four threads: rename
the tab to a teaching-shaped term, let the user queue messages while the
tutor is working, give tool-call artifacts enough time/persistence to be
readable, and make the stop button actually stop everything (including
in-flight sub-agents). Together these turn the chat tab from "talk to an
LLM" into "spend time with a tutor."

## Scope absorbed from backlog

This epic absorbs four parks:

- `idea-rename-chat-tab-teaching-term` (rename — Tutor / Teacher / Lesson /
  Session; final name decision at epic-design)
- `idea-chat-message-queue-while-streaming` (typable composer with visible
  pending-queue while the tutor's turn is running)
- `idea-tool-call-artifact-readability` (persist tool-call entries in the
  thread vs. minimum-display-delay — open question for epic-design)
- `idea-stop-button-cancels-sub-agents` (confirmed at scope time to belong
  here as a child story; cancellation propagation is part of the session
  experience, not a standalone plumbing fix)

## Anchors (current implementation)

- Chat tab dispatch — `packages/ui/src/components/` (per-mode `ChatTabBody`
  variants: `QuizTabBody`, `HomeworkTabBody`, `ExamTabBody`, `BootstrapTabBody`,
  `StudySkillsTabBody`)
- Sub-agent surfacing — `SubAgentRegistry` in `@praxis/core`; fanout via
  `praxis.subAgent.events` IPC; `<SubAgentBlock>` in UI
- Session loop / cancellation — `SessionServiceImpl` in
  `packages/core/src/services/session-service.ts`
- Engine adapter cancellation paths — `packages/engines/src/{claude-code,codex,direct}/`
- Tab system + tab labels — `packages/ui/src/` tabs primitives
  (`useTabs`, `openSessionInTab`, `tab-body-isolation` pattern)

## Why now

`feature-agent-transparency-ux` made the tutor *visible*; this epic makes the
tutor *feel right*. The harder polish (queueing, cancellation propagation)
is also where v0.1.1 sessions feel most like a chatbot — addressing them now
sets the tone for everything else that ships into the chat surface.

## Design questions for epic-design

- Naming: Tutor / Teacher / Lesson / Session — does the chosen name need to
  vary by mode (Quiz / Homework / Bootstrap all live in this tab), or is one
  name right across modes?
- Message queue: do queued messages render inline as pending bubbles in the
  thread, or in a separate queue zone above the composer? Editable while
  pending? Flushed automatically when the turn ends, or held until the user
  confirms?
- Tool-call readability: persist as first-class thread entries, enforce a
  minimum-visible-duration animation, or both? How does this interact with
  the existing episodic log that already stores tool events?
- Stop-cancellation: does cancellation propagate via `AbortController`
  threaded through the sub-agent registry, or via a higher-level
  "session-aborted" event that each adapter listens for? What's the
  contract for tools currently mid-flight?
