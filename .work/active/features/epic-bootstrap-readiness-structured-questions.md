---
id: epic-bootstrap-readiness-structured-questions
kind: feature
stage: drafting
tags: [bootstrap, tutor-ux, tools]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Tutor-initiated structured questions

## Brief

The bootstrap agent regularly wants to ask the student a structured
question — "use the canonical pack, the textbook, or both?", "merge these
two lessons or keep them separate?" — and today can't. The Claude Code
built-in `AskUserQuestion` is now hidden from the model entirely (via
`story-fix-block-claude-code-builtins-from-tutor`, which set `tools:
"none"` on `createConversation`), and there's no first-party Praxis tool
that fills the gap. So the agent falls back to text apologies like
"going with the recommended approach" and the student loses the
decision-point.

This feature adds a first-party Praxis tool — working name
`ask_student_question` — that gives the agent the same affordance via
the existing human-in-the-loop dispatch mechanism documented in
`docs/SPEC.md:109` ("Human-in-the-loop tool dispatch"). The agent emits
`tool_call: ask_student_question({ questions: [{ header, prompt,
multiSelect, options: [{ label, description }] }] })`. The handler routes
through `QuickCheckService` (or a sibling service modelled after it),
which holds the tool-result Promise open, emits a `pending` event the
renderer subscribes to, and resolves with the student's answer when a
`<StructuredQuestionCard>` (or a re-used quick-check card) reports the
choice back. The model receives the answer as a tool result in the same
turn and continues seamlessly.

The schema mirrors Claude Code's built-in `AskUserQuestion` shape so
the model's instinct lines up with the available tool — multiple
questions per call, each with `header`, `multiSelect`, and an option
list with `label` + `description`. Reference shapes:
`/home/nathan/dev/claude-cli-sdk/src/tools/builtin-schemas.ts`
(the upstream sdk's `AskUserQuestionInput`) and Claude Code's
documentation. The tool is added to `bootstrapMode.toolNames` and
`configureMode.toolNames` initially; teach mode can add it later when
the curriculum design calls for tutor-driven branching.

This feature does NOT bring back the Claude Code built-in
`AskUserQuestion` (built-ins remain blocked), does NOT change the engine
adapter (no `tools.custom` injection — the new tool registers through
the existing MCP bridge like every other Praxis tool), and does NOT
expand the chat UI's surface beyond a structured-question card.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: standalone capability — reuses existing
  human-in-the-loop infrastructure. No cross-feature dependencies.

## Foundation references
- `docs/SPEC.md:109-142` — Human-in-the-loop tool dispatch. This is the
  pattern to reuse. The dispatch mechanics, abandonment semantics, and
  multiple-in-flight-checks behaviour all transfer.
- `docs/CONTRACT.md:1402-1406` — `quick_check.*` tool listing pattern;
  `ask_student_question` joins this category with a different shape
  (multi-question, structured-options).
- `packages/tools/src/quick-check/` — existing quick-check tool family;
  template for the new tool's structure.
- `packages/core/src/services/` — `QuickCheckService` lives here;
  pattern to extend or sibling.
- `packages/ui/src/components/` — existing quick-check card components;
  template for the structured-question card.
- `story-fix-block-claude-code-builtins-from-tutor` (archived) — the fix
  this feature builds on top of; explains why this can't just be
  AskUserQuestion intercept.

## Originating backlog
- `idea-tutor-structured-questions-via-custom-mcp` — consumed by this
  feature; will be removed from `.work/backlog/` as part of epic-design.

<!-- Design pass (`/agile-workflow:feature-design`) will fill in:
       - The Zod input schema (multi-question, option shape)
       - Tool handler dispatch through QuickCheckService (or sibling)
       - Mode toolName / prompt-fragment updates
       - UI card design (mirror existing quick-check cards or new shape)
       - SPEC.md / CONTRACT.md roll-forward
       - Test approach (handler unit + UI + end-to-end pending→resolve) -->
