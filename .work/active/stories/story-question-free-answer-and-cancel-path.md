---
id: story-question-free-answer-and-cancel-path
kind: story
stage: implementing
tags: [ui]
parent: feature-question-panel-rework
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Question card: free-form answer field + explicit cancel-to-clarify path + tool-description guardrail

## Brief
The structured user-question tool needs three coupled escape hatches the current shape lacks:

1. **Free-form answer field per question.** Alongside the structured choices, each question exposes a typed-text input so the user can give a real response when none of the choices fit. Avoids the "forced near-match pick" failure mode.
2. **Explicit `clarify in chat` cancel control.** A first-class dismiss path that doesn't submit an answer — instead it tells the agent the user wants to resolve the question through normal conversation. The card transitions to a dismissed state and the chat composer focuses; the agent receives a structured cancel signal (separate from "no answer") so it can drop the structured-question framing and resume free Q&A.
3. **Tool-description guardrail.** The agent-facing description of the `ask_student_question` tool (and quick-check equivalents) explicitly forbids adding "tell me in chat" / "I'll explain in chat" / "let me clarify" as one of the structured choices. That path is already handled by the cancel control; surfacing it as a choice clutters the option list and gives the agent a wrong-shaped affordance.

Together these stop the question UI from being a forced funnel.

## Foundation reference
`docs/UX.md` "Structured question cards" section now states: "Each structured question carries two escape hatches alongside the structured choices: a free-form answer field for when no option fits, and an explicit `clarify in chat` cancel control that dismisses the card and signals the agent that the student wants to resolve the question through normal conversation instead. The tool description forbids the agent from adding 'tell me in chat' / 'explain in chat' as a structured choice — that path is already available through the cancel control."

## Affected surfaces
- `packages/ui/src/components/structured-question-card.tsx` — add free-form field + cancel control
- `packages/tools/src/` — `ask_student_question` tool description / system prompt fragment (find exact location during fix)
- Wire the cancel signal back to the agent as a distinct tool-result kind (not "no answer" — explicitly "user requested chat clarification")
- The quick-check equivalent for teach modality if the same shape applies

## Source idea
`idea-question-free-answer-and-cancel-path` (parked 2026-05-24).
