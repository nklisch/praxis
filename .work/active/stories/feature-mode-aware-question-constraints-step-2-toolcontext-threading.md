---
id: feature-mode-aware-question-constraints-step-2-toolcontext-threading
kind: story
stage: review
tags: [content, tool-schema, core]
parent: feature-mode-aware-question-constraints
depends_on: [feature-mode-aware-question-constraints-step-1-types-and-defaults]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Thread `questionConstraints` through `ToolContext`

## Scope
Extend `ToolContext` with `questionConstraints?: Required<QuestionConstraints>` and have `SessionServiceImpl` / `EngineSessionManager` resolve constraints once at session-open and stash on every per-turn call context.

## Implementation
- Edit `packages/core/src/types/tool.ts`:
  - Add `questionConstraints?: Required<QuestionConstraints>` field to `ToolContext`
- Locate the session-open / call-context build in `packages/core/src/services/session-service.ts` and/or `packages/core/src/services/session/engine-session-manager.ts`:
  - When the mode is loaded (`getMode(modeId)`), call `resolveQuestionConstraints(mode.id, mode.questionConstraints)` and stash on the entry
  - When building per-turn `callContext` for `registry.dispatch`, include the stashed constraints
- Add a test in `packages/core/src/__tests__/session-service-tool-context.test.ts` (or extend existing):
  - Open a teach-mode session → ToolContext has teach defaults
  - Open a session whose mode has `questionConstraints: { choiceCount: 3 }` → ToolContext has merged result
  - Open a session whose mode has no `questionConstraints` → ToolContext has DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[mode.id]

## Acceptance Criteria
- [x] `ToolContext.questionConstraints?: Required<QuestionConstraints>` field added
- [x] SessionServiceImpl / EngineSessionManager resolves constraints at session-open
- [x] Per-turn call context build includes the resolved constraints
- [x] Tests verify defaults + merged + missing-override paths
- [x] `pnpm typecheck && pnpm lint && pnpm test` green

## Implementation notes (2026-05-24)

**Call-context threading discovery**: the per-turn call context in `InProcessToolRegistry.dispatch` is a shallow copy of the base `ToolContext` stored on the registry (line 117-124 of `registry.ts`). Since `questionConstraints` is set once at session-open on the base context, it flows through to every tool dispatch automatically — no changes needed to the registry.

**`resolveQuestionConstraints` placement**: called once in `EngineSessionManager.openActive` (before the `toolContext` object literal) and the result spread into `toolContext` unconditionally. `resolveQuestionConstraints` always returns a `Required<QuestionConstraints>` (never undefined), so no conditional spread was needed.

**Pre-existing typecheck errors fixed**: The step-4 changes (prompt-fragment integration) were in the working tree but had `noUncheckedIndexedAccess` violations in all six mode files (`teach`, `quiz`, `exam`, `homework`, `course-create`, `study-skills`) and in `mode-question-fragment.test.ts`. Fixed by:
- Mode files: `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[key] ?? FALLBACK_QUESTION_CONSTRAINTS`
- Test file: replaced `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[key].field` with `resolveQuestionConstraints(key).field` (which already imported)

**Test approach**: `openAndGetConstraints` helper opens a session via `EngineSessionManager`, captures the `ToolRegistry` passed to `engine.open`, then dispatches a sentinel tool that captures `ctx.questionConstraints` at handler time. This verifies the field is present on the ToolContext at dispatch without touching private registry fields.

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 2
- Files: `packages/core/src/types/tool.ts`, `packages/core/src/services/session-service.ts`
- Depends on step-1 types
