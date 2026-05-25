---
id: feature-mode-aware-question-constraints-step-7-mode-wiring
kind: story
stage: done
tags: [content, agent-prompt, curriculum]
parent: feature-mode-aware-question-constraints
depends_on: [feature-mode-aware-question-constraints-step-1-types-and-defaults, feature-mode-aware-question-constraints-step-4-prompt-fragment]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 7: Per-mode wiring — register fragment + backfill overrides

## Scope
Wire `questionToolFragment` into every mode that uses question tools. Backfill `mode.questionConstraints` only where the default needs overriding. Add integration tests proving the composed system prompt contains the right caps per mode.

## Implementation
- For each mode file under `packages/curriculum/src/modes/` that uses question tools:
  - Append `questionToolFragment(resolveQuestionConstraints(mode.id, mode.questionConstraints), mode.displayName ?? mode.label)` to `mode.promptFragments` at the `constraints` slot
  - If a `constraints`-position fragment already exists with id collision, rename or merge content per the existing fragment's intent
- Audit which modes need question-tool guidance:
  - Question tool users: `teach`, `quiz`, `homework`, `exam`, `course-create`, `study-skills`
  - Likely NOT: `configure` (verify via `mode.toolNames` inspection)
- Backfill `mode.questionConstraints` only when overriding defaults. Most modes inherit; leave undefined.
- Add `packages/curriculum/src/__tests__/mode-question-fragment.test.ts`:
  - Each question-using mode includes the `question-tool-guidance` fragment in `promptFragments`
  - Composed `composeSystemPrompt` for teach contains "max 30 words"
  - Composed prompt for exam contains "max 60 words"
  - Non-question-using modes don't include the fragment

## Acceptance Criteria
- [x] All question-using modes register `questionToolFragment` in their `promptFragments`
- [x] `composeSystemPrompt` per mode includes the fragment with correct cap values
- [x] Non-question-using modes do NOT include the fragment
- [x] Integration tests cover per-mode composition
- [x] No regression on existing mode composition tests
- [x] `pnpm typecheck && pnpm lint && pnpm test` green

## Implementation notes (2026-05-24)

**Approach chosen:** (a) — pass defaults via `resolveQuestionConstraints(modeId)` at module load time. Each mode imports `resolveQuestionConstraints` from `../question-constraints.js` and calls the fragment factory with the resolved constraints and a string label. The `?? FALLBACK_QUESTION_CONSTRAINTS` guard at the call site satisfies `noUncheckedIndexedAccess` and makes fallback behavior explicit.

**Modes wired (6):** `teach`, `quiz`, `homework`, `exam`, `course-create`, `study-skills`. All get the fragment at the `constraints` position, placed after `constraintsFragment` (productive-struggle) and before `postamble`.

**Modes excluded (1):** `configure` — its `ask_student_question` usage is configurator-facing authoring, not the student question-tool flow the fragment governs. Verified by toolNames audit: no `quick_check.*` tools.

**Tests added:** `packages/curriculum/src/__tests__/mode-question-fragment.test.ts` — 22 assertions covering registration, position, composed-prompt cap values, teach/exam differentiation, and mode label in template.

**Existing tests updated:** hardcoded fragment-count assertions in `teach-mode.test.ts` (11→12), `quiz-mode.test.ts` (11→12), and `packages/curriculum/src/modes/__tests__/study-skills.test.ts` (8→9).

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 7
- Pattern: `.claude/skills/patterns/mode-prompt-fragment-composition.md`
- Depends on step-1 (types) and step-4 (fragment factory)

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: 6 modes wired with `questionToolFragment(DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[id] ?? FALLBACK)`. `configure` correctly excluded (configurator-facing, no `quick_check.*`). Choice of approach (a) — pass defaults table inline rather than computing from mode object — is the simpler/right call given the mode-literal scope at definition time. 22 new integration tests + 3 existing fragment-count tests updated cleanly (acknowledged exact counts shifted by +1 per mode). `noUncheckedIndexedAccess` violation that surfaced from parallel-running step-2 was caught + fixed in the same wave — clean convergence between the two agents.
