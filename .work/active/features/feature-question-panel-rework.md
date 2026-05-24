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

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass inherits them.)*

- **Paged surface chrome**: Tab strip across the top of the card group when N questions are in flight. Pattern: `[1 ✓] [2 ✓] [● 3] [4 •]` — answered carry `✓`, current carries `●`, unanswered carry `•`. Click any tab to jump (no forced linear walk). Reads as "a related set", emphasizes free navigation, scales beyond two questions cleanly.
- **Free-form answer field**: Always visible below the structured choices with `or, in your own words...` placeholder. No expand affordance, no segmented Choose/Write toggle. Single Submit handles either source (chosen radio OR free-form text — submit logic prefers free-form when populated, otherwise picks chosen).
- **`clarify in chat` cancel control**: Secondary text button right of Submit, same row. Reads as an alternative path, not a destructive dismiss. Submitting via `clarify in chat` sends a structured `tool_result` signaling "user wants to discuss this in chat" so the agent resumes normal conversation without thinking it was answered structurally.
- **Resolved state**: Collapsed summary chip in the chat history — one line: `⤷ you answered — "<answer>" · <time>`. Minimal vertical real estate. Clickable to expand back to full card if user wants to revisit. The full card never lingers post-submit; the chip is the historical record.
- **Tool-description rule (propagated from foundation)**: `ask_student_question` schema description explicitly forbids "tell me in chat" / "explain in chat" as a structured choice. The `clarify in chat` cancel control owns that path.

## Mockups
*To be filled in by the mockup pass paired with this `--only-questions` run.*
- Screens: `.mockups/screens/feature-question-panel-rework/` — state mocks for single-question / paged tab strip / resolved chip / free-form fallback / clarify-in-chat dismiss states.
