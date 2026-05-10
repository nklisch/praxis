/**
 * pedagogy.list_metacognitive_prompts — list metacognitive prompts, with
 * optional filtering by trigger type.
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const TRIGGER_ENUM = z.enum([
  "pre-reading",
  "post-reading",
  "pre-quiz",
  "post-error",
  "session-end",
]);

const InputSchema = z.object({
  trigger: TRIGGER_ENUM.optional().describe(
    "When provided, only prompts with this trigger are returned. Omit to retrieve all prompts.",
  ),
});

const PromptWireSchema = z.object({
  id: z.string(),
  trigger: TRIGGER_ENUM,
  template: z.string(),
});

const OutputSchema = z.object({
  prompts: z.array(PromptWireSchema),
});

export const pedagogyListMetacognitivePromptsTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: "pedagogy.list_metacognitive_prompts",
  description:
    "List metacognitive prompts from the active pedagogy pack, optionally filtered by trigger (pre-reading, post-reading, pre-quiz, post-error, session-end). Returns an empty array when no pack is loaded or no prompts match the trigger.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: [],
  async handler(args, ctx) {
    const prompts = ctx.services.pedagogyPack.listMetacognitivePrompts(
      args.trigger ? { trigger: args.trigger } : undefined,
    );
    return {
      prompts: prompts.map((p) => ({
        id: p.id,
        trigger: p.trigger,
        template: p.template,
      })),
    };
  },
};
