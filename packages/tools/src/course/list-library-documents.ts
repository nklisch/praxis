import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});

const OutputSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      chunkCount: z.number().int(),
      hasPageImages: z.boolean(),
      attachedToCurrentCourse: z.boolean(),
      /**
       * True when the document is attached to the current bootstrap session's
       * scope. Always false outside bootstrap mode (where no session-scope rows
       * exist for this session). Useful for the drafter to see which library
       * docs the active bootstrap session is reading from.
       */
      attachedToCurrentSession: z.boolean(),
    }),
  ),
});

export const listLibraryDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_library_documents",
  description:
    "List ALL documents in the student's library, with flags showing which are already attached to the active course (`attachedToCurrentCourse`) and which are scoped to the current bootstrap session (`attachedToCurrentSession`). Use this when the user wants to add a previously-ingested document to the current course, or to see what's available across the library. In bootstrap mode (no course yet), attachedToCurrentCourse is always false. attachedToCurrentSession is true for documents the active bootstrap exploration is reading.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const docs = await ctx.services.artifacts.listDocuments(ctx.studentId);
    const courseAttached = new Set(ctx.courseDocumentIds ?? []);

    // Session scope: look up which docs are session-attached in the current session.
    // In bootstrap mode, parentSessionId is set by the drafter harness to the
    // tutor session (S1) — that's the scope owner. In non-bootstrap sessions,
    // parentSessionId is undefined; fall back to sessionId (which also has no
    // session-scope rows in a normal tutor session, so the set will be empty).
    const sessionScopeId = ctx.parentSessionId ?? ctx.sessionId;
    const sessionAttachedIds = await ctx.services.documentScopes.listForScope({
      kind: "session",
      id: sessionScopeId,
    });
    const sessionAttached = new Set(sessionAttachedIds);

    return {
      documents: docs.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        mimeType: d.mimeType,
        chunkCount: d.chunkCount,
        hasPageImages: d.hasPageImages,
        attachedToCurrentCourse: courseAttached.has(d.documentId),
        attachedToCurrentSession: sessionAttached.has(d.documentId),
      })),
    };
  },
};
