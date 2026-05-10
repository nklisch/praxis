/**
 * pedagogy.list_techniques — list all study techniques in the active pack.
 *
 * Returns id, name, description, and uiAffordances per technique.
 * Citations are stripped from the wire shape.
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});

const TechniqueWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  uiAffordances: z.array(z.string()),
});

const OutputSchema = z.object({
  techniques: z.array(TechniqueWireSchema),
});

export const pedagogyListTechniquesTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: "pedagogy.list_techniques",
  description:
    "List all study techniques in the active pedagogy pack. Returns id, name, description, and uiAffordances per technique. Use pedagogy.get_technique to retrieve the full curriculum with lesson content. Returns an empty array when no pack is loaded.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: [],
  async handler(_args, ctx) {
    const techniques = ctx.services.pedagogyPack.listTechniques();
    return {
      techniques: techniques.map((t) => ({
        id: t.id as string,
        name: t.name,
        description: t.description,
        uiAffordances: t.uiAffordances,
      })),
    };
  },
};
