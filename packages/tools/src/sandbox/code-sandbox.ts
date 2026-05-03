import type { CodeSandbox, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

export const codeSandboxOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  durationMs: z.number(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }).optional(),
});

/**
 * Factory: builds the `code_sandbox` tool with a Zod input enum derived
 * from the supplied sandbox's `availableLanguages`. Single source of
 * truth — adding a new language adapter automatically expands the
 * tool's accepted inputs.
 *
 * Throws if the sandbox has zero languages registered (no point
 * registering a no-op tool).
 */
export function createCodeSandboxTool(
  sandbox: CodeSandbox,
): ToolDefinition<z.ZodType, typeof codeSandboxOutput> {
  const langs = sandbox.availableLanguages;
  if (langs.length === 0) {
    throw new Error("createCodeSandboxTool: sandbox has no language adapters registered");
  }
  const languageEnum = z.enum(langs as readonly [string, ...string[]]);

  const codeSandboxInput = z.object({
    language: languageEnum.describe(`Language to execute. One of: ${langs.join(", ")}.`),
    code: z.string().describe("Source code to execute. Print results to stdout."),
    stdin: z
      .string()
      .optional()
      .describe(
        "Optional stdin string. Only meaningful for languages that support it (e.g., Python).",
      ),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(30_000)
      .optional()
      .describe("Wall-clock timeout in ms. Default 5000, max 30000."),
  });

  return {
    name: "code_sandbox",
    description: buildDescription(langs),
    input: codeSandboxInput,
    output: codeSandboxOutput,
    tier: "deterministic",
    effects: ["external.code-exec"],
    // biome-ignore lint/suspicious/noExplicitAny: args is z.infer<z.ZodType> = unknown; typed via codeSandboxInput
    async handler(args: any, ctx: ToolContext) {
      return ctx.services.sandbox.run({
        language: args.language as string,
        code: args.code as string,
        ...(args.stdin !== undefined && { stdin: args.stdin as string }),
        ...(args.timeoutMs !== undefined && { timeoutMs: args.timeoutMs as number }),
      });
    },
  };
}

function buildDescription(languages: readonly string[]): string {
  return `Run code in a sandboxed environment. No filesystem, no network. Output captured from stdout/stderr. Available languages: ${languages.join(", ")}.

Use cases:
- Demonstrate an algorithm to the student step-by-step (print intermediate values).
- Verify a numeric computation that's too messy for grade_math.
- Run a small simulation or example.

DO NOT use for grading math — use grade_math instead (deterministic, citable).
Default timeout: 5 seconds. Max: 30 seconds. Max output per stream: 1MB.`;
}

// ── Legacy static export — kept for backward compat during Unit 7 transition. ──
// Unit 9 removes this once services.ts uses createCodeSandboxTool exclusively.

/** @deprecated Use createCodeSandboxTool(sandbox) instead. */
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

/** @deprecated Use createCodeSandboxTool(sandbox) instead. */
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
