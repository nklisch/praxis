import type {
  SymPyCheckEquivalentInput,
  SymPyCheckEquivalentResult,
  SymPyCheckSolutionInput,
  SymPyCheckSolutionResult,
  SymPyParseLatexInput,
  SymPyParseLatexResult,
  SymPyService,
  SymPySimplifyInput,
  SymPySimplifyResult,
  SymPySolveEquationInput,
  SymPySolveEquationResult,
} from "@praxis/core/types";
import type { PyodideHost } from "../runtime/pyodide-host.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class PyodideSymPyService implements SymPyService {
  constructor(private readonly host: PyodideHost) {}

  async checkSolution(input: SymPyCheckSolutionInput): Promise<SymPyCheckSolutionResult> {
    const code = buildScript("check_solution", {
      equation: input.equation,
      variable: input.variable,
      proposed_value: input.proposedValue,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "check_solution") as unknown as SymPyCheckSolutionResult;
  }

  async solveEquation(input: SymPySolveEquationInput): Promise<SymPySolveEquationResult> {
    const code = buildScript("solve_equation", {
      equation: input.equation,
      variable: input.variable,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "solve_equation") as unknown as SymPySolveEquationResult;
  }

  async simplify(input: SymPySimplifyInput): Promise<SymPySimplifyResult> {
    const code = buildScript("simplify", {
      expression: input.expression,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "simplify") as unknown as SymPySimplifyResult;
  }

  async checkEquivalent(input: SymPyCheckEquivalentInput): Promise<SymPyCheckEquivalentResult> {
    const code = buildScript("check_equivalent", {
      expression1: input.expression1,
      expression2: input.expression2,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "check_equivalent") as unknown as SymPyCheckEquivalentResult;
  }

  async parseLatex(input: SymPyParseLatexInput): Promise<SymPyParseLatexResult> {
    const code = buildScript("parse_latex", { latex: input.latex });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "parse_latex") as unknown as SymPyParseLatexResult;
  }
}

/**
 * Build a Python script that imports sympy, dispatches to the requested op,
 * and prints a JSON result to stdout. The TS side captures stdout and parses.
 *
 * This generator is intentionally small and deterministic — every op gets the
 * same boilerplate so the TS parser knows the contract. Args are interpolated
 * via JSON encoding (no shell injection risk because there's no shell).
 */
function buildScript(op: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args);
  return `
import json
import sympy
from sympy.parsing.sympy_parser import parse_expr

ARGS = json.loads(${JSON.stringify(argsJson)})

def parse_input_expr(s, is_latex):
    if is_latex:
        from sympy.parsing.latex import parse_latex as _pl
        return _pl(s)
    return parse_expr(s, transformations="all")

def parse_equation(s, is_latex):
    if "=" in s and not is_latex:
        lhs, rhs = s.split("=", 1)
        return sympy.Eq(parse_input_expr(lhs, False), parse_input_expr(rhs, False))
    if is_latex:
        return parse_input_expr(s, True)
    return sympy.Eq(parse_input_expr(s, False), 0)

def op_check_solution(args):
    eq = parse_equation(args["equation"], args["is_latex"])
    var = sympy.Symbol(args["variable"])
    proposed = parse_input_expr(args["proposed_value"], False)
    sols = sympy.solve(eq, var)
    sol_strs = [str(s) for s in sols]
    correct = any(sympy.simplify(s - proposed) == 0 for s in sols)
    return {
        "correct": correct,
        "proposedValue": str(proposed),
        "expectedSolutions": sol_strs,
    }

def op_solve_equation(args):
    eq = parse_equation(args["equation"], args["is_latex"])
    var = sympy.Symbol(args["variable"])
    sols = sympy.solve(eq, var)
    return {"solutions": [str(s) for s in sols]}

def op_simplify(args):
    expr = parse_input_expr(args["expression"], args["is_latex"])
    s = sympy.simplify(expr)
    return {"simplified": str(s), "simplifiedLatex": sympy.latex(s)}

def op_check_equivalent(args):
    e1 = parse_input_expr(args["expression1"], args["is_latex"])
    e2 = parse_input_expr(args["expression2"], args["is_latex"])
    diff = sympy.simplify(e1 - e2)
    return {"equivalent": diff == 0, "difference": str(diff)}

def op_parse_latex(args):
    expr = parse_input_expr(args["latex"], True)
    return {
        "sympyExpression": str(expr),
        "normalizedLatex": sympy.latex(expr),
    }

OPS = {
    "check_solution": op_check_solution,
    "solve_equation": op_solve_equation,
    "simplify": op_simplify,
    "check_equivalent": op_check_equivalent,
    "parse_latex": op_parse_latex,
}

try:
    out = OPS[${JSON.stringify(op)}](ARGS)
    print(json.dumps({"ok": True, "result": out}))
except Exception as e:
    print(json.dumps({"ok": False, "error": {"type": type(e).__name__, "message": str(e)}}))
`.trim();
}

interface ScriptOk {
  ok: true;
  result: Record<string, unknown>;
}
interface ScriptErr {
  ok: false;
  error: { type: string; message: string };
}

function parseScriptResult(
  pyResult: { stdout: string; stderr: string; timedOut: boolean; pythonError?: string },
  op: string,
): Record<string, unknown> {
  if (pyResult.timedOut) {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: `sympy ${op} timed out`,
    };
  }
  if (pyResult.pythonError) {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: pyResult.pythonError,
    };
  }
  const lastLine = pyResult.stdout.trim().split("\n").pop() ?? "";
  let parsed: ScriptOk | ScriptErr;
  try {
    parsed = JSON.parse(lastLine) as ScriptOk | ScriptErr;
  } catch {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: `Could not parse sympy output: ${lastLine}`,
    };
  }
  if (!parsed.ok) {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: `${parsed.error.type}: ${parsed.error.message}`,
    };
  }
  return parsed.result;
}

function emptyResultFor(op: string): Record<string, unknown> {
  switch (op) {
    case "check_solution":
      return { correct: false, proposedValue: "", expectedSolutions: [] };
    case "solve_equation":
      return { solutions: [] };
    case "simplify":
      return { simplified: "", simplifiedLatex: "" };
    case "check_equivalent":
      return { equivalent: false };
    case "parse_latex":
      return { sympyExpression: "", normalizedLatex: "" };
    default:
      return {};
  }
}
