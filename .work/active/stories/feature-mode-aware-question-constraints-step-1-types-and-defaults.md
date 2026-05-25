---
id: feature-mode-aware-question-constraints-step-1-types-and-defaults
kind: story
stage: done
tags: [content, tool-schema, config]
parent: feature-mode-aware-question-constraints
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: `QuestionConstraints` type + `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` + resolver

## Scope
Add the `QuestionConstraints` interface to `@praxis/core`, extend `Mode` with `questionConstraints?`, and define the single-source-of-truth defaults table in `@praxis/curriculum`. Plus `resolveQuestionConstraints(modeId, override?)` merge helper.

## Implementation
- Edit `packages/core/src/types/mode.ts`:
  - Add `export interface QuestionConstraints { promptMaxWords?: number; choiceMaxWords?: number; choiceCount?: number; multiSelectCap?: number }`
  - Add `questionConstraints?: QuestionConstraints` to `Mode`
- Create `packages/curriculum/src/question-constraints.ts`:
  - Export `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE: Record<string, Required<QuestionConstraints>>` covering all 7 modes (`teach`, `homework`, `quiz`, `exam`, `course-create`, `configure`, `study-skills`) with the values from the feature design table
  - Export `FALLBACK_QUESTION_CONSTRAINTS: Required<QuestionConstraints>` = `{ promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 }`
  - Export `resolveQuestionConstraints(modeId: string, override?: QuestionConstraints): Required<QuestionConstraints>` that spreads defaults under explicit overrides; falls back to FALLBACK for unknown mode
- Add `packages/curriculum/src/__tests__/question-constraints.test.ts`:
  - Each mode resolves to documented defaults
  - Unknown mode falls back
  - Partial override preserves defaults for unset keys
  - All-undefined override returns base defaults

## Acceptance Criteria
- [ ] `QuestionConstraints` interface exported with 4 optional numeric fields
- [ ] `Mode.questionConstraints?: QuestionConstraints` added
- [ ] `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` covers all 7 modes
- [ ] `resolveQuestionConstraints(modeId, override?)` merges correctly
- [ ] Unknown mode falls back to `FALLBACK_QUESTION_CONSTRAINTS`
- [ ] Existing modes typecheck unchanged (field optional)
- [ ] Unit tests cover defaults + merges + fallback

## Implementation notes (2026-05-24)

- Added `QuestionConstraints` interface directly above `Mode` in `packages/core/src/types/mode.ts`; added `questionConstraints?: QuestionConstraints` to `Mode` between `artifactScope?` and `onTurnEnd?`
- Created `packages/curriculum/src/question-constraints.ts` with all three exports: `FALLBACK_QUESTION_CONSTRAINTS`, `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` (all 7 modes), and `resolveQuestionConstraints` using field-by-field merge to avoid `undefined`-spreading pitfall
- Exported all three from `packages/curriculum/src/index.ts` barrel
- Created `packages/curriculum/src/__tests__/question-constraints.test.ts` with 4 tests: all-modes defaults, unknown-mode fallback, partial override, empty-override
- Typecheck clean; lint clean on changed files (pre-existing lint errors unrelated); all 61 curriculum tests pass including 4 new ones; pre-existing better-sqlite3 ABI failures unaffected

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 1
- File: `packages/core/src/types/mode.ts`

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: 8-line addition to `mode.ts` for `QuestionConstraints` interface + optional `Mode.questionConstraints` field. 32 LoC for `question-constraints.ts` covering `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` (all 7 modes with documented defaults), `FALLBACK_QUESTION_CONSTRAINTS`, and `resolveQuestionConstraints(modeId, override?)`. Resolver uses field-by-field merge (not spread) to correctly handle `undefined`-valued override keys — the right pattern for `Required<T>` semantics. Barrel-exported from `@praxis/curriculum/index.ts`. 4 tests cover all-modes-defaults, unknown-mode fallback, partial override, empty override. All existing modes typecheck unchanged.
