---
id: idea-wire-inline-question-set-in-chat-tab-body
kind: idea
stage: parked
tags: [ui, follow-up]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Wire `<InlineQuestionSet>` into `chat-tab-body.tsx` for N>1 pending detection

## Brief
The `<InlineQuestionSet>` component shipped in `story-questions-tabbed-display` (commit `48c11ebb`) — paged chassis for N in-flight structured questions, 18 tests, ready to consume. But the **detection + routing** that picks it over the stacked-card default when N > 1 `ask_student_question` calls arrive in the same turn wasn't implemented in that story (deferred per the design-flaw escape hatch).

## What's needed
- Edit `packages/ui/src/components/chat-tab-body.tsx` (or wherever per-mode tab bodies handle the items list)
- Detect when N > 1 pending `kind: "structured-question"` items exist in the same turn
- When detected, route them to a single `<InlineQuestionSet>` instead of N stacked `<StructuredQuestionCard>` instances
- Pass the questions array, current-index state, answers map; wire onTabClick, onAnswer, onSubmit, onClarifyInChat to the existing IPC handlers

## Why deferred
The orchestration depends on turn-boundary grouping logic in the quick-check bridge hook. That logic is non-trivial to extract cleanly without a small refactor — it needs to know which `tool_call_id`s came in the same turn from the same agent stride. The component-level work was finishable cleanly without it; the routing was the right place to slow down and split.

## Sizing
Small to medium story (~100-200 LoC). Mostly the detection predicate + the dispatch swap.

## Origin
- Story: `story-questions-tabbed-display` (commit `48c11ebb`); decision note in story implementation notes.
