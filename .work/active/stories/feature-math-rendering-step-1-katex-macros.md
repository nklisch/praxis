---
id: feature-math-rendering-step-1-katex-macros
kind: story
stage: done
tags: [content, rendering, math]
parent: feature-math-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: KaTeX macros configuration

## Scope
Define the curated 11-macro set (the design's locked starter set: `\R`, `\Z`, `\N`, `\Q`, `\C`, `\pdv`, `\dv`, `\norm`, `\abs`, `\set`, `\given`) in two exports: a `KATEX_MACROS` object for passing to `rehype-katex`, and a `KATEX_MACRO_DOCS` array for the prompt fragment.

## Implementation
- Create `packages/ui/src/lib/katex-macros.ts`:
  - `KATEX_MACROS: Readonly<Record<string, string>>` — frozen object with 11 macros mapping shortcut → LaTeX expansion
  - `MacroDoc` interface with `shortcut` / `expansion` / `meaning` fields
  - `KATEX_MACRO_DOCS: ReadonlyArray<MacroDoc>` — same 11 macros with human-readable meaning per the design table
- Add tests `packages/ui/src/lib/__tests__/katex-macros.test.ts`:
  - For each macro, render a representative expression (e.g., `\R` → `\mathbb{R}`) via `katex.renderToString` and assert no error
  - Assert `KATEX_MACROS` keys and `KATEX_MACRO_DOCS` shortcuts stay in sync (each set is a subset of the other)

## Acceptance Criteria
- [ ] `KATEX_MACROS` exported as frozen Record with 11 macros
- [ ] `KATEX_MACRO_DOCS` exported with shortcut/expansion/meaning per macro
- [ ] Both exports stay in sync (validation test)
- [ ] Each macro renders without KaTeX error
- [ ] `pnpm test` passes for the new test file

## References
- Parent feature: `.work/active/features/feature-math-rendering.md` § Unit 1
- File: `packages/ui/src/lib/katex-macros.ts`

## Implementation notes (2026-05-24)

### Files touched
- `packages/ui/src/lib/katex-macros.ts` — created; exports `KATEX_MACROS` (frozen `Readonly<Record<string, string>>` with 11 macros) and `KATEX_MACRO_DOCS` (`ReadonlyArray<MacroDoc>` with shortcut/expansion/meaning).
- `packages/ui/src/lib/__tests__/katex-macros.test.ts` — created; 17 tests covering sync validation, immutability, per-macro KaTeX render (throwOnError: true), and HTML output spot-check.

### Test result
17/17 tests pass. Full `@praxis/ui` suite: 164 test files, 1723 tests, all green.

### Deviations
None. All 11 macros rendered without KaTeX error. No design-flaw escape hatch triggered.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: All 11 macros declared with `Object.freeze` + `Readonly<Record<string, string>>`. `MacroDoc` array stays in sync via validation test asserting set equality between `KATEX_MACROS` keys and `KATEX_MACRO_DOCS` shortcuts. Per-macro KaTeX render assertions use `throwOnError: true` (correct — failing macros should surface in tests, not be silently substituted). 17 tests covering sync validation, immutability, per-macro render, HTML output spot-check. Clean.
