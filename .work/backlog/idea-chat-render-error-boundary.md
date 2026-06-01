---
id: idea-chat-render-error-boundary
created: 2026-05-31
tags: []
---

A malformed or unexpected chat stream item can take down the whole UI instead of failing locally in the message/tool-call surface, as seen when a structured course draft summary reached a React text position and crashed rendering. The chat workspace and authoring panes should contain renderer exceptions around individual message/tool items and show a recoverable fallback so one bad persisted event or tool result does not blank the entire app.
