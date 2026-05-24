---
id: idea-composer-queue-and-cancel
created: 2026-05-24
tags: [ui]
---

The chat composer locks the send button while the tutor is mid-turn, which blocks the user from typing or sending a follow-up until the response settles. Two related fixes: (1) keep send active so the user can queue additional messages — they should land in order behind the in-flight turn rather than being gated on it; (2) introduce a cancel button (replacing or sitting next to send) that aborts the current tutor turn via the existing AbortSignal path so the user can interrupt long thinking. Together these turn the composer from a strict request/response gate into a real conversational input surface.
