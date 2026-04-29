import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

export const codeSandboxInput = z.object({
  language: z
    .enum(["javascript", "python"])
    .describe(
      "Language to execute. Use python for scientific work; javascript for quick numeric or string operations.",
    ),
  code: z.string().describe("Source code to execute. Print results to stdout."),
  stdin: z.string().optional().describe("Optional stdin string. Only meaningful for Python."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30_000)
    .optional()
    .describe("Wall-clock timeout in ms. Default 5000, max 30000."),
});

export const codeSandboxOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  durationMs: z.number(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }).optional(),
});

export const codeSandboxTool: ToolDefinition<typeof codeSandboxInput, typeof codeSandboxOutput> = {
  name: "code_sandbox",
  description: `Run JavaScript or Python in a sandboxed environment. No filesystem, no network. Output captured from stdout/stderr.

Use cases:
- Demonstrate an algorithm to the student step-by-step (print intermediate values).
- Verify a numeric computation that's too messy for grade_math.
- Run a small simulation or example.

DO NOT use for grading math — use grade_math instead (deterministic, citable).
Default timeout: 5 seconds. Max: 30 seconds. Max output per stream: 1MB.`,
  input: codeSandboxInput,
  output: codeSandboxOutput,
  tier: "deterministic",
  effects: ["external.code-exec"],
  async handler(args, ctx: ToolContext) {
    return ctx.services.sandbox.run({
      language: args.language,
      code: args.code,
      ...(args.stdin !== undefined && { stdin: args.stdin }),
      ...(args.timeoutMs !== undefined && { timeoutMs: args.timeoutMs }),
    });
  },
};
