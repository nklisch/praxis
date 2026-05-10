import type { IpcStreamMessage } from "@praxis/client";
import type {
  AssignmentId,
  ConceptId,
  ConceptLink,
  ConceptMapId,
  CourseId,
  GateId,
  GateTarget,
  LessonId,
  Logger,
  MisconceptionId,
  SessionId,
  SketchId,
  StudentId,
  SuccessCriteria,
  TabId,
  TldrawSnapshot,
} from "@praxis/core/types";
import { brandId, serializeError } from "@praxis/core/types";
import { app, ipcMain } from "electron";
import { registerActivityHandlers } from "./activity-channel.js";
import { registerBootstrapDraftsHandlers } from "./bootstrap-drafts-channel.js";
import { registerCourseDocumentsHandlers } from "./course-documents-channel.js";
import { registerIngestHandlers } from "./ingest-channel.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import { registerQuickCheckHandlers } from "./quick-check-channel.js";
import type { Services } from "./services.js";

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

  // ── Session ──────────────────────────────────────────────────────────────

  handle("praxis.session.active", async () => {
    return services.session.active();
  });

  handle(
    "praxis.session.start",
    async (_event, opts: { modeId: string; courseId?: string; assignmentId?: string }) => {
      return services.session.start({
        modeId: opts.modeId,
        ...(opts.courseId !== undefined && {
          courseId: brandId<"CourseId">(opts.courseId) as CourseId,
        }),
        ...(opts.assignmentId !== undefined && {
          assignmentId: brandId<"AssignmentId">(opts.assignmentId) as AssignmentId,
        }),
      });
    },
  );

  handle("praxis.session.end", async (_event, sessionId: string) => {
    // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
    return services.session.end(sessionId as any);
  });

  // Phase 16: spawn a quiz/homework/exam child session from an assignment.
  handle(
    "praxis.session.spawnFromAssignment",
    async (_event, opts: { assignmentId: string; parentSessionId: string }) => {
      return services.session.spawnFromAssignment({
        assignmentId: brandId<"AssignmentId">(opts.assignmentId) as AssignmentId,
        parentSessionId: brandId<"SessionId">(opts.parentSessionId) as SessionId,
      });
    },
  );

  // Streaming: client invokes `praxis.session.send.start` with streamId + args.
  // Server pushes IpcStreamMessage<EngineEvent> on `praxis.session.send.events.<streamId>`.
  // Client can cancel via `praxis.session.send.cancel` with the streamId.
  handle(
    "praxis.session.send.start",
    async (_event, streamId: string, sessionId: string, message: string) => {
      const streamLog = log.child({ component: "session.send", streamId, sessionId });
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.session.send.events.${streamId}`;
      const t0 = performance.now();
      let eventCount = 0;
      let errorCount = 0;

      const push = (msg: IpcStreamMessage<unknown>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

      streamLog.info("session.send.start", { messageLength: message.length });
      try {
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        const stream = services.session.send(sessionId as any, message, controller.signal);
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          eventCount++;
          if (event.type === "error") errorCount++;
          push({ kind: "event", payload: event });
        }
        push({ kind: "done" });
        streamLog.info("session.send.done", {
          durationMs: Math.round(performance.now() - t0),
          eventCount,
          errorCount,
        });
      } catch (err) {
        streamLog.error("session.send.error", {
          durationMs: Math.round(performance.now() - t0),
          eventCount,
          err: serializeError(err),
        });
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        activeAbortControllers.delete(streamId);
      }
    },
  );

  on("praxis.session.send.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });

  // ── Config ───────────────────────────────────────────────────────────────

  handle("praxis.config.isLocked", async () => {
    return services.config.isLocked();
  });

  handle("praxis.config.setLockCode", async (_event, code: string) => {
    return services.config.setLockCode(code);
  });

  handle("praxis.config.unlock", async (_event, code: string) => {
    return services.config.unlock(code);
  });

  handle("praxis.config.selectedEngine", async () => {
    return services.config.selectedEngine();
  });

  handle("praxis.config.setSelectedEngine", async (_event, engineId: string) => {
    return services.config.setSelectedEngine(engineId);
  });

  handle("praxis.config.engineConfig", async () => {
    await requireUnlocked();
    return services.config.engineConfig();
  });

  handle("praxis.config.setEngineConfig", async (_event, config: unknown) => {
    await requireUnlocked();
    // biome-ignore lint/suspicious/noExplicitAny: config shape validated inside service
    return services.config.setEngineConfig(config as any);
  });

  handle("praxis.config.bootstrapConfig", async () => {
    return services.config.bootstrapConfig();
  });

  handle("praxis.config.setBootstrapConfig", async (_event, config: { maxSteps: number }) => {
    return services.config.setBootstrapConfig(config);
  });

  handle("praxis.config.firstRunCompleted", async () => {
    return services.config.firstRunCompleted();
  });

  handle("praxis.config.markFirstRunComplete", async () => {
    return services.config.markFirstRunComplete();
  });

  // ── Update check (manual-download flow) ──────────────────────────────────

  handle("praxis.update.checkLatest", async () => {
    return services.update.checkLatest(app.getVersion());
  });

  // ── Documents ────────────────────────────────────────────────────────────

  handle("praxis.documents.list", async () => {
    return services.documents.list();
  });

  handle("praxis.documents.delete", async (_event, documentId: string) => {
    return services.documents.delete(documentId);
  });

  handle(
    "praxis.documents.pageImage",
    async (_event, payload: { documentId: string; page: number }) => {
      const buffer = await services.documents.pageImage(payload);
      // Encode as base64 for IPC transport — Electron IPC can't send raw Buffers reliably
      return buffer ? buffer.toString("base64") : null;
    },
  );

  // ── Ingestion (streamed + non-streamed) ──────────────────────────────────

  registerIngestHandlers(
    services,
    webContentsGetter,
    services.ingestorRegistry,
    activeAbortControllers,
    log,
  );

  // ── Artifacts (read-only) ────────────────────────────────────────────────

  handle("praxis.artifacts.courses", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.artifacts.courses(studentId);
  });

  handle("praxis.artifacts.course", async (_event, courseId: string) => {
    return services.artifacts.course(brandId<"CourseId">(courseId) as CourseId);
  });

  handle("praxis.artifacts.lessons", async (_event, courseId: string) => {
    return services.artifacts.lessons(brandId<"CourseId">(courseId) as CourseId);
  });

  handle("praxis.artifacts.gates", async (_event, courseId: string) => {
    return services.artifacts.gates(brandId<"CourseId">(courseId) as CourseId);
  });

  handle("praxis.artifacts.progress", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.artifacts.progress(studentId);
  });

  // ── Phase 9: Gate view + evaluation ──────────────────────────────────────────

  handle("praxis.artifacts.gateView", async (_event, courseId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.artifacts.gateView({
      studentId,
      courseId: brandId<"CourseId">(courseId) as CourseId,
    });
  });

  handle("praxis.artifacts.evaluateGates", async (_event, courseId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.artifacts.evaluateAndPersistGates({
      studentId,
      courseId: brandId<"CourseId">(courseId) as CourseId,
    });
  });

  handle("praxis.artifacts.markGatesViewed", async (_event, courseId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.artifacts.markGatesViewed({
      studentId,
      courseId: brandId<"CourseId">(courseId) as CourseId,
    });
  });

  handle("praxis.artifacts.newlyUnlockedCount", async (_event, courseId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.artifacts.newlyUnlockedCount({
      studentId,
      courseId: brandId<"CourseId">(courseId) as CourseId,
    });
  });

  // ── Memory ───────────────────────────────────────────────────────────────────

  handle("praxis.memory.studentModel", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    const model = await services.memory.studentModel(studentId);
    // Maps don't survive JSON.stringify — serialize conceptMastery as entries array.
    return {
      ...model,
      conceptMastery: [...model.conceptMastery.entries()],
    };
  });

  handle("praxis.memory.misconceptions", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.memory.misconceptions(studentId);
  });

  handle("praxis.memory.procedural", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    const model = await services.memory.procedural(studentId);
    return {
      ...model,
      strategies: [...model.strategies.entries()],
    };
  });

  handle("praxis.memory.affective", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.memory.affective(studentId);
  });

  handle("praxis.memory.export", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    const exported = await services.memory.export(studentId);
    // Serialize Maps as entries arrays for IPC transport.
    return {
      ...exported,
      studentModel: {
        ...exported.studentModel,
        conceptMastery: [...exported.studentModel.conceptMastery.entries()],
      },
      procedural: {
        ...exported.procedural,
        strategies: [...exported.procedural.strategies.entries()],
      },
    };
  });

  handle("praxis.memory.delete", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.memory.delete({ studentId, confirm: true });
  });

  // Streaming: praxis.memory.episodic.start(streamId, opts) invokes the handler.
  // Events are pushed on praxis.memory.episodic.events.<streamId>.
  // Client cancels via praxis.memory.episodic.cancel with the streamId.
  handle(
    "praxis.memory.episodic.start",
    async (
      _event,
      streamId: string,
      opts: { sessionId?: string; range?: { fromMs: number; toMs: number } },
    ) => {
      const streamLog = log.child({ component: "memory.episodic", streamId });
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.memory.episodic.events.${streamId}`;
      const t0 = performance.now();
      let eventCount = 0;

      const push = (msg: IpcStreamMessage<unknown>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

      streamLog.info("memory.episodic.start");
      try {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        const stream = services.memory.episodic({
          studentId,
          ...(opts.sessionId !== undefined && {
            sessionId: brandId<"SessionId">(opts.sessionId),
          }),
          ...(opts.range !== undefined && { range: opts.range }),
        });
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          eventCount++;
          push({ kind: "event", payload: event });
        }
        push({ kind: "done" });
        streamLog.info("memory.episodic.done", {
          durationMs: Math.round(performance.now() - t0),
          eventCount,
        });
      } catch (err) {
        streamLog.error("memory.episodic.error", {
          durationMs: Math.round(performance.now() - t0),
          eventCount,
          err: serializeError(err),
        });
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        activeAbortControllers.delete(streamId);
      }
    },
  );

  on("praxis.memory.episodic.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });

  // ── Assignments ──────────────────────────────────────────────────────────────

  handle("praxis.assignments.get", async (_event, input: { assignmentId: string }) => {
    return services.assignments.get({
      assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
    });
  });

  handle(
    "praxis.assignments.list",
    async (_event, input: { courseId: string; kind?: "quiz" | "homework" | "exam" }) => {
      return services.assignments.list({
        courseId: brandId<"CourseId">(input.courseId) as CourseId,
        ...(input.kind !== undefined && { kind: input.kind }),
      });
    },
  );

  handle(
    "praxis.assignments.recordResponse",
    async (
      _event,
      input: {
        assignmentId: string;
        itemId: string;
        response: string;
        work?: string;
        sketchId?: string;
      },
    ) => {
      return services.assignments.recordResponse({
        assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
        itemId: input.itemId,
        response: input.response,
        ...(input.work !== undefined && { work: input.work }),
        ...(input.sketchId !== undefined && { sketchId: input.sketchId }),
      });
    },
  );

  handle("praxis.assignments.getResponses", async (_event, input: { assignmentId: string }) => {
    return services.assignments.getResponses({
      assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
    });
  });

  handle("praxis.assignments.submit", async (_event, input: { assignmentId: string }) => {
    return services.assignments.submit({
      assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
    });
  });

  // ── Phase 10: Concepts (read-only) ──────────────────────────────────────────

  handle("praxis.artifacts.concepts", async (_event, courseId: string) => {
    // Concept ids returned here are prefixed for canonical packs
    // (e.g., "<graphId>:algebra-1.real-numbers") — consumers must treat as opaque strings.
    return services.artifacts.concepts(brandId<"CourseId">(courseId));
  });

  // ── Phase 10: Packs ──────────────────────────────────────────────────────────

  handle("praxis.packs.listAvailable", async () => {
    return services.packs.listAvailablePacks();
  });

  handle("praxis.packs.listImported", async () => {
    return services.packs.listImportedPacks();
  });

  handle("praxis.packs.import", async (_event, packId: string) => {
    return services.packs.importPack(packId);
  });

  // ── Phase 11: Lock ───────────────────────────────────────────────────────────
  // Lock handlers are NOT guarded by requireUnlocked — they control the lock.

  handle("praxis.lock.isSet", async () => {
    return services.lock.isSet();
  });

  handle("praxis.lock.isUnlocked", async () => {
    return services.lock.isUnlocked();
  });

  handle("praxis.lock.setLockCode", async (_event, code: string) => {
    return services.lock.setLockCode({ code });
  });

  handle("praxis.lock.unlock", async (_event, code: string) => {
    return services.lock.unlock({ code });
  });

  handle("praxis.lock.lock", async () => {
    return services.lock.lock();
  });

  handle("praxis.lock.clearLock", async (_event, currentCode: string) => {
    return services.lock.clearLock({ currentCode });
  });

  // ── Phase 11: Author ─────────────────────────────────────────────────────────
  // Every author handler calls requireUnlocked() first — IPC safety layer.

  handle(
    "praxis.author.updateCourse",
    async (
      _event,
      input: {
        courseId: string;
        patch: { title?: string; subject?: string; gradeLevel?: string };
        reason?: string;
      },
    ) => {
      await requireUnlocked();
      return services.authoring.updateCourse({
        courseId: brandId<"CourseId">(input.courseId),
        patch: input.patch,
        ...(input.reason !== undefined && { reason: input.reason }),
      });
    },
  );

  handle(
    "praxis.author.createLesson",
    async (
      _event,
      input: {
        courseId: string;
        title: string;
        conceptIds: string[];
        orderIndex?: number;
        estimatedMinutes?: number;
      },
    ) => {
      await requireUnlocked();
      return services.authoring.createLesson({
        courseId: brandId<"CourseId">(input.courseId),
        title: input.title,
        conceptIds: input.conceptIds.map((id) => brandId<"ConceptId">(id) as ConceptId),
        ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
        ...(input.estimatedMinutes !== undefined && { estimatedMinutes: input.estimatedMinutes }),
      });
    },
  );

  handle(
    "praxis.author.updateLesson",
    async (
      _event,
      input: {
        lessonId: string;
        patch: { title?: string; conceptIds?: string[]; estimatedMinutes?: number };
      },
    ) => {
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
  );

  handle(
    "praxis.author.deleteLesson",
    async (_event, input: { lessonId: string; reason?: string }) => {
      await requireUnlocked();
      return services.authoring.deleteLesson({
        lessonId: brandId<"LessonId">(input.lessonId) as LessonId,
        ...(input.reason !== undefined && { reason: input.reason }),
      });
    },
  );

  handle(
    "praxis.author.createGate",
    async (
      _event,
      input: {
        courseId: string;
        guards: GateTarget;
        prerequisites: string[];
        successCriteria: SuccessCriteria;
      },
    ) => {
      await requireUnlocked();
      return services.authoring.createGate({
        courseId: brandId<"CourseId">(input.courseId) as CourseId,
        guards: input.guards,
        prerequisites: input.prerequisites.map((id) => brandId<"GateId">(id) as GateId),
        successCriteria: input.successCriteria,
      });
    },
  );

  handle(
    "praxis.author.updateGate",
    async (
      _event,
      input: {
        gateId: string;
        patch: { prerequisites?: string[]; successCriteria?: SuccessCriteria };
        reason?: string;
      },
    ) => {
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
        patch.successCriteria = input.patch.successCriteria;
      }
      return services.authoring.updateGate({
        gateId: brandId<"GateId">(input.gateId) as GateId,
        patch,
        ...(input.reason !== undefined && { reason: input.reason }),
      });
    },
  );

  handle("praxis.author.deleteGate", async (_event, input: { gateId: string; reason?: string }) => {
    await requireUnlocked();
    return services.authoring.deleteGate({
      gateId: brandId<"GateId">(input.gateId) as GateId,
      ...(input.reason !== undefined && { reason: input.reason }),
    });
  });

  handle(
    "praxis.author.overrideGate",
    async (_event, input: { gateId: string; reason: string }) => {
      await requireUnlocked();
      return services.authoring.overrideGate({
        gateId: brandId<"GateId">(input.gateId) as GateId,
        reason: input.reason,
      });
    },
  );

  handle("praxis.author.getCourseSummary", async (_event, courseId: string) => {
    await requireUnlocked();
    return services.authoring.getCourseSummary(brandId<"CourseId">(courseId) as CourseId);
  });

  handle(
    "praxis.author.customizePrompt",
    async (_event, input: { modeId: string; fragmentId: string; override: string }) => {
      await requireUnlocked();
      return services.authoring.customizePrompt(input.modeId, input.fragmentId, input.override);
    },
  );

  handle(
    "praxis.author.clearFragmentOverride",
    async (_event, input: { modeId: string; fragmentId: string }) => {
      await requireUnlocked();
      return services.authoring.clearFragmentOverride(input);
    },
  );

  handle(
    "praxis.author.setStyleSliders",
    async (_event, input: { socratic: number; verbosity: number; formality: number }) => {
      await requireUnlocked();
      return services.authoring.setStyleSliders(input);
    },
  );

  handle(
    "praxis.author.resetConcept",
    async (_event, input: { conceptId: string; reason: string }) => {
      await requireUnlocked();
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.authoring.resetConcept({
        studentId,
        conceptId: brandId<"ConceptId">(input.conceptId) as ConceptId,
        reason: input.reason,
      });
    },
  );

  handle(
    "praxis.author.clearMisconception",
    async (_event, input: { misconceptionId: string; reason: string }) => {
      await requireUnlocked();
      return services.authoring.clearMisconception({
        misconceptionId: brandId<"MisconceptionId">(input.misconceptionId) as MisconceptionId,
        reason: input.reason,
      });
    },
  );

  handle("praxis.author.exportMemory", async (_event, input: { targetPath: string }) => {
    await requireUnlocked();
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.authoring.exportMemory({ studentId, targetPath: input.targetPath });
  });

  handle(
    "praxis.author.deleteAllMemory",
    async (_event, input: { reason: string; confirm: true }) => {
      await requireUnlocked();
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.authoring.deleteAllMemory({
        studentId,
        reason: input.reason,
        confirm: input.confirm,
      });
    },
  );

  handle(
    "praxis.author.listConfiguratorActions",
    async (_event, input?: { fromTs?: number; limit?: number }) => {
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
  );

  // ── Phase 12: Notes ──────────────────────────────────────────────────────────

  handle(
    "praxis.notes.create",
    async (
      _event,
      input: {
        format: "cornell" | "feynman" | "outline" | "free";
        body: unknown;
        context?: {
          courseId?: string;
          lessonId?: string;
          sessionId?: string;
          conceptIds?: string[];
        };
      },
    ) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.notes.create({
        studentId,
        format: input.format,
        // biome-ignore lint/suspicious/noExplicitAny: NoteBody validated inside service
        body: input.body as any,
        ...(input.context !== undefined && {
          context: {
            ...(input.context.courseId !== undefined && {
              courseId: brandId<"CourseId">(input.context.courseId),
            }),
            ...(input.context.lessonId !== undefined && {
              lessonId: brandId<"LessonId">(input.context.lessonId),
            }),
            ...(input.context.sessionId !== undefined && {
              sessionId: input.context.sessionId,
            }),
            ...(input.context.conceptIds !== undefined && {
              conceptIds: input.context.conceptIds.map((id) => brandId<"ConceptId">(id)),
            }),
          },
        }),
      });
    },
  );

  handle("praxis.notes.update", async (_event, input: { noteId: string; body: unknown }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId());
    return services.notes.update({
      studentId,
      noteId: brandId<"NoteId">(input.noteId),
      // biome-ignore lint/suspicious/noExplicitAny: NoteBody validated inside service
      body: input.body as any,
    });
  });

  handle("praxis.notes.get", async (_event, noteId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId());
    return services.notes.get({ studentId, noteId: brandId<"NoteId">(noteId) });
  });

  handle(
    "praxis.notes.list",
    async (
      _event,
      input?: {
        courseId?: string;
        lessonId?: string;
        format?: "cornell" | "feynman" | "outline" | "free";
        limit?: number;
      },
    ) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.notes.list({
        studentId,
        ...(input?.courseId !== undefined && {
          courseId: brandId<"CourseId">(input.courseId),
        }),
        ...(input?.lessonId !== undefined && {
          lessonId: brandId<"LessonId">(input.lessonId),
        }),
        ...(input?.format !== undefined && { format: input.format }),
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    },
  );

  handle("praxis.notes.delete", async (_event, noteId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId());
    return services.notes.delete({ studentId, noteId: brandId<"NoteId">(noteId) });
  });

  // ── Phase 12: Flashcards ─────────────────────────────────────────────────────

  handle(
    "praxis.flashcards.create",
    async (
      _event,
      input: {
        front: string;
        back: string;
        conceptId?: string;
        source?: { kind: "authored" | "extracted" | "user-created"; ref?: string };
      },
    ) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.create({
        studentId,
        front: input.front,
        back: input.back,
        ...(input.conceptId !== undefined && {
          conceptId: brandId<"ConceptId">(input.conceptId),
        }),
        ...(input.source !== undefined && { source: input.source }),
      });
    },
  );

  handle(
    "praxis.flashcards.update",
    async (
      _event,
      input: {
        flashcardId: string;
        patch: { front?: string; back?: string; conceptId?: string };
      },
    ) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.update({
        studentId,
        flashcardId: brandId<"FlashcardId">(input.flashcardId),
        patch: {
          ...(input.patch.front !== undefined && { front: input.patch.front }),
          ...(input.patch.back !== undefined && { back: input.patch.back }),
          ...(input.patch.conceptId !== undefined && {
            conceptId: brandId<"ConceptId">(input.patch.conceptId),
          }),
        },
      });
    },
  );

  handle("praxis.flashcards.get", async (_event, flashcardId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId());
    return services.flashcards.get({
      studentId,
      flashcardId: brandId<"FlashcardId">(flashcardId),
    });
  });

  handle(
    "praxis.flashcards.list",
    async (_event, input?: { conceptId?: string; due?: boolean; limit?: number }) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.list({
        studentId,
        ...(input?.conceptId !== undefined && {
          conceptId: brandId<"ConceptId">(input.conceptId),
        }),
        ...(input?.due !== undefined && { due: input.due }),
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    },
  );

  handle("praxis.flashcards.delete", async (_event, flashcardId: string) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId());
    return services.flashcards.delete({
      studentId,
      flashcardId: brandId<"FlashcardId">(flashcardId),
    });
  });

  handle(
    "praxis.flashcards.review",
    async (_event, input: { flashcardId: string; rating: "again" | "hard" | "good" | "easy" }) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.review({
        studentId,
        flashcardId: brandId<"FlashcardId">(input.flashcardId),
        rating: input.rating,
      });
    },
  );

  handle("praxis.flashcards.dueCount", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId());
    return services.flashcards.dueCount({ studentId });
  });

  // ── Claude auth ──────────────────────────────────────────────────────────────

  handle("praxis.auth.claude.status", async () => {
    return services.claudeAuth.status();
  });

  // Streaming login flow. Renderer subscribes to events.<streamId> first,
  // then invokes start. Cancel via .cancel with the streamId.
  handle("praxis.auth.claude.login.start", async (_event, streamId: string) => {
    const streamLog = log.child({ component: "auth.claude.login", streamId });
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.auth.claude.login.events.${streamId}`;
    const t0 = performance.now();
    let eventCount = 0;

    const push = (msg: IpcStreamMessage<unknown>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    streamLog.info("auth.claude.login.start");
    try {
      const stream = services.claudeAuth.login({ signal: controller.signal });
      for await (const event of stream) {
        if (controller.signal.aborted) break;
        eventCount++;
        push({ kind: "event", payload: event });
      }
      push({ kind: "done" });
      streamLog.info("auth.claude.login.done", {
        durationMs: Math.round(performance.now() - t0),
        eventCount,
      });
    } catch (err) {
      streamLog.error("auth.claude.login.error", {
        durationMs: Math.round(performance.now() - t0),
        eventCount,
        err: serializeError(err),
      });
      push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.auth.claude.login.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });

  // ── Phase 14: Tabs ───────────────────────────────────────────────────────────

  handle("praxis.tabs.listOpen", async () => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.tabs.listOpen(studentId);
  });

  handle("praxis.tabs.list", async (_event, opts: { limit?: number; includeClosed?: boolean }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.tabs.list(studentId, opts);
  });

  handle("praxis.tabs.get", async (_event, tabId: string) => {
    return services.tabs.get(tabId as TabId);
  });

  handle("praxis.tabs.open", async (_event, opts: { sessionId: string; courseTitle?: string }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.tabs.open({
      studentId,
      sessionId: opts.sessionId as SessionId,
      ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
    });
  });

  handle("praxis.tabs.reopen", async (_event, tabId: string) => {
    return services.tabs.reopen(tabId as TabId);
  });

  handle("praxis.tabs.close", async (_event, tabId: string) => {
    return services.tabs.close(tabId as TabId);
  });

  handle("praxis.tabs.touch", async (_event, tabId: string) => {
    return services.tabs.touch(tabId as TabId);
  });

  handle("praxis.tabs.rename", async (_event, opts: { tabId: string; title: string }) => {
    return services.tabs.rename(opts.tabId as TabId, opts.title);
  });

  // ── Phase 14: Session list (archive) ─────────────────────────────────────────

  handle(
    "praxis.session.list",
    async (_event, opts?: { includeEnded?: boolean; limit?: number }) => {
      return services.session.list(opts);
    },
  );

  // ── Phase 15a: Sketches ──────────────────────────────────────────────────────

  handle(
    "praxis.sketches.put",
    async (
      _event,
      opts: { snapshot: unknown; imageBase64: string; width: number; height: number },
    ) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      const image = Buffer.from(opts.imageBase64, "base64");
      return services.sketches.put({
        studentId,
        snapshot: opts.snapshot,
        image,
        width: opts.width,
        height: opts.height,
      });
    },
  );

  handle("praxis.sketches.get", async (_event, sketchId: string) => {
    const sketch = await services.sketches.get(sketchId as SketchId);
    // Encode image as base64 for IPC transport — Electron IPC can't send raw Buffers reliably.
    return {
      id: sketch.id,
      snapshot: sketch.snapshot,
      width: sketch.width,
      height: sketch.height,
      createdAt: sketch.createdAt,
      imageBase64: sketch.image.toString("base64"),
    };
  });

  handle("praxis.sketches.getSummary", async (_event, sketchId: string) => {
    return services.sketches.getSummary(sketchId as SketchId);
  });

  // ── Phase 15b: Concept maps ──────────────────────────────────────────────────

  handle("praxis.conceptMaps.create", async (_event, opts: { courseId: string; title: string }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.conceptMaps.create({
      studentId,
      courseId: opts.courseId as CourseId,
      title: opts.title,
    });
  });

  handle("praxis.conceptMaps.get", async (_event, id: string) => {
    return services.conceptMaps.get(id as ConceptMapId);
  });

  handle("praxis.conceptMaps.list", async (_event, opts: { courseId: string }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    return services.conceptMaps.list({
      studentId,
      courseId: opts.courseId as CourseId,
    });
  });

  handle("praxis.conceptMaps.rename", async (_event, opts: { id: string; title: string }) => {
    return services.conceptMaps.rename(opts.id as ConceptMapId, opts.title);
  });

  handle("praxis.conceptMaps.delete", async (_event, id: string) => {
    return services.conceptMaps.delete(id as ConceptMapId);
  });

  handle(
    "praxis.conceptMaps.updateScene",
    async (_event, opts: { id: string; scene: TldrawSnapshot; conceptLinks: ConceptLink[] }) => {
      return services.conceptMaps.updateScene({
        id: opts.id as ConceptMapId,
        scene: opts.scene,
        conceptLinks: opts.conceptLinks,
      });
    },
  );

  handle("praxis.conceptMaps.listVersions", async (_event, id: string) => {
    return services.conceptMaps.listVersions(id as ConceptMapId);
  });

  // ── Activity rail ─────────────────────────────────────────────────────────────

  registerActivityHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Bootstrap-mode draft stream ──────────────────────────────────────────────

  registerBootstrapDraftsHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Phase 17: QuickCheck ──────────────────────────────────────────────────────

  registerQuickCheckHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Phase 16: Course ↔ Document attachments ──────────────────────────────────

  registerCourseDocumentsHandlers(services, log);

  // ── Shell helpers ─────────────────────────────────────────────────────────────

  handle("praxis.shell.openExternal", async (_event, url: string) => {
    // Defensive URL allowlist: only http/https. Refuse file://, mailto:, etc.
    // to prevent the renderer from coaxing the main process into opening
    // arbitrary local handlers.
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("openExternal: only http(s) URLs are allowed");
    }
    const { shell } = await import("electron");
    await shell.openExternal(url);
  });

  const cleanup = () => {
    for (const channel of registeredChannels) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeAllListeners("praxis.session.send.cancel");
    ipcMain.removeAllListeners("praxis.ingest.cancel");
    ipcMain.removeAllListeners("praxis.memory.episodic.cancel");
    ipcMain.removeAllListeners("praxis.auth.claude.login.cancel");
    ipcMain.removeAllListeners("praxis.activity.events.cancel");
    ipcMain.removeAllListeners("praxis.bootstrap.drafts.events.cancel");
    ipcMain.removeAllListeners("praxis.quickCheck.events.cancel");
    for (const ctrl of activeAbortControllers.values()) {
      ctrl.abort();
    }
    activeAbortControllers.clear();
  };

  return { cleanup, activeAbortControllers };
}
