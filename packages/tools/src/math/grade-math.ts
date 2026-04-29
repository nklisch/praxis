import type { ToolContext, ToolDefinition } from "@praxis/core/types";
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

export const gradeMathInput = z.discriminatedUnion("kind", [
  checkSolutionInput,
  solveEquationInput,
  simplifyInput,
  checkEquivalentInput,
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

export const gradeMathOutput = z.discriminatedUnion("kind", [
  checkSolutionOutput,
  solveEquationOutput,
  simplifyOutput,
  checkEquivalentOutput,
]);

export const gradeMathTool: ToolDefinition<typeof gradeMathInput, typeof gradeMathOutput> = {
  name: "grade_math",
  description: `Symbolic math via sympy. Use this for ANY arithmetic, algebra, or equation work — never trust your own arithmetic for grading.

Operations:
- check_solution: verify a proposed value satisfies an equation. Returns the actual solution(s) for context.
- solve_equation: solve an equation for one variable, return all solutions.
- simplify: algebraic simplification of an expression.
- check_equivalent: check if two expressions are mathematically equal.

If parse_error or needs_human_review is set, the input couldn't be parsed cleanly — surface this to the student and ask for clarification rather than guessing.`,
  input: gradeMathInput,
  output: gradeMathOutput,
  tier: "deterministic",
  effects: ["external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const sympy = ctx.services.sympy;
    switch (args.kind) {
      case "check_solution": {
        const r = await sympy.checkSolution({
          equation: args.equation,
          variable: args.variable,
          proposedValue: args.proposedValue,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "check_solution" as const,
          correct: r.correct,
          proposedValue: r.proposedValue,
          expectedSolutions: r.expectedSolutions,
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
      case "solve_equation": {
        const r = await sympy.solveEquation({
          equation: args.equation,
          variable: args.variable,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "solve_equation" as const,
          solutions: r.solutions,
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
      case "simplify": {
        const r = await sympy.simplify({
          expression: args.expression,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "simplify" as const,
          simplified: r.simplified,
          simplifiedLatex: r.simplifiedLatex,
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
      case "check_equivalent": {
        const r = await sympy.checkEquivalent({
          expression1: args.expression1,
          expression2: args.expression2,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "check_equivalent" as const,
          equivalent: r.equivalent,
          ...(r.difference !== undefined && { difference: r.difference }),
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
    }
  },
};
