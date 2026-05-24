---
id: feature-math-rendering-step-4-prompt-fragment-extension
kind: story
stage: implementing
tags: [content, rendering, math, agent-prompt]
parent: feature-math-rendering
depends_on: [feature-math-rendering-step-1-katex-macros, feature-mode-aware-question-constraints-step-4-prompt-fragment]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Extend `questionToolFragment` with macros table

## Scope
Edit the existing `questionToolFragment` factory (created in `feature-mode-aware-question-constraints-step-4`) to append the available LaTeX macros table to the Math section. Agent reads the table as a quick reference and uses the shortcuts in LaTeX expressions.

## Implementation
- Edit `packages/curriculum/src/modes/fragments/question-tool.ts`:
  - Import `KATEX_MACRO_DOCS` from `@praxis/ui` (or wherever the path resolves — likely re-exported via `@praxis/ui/lib`)
  - Append to the Math section template:
    ```
    Available LaTeX macros (shortcuts you can use in $...$ and $$...$$):

    | Shortcut | Expansion | Meaning |
    |---|---|---|
    | `\R` | `\mathbb{R}` | real numbers ℝ |
    ... (generated from KATEX_MACRO_DOCS)
    ```
  - Generation: a small helper inside the factory iterates `KATEX_MACRO_DOCS` and formats each as a markdown table row
- Edit `packages/curriculum/src/modes/fragments/__tests__/question-tool.test.ts`:
  - Assert the template now includes "Available LaTeX macros"
  - Assert each macro's shortcut appears in the table

## Acceptance Criteria
- [ ] `questionToolFragment` template includes the macros table from `KATEX_MACRO_DOCS`
- [ ] Table has all 11 macros with shortcut + expansion + meaning
- [ ] All other sections of the template are preserved (length constraints, citations, definitions, etc.)
- [ ] Tests assert macros table presence + each macro's shortcut
- [ ] `pnpm test` passes for the test file

## References
- Parent feature: `.work/active/features/feature-math-rendering.md` § Unit 4
- File: `packages/curriculum/src/modes/fragments/question-tool.ts` (created in dependent story)
- Depends on step-1 (macros) and the sibling-feature's prompt-fragment story
