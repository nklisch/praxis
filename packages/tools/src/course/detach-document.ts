import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { DocumentId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentId: z.string().min(1).describe("Document id to detach from the active course."),
});

const OutputSchema = z.object({
  detached: z.boolean(),
  message: z.string(),
});

export const detachDocumentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.detach_document",
  description:
    "Detach a document from the active course. Idempotent — returns detached=false if the document was not attached. The document remains in the student's library. Errors if no course is in scope.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    if (ctx.courseId === undefined) {
      throw new Error("course.detach_document requires a course-scoped session");
    }
    const result = await ctx.services.courseDocuments.detach({
      courseId: ctx.courseId,
      documentId: brandId<"DocumentId">(args.documentId) as DocumentId,
    });
    return {
      detached: result.detached,
      message: result.detached ? "Document detached." : "Document was not attached.",
    };
  },
};
