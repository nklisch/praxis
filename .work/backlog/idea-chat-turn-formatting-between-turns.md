---
id: idea-chat-turn-formatting-between-turns
created: 2026-05-09
tags: [ui]
---

Text boxes in chat aren't formatted right between turns. When the agent continues a response across multiple model turns, each new turn should produce a new, separately-formatted message bubble — not append to the previous one (or look like it does).

Pattern suggestion: each `assistant_message_start` event opens a new bubble; subsequent `assistant_message_delta` appends to the most-recent bubble; `assistant_message_complete` seals it. Verify the streaming pipeline in `use-streamed-send.ts` actually splits on turn boundaries this way.
