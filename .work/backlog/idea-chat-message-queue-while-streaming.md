---
id: idea-chat-message-queue-while-streaming
created: 2026-05-13
tags: []
---

Allow the user to type and submit chat messages while the tutor is still streaming/working, rather than locking the composer until the model's turn ends. Submitted-but-not-yet-delivered messages should sit in a visible queue (rendered in the message stream, marked as pending/queued) and only flush to the engine when it's the user's turn again. This removes "I had a follow-up thought but had to wait" friction — common during long bootstrap explorations or multi-tool turns — and gives the user a clear, editable holding area instead of forcing them to remember or retype.
