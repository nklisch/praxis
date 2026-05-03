import type { AssignmentItem, AssignmentResponse, CodeItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

/**
 * CodeGrader — runs each test case through the sandbox and grades on
 * passed/total basis. Partial credit: a 3/5 test-case pass yields score=0.6.
 *
 * Reads `item.testCases` and `item.language`.
 * Returns `needs-human-review` when test cases or language are not set.
 */
export class CodeGrader implements ItemGrader {
  readonly kind = "code" as const;

  async grade({
    item,
    response,
    ctx,
  }: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const ci = item as CodeItem;
    if (ci.testCases.length === 0) {
      return {
        score: null,
        feedback: "needs-human-review (no test cases configured)",
        tier: "needs-human-review",
      };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No code provided.", tier: "deterministic" };
    }

    let passed = 0;
    const failures: string[] = [];

    for (const tc of ci.testCases) {
      const run = await ctx.services.sandbox.run({
        language: ci.language,
        code: response.response,
        ...(tc.stdin !== undefined && { stdin: tc.stdin }),
        timeoutMs: tc.timeoutMs ?? 5000,
      });

      const ok =
        !run.timedOut && run.exitCode === 0 && run.stdout.trim() === tc.expectedStdout.trim();

      if (ok) {
        passed++;
      } else {
        const why = run.timedOut
          ? "timeout"
          : run.stderr.trim()
            ? `stderr: ${run.stderr.slice(0, 120).trim()}`
            : `stdout mismatch (expected ${JSON.stringify(tc.expectedStdout.trim())}, got ${JSON.stringify(run.stdout.trim())})`;
        const label = tc.stdin !== undefined ? `stdin=${JSON.stringify(tc.stdin)}` : "test";
        failures.push(`${label}: ${why}`);
      }
    }

    const score = passed / ci.testCases.length;
    return {
      score,
      feedback:
        score === 1
          ? `All ${ci.testCases.length} test case${ci.testCases.length === 1 ? "" : "s"} passed.`
          : `${passed}/${ci.testCases.length} test cases passed. Failures:\n${failures.join("\n")}`,
      tier: "deterministic",
    };
  }
}
