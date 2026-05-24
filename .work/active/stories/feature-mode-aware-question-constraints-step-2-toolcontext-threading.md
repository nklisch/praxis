---
id: feature-mode-aware-question-constraints-step-2-toolcontext-threading
kind: story
stage: implementing
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
- [ ] `ToolContext.questionConstraints?: Required<QuestionConstraints>` field added
- [ ] SessionServiceImpl / EngineSessionManager resolves constraints at session-open
- [ ] Per-turn call context build includes the resolved constraints
- [ ] Tests verify defaults + merged + missing-override paths
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 2
- Files: `packages/core/src/types/tool.ts`, `packages/core/src/services/session-service.ts`
- Depends on step-1 types
