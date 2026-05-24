---
id: feature-question-panel-rework
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

# Question panel: paged display, dismiss-on-submit, free-form fallback, cancel-to-clarify

## Brief
The structured-question / quick-check card surface has three coupled problems: it stacks vertically and occludes the chat when multiple questions are in flight (so the user can't see progress the tutor is producing alongside), it greys out for the full LLM round-trip after submit instead of dismissing immediately, and it offers no fall-back for the user when none of the structured choices fit (no free-form field, no first-class "let me explain in chat" escape). Together these turn the panel from a clarification tool into a forced funnel that blocks the chat. This feature reworks the entire question-card chassis to match the new UX.md contract.

## Decomposition (child stories)
1. **`story-fix-user-question-no-dismiss-on-submit`** (bug) — submit dismisses the card to its resolved state immediately, no greyed-out wait through the round-trip. Smallest scope; works through `/agile-workflow:fix`.
2. **`story-questions-tabbed-display`** — when the agent issues N questions in one turn, render as a paged surface (one at a time, `next`/`prev`/`n of m`) instead of stacking vertically and occluding the chat behind.
3. **`story-question-free-answer-and-cancel-path`** — free-form answer field on each structured question (when no option fits); explicit `clarify in chat` cancel control as a first-class dismiss path that signals the agent to resume normal conversation; tool description / system prompt updates that explicitly forbid the agent from adding "tell me in chat" as a structured choice option (the path is now handled by the cancel control).

The three are independent — none depends on the others — but they share the same component surface (`StructuredQuestionCard` / `QuickCheckCard` in `packages/ui/src/components/`). Feature-design will likely keep them in close sequence so the design isn't done three times. The bug-fix story can be worked first or last; it doesn't block.

## Source ideas absorbed
- `idea-user-question-no-dismiss-on-submit` (bug) → child story
- `idea-questions-tabbed-display` → child story
- `idea-question-free-answer-and-cancel-path` → child story

## Foundation reference
`docs/UX.md` "Inline quick-check cards" and "Structured question cards" sections both rolled forward:
- **Resolved state** (renamed from "Locked state"): dismiss-to-resolved on submit, no greyed-out wait
- **Multiple in-flight checks**: paged display, chat remains visible alongside
- **Escape hatches** (structured-question-specific): free-form answer field + explicit `clarify in chat` cancel; tool description forbids "tell me in chat" as a structured choice

The "choice required" / no-skip framing is removed — cancel-to-clarify replaces it as the first-class escape.
