import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { runConceptExplorer } from "@praxis/curriculum/bootstrap";
import { z } from "zod";
import { documentListSectionsTool } from "../document/list-sections.js";
import { documentOutlineTool } from "../document/outline.js";
import { documentReadPagesTool } from "../document/read-pages.js";
import { retrieveFromDocumentsTool } from "../retrieval/retrieve-from-documents.js";
import { draftAddConceptsTool } from "./draft-add-concepts.js";
import { draftAddEdgesTool } from "./draft-add-edges.js";
import { draftAddLessonAssessmentsTool } from "./draft-add-lesson-assessments.js";
import { draftAddLessonsTool } from "./draft-add-lessons.js";
import { draftAddUnitTool } from "./draft-add-unit.js";
import { draftInitTool } from "./draft-init.js";
import { draftRemoveConceptTool } from "./draft-remove-concept.js";
import { draftRemoveLessonTool } from "./draft-remove-lesson.js";
import { draftSetAssessmentPlanTool } from "./draft-set-assessment-plan.js";
import { draftSetMetadataTool } from "./draft-set-metadata.js";
import { showDraftTool } from "./show-draft.js";

const InputSchema = z.object({
  documentIds: z
    .array(z.string())
    .min(1)
    .describe("Document IDs to explore. Obtain from course.list_library_documents."),
  courseTitle: z.string().min(1).describe("Desired course title."),
  subject: z.string().min(1).describe("Subject slug, e.g. 'math.algebra-1'."),
  gradeLevel: z.string().min(1).describe("Grade level, e.g. '9-12'."),
  draftId: z
    .string()
    .optional()
    .describe(
      "Optional. Pass an existing draftId to CONTINUE building that draft instead " +
        "of starting fresh — the explorer will read the current draft state and add " +
        "to it. Use this when a previous start_exploration returned exhaustedBudget=true.",
    ),
  instructions: z
    .string()
    .max(4000)
    .optional()
    .describe(
      "Optional free-form guidance for the explorer (max 4000 chars). Use this for " +
        "anything the structured fields can't carry: chapter / page-range scope " +
        "(e.g. 'focus on Ch. R through Ch. 4 of Sullivan'), emphasis hints " +
        "('skip trig; treat polynomials lightly'), pedagogy preferences " +
        "('prefer worked-examples lessons'), or student context you've gathered " +
        "in chat ('student has weak fractions, scaffold accordingly'). " +
        "Surfaced verbatim in the explorer's initial message under a " +
        "'Tutor instructions' header.",
    ),
  maxSteps: z
    .number()
    .int()
    .min(5)
    .max(200)
    .optional()
    .describe(
      "Optional per-call cap on tool-call steps for the explorer agent. " +
        "Capped server-side by the user-set bootstrap budget (defaults to 200). " +
        "Omit to use the user's configured budget. Provide a smaller number only " +
        "when you've narrowed scope (e.g. a single chapter) and want to fail fast.",
    ),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    draftId: z.string(),
    summary: z
      .object({
        draftId: z.string(),
        title: z.string(),
        lessonCount: z.number(),
        conceptCount: z.number(),
        edgeCount: z.number(),
        firstLessons: z.array(z.object({ title: z.string(), conceptCount: z.number() })),
        unitCount: z.number(),
        assessmentCount: z.number(),
      })
      .optional(),
    /**
     * True when the explorer ran short of budget. The draft is still usable
     * — call course.start_exploration again with the same draftId to continue,
     * or course.confirm_draft to persist what's there.
     */
    exhaustedBudget: z.boolean().optional(),
    stepsUsed: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["no_draft_init", "engine_error"]),
    stepsUsed: z.number(),
  }),
]);

export const startExplorationTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_exploration",
  description:
    "Run the concept-explorer agent on the selected source documents to build a course draft. Reads the materials and incrementally writes concepts, edges, lessons, units, and assessments into a draft. Returns a draftId — pass it to course.show_draft to render it, course.confirm_draft to persist as a real course, or course.start_exploration again (with the same draftId) to keep building. If `exhaustedBudget` is true the explorer stopped short of finishing — offer the student a continuation. There is no separate finalize step; validation runs at confirm_draft time.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate", "external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const explorerToolDefs = [
      // Read-only exploration tools.
      retrieveFromDocumentsTool,
      documentOutlineTool,
      documentListSectionsTool,
      documentReadPagesTool,
      showDraftTool, // continuation case — read what's already there
      // Draft init + metadata.
      draftInitTool,
      draftSetMetadataTool,
      // Concept + edge mutations (batch only).
      draftAddConceptsTool,
      draftRemoveConceptTool,
      draftAddEdgesTool,
      // Lesson mutations.
      draftAddLessonsTool,
      draftRemoveLessonTool,
      // Unit + assessment scaffold.
      draftAddUnitTool,
      draftSetAssessmentPlanTool,
      draftAddLessonAssessmentsTool,
    ];

    const engine = ctx.services.engineResolver();

    // Resolve the effective tool-call budget. The user's UI knob caps
    // everything; the model can request a tighter cap by passing maxSteps but
    // can never exceed the user setting. When the resolver is absent (e.g.
    // test stubs that don't wire it), fall back to a generous 200 so realistic
    // bootstraps still complete.
    const userMax = ctx.services.bootstrapConfigResolver?.().maxSteps ?? 200;
    const requested = args.maxSteps ?? userMax;
    const effectiveMaxSteps = Math.min(requested, userMax);

    const subHandle =
      ctx.callId !== undefined
        ? ctx.services.subAgent?.start({
            parentCallId: ctx.callId,
            sessionId: ctx.sessionId,
            label: args.draftId !== undefined ? "continuing your draft" : "reading your materials",
          })
        : undefined;

    const actHandle = ctx.services.activity?.start({
      label: `${args.draftId !== undefined ? "continuing" : "exploring"} ${args.courseTitle.toLowerCase()}`,
      detail: args.draftId !== undefined ? "reading prior draft" : "reading materials",
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
      maxSteps: effectiveMaxSteps,
      ...(args.draftId !== undefined && { draftId: args.draftId }),
      ...(args.instructions !== undefined && { instructions: args.instructions }),
      subAgentHandle: subHandle,
      onProgress: (phase) => {
        const detail =
          phase === "reading"
            ? "reading materials"
            : phase === "shaping"
              ? "shaping the course"
              : "finalizing";
        actHandle?.update({ detail });
        // Sub-agent label updates are emitted inside the explorer's loop via
        // subAgentHandle.setLabel() on phase transitions (reading/shaping/finalizing).
        // The onProgress callback here drives the activity rail detail; the sub-agent
        // handle drives the inline sub-agent block label.
      },
    });

    subHandle?.finish(result.ok ? "done" : "failed", {
      message: result.ok ? "done" : (result.reason ?? "explorer error"),
    });
    actHandle?.finish(result.ok ? "done" : "failed", {
      message: result.ok ? "done" : (result.reason ?? "explorer error"),
    });

    if (result.ok && result.draftId !== undefined) {
      return {
        ok: true as const,
        draftId: result.draftId,
        ...(result.summary !== undefined && { summary: result.summary }),
        ...(result.exhaustedBudget === true && { exhaustedBudget: true }),
        stepsUsed: result.stepsUsed,
      };
    }

    return {
      ok: false as const,
      reason: result.reason ?? "engine_error",
      stepsUsed: result.stepsUsed,
    };
  },
};
