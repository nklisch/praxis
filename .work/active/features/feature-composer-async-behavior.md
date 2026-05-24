---
id: feature-composer-async-behavior
kind: feature
stage: drafting
tags: [ui, ux]
parent: epic-chat-interaction-ux-overhaul
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Composer: queue messages during in-flight turns, expose a cancel control

## Brief
The chat composer locks the send button while the tutor is mid-turn, blocking the user from typing or sending a follow-up until the response settles. Two coupled changes: (1) keep send active so the user can queue additional messages — they should land in order behind the in-flight turn rather than being gated on it; (2) introduce a cancel control (replacing or sitting next to send) that aborts the current tutor turn via the existing AbortSignal path so the user can interrupt long thinking. Together these turn the composer from a strict request/response gate into a real conversational input surface.

## Source idea
`idea-composer-queue-and-cancel` (parked 2026-05-24).

## Foundation reference
`docs/UX.md` teach-modality composer section now states: "The composer never locks while the tutor is mid-turn — additional messages typed during an in-flight response queue and dispatch in order behind the active turn, and the send button transforms into a cancel control during in-flight state that aborts the current turn via the engine's AbortSignal path." Feature design fills in the visual treatment (queued-message pill list? send/cancel toggle vs separate buttons? error-on-queued-message handling?).
