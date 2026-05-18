// ─── SymPyService ────────────────────────────────────────────────────────────

export interface SymPyService {
  /**
   * Check whether a proposed value satisfies an equation.
   * Returns the actual solution(s) for context regardless of correctness.
   */
  checkSolution(input: SymPyCheckSolutionInput): Promise<SymPyCheckSolutionResult>;

  /** Solve an equation for one variable; return all solutions (real + complex). */
  solveEquation(input: SymPySolveEquationInput): Promise<SymPySolveEquationResult>;

  /** Algebraic simplification of an expression. */
  simplify(input: SymPySimplifyInput): Promise<SymPySimplifyResult>;

  /** Check whether two expressions are mathematically equivalent. */
  checkEquivalent(input: SymPyCheckEquivalentInput): Promise<SymPyCheckEquivalentResult>;

  /**
   * Parse a LaTeX expression into sympy-canonical form. Returns the parsed
   * sympy expression as a string and a normalized LaTeX rendering. Used by
   * the verification round-trip helper.
   */
  parseLatex(input: SymPyParseLatexInput): Promise<SymPyParseLatexResult>;
}

export interface SymPyCheckSolutionInput {
  /** Equation in standard math notation, e.g. "2*x + 5 = 11" or LaTeX "2x + 5 = 11". */
  equation: string;
  variable: string;
  proposedValue: string;
  /** When true, treat `equation` as LaTeX; otherwise sympy-style infix. Default: false. */
  isLatex?: boolean;
}

export interface SymPyCheckSolutionResult {
  correct: boolean;
  proposedValue: string;
  expectedSolutions: string[];
  /** When the parser couldn't read the input cleanly. */
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPySolveEquationInput {
  equation: string;
  variable: string;
  isLatex?: boolean;
}

export interface SymPySolveEquationResult {
  solutions: string[];
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPySimplifyInput {
  expression: string;
  isLatex?: boolean;
}

export interface SymPySimplifyResult {
  simplified: string;
  /** LaTeX rendering of the simplified form. */
  simplifiedLatex: string;
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPyCheckEquivalentInput {
  expression1: string;
  expression2: string;
  isLatex?: boolean;
}

export interface SymPyCheckEquivalentResult {
  equivalent: boolean;
  /** sympy expression form of (expression1 - expression2) simplified — useful for diagnostics. */
  difference?: string;
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPyParseLatexInput {
  latex: string;
}

export interface SymPyParseLatexResult {
  /** The parsed sympy expression as a string (e.g. "2*x + 5"). */
  sympyExpression: string;
  /** Normalized LaTeX rendering (sympy's LaTeX printer output). */
  normalizedLatex: string;
  parseError?: string;
}
