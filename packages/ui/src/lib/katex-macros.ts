/**
 * Curated KaTeX macro set for Praxis math rendering.
 *
 * KATEX_MACROS: pass to rehype-katex's `macros` option.
 * KATEX_MACRO_DOCS: enumerate macros for the question-tool prompt fragment.
 */

/**
 * 11-macro starter set: number sets + common calculus/analysis notation.
 * Frozen so callers cannot accidentally mutate the shared object.
 */
export const KATEX_MACROS: Readonly<Record<string, string>> = Object.freeze({
  "\\R": "\\mathbb{R}",
  "\\Z": "\\mathbb{Z}",
  "\\N": "\\mathbb{N}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
  "\\pdv": "\\frac{\\partial #1}{\\partial #2}",
  "\\dv": "\\frac{d#1}{d#2}",
  "\\norm": "\\lVert #1 \\rVert",
  "\\abs": "\\lvert #1 \\rvert",
  "\\set": "\\{ #1 \\}",
  "\\given": "\\mid",
});

/** Human-readable documentation entry for a single macro. */
export interface MacroDoc {
  /** The LaTeX shortcut (e.g. `\\R`). */
  shortcut: string;
  /** The LaTeX expansion (e.g. `\\mathbb{R}`). */
  expansion: string;
  /** Plain-language meaning shown to the agent / student. */
  meaning: string;
}

/**
 * Ordered documentation list — one entry per macro in KATEX_MACROS.
 * Used to build the prompt fragment that tells the model which shortcuts
 * are available.
 */
export const KATEX_MACRO_DOCS: ReadonlyArray<MacroDoc> = [
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
