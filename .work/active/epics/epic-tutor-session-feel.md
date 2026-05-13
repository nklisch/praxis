---
id: epic-tutor-session-feel
kind: epic
stage: implementing
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

## Decomposition

Split by capability. All four children are independent — no critical path —
which gives autopilot maximum parallelism in a single wave. The cancellation
work is the largest (touching three engine adapters + tools + sub-agents)
but doesn't share types with the UI features, so it parallelizes cleanly.

Foundation roll-forward: none. `docs/ARCHITECTURE.md:310,343` already
describe the chat surface and the sub-agent transparency contract; the
cancellation work is a behavior fix to honor that contract, not a new
boundary. The composer queue and tool-call persistence change interaction
patterns within the existing surface. The tab rename is purely a string
move.

Key map findings that shape the decomposition:

- The cancellation gap is concrete: `DispatchMeta` at
  `packages/tools/src/registry.ts:17-20` carries only `callId`. There's no
  `signal` in tool dispatch, and `runConceptExplorer` has no abort
  parameter. The signal dies at the engine adapter and never reaches
  tools or sub-agents.
- The "tool calls too fast to read" complaint already has
  `MIN_INTERSTITIAL_VISIBLE_MS = 800` in `use-streamed-send.ts:56`. The
  remaining gap is persistence: `episodicToItems` replays interstitials
  as instantly-settled with no pacing, and the live UI may move on from
  settled interstitials too quickly. The fix is "tool calls as
  first-class thread artifacts," not "more pacing."
- The chat tab title is rendered from server-side `TabSummary.title` at
  `tab-strip.tsx:48`; `ModeMeta` already has per-mode names that the
  in-session header uses. Rename is mostly aligning the tab title with
  the existing SSOT.

### Child features

- `epic-tutor-session-feel-tutor-tab-rename` — pick the teaching-shaped
  term, update `ModeMeta` strings + the tab-title flow in
  `open-session-in-tab.ts`; bring tab labels into the existing SSOT. —
  depends on: `[]`
- `epic-tutor-session-feel-cancellation-propagation` — add `signal` to
  `DispatchMeta`/`ToolContext`, thread through all three engine adapters,
  propagate into `runConceptExplorer` and other sub-agent entries, abort
  in-flight sub-agent sessions on parent abort. — depends on: `[]`
- `epic-tutor-session-feel-composer-queue` — decouple composer from
  `isStreaming`; submitted messages enqueue as pending bubbles in the
  thread; flush on turn-end. — depends on: `[]`
- `epic-tutor-session-feel-tool-call-thread-persistence` — settled tool
  calls remain as first-class thread artifacts (compact-but-readable,
  expand/collapse); replay from episodic produces the same shape as live
  stream; scroll behavior doesn't race past tool entries. — depends on:
  `[]`

### Decomposition risks

- **Cancellation propagation is the largest and riskiest** — touching
  three engine adapters, tool dispatch, and sub-agent flow at once.
  Splitting into "tools-only" and "sub-agents-only" looks tempting but
  the two share the abort tree and the split adds ceremony for no net
  gain. Feature-design pass should consider whether sub-agent abort can
  reuse the same `conv.abort()` path the parent engine already uses
  (recursive walk for free).
- **Tool-call persistence root cause is fuzzy** — `MIN_INTERSTITIAL_VISIBLE_MS`
  already exists at 800ms, yet the user reports tool calls still flash by.
  Feature-design pass must reproduce the specific frustration first
  (auto-scroll racing past? settled-state collapses out of view?
  sub-agent steps inside a tool?) before committing to the persistence
  framing.
- **Composer queue UX is the most novel** — pending bubbles inline vs.
  separate zone, edit-while-pending, flush-as-one vs. flush-as-many. The
  design pass should land a concrete shape before implementation, not
  iterate at code time.
- **Tab rename backfill** — existing rows in the `tabs` table have stale
  titles. Migration vs. lazy refresh is a small decision but easy to
  miss.
