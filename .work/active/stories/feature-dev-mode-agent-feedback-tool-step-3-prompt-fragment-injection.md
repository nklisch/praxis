---
id: feature-dev-mode-agent-feedback-tool-step-3-prompt-fragment-injection
kind: story
stage: done
tags: [dev, observability, dx, agent-prompt]
parent: feature-dev-mode-agent-feedback-tool
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Dev-mode prompt fragment + session-open injection

## Scope
Create `devModeFragment` (a static `PromptFragment` at position `postamble`) and inject it via `additionalFragments` in `EngineSessionManager.openActive` when `PRAXIS_DEV === 'true'`.

## Implementation
- Create `packages/curriculum/src/modes/fragments/dev-mode.ts`:
  - Export `devModeFragment: PromptFragment` with `id: "dev.agent-feedback"`, `position: "postamble"`, `customizable: false`, template per the feature design body (explains dev mode + `dev.report_issue` usage + schema + where reports land)
- Edit `packages/core/src/services/session/engine-session-manager.ts` (in `openActive`, around the additionalFragments assembly at ~line 284-312):
  - After the existing array is built, conditionally push:
    ```typescript
    if (process.env.PRAXIS_DEV === "true") {
      additionalFragments.push(devModeFragment);
    }
    ```
- Add tests `packages/core/src/services/session/__tests__/dev-mode-injection.test.ts`:
  - With `PRAXIS_DEV='true'`: open a session in teach mode → composed system prompt contains "Dev mode" and "dev.report_issue"
  - With `PRAXIS_DEV` unset: opened session's composed prompt does NOT contain those tokens
  - beforeEach/afterEach save/restore env var
- Verify no regression on existing session-open / prompt-composition tests.

## Acceptance Criteria
- [ ] `devModeFragment` exported with documented id / position / customizable settings
- [ ] Fragment template explains: dev environment, when to use, schema, output location
- [ ] `engine-session-manager.ts` pushes fragment to `additionalFragments` only when gate is on
- [ ] Tests cover both gate states
- [ ] Composed system prompt for any mode includes the fragment when gate is on
- [ ] No regression on existing prompt-composition tests
- [ ] `pnpm test` passes for new test file + existing session tests

## References
- Parent feature: `.work/active/features/feature-dev-mode-agent-feedback-tool.md` § Unit 3
- File: `packages/core/src/services/session/engine-session-manager.ts:284-312`
- Reference: `packages/core/src/types/mode.ts` (PromptFragment interface)

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: `devModeFragment` at `position: "postamble"`, `customizable: false`, frozen export. Injection at `engine-session-manager.ts:306` is conditional on `process.env.PRAXIS_DEV === "true"`, placed LAST in additionalFragments so it sits at the trailing postamble slot regardless of other fragments. 249-line test file across 3 describe blocks: fragment shape (id/position/customizable/template content), compose integration (composes correctly through `composeSystemPromptWithAttribution`), and gate behavior (on/off env handling). Builds and curriculum dist rebuild required (`pnpm --filter @praxis/curriculum build`) — known workflow step, documented.
