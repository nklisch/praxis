import type {
  SketchId,
  SymPyCheckEquivalentResult,
  SymPyCheckSolutionResult,
  SymPySimplifyResult,
  SymPySolveEquationResult,
  ToolContext,
  ToolDefinition,
} from "@praxis/core/types";
import { z } from "zod";

const checkSolutionInput = z.object({
  kind: z.literal("check_solution"),
  equation: z
    .string()
    .describe(
      "Equation to check, e.g. '2*x + 5 = 11' (sympy notation) or '2x + 5 = 11' (LaTeX, set isLatex: true)",
    ),
  variable: z.string().describe("Variable to check, e.g. 'x'"),
  proposedValue: z.string().describe("Proposed value, e.g. '3'"),
  isLatex: z.boolean().optional().describe("True if equation is LaTeX-formatted"),
});

const solveEquationInput = z.object({
  kind: z.literal("solve_equation"),
  equation: z.string(),
  variable: z.string(),
  isLatex: z.boolean().optional(),
});

const simplifyInput = z.object({
  kind: z.literal("simplify"),
  expression: z.string(),
  isLatex: z.boolean().optional(),
});

const checkEquivalentInput = z.object({
  kind: z.literal("check_equivalent"),
  expression1: z.string(),
  expression2: z.string(),
  isLatex: z.boolean().optional(),
});

const sketchInput = z.object({
  kind: z.literal("sketch"),
  sketchId: z
    .string()
    .describe("The sketch id from a [sketch:<id>] marker in the student's message."),
  /**
   * Optional expected answer. When provided, the vision-extracted LaTeX is
   * checked against this expression for equivalence via sympy. When absent,
   * the LaTeX is only parsed/simplified to confirm it's readable.
   */
  expected: z
    .string()
    .optional()
    .describe("The expected LaTeX or sympy expression to grade against."),
});

export const gradeMathInput = z.discriminatedUnion("kind", [
  checkSolutionInput,
  solveEquationInput,
  simplifyInput,
  checkEquivalentInput,
  sketchInput,
]);

const checkSolutionOutput = z.object({
  kind: z.literal("check_solution"),
  correct: z.boolean(),
  proposedValue: z.string(),
  expectedSolutions: z.array(z.string()),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

const solveEquationOutput = z.object({
  kind: z.literal("solve_equation"),
  solutions: z.array(z.string()),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

const simplifyOutput = z.object({
  kind: z.literal("simplify"),
  simplified: z.string(),
  simplifiedLatex: z.string(),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

const checkEquivalentOutput = z.object({
  kind: z.literal("check_equivalent"),
  equivalent: z.boolean(),
  difference: z.string().optional(),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

/**
 * Output for kind: "sketch".
 *
 * `visionLatex` is always present — the raw LaTeX extracted by vision OCR.
 * Use it in diagnostic messages so the student can see what the model read.
 *
 * When `expected` was provided: `correct` and `expectedSolutions` are set.
 * When sympy cannot parse the OCR output: `needsHumanReview: true` is set
 * and `correct` is absent — surface this to the student and ask them to
 * re-draw or type the expression.
 */
const sketchOutput = z.object({
  kind: z.literal("sketch"),
  /** LaTeX extracted from the drawing by vision OCR. Always present for diagnostics. */
  visionLatex: z.string(),
  /** True/false when sympy validated against `expected`; absent when no expected was given. */
  correct: z.boolean().optional(),
  /** Sympy solutions / canonical forms, when an expected answer was graded. */
  expectedSolutions: z.array(z.string()).optional(),
  /** Simplified canonical form when no expected answer was given. */
  simplified: z.string().optional(),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

export const gradeMathOutput = z.discriminatedUnion("kind", [
  checkSolutionOutput,
  solveEquationOutput,
  simplifyOutput,
  checkEquivalentOutput,
  sketchOutput,
]);

/** Carry the optional diagnostics fields onto any discriminated output object. */
function withDiagnostics(
  base: Record<string, unknown>,
  source: { needsHumanReview?: boolean; parseError?: string },
): Record<string, unknown> {
  return {
    ...base,
    ...(source.needsHumanReview !== undefined && { needsHumanReview: source.needsHumanReview }),
    ...(source.parseError !== undefined && { parseError: source.parseError }),
  };
}

function buildCheckSolutionOutput(
  r: SymPyCheckSolutionResult,
): z.infer<typeof checkSolutionOutput> {
  return withDiagnostics(
    {
      kind: "check_solution",
      correct: r.correct,
      proposedValue: r.proposedValue,
      expectedSolutions: r.expectedSolutions,
    },
    r,
  ) as z.infer<typeof checkSolutionOutput>;
}

function buildSolveEquationOutput(
  r: SymPySolveEquationResult,
): z.infer<typeof solveEquationOutput> {
  return withDiagnostics({ kind: "solve_equation", solutions: r.solutions }, r) as z.infer<
    typeof solveEquationOutput
  >;
}

function buildSimplifyOutput(r: SymPySimplifyResult): z.infer<typeof simplifyOutput> {
  return withDiagnostics(
    { kind: "simplify", simplified: r.simplified, simplifiedLatex: r.simplifiedLatex },
    r,
  ) as z.infer<typeof simplifyOutput>;
}

function buildCheckEquivalentOutput(
  r: SymPyCheckEquivalentResult,
): z.infer<typeof checkEquivalentOutput> {
  return withDiagnostics(
    {
      kind: "check_equivalent",
      equivalent: r.equivalent,
      ...(r.difference !== undefined && { difference: r.difference }),
    },
    r,
  ) as z.infer<typeof checkEquivalentOutput>;
}

export const gradeMathTool: ToolDefinition<typeof gradeMathInput, typeof gradeMathOutput> = {
  name: "grade_math",
  description: `Symbolic math via sympy. Use this for ANY arithmetic, algebra, or equation work — never trust your own arithmetic for grading.

Operations:
- check_solution: verify a proposed value satisfies an equation. Returns the actual solution(s) for context.
- solve_equation: solve an equation for one variable, return all solutions.
- simplify: algebraic simplification of an expression.
- check_equivalent: check if two expressions are mathematically equal.
- sketch: two-step vision OCR pipeline — reads a sketch by id, extracts LaTeX via vision, then validates with sympy. Use when grading sketched math work. Pass expected to grade correctness; omit to just read the expression.

If parse_error or needs_human_review is set, the input couldn't be parsed cleanly — surface this to the student and ask for clarification rather than guessing.`,
  input: gradeMathInput,
  output: gradeMathOutput,
  tier: "deterministic",
  effects: ["external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const sympy = ctx.services.sympy;
    switch (args.kind) {
      case "check_solution": {
        return buildCheckSolutionOutput(
          await sympy.checkSolution({
            equation: args.equation,
            variable: args.variable,
            proposedValue: args.proposedValue,
            ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
          }),
        );
      }
      case "solve_equation": {
        return buildSolveEquationOutput(
          await sympy.solveEquation({
            equation: args.equation,
            variable: args.variable,
            ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
          }),
        );
      }
      case "simplify": {
        return buildSimplifyOutput(
          await sympy.simplify({
            expression: args.expression,
            ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
          }),
        );
      }
      case "check_equivalent": {
        return buildCheckEquivalentOutput(
          await sympy.checkEquivalent({
            expression1: args.expression1,
            expression2: args.expression2,
            ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
          }),
        );
      }
      case "sketch": {
        if (!ctx.services.sketches) {
          throw new Error("Sketch service is not available in this context.");
        }
        if (!ctx.services.vision) {
          throw new Error(
            "Vision is not available with the current engine. Switch to a vision-capable engine to grade sketched math.",
          );
        }

        // Step 1: Fetch the sketch image from the store.
        const sketch = await ctx.services.sketches.get(args.sketchId as SketchId);

        // Step 2: Vision OCR — extract LaTeX from the drawing.
        // VisionDescribeRequest uses `images` (array) with `data` (base64, no data: prefix).
        const visionResult = await ctx.services.vision.describe({
          images: [
            {
              data: sketch.image.toString("base64"),
              mimeType: "image/png",
            },
          ],
          prompt:
            "Extract the mathematical expression(s) shown in this drawing as LaTeX. Reply with only the LaTeX, no prose or explanation.",
        });
        const latex = visionResult.text.trim();

        // Step 3: Pass the vision-extracted LaTeX to sympy.
        // When expected is provided: check equivalence.
        // When no expected: simplify to verify parseability and return canonical form.
        if (args.expected !== undefined) {
          const result = await sympy.checkEquivalent({
            expression1: latex,
            expression2: args.expected,
            isLatex: true,
          });
          return withDiagnostics(
            {
              kind: "sketch",
              visionLatex: latex,
              correct: result.equivalent,
              ...(result.difference !== undefined && { expectedSolutions: [result.difference] }),
            },
            result,
          ) as z.infer<typeof sketchOutput>;
        }

        // No expected answer — simplify to verify the LaTeX is parseable.
        const simplifyResult = await sympy.simplify({ expression: latex, isLatex: true });
        return withDiagnostics(
          {
            kind: "sketch",
            visionLatex: latex,
            ...(simplifyResult.simplified !== undefined && {
              simplified: simplifyResult.simplified,
            }),
          },
          simplifyResult,
        ) as z.infer<typeof sketchOutput>;
      }
    }
  },
};
