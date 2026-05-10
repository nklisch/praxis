---
id: gate-docs-pattern-tab-body-isolation-api
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `tab-body-isolation.md` cites stale chat.tsx lines and outdated `useStreamedSend` API

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/tab-body-isolation.md:19` (line cite) and
  `:50` (API destructure example)
- Code: `packages/ui/src/routes/chat.tsx:106-110` (mounting block);
  `packages/ui/src/hooks/use-streamed-send.ts:56-71` (API: `items`,
  `isStreaming`, `lastError`, `send`, `loadHistory` — `clearMessages`
  removed)

## Current doc text
> **File**: `packages/ui/src/routes/chat.tsx:98-106`
> Example 2 shows `const { messages, isStreaming, lastError, send, clearMessages } = useStreamedSend(client);`

## Reality
The mount block is now at `chat.tsx:106-110`. `useStreamedSend`'s public
API is `{ items: ChatStreamItem[], isStreaming, lastError, send, loadHistory }`
— `messages` was renamed `items` (a union of message and tool-interstitial
entries) and `clearMessages` was removed in favor of `loadHistory`. This
is the central API shift from the chat-tool-call-visibility +
chat-turn-bubble-boundaries features in this bundle.

## Required edit
- Update the chat.tsx line range to `chat.tsx:106-110`.
- Update Example 2's destructure to
  `const { items, isStreaming, lastError, send, loadHistory } = useStreamedSend(client);`
- Update the prose ("Each tab instance has its own independent hook
  state") to mention `items` (a stream of messages and interstitials)
  rather than "message log."
