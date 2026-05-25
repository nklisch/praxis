import type { PromptFragment, QuestionConstraints } from "@praxis/core/types";

/**
 * Mirror of `KATEX_MACRO_DOCS` from `packages/ui/src/lib/katex-macros.ts`.
 * Intentionally duplicated to respect the dep boundary: `@praxis/curriculum`
 * must not import `@praxis/ui` at runtime. If macros drift, update both places.
 * Source of truth: packages/ui/src/lib/katex-macros.ts
 */
const KATEX_MACRO_DOCS_INLINE: ReadonlyArray<{
  shortcut: string;
  expansion: string;
  meaning: string;
}> = [
  { shortcut: "\\R", expansion: "\\mathbb{R}", meaning: "real numbers ℝ" },
  { shortcut: "\\Z", expansion: "\\mathbb{Z}", meaning: "integers ℤ" },
  { shortcut: "\\N", expansion: "\\mathbb{N}", meaning: "naturals ℕ" },
  { shortcut: "\\Q", expansion: "\\mathbb{Q}", meaning: "rationals ℚ" },
  { shortcut: "\\C", expansion: "\\mathbb{C}", meaning: "complex ℂ" },
  {
    shortcut: "\\pdv",
    expansion: "\\frac{\\partial #1}{\\partial #2}",
    meaning: "partial derivative",
  },
  {
    shortcut: "\\dv",
    expansion: "\\frac{d#1}{d#2}",
    meaning: "derivative",
  },
  {
    shortcut: "\\norm",
    expansion: "\\lVert #1 \\rVert",
    meaning: "norm ‖x‖",
  },
  {
    shortcut: "\\abs",
    expansion: "\\lvert #1 \\rvert",
    meaning: "absolute value |x|",
  },
  {
    shortcut: "\\set",
    expansion: "\\{ #1 \\}",
    meaning: "set braces",
  },
  { shortcut: "\\given", expansion: "\\mid", meaning: '"given" bar in conditionals' },
];

function buildMacrosTable(): string {
  const rows = KATEX_MACRO_DOCS_INLINE.map(
    (d) => `| \`${d.shortcut}\` | \`${d.expansion}\` | ${d.meaning} |`,
  );
  return [
    "Available LaTeX macros (shortcuts you can use in $...$ and $$...$$):",
    "",
    "| Shortcut | Expansion | Meaning |",
    "|---|---|---|",
    ...rows,
  ].join("\n");
}

/**
 * Builds the unified question-tool prompt fragment for a given mode.
 * Carries per-mode question caps PLUS all cross-cutting markup conventions
 * (math, citations, definitions, callouts, concept refs, figures).
 *
 * Returns a new object on each call — pure, not memoized.
 */
export function questionToolFragment(
  constraints: Required<QuestionConstraints>,
  modeLabel: string,
): PromptFragment {
  return {
    id: "question-tool-guidance",
    position: "constraints",
    customizable: false,
    template: `## Questions and educational content

When using the question tools (\`ask_student_question\`, \`quick_check.*\`), respect these caps for ${modeLabel} mode:
- Question prompt: max ${constraints.promptMaxWords} words
- Each choice text: max ${constraints.choiceMaxWords} words
- Up to ${constraints.choiceCount} choices per question
- Multi-select: students may select up to ${constraints.multiSelectCap}

Over-cap calls fail with a descriptive error you can correct from. Compress to the essential framing; longer reasoning belongs in the preceding tutor turn.

## Content conventions

### Math
- Inline: \`$f(x) = x^2$\`
- Display: \`$$\\frac{dV}{dt} = ...$$\`
- Bare unicode glyphs (∂, ∫, π, α, etc.) are auto-styled but use LaTeX for full typesetting

${buildMacrosTable()}

### Citations
Call the \`citation\` tool with \`source_id\` and \`passage\`. Do NOT inline-write \`[Stewart §3.5]\` markup — the tool emits the chip.

### Definitions
Wrap first-introduction terms in \`[[def:term-name]]\`. The renderer styles the first occurrence per student and falls through on subsequent mentions.

### Callouts
Use GitHub admonition syntax: \`> [!theorem]\`, \`> [!lemma]\`, \`> [!hint]\`, \`> [!warning]\`. One register per moment.

### Concept references
Link with the \`concept:\` scheme: \`[chain rule](concept:chain-rule)\`.

### Figures
For worked examples, use a container directive:
\`\`\`
::: figure {caption="Fig. 1 · convergence near x=0" verdict="ok"}
<figure body — markdown, math, etc.>
:::
\`\`\`
`,
  };
}
