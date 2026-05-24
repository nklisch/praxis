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

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass inherits them.)*

- **Cancel control shape**: Send button transforms into Stop (`■`) in place during in-flight state — single affordance, swaps between `Send ↑` (idle) and `Stop ■` (in-flight). Familiar ChatGPT/Claude.ai pattern. The composer never disables; only the button's role changes.
- **Queued message visualization**: Inline ghost bubbles in the chat thread (where the message will eventually appear) with a per-bubble `edit / remove` affordance until dispatch. The faded/italic styling distinguishes queued from sent. Optimistic UI reads forward; per-item cancel is a hard requirement.
- **Queue failure surfacing**: Failed-to-send badge inline on the originating ghost bubble + one-click retry. Matches the `optimistic + async error` pattern the sibling refactor feature codifies. After ~30s unattended, the activity strip picks up the failure as a persistent notification (escalation tier from the refactor pattern).
- **Queue depth cap**: Unlimited. Trust the user; cancel is always available. Avoids re-introducing the kind of locked state this epic is removing.

## Mockups
- Inherits design system: `.mockups/design-system/tokens.css`
- Screens · state mocks at `.mockups/screens/feature-composer-async-behavior/`:
  - `index.html` — navigator (2×2 grid of states)
  - `state-idle.html` — baseline; Send button; no in-flight turn
  - `state-in-flight-empty.html` — tutor streaming; Send transformed to Stop; composer remains fully active
  - `state-in-flight-queued.html` — tutor streaming; 2 queued ghost bubbles with per-bubble `edit` / `remove` affordances and ordered position pips
  - `state-failed-retry.html` — queued #1 hit a transient engine error; inline failed-to-send badge + retry; activity-strip escalated the failure as a persistent banner after 38s
- Shared interactive feel demo: `.mockups/flows/async-chat-interactions/01-composer-queue.html`
