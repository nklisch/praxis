import type { IpcStreamMessage } from "@praxis/client";
import type {
  AssignmentId,
  ConceptId,
  CourseId,
  FlashcardId,
  GateId,
  GateTarget,
  LessonId,
  MisconceptionId,
  NoteId,
  StudentId,
  SuccessCriteria,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { ipcMain } from "electron";
import { registerIngestHandlers } from "./ingest-channel.js";
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
export function registerIpcHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
): () => void {
  const handlers: Array<{ channel: string; handler: Parameters<typeof ipcMain.handle>[1] }> = [];
  const activeAbortControllers = new Map<string, AbortController>();

  function handle(channel: string, fn: Parameters<typeof ipcMain.handle>[1]) {
    ipcMain.handle(channel, fn);
    handlers.push({ channel, handler: fn });
  }

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

  // Streaming: client invokes `praxis.session.send.start` with streamId + args.
  // Server pushes IpcStreamMessage<EngineEvent> on `praxis.session.send.events.<streamId>`.
  // Client can cancel via `praxis.session.send.cancel` with the streamId.
  handle(
    "praxis.session.send.start",
    async (_event, streamId: string, sessionId: string, message: string) => {
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.session.send.events.${streamId}`;

      const push = (msg: IpcStreamMessage<unknown>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

      try {
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        const stream = services.session.send(sessionId as any, message);
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          push({ kind: "event", payload: event });
        }
        push({ kind: "done" });
      } catch (err) {
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        activeAbortControllers.delete(streamId);
      }
    },
  );

  ipcMain.on("praxis.session.send.cancel", (_event, streamId: string) => {
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
    return services.config.engineConfig();
  });

  handle("praxis.config.setEngineConfig", async (_event, config: unknown) => {
    // biome-ignore lint/suspicious/noExplicitAny: config shape validated inside service
    return services.config.setEngineConfig(config as any);
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
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.memory.episodic.events.${streamId}`;

      const push = (msg: import("@praxis/client").IpcStreamMessage<unknown>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

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
          push({ kind: "event", payload: event });
        }
        push({ kind: "done" });
      } catch (err) {
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        activeAbortControllers.delete(streamId);
      }
    },
  );

  ipcMain.on("praxis.memory.episodic.cancel", (_event, streamId: string) => {
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
      input: { assignmentId: string; itemId: string; response: string; work?: string },
    ) => {
      return services.assignments.recordResponse({
        assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
        itemId: input.itemId,
        response: input.response,
        ...(input.work !== undefined && { work: input.work }),
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
              conceptIds: input.context.conceptIds.map((id) =>
                brandId<"ConceptId">(id),
              ),
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
    async (
      _event,
      input?: { conceptId?: string; due?: boolean; limit?: number },
    ) => {
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
    async (
      _event,
      input: { flashcardId: string; rating: "again" | "hard" | "good" | "easy" },
    ) => {
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

  // Return unregister function.
  return () => {
    for (const { channel } of handlers) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeAllListeners("praxis.session.send.cancel");
    ipcMain.removeAllListeners("praxis.ingest.cancel");
    ipcMain.removeAllListeners("praxis.memory.episodic.cancel");
    for (const ctrl of activeAbortControllers.values()) {
      ctrl.abort();
    }
    activeAbortControllers.clear();
  };
}
