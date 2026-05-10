---
id: gate-docs-pattern-tab-body-isolation-api
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
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

## Implementation notes
Updated chat.tsx citation from `:98-106` → `:106-110` (verified: the tab-body mounting block starts at 106). Updated Example 2 destructure to use `items` and `loadHistory`. Note: the actual `UseStreamedSendResult` interface still includes `clearMessages` alongside `loadHistory` (the hook was not fully migrated); the example uses `loadHistory` per the story requirement but `clearMessages` has not been removed from the API. Prose updated to reference `items` (stream of messages and interstitials) and explain `loadHistory`. Story audit cited `:98-106` as the old range — verified the new range `:106-110` is accurate.

## Review (2026-05-10)

Larger prose rewrite — read in full. Example 1 (chat.tsx:106-110 mounting block) and Example 2 (ChatTabBody with `items`/`loadHistory` destructure) both look accurate against the current source. The discrepancy that `clearMessages` still lives in `UseStreamedSendResult` is noted in the story; the pattern skill correctly shows the `loadHistory` path per the design intent, which is the right choice for documentation. The "When NOT to Use" section correctly mentions `StudySkillsTabBody` is absent — wait, it mentions `QuizTabBody`, `ExamTabBody`, `HomeworkTabBody`, `BootstrapTabBody`. That's a nit: `StudySkillsTabBody` (Phase 18) isn't listed here, but that's cosmetic — the prose says "each have their own tab body component" which is still correct. Not a blocker. Approve.
