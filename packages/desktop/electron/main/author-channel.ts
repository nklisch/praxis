import type {
  ConceptId,
  CourseId,
  GateId,
  GateTarget,
  LessonId,
  Logger,
  MisconceptionId,
  StudentId,
  SuccessCriteria,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the authoring service.
 *
 * Every handler calls requireUnlocked() first — IPC safety layer.
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.updateCourse
 *   praxis.author.createLesson
 *   praxis.author.updateLesson
 *   praxis.author.deleteLesson
 *   praxis.author.createGate
 *   praxis.author.updateGate
 *   praxis.author.deleteGate
 *   praxis.author.overrideGate
 *   praxis.author.getCourseSummary
 *   praxis.author.customizePrompt
 *   praxis.author.listFragmentOverrides
 *   praxis.author.clearFragmentOverride
 *   praxis.author.setStyleSliders
 *   praxis.author.setGlobalPrompt
 *   praxis.author.getGlobalPrompt
 *   praxis.author.setModeAppend
 *   praxis.author.getModeAppend
 *   praxis.author.previewPrompt
 *   praxis.author.previewPromptWithAttribution
 *   praxis.author.resetConcept
 *   praxis.author.clearMisconception
 *   praxis.author.exportMemory
 *   praxis.author.deleteAllMemory
 *   praxis.author.listConfiguratorActions
 *   praxis.author.restoreAction
 */
export function registerAuthorHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  /**
   * IPC safety guard for all praxis.author.* handlers.
   * Throws when the lock is set but the current process hasn't unlocked.
   * This is the backstop: even if the UI has a bug that sends an author
   * call while locked, this guard refuses it.
   */
  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  // Shared schemas for groups of channels with the same payload shape.
  const modeIdSchema = z.object({ modeId: z.string().min(1, "modeId") });

  const previewPromptSchema = z.object({
    modeId: z.string().min(1, "modeId"),
    draftGlobal: z.string().nullable().optional(),
    draftAppend: z.string().nullable().optional(),
  });

  handle(
    "praxis.author.updateCourse",
    handleEnvelope(
      "praxis.author.updateCourse",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        patch: z.object({
          title: z.string().optional(),
          subject: z.string().optional(),
          gradeLevel: z.string().optional(),
        }),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.updateCourse({
          courseId: brandId<"CourseId">(input.courseId),
          patch: input.patch as Parameters<typeof services.authoring.updateCourse>[0]["patch"],
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.createLesson",
    handleEnvelope(
      "praxis.author.createLesson",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        title: z.string().min(1, "title"),
        conceptIds: z.array(z.string().min(1)),
        orderIndex: z.number().int().optional(),
        estimatedMinutes: z.number().int().positive().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.createLesson({
          courseId: brandId<"CourseId">(input.courseId),
          title: input.title,
          conceptIds: input.conceptIds.map((id) => brandId<"ConceptId">(id) as ConceptId),
          ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
          ...(input.estimatedMinutes !== undefined && { estimatedMinutes: input.estimatedMinutes }),
        });
      },
    ),
  );

  handle(
    "praxis.author.updateLesson",
    handleEnvelope(
      "praxis.author.updateLesson",
      log,
      z.object({
        lessonId: z.string().min(1, "lessonId"),
        patch: z.object({
          title: z.string().optional(),
          conceptIds: z.array(z.string().min(1)).optional(),
          estimatedMinutes: z.number().int().positive().optional(),
        }),
      }),
      async (input) => {
        await requireUnlocked();
        const patch: {
          title?: string;
          conceptIds?: ConceptId[];
          estimatedMinutes?: number;
        } = {};
        if (input.patch.title !== undefined) patch.title = input.patch.title;
        if (input.patch.conceptIds !== undefined) {
          patch.conceptIds = input.patch.conceptIds.map(
            (id) => brandId<"ConceptId">(id) as ConceptId,
          );
        }
        if (input.patch.estimatedMinutes !== undefined)
          patch.estimatedMinutes = input.patch.estimatedMinutes;
        return services.authoring.updateLesson({
          lessonId: brandId<"LessonId">(input.lessonId) as LessonId,
          patch,
        });
      },
    ),
  );

  handle(
    "praxis.author.deleteLesson",
    handleEnvelope(
      "praxis.author.deleteLesson",
      log,
      z.object({
        lessonId: z.string().min(1, "lessonId"),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.deleteLesson({
          lessonId: brandId<"LessonId">(input.lessonId) as LessonId,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.createGate",
    handleEnvelope(
      "praxis.author.createGate",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        guards: z.unknown(),
        prerequisites: z.array(z.string().min(1)),
        successCriteria: z.unknown(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.createGate({
          courseId: brandId<"CourseId">(input.courseId) as CourseId,
          guards: input.guards as GateTarget,
          prerequisites: input.prerequisites.map((id) => brandId<"GateId">(id) as GateId),
          successCriteria: input.successCriteria as SuccessCriteria,
        });
      },
    ),
  );

  handle(
    "praxis.author.updateGate",
    handleEnvelope(
      "praxis.author.updateGate",
      log,
      z.object({
        gateId: z.string().min(1, "gateId"),
        patch: z.object({
          prerequisites: z.array(z.string().min(1)).optional(),
          successCriteria: z.unknown().optional(),
        }),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        const patch: {
          prerequisites?: GateId[];
          successCriteria?: SuccessCriteria;
        } = {};
        if (input.patch.prerequisites !== undefined) {
          patch.prerequisites = input.patch.prerequisites.map(
            (id) => brandId<"GateId">(id) as GateId,
          );
        }
        if (input.patch.successCriteria !== undefined) {
          patch.successCriteria = input.patch.successCriteria as SuccessCriteria;
        }
        return services.authoring.updateGate({
          gateId: brandId<"GateId">(input.gateId) as GateId,
          patch,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.deleteGate",
    handleEnvelope(
      "praxis.author.deleteGate",
      log,
      z.object({
        gateId: z.string().min(1, "gateId"),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.deleteGate({
          gateId: brandId<"GateId">(input.gateId) as GateId,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.overrideGate",
    handleEnvelope(
      "praxis.author.overrideGate",
      log,
      z.object({
        gateId: z.string().min(1, "gateId"),
        reason: z.string().min(1, "reason"),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.overrideGate({
          gateId: brandId<"GateId">(input.gateId) as GateId,
          reason: input.reason,
        });
      },
    ),
  );

  handle(
    "praxis.author.getCourseSummary",
    handleEnvelope(
      "praxis.author.getCourseSummary",
      log,
      z.string().min(1, "courseId"),
      async (courseId) => {
        await requireUnlocked();
        return services.authoring.getCourseSummary(brandId<"CourseId">(courseId) as CourseId);
      },
    ),
  );

  handle(
    "praxis.author.customizePrompt",
    handleEnvelope(
      "praxis.author.customizePrompt",
      log,
      z.object({
        modeId: z.string().min(1, "modeId"),
        fragmentId: z.string().min(1, "fragmentId"),
        override: z.string(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.customizePrompt(input.modeId, input.fragmentId, input.override);
      },
    ),
  );

  handle(
    "praxis.author.listFragmentOverrides",
    handleEnvelope("praxis.author.listFragmentOverrides", log, modeIdSchema, async (input) => {
      await requireUnlocked();
      return services.authoring.listFragmentOverrides(input.modeId);
    }),
  );

  handle(
    "praxis.author.clearFragmentOverride",
    handleEnvelope(
      "praxis.author.clearFragmentOverride",
      log,
      z.object({
        modeId: z.string().min(1, "modeId"),
        fragmentId: z.string().min(1, "fragmentId"),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.clearFragmentOverride(input);
      },
    ),
  );

  handle(
    "praxis.author.setStyleSliders",
    handleEnvelope(
      "praxis.author.setStyleSliders",
      log,
      z.object({
        socratic: z.number().min(0).max(10),
        verbosity: z.number().min(0).max(10),
        formality: z.number().min(0).max(10),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.setStyleSliders(input);
      },
    ),
  );

  // Prompt customization layers

  handle(
    "praxis.author.setGlobalPrompt",
    handleEnvelope(
      "praxis.author.setGlobalPrompt",
      log,
      z.object({ text: z.string().nullable() }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.setGlobalPrompt(input.text);
      },
    ),
  );

  handle(
    "praxis.author.getGlobalPrompt",
    wrapEnvelope("praxis.author.getGlobalPrompt", log, async () => {
      await requireUnlocked();
      return services.authoring.getGlobalPrompt();
    }),
  );

  handle(
    "praxis.author.setModeAppend",
    handleEnvelope(
      "praxis.author.setModeAppend",
      log,
      z.object({
        modeId: z.string().min(1, "modeId"),
        text: z.string().nullable(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.setModeAppend(input);
      },
    ),
  );

  handle(
    "praxis.author.getModeAppend",
    handleEnvelope("praxis.author.getModeAppend", log, modeIdSchema, async (input) => {
      await requireUnlocked();
      return services.authoring.getModeAppend(input.modeId);
    }),
  );

  handle(
    "praxis.author.previewPrompt",
    handleEnvelope("praxis.author.previewPrompt", log, previewPromptSchema, async (input) => {
      await requireUnlocked();
      return services.authoring.previewPrompt({
        modeId: input.modeId,
        ...(input.draftGlobal !== undefined && { draftGlobal: input.draftGlobal }),
        ...(input.draftAppend !== undefined && { draftAppend: input.draftAppend }),
      });
    }),
  );

  handle(
    "praxis.author.previewPromptWithAttribution",
    handleEnvelope(
      "praxis.author.previewPromptWithAttribution",
      log,
      previewPromptSchema,
      async (input) => {
        await requireUnlocked();
        return services.authoring.previewPromptWithAttribution({
          modeId: input.modeId,
          ...(input.draftGlobal !== undefined && { draftGlobal: input.draftGlobal }),
          ...(input.draftAppend !== undefined && { draftAppend: input.draftAppend }),
        });
      },
    ),
  );

  handle(
    "praxis.author.resetConcept",
    handleEnvelope(
      "praxis.author.resetConcept",
      log,
      z.object({
        conceptId: z.string().min(1, "conceptId"),
        reason: z.string().min(1, "reason"),
      }),
      async (input) => {
        await requireUnlocked();
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.authoring.resetConcept({
          studentId,
          conceptId: brandId<"ConceptId">(input.conceptId) as ConceptId,
          reason: input.reason,
        });
      },
    ),
  );

  handle(
    "praxis.author.clearMisconception",
    handleEnvelope(
      "praxis.author.clearMisconception",
      log,
      z.object({
        misconceptionId: z.string().min(1, "misconceptionId"),
        reason: z.string().min(1, "reason"),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.clearMisconception({
          misconceptionId: brandId<"MisconceptionId">(input.misconceptionId) as MisconceptionId,
          reason: input.reason,
        });
      },
    ),
  );

  handle(
    "praxis.author.exportMemory",
    handleEnvelope(
      "praxis.author.exportMemory",
      log,
      z.object({ targetPath: z.string().min(1, "targetPath") }),
      async (input) => {
        await requireUnlocked();
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.authoring.exportMemory({ studentId, targetPath: input.targetPath });
      },
    ),
  );

  handle(
    "praxis.author.deleteAllMemory",
    handleEnvelope(
      "praxis.author.deleteAllMemory",
      log,
      z.object({
        reason: z.string().min(1, "reason"),
        confirm: z.literal(true),
      }),
      async (input) => {
        await requireUnlocked();
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.authoring.deleteAllMemory({
          studentId,
          reason: input.reason,
          confirm: input.confirm,
        });
      },
    ),
  );

  handle(
    "praxis.author.listConfiguratorActions",
    handleEnvelope(
      "praxis.author.listConfiguratorActions",
      log,
      z
        .object({
          fromTs: z.number().optional(),
          limit: z.number().int().positive().optional(),
        })
        .optional(),
      async (input) => {
        await requireUnlocked();
        return services.authoring.listConfiguratorActions(
          input !== undefined
            ? {
                ...(input.fromTs !== undefined && {
                  fromTs: input.fromTs as import("@praxis/core/types").Timestamp,
                }),
                ...(input.limit !== undefined && { limit: input.limit }),
              }
            : undefined,
        );
      },
    ),
  );

  handle(
    "praxis.author.restoreAction",
    handleEnvelope(
      "praxis.author.restoreAction",
      log,
      z.object({ actionId: z.string().min(1, "actionId is required") }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.restoreAction({ actionId: input.actionId });
      },
    ),
  );
}
