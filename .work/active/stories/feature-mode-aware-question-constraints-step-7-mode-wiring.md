---
id: feature-mode-aware-question-constraints-step-7-mode-wiring
kind: story
stage: implementing
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
- [ ] All question-using modes register `questionToolFragment` in their `promptFragments`
- [ ] `composeSystemPrompt` per mode includes the fragment with correct cap values
- [ ] Non-question-using modes do NOT include the fragment
- [ ] Integration tests cover per-mode composition
- [ ] No regression on existing mode composition tests
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 7
- Pattern: `.claude/skills/patterns/mode-prompt-fragment-composition.md`
- Depends on step-1 (types) and step-4 (fragment factory)
