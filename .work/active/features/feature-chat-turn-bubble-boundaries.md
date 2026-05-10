---
id: feature-chat-turn-bubble-boundaries
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

# Chat: split assistant text into one bubble per model turn

## Brief

`useStreamedSend` opens a single assistant bubble per `send(...)` call and
funnels every `model_message` event into it (see
`packages/ui/src/hooks/use-streamed-send.ts:81-115`: one
`assistantMsgId = nextId()`, then `setMessages(... id === assistantMsgId)` for
the lifetime of the turn). When the agent runs multiple model turns inside a
single user send — common during a tool-using exchange — all of the model's
prose collapses into one growing bubble that visually concatenates distinct
moments of thinking.

This feature splits the bubble. Each new model turn should open its own
bubble; tool calls (handled by `feature-chat-tool-call-visibility`) sit
between bubbles as ambient interstitials.

The split must be driven off engine events, not heuristics on text content.
Inspect the `EngineEvent` stream coming from `client.session.send(...)` and
identify the right boundary — likely the first `model_message` after a
`tool_result` (i.e., the turn after the tool round-trip), or a dedicated
`assistant_turn_start` / `assistant_turn_end` signal if one exists or needs
to exist. The design phase verifies what the engine adapters actually emit
(`packages/engines/src/{claude-code,codex,direct}/events.ts`) and decides
whether to add a normalized boundary event or infer it from the existing
stream.

The split must also reflect correctly when replaying persisted history via
`episodicToMessages` (`packages/ui/src/hooks/episodic-to-messages.ts`) so a
re-opened tab shows the same bubble structure as the live stream produced.
Otherwise the live and replayed views diverge on the same conversation.

Out of scope: visual styling beyond what's necessary to make distinct bubbles
read as distinct (vertical rhythm, label repetition rules). Editorial
constraints from `docs/VISION.md` apply — no avatars, no aggressive
separators.

## Source

Promoted from `idea-chat-turn-formatting-between-turns` (parked 2026-05-09).
The original parking note suggested an `assistant_message_start` /
`_delta` / `_complete` event pattern; the design phase should treat that
as one option to evaluate against what the engine adapters already emit, not
as a fixed contract.
