---
id: feature-chat-tool-call-visibility
kind: feature
stage: drafting
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Chat: surface tool calls inline as ambient editorial interstitials

## Brief

Tool calls are invisible to the student today. `useStreamedSend` consumes
`tool_call` and `tool_result` events but only uses them to harvest renderable
results (citations, drafts, notes, due-cards) — see
`packages/ui/src/hooks/use-streamed-send.ts:116-189`. The `tool_call` event
itself never produces UI; the student sees a pause, then the tutor's text.
For long-running tools (textbook retrieval, grading, exploration drafts) the
pause can stretch for several seconds with no signal that anything is
happening.

This feature renders each in-flight tool call as a compact, ambient
interstitial in the message stream — italic editorial copy on its own line,
inline between turns, e.g. "looking up algebra II prerequisites…" or
"grading your work…". Once the tool returns, the line either disappears,
collapses to a past-tense summary, or stays as quiet context — the design
phase decides which based on tool semantics. The pattern should feel like
the same restraint the `<ActivityRail />` uses for background work: present
when relevant, never demanding attention.

The feature owns:

- A mapping from tool name → human-readable present-progressive label and an
  optional past-tense settled label. This belongs near the tool registry so
  the source of truth lives where new tools are added, not scattered in the
  UI. (Candidate location: alongside `composer-verbs-meta.ts` or as a sibling
  table in `@praxis/tools` exposed to the renderer.)
- Stream handling in `useStreamedSend` (or a successor hook) that emits an
  in-flight item per `tool_call` event and resolves it on the matching
  `tool_result` (the existing `lastToolCallName` pairing logic is fragile
  and assumes strict serialization — verify or replace).
- Rendering inside `<MessageBubble>` (or a new sibling component for between-
  bubble interstitials) that hits the editorial primitives — no badges, no
  spinning icons, no dopamine taps. Static italic text, optional muted
  ellipsis cadence at most.
- Replay parity through `episodicToMessages` so that re-opening a tab shows
  the same interstitials a live viewer saw, in the same positions relative
  to bubbles.

Editorial guardrails from `docs/VISION.md` are non-negotiable:

- No emoji, no icons-as-attention-grabbers
- No "Tool: foo()" technical leakage — student sees what the tutor is doing,
  not the underlying API
- Errors during tool execution should still surface (don't silently hide
  failed calls), but the framing remains pedagogical, not diagnostic

Out of scope: changing what tools the model can call, surfacing tool inputs
or outputs (those already render as their own components — citations, drafts,
notes), or building a debug panel. This is purely about ambient awareness in
the conversation flow.

## Source

Promoted from `idea-show-tool-calls` (parked 2026-05-09).
