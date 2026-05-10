import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  edges: z
    .array(
      z.object({
        fromName: z.string().min(1).describe("Prerequisite concept name (must already exist)."),
        toName: z.string().min(1).describe("Dependent concept name (must already exist)."),
        strength: z
          .number()
          .min(0)
          .max(1)
          .default(0.7)
          .describe("0.9 = strict prerequisite, 0.3 = weak suggestion, 0.7 if uncertain."),
        rationale: z
          .string()
          .describe("One-sentence explanation of why fromName is needed for toName."),
      }),
    )
    .min(1)
    .describe("Edges to add. Each is independently validated."),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  results: z.array(
    z.union([
      z.object({ ok: z.literal(true), fromName: z.string(), toName: z.string() }),
      z.object({
        ok: z.literal(false),
        fromName: z.string(),
        toName: z.string(),
        reason: z.string(),
      }),
    ]),
  ),
});

export const draftAddEdgesTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_add_edges",
  description:
    "Add many prerequisite edges in one tool call. Each fromName/toName must reference an existing concept. Costs one step regardless of array length. Per-item failures (unknown concept, duplicate edge, self-edge) are reported in `results` without aborting the rest.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) {
      return {
        ok: false,
        results: args.edges.map((e) => ({
          ok: false as const,
          fromName: e.fromName,
          toName: e.toName,
          reason: "no draftId in args or session context",
        })),
      };
    }
    const results: Array<
      | { ok: true; fromName: string; toName: string }
      | { ok: false; fromName: string; toName: string; reason: string }
    > = [];
    let allOk = true;
    for (const e of args.edges) {
      const r = await ctx.services.bootstrap.addEdge({
        draftId,
        fromName: e.fromName,
        toName: e.toName,
        strength: e.strength,
        rationale: e.rationale,
      });
      if (r.ok) {
        results.push({ ok: true, fromName: e.fromName, toName: e.toName });
      } else {
        allOk = false;
        results.push({ ok: false, fromName: e.fromName, toName: e.toName, reason: r.reason });
      }
    }
    return { ok: allOk, results };
  },
};
