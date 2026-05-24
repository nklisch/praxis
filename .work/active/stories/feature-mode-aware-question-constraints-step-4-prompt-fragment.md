---
id: feature-mode-aware-question-constraints-step-4-prompt-fragment
kind: story
stage: implementing
tags: [content, agent-prompt]
parent: feature-mode-aware-question-constraints
depends_on: [feature-mode-aware-question-constraints-step-1-types-and-defaults]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: `questionToolFragment` factory

## Scope
A single factory that builds the unified question-tool prompt fragment. Takes resolved constraints + mode label; returns a `PromptFragment` at position `constraints`. Template carries per-mode caps PLUS all cross-cutting markup conventions from the parent epic's agent-contract section (math, citations, definitions, callouts, concept refs, figures).

## Implementation
- Create `packages/curriculum/src/modes/fragments/question-tool.ts`:
  - Export `questionToolFragment(constraints: Required<QuestionConstraints>, modeLabel: string): PromptFragment`
  - Returns `{ id: "question-tool-guidance", position: "constraints", customizable: false, template: <interpolated string> }`
  - Template includes:
    1. Per-mode caps section (interpolated)
    2. Math: LaTeX wrappers (`$...$`, `$$...$$`), bare-glyph auto-style note
    3. Citations: call the citation tool, don't inline markup
    4. Definitions: `[[def:term-name]]` first-introduction wrap
    5. Callouts: GitHub admonition syntax (`> [!hint]` etc.)
    6. Concept refs: `concept:` link scheme
    7. Figures: `::: figure` container directive
- Add `packages/curriculum/src/modes/fragments/__tests__/question-tool.test.ts`:
  - Factory returns fragment with correct id / position / customizable
  - Template for teach constraints contains "max 30 words" + "max 10 words"
  - Template for exam constraints contains "max 60 words" + "max 25 words"
  - Template includes the markup-convention sections (assert presence of "LaTeX", "citation tool", "[[def:", "GitHub admonition", "concept:", "::: figure")

## Acceptance Criteria
- [ ] Factory returns PromptFragment with `id: "question-tool-guidance"`, position `constraints`, `customizable: false`
- [ ] Template interpolates all 4 cap values from constraints
- [ ] Template includes all 6 markup-convention sections
- [ ] Tests cover teach-vs-exam interpolation difference
- [ ] Tests assert markup-convention section presence
- [ ] `pnpm test` passes for the new test file

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 4
- Pattern: `.claude/skills/patterns/mode-prompt-fragment-composition.md` (factory fragments)
- Depends on step-1 types
