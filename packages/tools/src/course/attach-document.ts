import type { DocumentId, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentId: z.string().min(1).describe("Document id from course.list_library_documents."),
});

const OutputSchema = z.object({
  attached: z.boolean(),
  message: z.string(),
});

export const attachDocumentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.attach_document",
  description:
    "Attach an existing library document to the active course. Idempotent — returns attached=false with a message if already attached. Errors if no course is in scope.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    if (ctx.courseId === undefined) {
      throw new Error("course.attach_document requires a course-scoped session");
    }
    const result = await ctx.services.documentScopes.attach({
      scope: { kind: "course", id: ctx.courseId },
      documentId: brandId<"DocumentId">(args.documentId) as DocumentId,
      source: "manual",
    });
    return {
      attached: result.attached,
      message: result.attached ? "Document attached." : "Document was already attached.",
    };
  },
};
