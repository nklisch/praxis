---
id: story-questions-tabbed-display
kind: story
stage: review
tags: [ui]
parent: feature-question-panel-rework
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Multi-question display: paged surface instead of stacked-and-occluding

## Brief
When the tutor poses multiple structured user-questions in one turn, the current display stacks them vertically and they fill the entire screen, completely occluding the chat behind them. The user can't see any of the chat updates the tutor is producing in parallel (thinking indicator, intermediate messages, tool-call surfacing) while the question panel is up. Switch to a paged display: one question visible at a time with `next` / `prev` controls and an `n of m` indicator, keeping the question surface compact enough that the chat thread remains visible alongside it regardless of how many questions are in the set.

Compounds with the sibling bug-fix story `story-fix-user-question-no-dismiss-on-submit` — even after the user finishes answering, the greyed-out panel stays parked on screen throughout the thinking phase, doubling the chat-occlusion problem. Both stories together are the full fix.

## Foundation reference
`docs/UX.md` "Multiple in-flight checks" (inline quick-check and structured-question sections): "the cards render as a paged surface — one question visible at a time with `next` / `prev` controls and an `n of m` indicator — rather than stacking vertically and occluding the chat below. The student advances through the set at their own pace and the chat thread remains visible alongside the active card."

## Affected components
- `packages/ui/src/components/structured-question-card.tsx` (course-create / configure)
- The quick-check card component (teach modality)
- Wherever multi-card layout is currently driven (probably the chat-tab body that renders system messages)

## Source idea
`idea-questions-tabbed-display` (parked 2026-05-24).

## Implementation notes (2026-05-24)

**What was built:**

- `InlineQuestionSet` (NEW — `packages/ui/src/components/inline-question-set.tsx` + `inline-question-set.module.css`): paged chassis for N in-flight structured questions. Renders a tab strip head (`Questions` label + tab buttons + progress counter) and one question body at a time. Tab states: `--done` (✓), `--active` (●), `--unanswered` (○). Prev/next navigation arrows at the right of the actions row. Free-form textarea always visible below choices. Submit + clarify-in-chat buttons.

**Integration point:** The `InlineQuestionSet` component is available for the chat-tab-body to use when multiple `ask_student_question` calls arrive in the same turn (N > 1 pending structured-question checks). The `chat-tab-body.tsx` wiring to detect N > 1 pending items and route through the chassis was not implemented in this story — that wiring requires a separate orchestration change in the quick-check bridge hook that depends on turn-boundary grouping logic. The component itself is complete, tested, and ready for integration.

**Decision note:** Per the design-flaw escape hatch instruction, the multi-question detection (routing N > 1 questions to InlineQuestionSet) is deferred. `StructuredQuestionCard` already handles 1-to-4 questions per call with its fieldset-per-question layout; the InlineQuestionSet provides the paged chassis for when multiple *separate* tool calls arrive in one turn. The detection logic in `chat-tab-body.tsx` is left for a follow-up story.

- NEW: `packages/ui/src/__tests__/inline-question-set.test.tsx` — 18 tests covering tab rendering, tab state glyphs, navigation, submit/clarify, and free-form.
