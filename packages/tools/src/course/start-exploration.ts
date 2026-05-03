import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { runConceptExplorer } from "@praxis/curriculum/bootstrap";
import { z } from "zod";
import { documentListSectionsTool } from "../document/list-sections.js";
import { documentOutlineTool } from "../document/outline.js";
import { documentReadPagesTool } from "../document/read-pages.js";
import { retrieveFromTextbookTool } from "../retrieval/retrieve-from-textbook.js";
import { draftAddConceptTool } from "./draft-add-concept.js";
import { draftAddEdgeTool } from "./draft-add-edge.js";
import { draftAddLessonTool } from "./draft-add-lesson.js";
import { draftAddLessonAssessmentTool } from "./draft-add-lesson-assessment.js";
import { draftAddUnitTool } from "./draft-add-unit.js";
import { draftFinalizeTool } from "./draft-finalize.js";
import { draftInitTool } from "./draft-init.js";
import { draftRemoveConceptTool } from "./draft-remove-concept.js";
import { draftRemoveLessonTool } from "./draft-remove-lesson.js";
import { draftSetAssessmentPlanTool } from "./draft-set-assessment-plan.js";
import { draftSetMetadataTool } from "./draft-set-metadata.js";

const InputSchema = z.object({
  documentIds: z
    .array(z.string())
    .min(1)
    .describe("Document IDs to explore. Obtain from course.list_library_documents."),
  courseTitle: z.string().min(1).describe("Desired course title."),
  subject: z.string().min(1).describe("Subject slug, e.g. 'math.algebra-1'."),
  gradeLevel: z.string().min(1).describe("Grade level, e.g. '9-12'."),
  maxSteps: z
    .number()
    .int()
    .min(5)
    .max(60)
    .default(30)
    .describe("Maximum tool-call steps for the explorer agent."),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    draftId: z.string(),
    summary: z.object({
      draftId: z.string(),
      title: z.string(),
      lessonCount: z.number(),
      conceptCount: z.number(),
      edgeCount: z.number(),
      firstLessons: z.array(z.object({ title: z.string(), conceptCount: z.number() })),
      unitCount: z.number(),
      assessmentCount: z.number(),
    }),
    stepsUsed: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["max_steps_reached", "engine_error", "no_finalize_call", "validation_failed"]),
    issues: z.array(z.object({ kind: z.string(), message: z.string() })).optional(),
    stepsUsed: z.number(),
    draftId: z.string().optional(),
  }),
]);

export const startExplorationTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_exploration",
  description:
    "Run the concept-explorer agent on the selected source documents to produce a course draft. The explorer reads the documents using deterministic + semantic search tools, then builds the concept graph and lesson plan incrementally. Returns the draftId on success — pass it to course.show_draft to render the draft to the user. If ok:false, narrate the failure to the user and offer to retry with a tighter scope.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate", "external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const explorerToolDefs = [
      // Read-only exploration tools
      retrieveFromTextbookTool,
      documentOutlineTool,
      documentListSectionsTool,
      documentReadPagesTool,
      // Draft init + metadata
      draftInitTool,
      draftSetMetadataTool,
      // Concept + edge mutations
      draftAddConceptTool,
      draftRemoveConceptTool,
      draftAddEdgeTool,
      // Lesson mutations
      draftAddLessonTool,
      draftRemoveLessonTool,
      // Phase 16: unit + assessment scaffold (explorer-only)
      draftAddUnitTool,
      draftSetAssessmentPlanTool,
      draftAddLessonAssessmentTool,
      // Finalize
      draftFinalizeTool,
    ];

    const engine = ctx.services.engineResolver();

    const actHandle = ctx.services.activity?.start({
      label: `exploring ${args.courseTitle.toLowerCase()}`,
      detail: "reading materials",
    });

    const result = await runConceptExplorer({
      engine,
      baseContext: ctx,
      toolDefinitions: explorerToolDefs,
      documentIds: args.documentIds.map((id) => brandId<"DocumentId">(id)),
      courseTitle: args.courseTitle,
      subject: args.subject,
      gradeLevel: args.gradeLevel,
      log: ctx.log,
      maxSteps: args.maxSteps,
      onProgress: (phase) => {
        const detail =
          phase === "reading"
            ? "reading materials"
            : phase === "shaping"
              ? "shaping the course"
              : "finalizing";
        actHandle?.update({ detail });
      },
    });

    actHandle?.finish(result.ok ? "done" : "failed", {
      message: result.ok ? "done" : (result.reason ?? "explorer error"),
    });

    if (result.ok && result.draftId !== undefined && result.summary !== undefined) {
      return {
        ok: true as const,
        draftId: result.draftId,
        summary: result.summary,
        stepsUsed: result.stepsUsed,
      };
    }

    return {
      ok: false as const,
      reason: result.reason ?? "engine_error",
      ...(result.issues !== undefined && { issues: Array.from(result.issues) }),
      ...(result.draftId !== undefined && { draftId: result.draftId }),
      stepsUsed: result.stepsUsed,
    };
  },
};
