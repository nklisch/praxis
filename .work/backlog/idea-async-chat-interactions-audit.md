---
id: idea-async-chat-interactions-audit
created: 2026-05-24
tags: [ui, refactor]
related: [idea-composer-queue-and-cancel, idea-user-question-no-dismiss-on-submit]
---

Across the app, a lot of buttons that trigger work which hits the chat / LLM pipeline freeze and wait synchronously for the round-trip to complete instead of returning control to the user immediately. The composer send button locks, the "ready to materialize" button freezes, the user-question submit greys out for the duration, and there are presumably more — every interaction that fans out into a chat turn currently gates the UI on it. This is the wrong default: nothing in a tutoring loop should block the user from doing the next thing while the previous request is in flight. We need to audit every UI surface that interacts with the chat / engine layer, catalogue which ones synchronously await and which already fire-and-forget, then refactor the sync ones to dispatch optimistically with proper async error handling (failed-to-send badge, retry, surfaced error in the activity strip, etc.) instead of locking. The deliverable is a comprehensive sweep + uniform pattern for "click fires the action, UI updates immediately to show in-flight state, errors surface asynchronously", not a one-off fix for a single button.
