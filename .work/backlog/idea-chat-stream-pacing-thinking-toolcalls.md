---
id: idea-chat-stream-pacing-thinking-toolcalls
created: 2026-05-10
tags: [ui, chat]
---

Thinking blocks and tool calls scroll by too fast in the chat to read. Two
contributing factors (parked together because they share a root surface):

1. `packages/ui/src/hooks/use-streamed-send.ts` has no handler for
   `event.type === "thinking"`. Thinking content arrives off the engine
   stream and is silently dropped — only the `thinking` boolean (toggled at
   stream start and around `tool_result`) drives the
   `<ThinkingIndicator />`. The model's actual reasoning text never renders.

2. `<ToolInterstitial>` (packages/ui/src/components/tool-interstitial.tsx)
   transitions `in_flight → settled` instantly. A fast tool can flash in
   and out before the user reads it. There is no minimum display time, no
   easing, and the auto-scroll on `messageCount` change races past the
   interstitial.

Likely shape of the fix: add a `thinking` event branch in `use-streamed-send`
that surfaces a reasoning summary (truncated or collapsible), and add a
hold-time / min-visible-ms to tool interstitials. Pair with a non-smooth
scroll-to-bottom or scroll-only-when-near-bottom heuristic so users can
pause to read mid-stream.

Surfaced from the same user report as
`story-fix-quickcheck-toolcontext-wiring` (2026-05-10) — kept separate
because it's a different root cause and a wider UX change.
