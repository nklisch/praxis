import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  conceptId: z.string().min(1).describe("The concept ID this misconception is attributed to."),
  description: z
    .string()
    .min(1)
    .describe(
      "A clear, student-specific description of the misconception — what the student believes and why it is wrong.",
    ),
  errorForm: z
    .string()
    .min(1)
    .describe(
      "Canonical short label for this error pattern (e.g., 'distributes exponent over addition'). Used for deduplication — use consistent phrasing across sessions.",
    ),
  remediation: z
    .object({
      strategyId: z
        .string()
        .min(1)
        .describe(
          "Remediation strategy ID: worked-examples, socratic, elaborative-interrogation, analogy-bridging, or productive-failure-gauntlet.",
        ),
      rationale: z
        .string()
        .min(1)
        .describe("Brief explanation of why this strategy fits the misconception."),
    })
    .describe("Recommended remediation approach for this misconception."),
  evidenceEventIds: z
    .array(z.string())
    .min(1)
    .describe(
      "Episodic event IDs that ground this misconception. At least one required — these trace back to the turns where the error was observed.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  misconceptionId: z.string(),
  merged: z
    .boolean()
    .describe(
      "True when this upsert merged with an existing misconception row (same errorForm + concept). False for a new insert.",
    ),
});

export const recordMisconceptionTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "record_misconception",
  description:
    "Record a specific misconception the student has demonstrated — a persistent wrong mental model that will need targeted remediation. Use when you observe a clear pattern of incorrect reasoning (not just an arithmetic slip). Grounded in episodic evidence event IDs. Deduplicates by (conceptId, errorForm) — repeated calls with the same errorForm merge evidence.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const conceptId = brandId<"ConceptId">(args.conceptId);

    const result = ctx.services.memory.recordMisconception({
      studentId: ctx.studentId,
      conceptId,
      description: args.description,
      errorForm: args.errorForm,
      remediation: args.remediation,
      evidenceEventIds: args.evidenceEventIds,
    });

    return {
      ok: true,
      misconceptionId: result.misconceptionId,
      merged: result.merged,
    };
  },
};
