import type {
  AssignmentId,
  ConceptId,
  CourseId,
  DocumentId,
  GateId,
  GateTarget,
  LessonId,
  Logger,
  MisconceptionId,
  NoteId,
  SessionId,
  StudentId,
  SuccessCriteria,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { ipcMain } from "electron";
import { z } from "zod";
import { registerActivityHandlers } from "./activity-channel.js";
import { registerAssignmentsHandlers } from "./assignments-channel.js";
import { registerAuthHandlers } from "./auth-channel.js";
import { registerCitationsHandlers } from "./citations-channel.js";
import { registerConceptMapsHandlers } from "./concept-maps-channel.js";
import { registerConfigHandlers } from "./config-channel.js";
import { registerCourseCreateDraftsHandlers } from "./course-create-drafts-channel.js";
import { registerDocumentScopesHandlers } from "./document-scopes-channel.js";
import { registerDocumentsHandlers } from "./documents-channel.js";
import { registerFlashcardsHandlers } from "./flashcards-channel.js";
import { registerIngestHandlers } from "./ingest-channel.js";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import { registerLibraryHandlers } from "./library-channel.js";
import { registerLockHandlers } from "./lock-channel.js";
import { registerMemoryHandlers } from "./memory-channel.js";
import { registerNotesHandlers } from "./notes-channel.js";
import { registerPacksHandlers } from "./packs-channel.js";
import { registerQuickCheckHandlers } from "./quick-check-channel.js";
import { registerRecommendationsHandlers } from "./recommendations-channel.js";
import type { Services } from "./services.js";
import { registerShellHandlers } from "./shell-channel.js";
import { registerSketchesHandlers } from "./sketches-channel.js";
import { registerGeneratorStream } from "./stream-handler.js";
import { registerSubAgentHandlers } from "./subagent-channel.js";
import { registerTabsHandlers } from "./tabs-channel.js";
import { registerUpdateHandlers } from "./update-channel.js";

/**
 * Register all IPC handlers for the Praxis services.
 *
 * Stream channel naming convention (matches IpcTransport in @praxis/client):
 *   invoke:  praxis.session.send.start  (with streamId as first arg)
 *   events:  praxis.session.send.events.<streamId>
 *   cancel:  praxis.session.send.cancel
 *
 *   invoke:  praxis.ingest.start (with streamId as first arg)
 *   events:  praxis.ingest.events.<streamId>
 *   cancel:  praxis.ingest.cancel
 */
export interface IpcHandlerResult {
  /** Unregister all handlers and abort all in-flight streams. */
  cleanup: () => void;
  /** Map of streamId → AbortController for all active streaming IPC channels.
   *  Exposed so the before-quit handler can abort them during shutdown. */
  activeAbortControllers: Map<string, AbortController>;
}

export function registerIpcHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  log: Logger,
): IpcHandlerResult {
  const registeredChannels: string[] = [];
  const activeAbortControllers = new Map<string, AbortController>();
  const _helpers = createIpcHelpers(log);

  // Wrap handle to also track registered channels for cleanup
  const { on } = _helpers;
  const handle = (channel: string, fn: Parameters<typeof _helpers.handle>[1]): void => {
    _helpers.handle(channel, fn);
    registeredChannels.push(channel);
  };

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

  const getStudentId = (): StudentId =>
    brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;

  // ── Session ──────────────────────────────────────────────────────────────

  const SpawnFromAssignmentSchema = z.object({
    assignmentId: z.string().min(1, "assignmentId"),
    parentSessionId: z.string().min(1, "parentSessionId"),
  });

  handle(
    "praxis.session.active",
    wrapEnvelope("praxis.session.active", log, async () => services.session.active()),
  );

  const sessionStartSchema = z.object({
    modeId: z.string().min(1, "modeId"),
    courseId: z.string().optional(),
    assignmentId: z.string().optional(),
  });

  handle(
    "praxis.session.start",
    handleEnvelope("praxis.session.start", log, sessionStartSchema, async (opts) =>
      services.session.start({
        modeId: opts.modeId,
        ...(opts.courseId !== undefined && {
          courseId: brandId<"CourseId">(opts.courseId) as CourseId,
        }),
        ...(opts.assignmentId !== undefined && {
          assignmentId: brandId<"AssignmentId">(opts.assignmentId) as AssignmentId,
        }),
      }),
    ),
  );

  handle(
    "praxis.session.end",
    handleEnvelope(
      "praxis.session.end",
      log,
      z.string().min(1, "sessionId"),
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (sessionId) => services.session.end(sessionId as any),
    ),
  );

  // Phase 16: spawn a quiz/homework/exam child session from an assignment.
  handle(
    "praxis.session.spawnFromAssignment",
    handleEnvelope(
      "praxis.session.spawnFromAssignment",
      log,
      SpawnFromAssignmentSchema,
      async (opts) =>
        services.session.spawnFromAssignment({
          assignmentId: brandId<"AssignmentId">(opts.assignmentId) as AssignmentId,
          parentSessionId: brandId<"SessionId">(opts.parentSessionId) as SessionId,
        }),
    ),
  );

  const SpawnFromNoteSchema = z.object({
    noteId: z.string().min(1, "noteId"),
    cueId: z.string().optional(),
  });

  // Spawn a teach session pre-loaded with a note's cue context.
  // studentId is resolved server-side (consistent with all notes.* channels).
  handle(
    "praxis.session.spawnFromNote",
    handleEnvelope("praxis.session.spawnFromNote", log, SpawnFromNoteSchema, async (opts) => {
      const studentId = getStudentId();
      return services.session.spawnFromNote({
        studentId,
        noteId: brandId<"NoteId">(opts.noteId) as NoteId,
        ...(opts.cueId !== undefined && { cueId: opts.cueId }),
      });
    }),
  );

  const SpawnFromPassageSchema = z.object({
    documentId: z.string().min(1, "documentId"),
    range: z.object({
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
    }),
  });

  // Open a teach session scoped to a document passage.
  // studentId is resolved server-side (consistent with all document/* channels).
  handle(
    "praxis.session.spawnFromPassage",
    handleEnvelope("praxis.session.spawnFromPassage", log, SpawnFromPassageSchema, async (opts) => {
      const studentId = getStudentId();
      return services.session.spawnFromPassage({
        studentId,
        documentId: brandId<"DocumentId">(opts.documentId) as DocumentId,
        range: opts.range,
      });
    }),
  );

  // Streaming: client invokes `praxis.session.send.start` with streamId + args.
  // Server pushes IpcStreamMessage<EngineEvent> on `praxis.session.send.events.<streamId>`.
  // Client can cancel via `praxis.session.send.cancel` with the streamId.
  registerGeneratorStream<unknown, [sessionId: string, message: string]>(
    {
      channelBase: "praxis.session.send",
      log,
      webContentsGetter,
      activeAbortControllers,
    },
    { handle, on },
    {
      iterate: ([sessionId, message], signal) =>
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        services.session.send(sessionId as any, message, signal),
    },
  );

  // ── Config ───────────────────────────────────────────────────────────────

  registerConfigHandlers(services, log);

  // ── Ingestion (streamed + non-streamed) ──────────────────────────────────

  registerIngestHandlers(
    services,
    webContentsGetter,
    services.ingestorRegistry,
    activeAbortControllers,
    log,
  );

  // ── Artifacts (read-only) ────────────────────────────────────────────────

  // Shared schema for all single-courseId artifact channels.
  const courseIdSchema = z.string().min(1, "courseId");

  handle(
    "praxis.artifacts.courses",
    wrapEnvelope("praxis.artifacts.courses", log, async () => {
      const studentId = getStudentId();
      return services.artifacts.courses(studentId);
    }),
  );

  handle(
    "praxis.artifacts.course",
    handleEnvelope(
      "praxis.artifacts.course",
      log,
      courseIdSchema,
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (courseId) => services.artifacts.course(brandId<"CourseId">(courseId) as any),
    ),
  );

  handle(
    "praxis.artifacts.lessons",
    handleEnvelope(
      "praxis.artifacts.lessons",
      log,
      courseIdSchema,
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (courseId) => services.artifacts.lessons(brandId<"CourseId">(courseId) as any),
    ),
  );

  handle(
    "praxis.artifacts.units",
    handleEnvelope(
      "praxis.artifacts.units",
      log,
      courseIdSchema,
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (courseId) => services.artifacts.units(brandId<"CourseId">(courseId) as any),
    ),
  );

  handle(
    "praxis.artifacts.lessonAssessments",
    handleEnvelope(
      "praxis.artifacts.lessonAssessments",
      log,
      z.string().min(1, "lessonId"),
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (lessonId) =>
        services.artifacts.lessonAssessments(brandId<"LessonId">(lessonId) as any),
    ),
  );

  handle(
    "praxis.artifacts.gates",
    handleEnvelope(
      "praxis.artifacts.gates",
      log,
      courseIdSchema,
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (courseId) => services.artifacts.gates(brandId<"CourseId">(courseId) as any),
    ),
  );

  handle(
    "praxis.artifacts.progress",
    wrapEnvelope("praxis.artifacts.progress", log, async () => {
      const studentId = getStudentId();
      return services.artifacts.progress(studentId);
    }),
  );

  // ── Phase 9: Gate view + evaluation ──────────────────────────────────────────

  handle(
    "praxis.artifacts.gateView",
    handleEnvelope("praxis.artifacts.gateView", log, courseIdSchema, async (courseId) => {
      const studentId = getStudentId();
      return services.artifacts.gateView({
        studentId,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: brandId<"CourseId">(courseId) as any,
      });
    }),
  );

  handle(
    "praxis.artifacts.evaluateGates",
    handleEnvelope("praxis.artifacts.evaluateGates", log, courseIdSchema, async (courseId) => {
      const studentId = getStudentId();
      return services.artifacts.evaluateAndPersistGates({
        studentId,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: brandId<"CourseId">(courseId) as any,
      });
    }),
  );

  handle(
    "praxis.artifacts.markGatesViewed",
    handleEnvelope("praxis.artifacts.markGatesViewed", log, courseIdSchema, async (courseId) => {
      const studentId = getStudentId();
      return services.artifacts.markGatesViewed({
        studentId,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: brandId<"CourseId">(courseId) as any,
      });
    }),
  );

  handle(
    "praxis.artifacts.newlyUnlockedCount",
    handleEnvelope("praxis.artifacts.newlyUnlockedCount", log, courseIdSchema, async (courseId) => {
      const studentId = getStudentId();
      return services.artifacts.newlyUnlockedCount({
        studentId,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: brandId<"CourseId">(courseId) as any,
      });
    }),
  );

  // ── Memory ───────────────────────────────────────────────────────────────────

  registerMemoryHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Assignments ──────────────────────────────────────────────────────────────

  registerAssignmentsHandlers(services, log);

  // ── Phase 10: Concepts (read-only) ──────────────────────────────────────────

  handle(
    "praxis.artifacts.concepts",
    handleEnvelope(
      "praxis.artifacts.concepts",
      log,
      courseIdSchema,
      // Concept ids returned here are prefixed for canonical packs
      // (e.g., "<graphId>:algebra-1.real-numbers") — consumers must treat as opaque strings.
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (courseId) => services.artifacts.concepts(brandId<"CourseId">(courseId) as any),
    ),
  );

  // ── Phase 11: Author ─────────────────────────────────────────────────────────
  // Every author handler calls requireUnlocked() first — IPC safety layer.
  // Shared Zod schemas for groups of channels with the same payload shape.

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

  // ── Prompt customization layers ───────────────────────────────────────────

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
        const studentId = getStudentId();
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
        const studentId = getStudentId();
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
        const studentId = getStudentId();
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

  // ── Phase 12: Notes ──────────────────────────────────────────────────────────

  registerNotesHandlers(services, log);

  // ── Phase 12: Flashcards ─────────────────────────────────────────────────────

  registerFlashcardsHandlers(services, log);

  // ── Phase 14: Tabs ───────────────────────────────────────────────────────────

  registerTabsHandlers(services, log);

  // ── Phase 14: Session list (archive) ─────────────────────────────────────────

  const sessionListSchema = z
    .object({
      includeEnded: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional();

  handle(
    "praxis.session.list",
    handleEnvelope("praxis.session.list", log, sessionListSchema, async (opts) =>
      services.session.list(
        opts !== undefined
          ? {
              ...(opts.includeEnded !== undefined && { includeEnded: opts.includeEnded }),
              ...(opts.limit !== undefined && { limit: opts.limit }),
            }
          : undefined,
      ),
    ),
  );

  // ── Phase 15a: Sketches ──────────────────────────────────────────────────────

  registerSketchesHandlers(services, log);

  // ── Phase 15b: Concept maps ──────────────────────────────────────────────────

  registerConceptMapsHandlers(services, log);

  // ── Activity rail ─────────────────────────────────────────────────────────────

  registerActivityHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Sub-agent transparency ─────────────────────────────────────────────────────

  registerSubAgentHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Bootstrap-mode draft stream ──────────────────────────────────────────────

  registerCourseCreateDraftsHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Phase 17: QuickCheck ──────────────────────────────────────────────────────

  registerQuickCheckHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Document citations ────────────────────────────────────────────────────────

  registerCitationsHandlers(services, log);

  // ── Phase 16: Polymorphic scope ↔ document attachments ───────────────────────

  registerDocumentScopesHandlers(services, log);

  // ── Workbench recommendation engine ──────────────────────────────────────────

  registerRecommendationsHandlers(services, log);

  // ── Claude auth ──────────────────────────────────────────────────────────────

  registerAuthHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Documents ────────────────────────────────────────────────────────────────

  registerDocumentsHandlers(services, log);

  // ── Library search ────────────────────────────────────────────────────────────

  registerLibraryHandlers(services, log);

  // ── Lock ──────────────────────────────────────────────────────────────────────

  registerLockHandlers(services, log);

  // ── Packs ─────────────────────────────────────────────────────────────────────

  registerPacksHandlers(services, log);

  // ── Shell helpers ─────────────────────────────────────────────────────────────

  registerShellHandlers(services, log);

  // ── Update check ──────────────────────────────────────────────────────────────

  registerUpdateHandlers(services, log);

  const cleanup = () => {
    for (const channel of registeredChannels) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeAllListeners("praxis.session.send.cancel");
    ipcMain.removeAllListeners("praxis.ingest.cancel");
    ipcMain.removeAllListeners("praxis.memory.episodic.cancel");
    ipcMain.removeAllListeners("praxis.auth.claude.login.cancel");
    ipcMain.removeAllListeners("praxis.activity.events.cancel");
    ipcMain.removeAllListeners("praxis.courseCreate.drafts.events.cancel");
    ipcMain.removeAllListeners("praxis.quickCheck.events.cancel");
    for (const ctrl of activeAbortControllers.values()) {
      ctrl.abort();
    }
    activeAbortControllers.clear();
  };

  return { cleanup, activeAbortControllers };
}
