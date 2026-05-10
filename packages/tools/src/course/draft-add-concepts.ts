import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  concepts: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .describe("Concept name (1-4 words, no jargon the student wouldn't know)."),
        description: z.string().min(1).describe("One-sentence description of the concept."),
      }),
    )
    .min(1)
    .describe("Concepts to add. Order is preserved; each is added in turn."),
});

const OutputSchema = z.object({
  /** True iff every concept in the batch was added successfully. */
  ok: z.boolean(),
  /** Total concept count on the draft after the batch. */
  conceptCount: z.number().int(),
  /**
   * Per-item results, in input order. Use this to inspect which concepts
   * were rejected (e.g. duplicate names) without having to re-call.
   */
  results: z.array(
    z.union([
      z.object({ ok: z.literal(true), name: z.string() }),
      z.object({ ok: z.literal(false), name: z.string(), reason: z.string() }),
    ]),
  ),
});

export const draftAddConceptsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_concepts",
  description:
    "Add many concepts to the draft in one tool call. Order preserved. Each concept is independently validated; duplicates and invalid entries are reported in `results` without aborting the rest. Prefer this over course.draft_add_concept whenever you have more than one concept to add — it costs one step regardless of array length.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) {
      return {
        ok: false,
        conceptCount: 0,
        results: args.concepts.map((c) => ({
          ok: false as const,
          name: c.name,
          reason: "no draftId in args or session context",
        })),
      };
    }
    const results: Array<{ ok: true; name: string } | { ok: false; name: string; reason: string }> =
      [];
    let lastConceptCount = 0;
    let allOk = true;
    for (const c of args.concepts) {
      const r = await ctx.services.bootstrap.addConcept({
        draftId,
        name: c.name,
        description: c.description,
      });
      if (r.ok) {
        lastConceptCount = r.conceptCount;
        results.push({ ok: true, name: c.name });
      } else {
        allOk = false;
        results.push({ ok: false, name: c.name, reason: r.reason });
      }
    }
    return { ok: allOk, conceptCount: lastConceptCount, results };
  },
};
