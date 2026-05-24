---
id: story-questions-tabbed-display
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
