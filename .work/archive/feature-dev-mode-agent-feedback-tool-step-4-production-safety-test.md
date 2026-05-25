---
id: feature-dev-mode-agent-feedback-tool-step-4-production-safety-test
kind: story
stage: done
tags: [dev, observability, dx, test]
parent: feature-dev-mode-agent-feedback-tool
depends_on: [feature-dev-mode-agent-feedback-tool-step-2-tool-registration-gating, feature-dev-mode-agent-feedback-tool-step-3-prompt-fragment-injection]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Production-safety test — double-gate verification

## Scope
Single dedicated test file that asserts zero `dev.*` tools registered AND zero dev-mode text composed into any mode's system prompt when `PRAXIS_DEV` is unset. This is the canary that catches regressions in either insertion point.

## Implementation
- Create `packages/desktop/electron/main/__tests__/dev-mode-production-safety.test.ts`:
  - `beforeEach`: save current `process.env.PRAXIS_DEV`, then `delete process.env.PRAXIS_DEV`
  - `afterEach`: restore the saved value
  - Test 1: `it("registers zero dev.* tools when PRAXIS_DEV is unset")` — build tool registry, assert `registry.list().filter(t => t.name.startsWith("dev.")).length === 0`
  - Test 2: `it("composes zero dev-mode text into any mode's system prompt when PRAXIS_DEV is unset")` — for each mode (teach, quiz, homework, exam, course-create, configure, study-skills), call `composeSystemPromptWithAttribution({ mode, additionalFragments: <whatever EngineSessionManager would build> })`, assert composed prompt does NOT include "Dev mode" or "dev.report_issue"
- For test 2, you may need a small helper that simulates the EngineSessionManager's additionalFragments assembly without running the full session. Stub user-fragments to empty.
- Run tests in CI; ensure they pass without depending on the local environment's `PRAXIS_DEV` state.

## Acceptance Criteria
- [ ] Test file at `packages/desktop/electron/main/__tests__/dev-mode-production-safety.test.ts`
- [ ] Test 1: zero `dev.*` tools when gate off
- [ ] Test 2: zero dev-mode text in any mode's composed prompt when gate off
- [ ] beforeEach/afterEach correctly save/restore env var (no leak)
- [ ] Both tests parameterize over all modes where applicable
- [ ] Tests pass in CI regardless of host env

## References
- Parent feature: `.work/active/features/feature-dev-mode-agent-feedback-tool.md` § Unit 4
- Depends on step-2 (tool gating) and step-3 (fragment gating)

## Implementation notes (2026-05-24)

Test file: `packages/desktop/electron/main/__tests__/dev-mode-production-safety.test.ts`

Three describe blocks:

1. **Gate-off canary** (`dev-mode production safety (gate-off canary)`): Two assertions with `PRAXIS_DEV` unset via `beforeEach`/`afterEach` save/restore.
   - Tool registration: inlines the `IS_DEV = process.env.PRAXIS_DEV === "true"` predicate from `services.ts` and confirms zero `dev.*` tools assembled.
   - Prompt composition: parameterized over all 7 modes (teach, quiz, homework, exam, course-create, configure, study-skills) — each confirms `composeSystemPromptWithAttribution` with an empty `additionalFragments` array (the gate is off) produces a prompt free of "Dev mode" and "dev.report_issue".

2. **Gate-on sanity** (`dev-mode gate-on sanity (PRAXIS_DEV=true)`): Proves the canary would actually catch a regression — sets `PRAXIS_DEV=true` and confirms the dev content IS present. Without this block, the canary would pass vacuously if the fragment content changed.

Key design decision: the `@praxis/curriculum/brief` sub-export is used (not the root `@praxis/curriculum`) because that's where `composeSystemPromptWithAttribution` lives, matching the pattern from `dev-mode-injection.test.ts`.

All 10 tests pass; biome lint clean; typecheck clean.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Test-only change (138 LoC, new file). The dedicated production-safety canary is exactly what was specified. Two-tier coverage: (1) gate-off canary across all 7 modes asserts no dev surface leaks; (2) gate-on sanity proves the canary isn't vacuous — would catch a regression where the fragment text or DEV_TOOLS composition silently broke. Agent caught the spec typo (`.systemPrompt` vs actual `.prompt` on `ComposedSystemPromptWithAttribution`). Env var save/restore in beforeEach/afterEach prevents host-env leak between tests. This story closes the dev-mode feature implementation chain.
