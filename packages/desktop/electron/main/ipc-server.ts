import type { IpcStreamMessage } from "@praxis/client";
import { EngineConfigSchema, EngineIdSchema } from "@praxis/core/config";
import type {
  AssignmentId,
  ConceptId,
  ConceptLink,
  ConceptMapId,
  CourseId,
  DocumentId,
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
import {
  brandId,
  isAllowedExternalUrl,
  redactSecrets,
  serializeErrorRedacted,
} from "@praxis/core/types";
import { app, ipcMain } from "electron";
import { z } from "zod";
import { registerActivityHandlers } from "./activity-channel.js";
import { registerBootstrapDraftsHandlers } from "./bootstrap-drafts-channel.js";
import { registerDocumentScopesHandlers } from "./document-scopes-channel.js";
import { registerIngestHandlers } from "./ingest-channel.js";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import { registerQuickCheckHandlers } from "./quick-check-channel.js";
import { registerRecommendationsHandlers } from "./recommendations-channel.js";
import type { Services } from "./services.js";
import { registerSubAgentHandlers } from "./subagent-channel.js";

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
          err: serializeErrorRedacted(err),
        });
        push({
          kind: "error",
          error: redactSecrets(err instanceof Error ? err.message : String(err)),
        });
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

  handle(
    "praxis.config.isLocked",
    wrapEnvelope("praxis.config.isLocked", log, async () => services.config.isLocked()),
  );

  handle(
    "praxis.config.setLockCode",
    handleEnvelope("praxis.config.setLockCode", log, z.string().min(1, "code"), async (code) =>
      services.config.setLockCode(code),
    ),
  );

  handle(
    "praxis.config.unlock",
    handleEnvelope("praxis.config.unlock", log, z.string().min(1, "code"), async (code) =>
      services.config.unlock(code),
    ),
  );

  handle(
    "praxis.config.selectedEngine",
    wrapEnvelope("praxis.config.selectedEngine", log, async () => services.config.selectedEngine()),
  );

  handle(
    "praxis.config.setSelectedEngine",
    handleEnvelope("praxis.config.setSelectedEngine", log, EngineIdSchema, async (engineId) =>
      services.config.setSelectedEngine(engineId),
    ),
  );

  handle(
    "praxis.config.engineConfig",
    wrapEnvelope("praxis.config.engineConfig", log, async () => {
      await requireUnlocked();
      return services.config.engineConfig();
    }),
  );

  // Phase: IPC trust-boundary hardening — separate "reveal" channel so the
  // steady-state `engineConfig()` read never sees the decrypted apiKey.
  handle(
    "praxis.config.engineConfig.reveal",
    wrapEnvelope("praxis.config.engineConfig.reveal", log, async () => {
      await requireUnlocked();
      return services.config.revealApiKey();
    }),
  );

  handle(
    "praxis.config.setEngineConfig",
    handleEnvelope("praxis.config.setEngineConfig", log, EngineConfigSchema, async (cfg) => {
      await requireUnlocked();
      // The service writes to disk; `hasApiKey` is a derived display flag
      // — set it from the validated public input so the snapshot shape
      // matches even though the service strips it before persistence.
      const hasApiKey = cfg.apiKey !== undefined && cfg.apiKey.length > 0;
      return services.config.setEngineConfig({
        engineId: cfg.engineId,
        hasApiKey,
        ...(cfg.model !== undefined && { model: cfg.model }),
        ...(cfg.baseUrl !== undefined && { baseUrl: cfg.baseUrl }),
        ...(cfg.effort !== undefined && { effort: cfg.effort }),
        ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),
      });
    }),
  );

  handle(
    "praxis.config.bootstrapConfig",
    wrapEnvelope("praxis.config.bootstrapConfig", log, async () =>
      services.config.bootstrapConfig(),
    ),
  );

  handle(
    "praxis.config.setBootstrapConfig",
    handleEnvelope(
      "praxis.config.setBootstrapConfig",
      log,
      z.object({ maxSteps: z.number().int().positive() }),
      async (cfg) => services.config.setBootstrapConfig(cfg),
    ),
  );

  handle(
    "praxis.config.firstRunCompleted",
    wrapEnvelope("praxis.config.firstRunCompleted", log, async () =>
      services.config.firstRunCompleted(),
    ),
  );

  handle(
    "praxis.config.markFirstRunComplete",
    wrapEnvelope("praxis.config.markFirstRunComplete", log, async () =>
      services.config.markFirstRunComplete(),
    ),
  );

  // ── Update check (manual-download flow) ──────────────────────────────────

  handle(
    "praxis.update.checkLatest",
    wrapEnvelope("praxis.update.checkLatest", log, async () => {
      return services.update.checkLatest(app.getVersion());
    }),
  );

  // ── Documents ────────────────────────────────────────────────────────────

  handle(
    "praxis.documents.list",
    wrapEnvelope("praxis.documents.list", log, async () => services.documents.list()),
  );

  handle(
    "praxis.documents.get",
    handleEnvelope(
      "praxis.documents.get",
      log,
      z.string().min(1, "documentId"),
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (documentId) => services.documents.get(documentId as any),
    ),
  );

  handle(
    "praxis.documents.delete",
    handleEnvelope(
      "praxis.documents.delete",
      log,
      z.string().min(1, "documentId"),
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (documentId) => services.documents.delete(documentId as any),
    ),
  );

  const pageImageSchema = z.object({
    documentId: z.string().min(1, "documentId"),
    page: z.number().int().nonnegative(),
  });

  handle(
    "praxis.documents.pageImage",
    handleEnvelope("praxis.documents.pageImage", log, pageImageSchema, async (payload) => {
      const buffer = await services.documents.pageImage(payload);
      // Encode as base64 for IPC transport — Electron IPC can't send raw Buffers reliably
      return buffer ? buffer.toString("base64") : null;
    }),
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

  // Shared schema for all single-courseId artifact channels.
  const courseIdSchema = z.string().min(1, "courseId");

  handle(
    "praxis.artifacts.courses",
    wrapEnvelope("praxis.artifacts.courses", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
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
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.artifacts.progress(studentId);
    }),
  );

  // ── Phase 9: Gate view + evaluation ──────────────────────────────────────────

  handle(
    "praxis.artifacts.gateView",
    handleEnvelope("praxis.artifacts.gateView", log, courseIdSchema, async (courseId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
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
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
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
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
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
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.artifacts.newlyUnlockedCount({
        studentId,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: brandId<"CourseId">(courseId) as any,
      });
    }),
  );

  // ── Memory ───────────────────────────────────────────────────────────────────

  handle(
    "praxis.memory.studentModel",
    wrapEnvelope("praxis.memory.studentModel", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      const model = await services.memory.studentModel(studentId);
      // Maps don't survive JSON.stringify — serialize conceptMastery as entries array.
      return {
        ...model,
        conceptMastery: [...model.conceptMastery.entries()],
      };
    }),
  );

  handle(
    "praxis.memory.misconceptions",
    wrapEnvelope("praxis.memory.misconceptions", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.memory.misconceptions(studentId);
    }),
  );

  handle(
    "praxis.memory.procedural",
    wrapEnvelope("praxis.memory.procedural", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      const model = await services.memory.procedural(studentId);
      return {
        ...model,
        strategies: [...model.strategies.entries()],
      };
    }),
  );

  handle(
    "praxis.memory.affective",
    wrapEnvelope("praxis.memory.affective", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.memory.affective(studentId);
    }),
  );

  handle(
    "praxis.memory.export",
    wrapEnvelope("praxis.memory.export", log, async () => {
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
    }),
  );

  handle(
    "praxis.memory.delete",
    wrapEnvelope("praxis.memory.delete", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.memory.delete({ studentId, confirm: true });
    }),
  );

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
          err: serializeErrorRedacted(err),
        });
        push({
          kind: "error",
          error: redactSecrets(err instanceof Error ? err.message : String(err)),
        });
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

  const assignmentInputSchema = z.object({ assignmentId: z.string().min(1, "assignmentId") });

  handle(
    "praxis.assignments.get",
    handleEnvelope("praxis.assignments.get", log, assignmentInputSchema, async ({ assignmentId }) =>
      services.assignments.get({
        assignmentId: brandId<"AssignmentId">(assignmentId) as AssignmentId,
      }),
    ),
  );

  const assignmentListSchema = z.object({
    courseId: z.string().min(1, "courseId"),
    kind: z.enum(["quiz", "homework", "exam"]).optional(),
  });

  handle(
    "praxis.assignments.list",
    handleEnvelope("praxis.assignments.list", log, assignmentListSchema, async (input) =>
      services.assignments.list({
        courseId: brandId<"CourseId">(input.courseId) as CourseId,
        ...(input.kind !== undefined && { kind: input.kind }),
      }),
    ),
  );

  const recordResponseSchema = z.object({
    assignmentId: z.string().min(1, "assignmentId"),
    itemId: z.string().min(1, "itemId"),
    response: z.string(),
    work: z.string().optional(),
    sketchId: z.string().optional(),
  });

  handle(
    "praxis.assignments.recordResponse",
    handleEnvelope("praxis.assignments.recordResponse", log, recordResponseSchema, async (input) =>
      services.assignments.recordResponse({
        assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
        itemId: input.itemId,
        response: input.response,
        ...(input.work !== undefined && { work: input.work }),
        ...(input.sketchId !== undefined && { sketchId: input.sketchId }),
      }),
    ),
  );

  handle(
    "praxis.assignments.getResponses",
    handleEnvelope(
      "praxis.assignments.getResponses",
      log,
      assignmentInputSchema,
      async ({ assignmentId }) =>
        services.assignments.getResponses({
          assignmentId: brandId<"AssignmentId">(assignmentId) as AssignmentId,
        }),
    ),
  );

  handle(
    "praxis.assignments.submit",
    handleEnvelope(
      "praxis.assignments.submit",
      log,
      assignmentInputSchema,
      async ({ assignmentId }) =>
        services.assignments.submit({
          assignmentId: brandId<"AssignmentId">(assignmentId) as AssignmentId,
        }),
    ),
  );

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

  // ── Phase 10: Packs ──────────────────────────────────────────────────────────

  handle(
    "praxis.packs.listAvailable",
    wrapEnvelope("praxis.packs.listAvailable", log, async () =>
      services.packs.listAvailablePacks(),
    ),
  );

  handle(
    "praxis.packs.listImported",
    wrapEnvelope("praxis.packs.listImported", log, async () => services.packs.listImportedPacks()),
  );

  handle(
    "praxis.packs.import",
    handleEnvelope("praxis.packs.import", log, z.string().min(1, "packId"), async (packId) =>
      services.packs.importPack(packId),
    ),
  );

  // ── Phase 11: Lock ───────────────────────────────────────────────────────────
  // Lock handlers are NOT guarded by requireUnlocked — they control the lock.

  handle(
    "praxis.lock.isSet",
    wrapEnvelope("praxis.lock.isSet", log, async () => services.lock.isSet()),
  );

  handle(
    "praxis.lock.isUnlocked",
    wrapEnvelope("praxis.lock.isUnlocked", log, async () => services.lock.isUnlocked()),
  );

  handle(
    "praxis.lock.setLockCode",
    handleEnvelope("praxis.lock.setLockCode", log, z.string().min(1, "code"), async (code) =>
      services.lock.setLockCode({ code }),
    ),
  );

  handle(
    "praxis.lock.unlock",
    handleEnvelope("praxis.lock.unlock", log, z.string().min(1, "code"), async (code) =>
      services.lock.unlock({ code }),
    ),
  );

  handle(
    "praxis.lock.lock",
    wrapEnvelope("praxis.lock.lock", log, async () => services.lock.lock()),
  );

  handle(
    "praxis.lock.clearLock",
    handleEnvelope("praxis.lock.clearLock", log, z.string().min(1, "code"), async (currentCode) =>
      services.lock.clearLock({ currentCode }),
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

  // ── Phase 12: Notes ──────────────────────────────────────────────────────────

  const noteCreateSchema = z.object({
    format: z.enum(["cornell", "feynman", "outline", "free"]),
    body: z.unknown(),
    context: z
      .object({
        courseId: z.string().optional(),
        lessonId: z.string().optional(),
        sessionId: z.string().optional(),
        conceptIds: z.array(z.string()).optional(),
      })
      .optional(),
  });

  handle(
    "praxis.notes.create",
    handleEnvelope("praxis.notes.create", log, noteCreateSchema, async (input) => {
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
    }),
  );

  const noteIdSchema = z.string().min(1, "noteId");
  const flashcardIdSchema = z.string().min(1, "flashcardId");

  handle(
    "praxis.notes.update",
    handleEnvelope(
      "praxis.notes.update",
      log,
      z.object({ noteId: z.string().min(1, "noteId"), body: z.unknown() }),
      async (input) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId());
        return services.notes.update({
          studentId,
          noteId: brandId<"NoteId">(input.noteId),
          // biome-ignore lint/suspicious/noExplicitAny: NoteBody validated inside service
          body: input.body as any,
        });
      },
    ),
  );

  handle(
    "praxis.notes.get",
    handleEnvelope("praxis.notes.get", log, noteIdSchema, async (noteId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.notes.get({ studentId, noteId: brandId<"NoteId">(noteId) });
    }),
  );

  const noteListSchema = z
    .object({
      courseId: z.string().optional(),
      lessonId: z.string().optional(),
      format: z.enum(["cornell", "feynman", "outline", "free"]).optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional();

  handle(
    "praxis.notes.list",
    handleEnvelope("praxis.notes.list", log, noteListSchema, async (input) => {
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
    }),
  );

  handle(
    "praxis.notes.delete",
    handleEnvelope("praxis.notes.delete", log, noteIdSchema, async (noteId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.notes.delete({ studentId, noteId: brandId<"NoteId">(noteId) });
    }),
  );

  // ── Phase 12: Flashcards ─────────────────────────────────────────────────────

  const flashcardCreateSchema = z.object({
    front: z.string().min(1, "front"),
    back: z.string().min(1, "back"),
    conceptId: z.string().optional(),
    source: z
      .object({
        kind: z.enum(["authored", "extracted", "user-created"]),
        ref: z.string(),
      })
      .optional(),
  });

  handle(
    "praxis.flashcards.create",
    handleEnvelope("praxis.flashcards.create", log, flashcardCreateSchema, async (input) => {
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
    }),
  );

  const flashcardUpdateSchema = z.object({
    flashcardId: z.string().min(1, "flashcardId"),
    patch: z.object({
      front: z.string().optional(),
      back: z.string().optional(),
      conceptId: z.string().optional(),
    }),
  });

  handle(
    "praxis.flashcards.update",
    handleEnvelope("praxis.flashcards.update", log, flashcardUpdateSchema, async (input) => {
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
    }),
  );

  handle(
    "praxis.flashcards.get",
    handleEnvelope("praxis.flashcards.get", log, flashcardIdSchema, async (flashcardId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.get({
        studentId,
        flashcardId: brandId<"FlashcardId">(flashcardId),
      });
    }),
  );

  const flashcardListSchema = z
    .object({
      conceptId: z.string().optional(),
      due: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional();

  handle(
    "praxis.flashcards.list",
    handleEnvelope("praxis.flashcards.list", log, flashcardListSchema, async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.list({
        studentId,
        ...(input?.conceptId !== undefined && {
          conceptId: brandId<"ConceptId">(input.conceptId),
        }),
        ...(input?.due !== undefined && { due: input.due }),
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    }),
  );

  handle(
    "praxis.flashcards.delete",
    handleEnvelope("praxis.flashcards.delete", log, flashcardIdSchema, async (flashcardId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.delete({
        studentId,
        flashcardId: brandId<"FlashcardId">(flashcardId),
      });
    }),
  );

  const flashcardReviewSchema = z.object({
    flashcardId: z.string().min(1, "flashcardId"),
    rating: z.enum(["again", "hard", "good", "easy"]),
  });

  handle(
    "praxis.flashcards.review",
    handleEnvelope("praxis.flashcards.review", log, flashcardReviewSchema, async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.review({
        studentId,
        flashcardId: brandId<"FlashcardId">(input.flashcardId),
        rating: input.rating,
      });
    }),
  );

  handle(
    "praxis.flashcards.dueCount",
    wrapEnvelope("praxis.flashcards.dueCount", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId());
      return services.flashcards.dueCount({ studentId });
    }),
  );

  // ── Claude auth ──────────────────────────────────────────────────────────────

  handle(
    "praxis.auth.claude.status",
    wrapEnvelope("praxis.auth.claude.status", log, async () => services.claudeAuth.status()),
  );

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
        err: serializeErrorRedacted(err),
      });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.auth.claude.login.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });

  // ── Phase 14: Tabs ───────────────────────────────────────────────────────────

  const tabIdSchema = z.string().min(1, "tabId");

  handle(
    "praxis.tabs.listOpen",
    wrapEnvelope("praxis.tabs.listOpen", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.tabs.listOpen(studentId);
    }),
  );

  handle(
    "praxis.tabs.list",
    handleEnvelope(
      "praxis.tabs.list",
      log,
      z
        .object({
          limit: z.number().int().positive().optional(),
          includeClosed: z.boolean().optional(),
        })
        .optional(),
      async (opts) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.tabs.list(
          studentId,
          opts !== undefined
            ? {
                ...(opts.limit !== undefined && { limit: opts.limit }),
                ...(opts.includeClosed !== undefined && { includeClosed: opts.includeClosed }),
              }
            : undefined,
        );
      },
    ),
  );

  handle(
    "praxis.tabs.get",
    handleEnvelope("praxis.tabs.get", log, tabIdSchema, async (tabId) => {
      return services.tabs.get(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.open",
    handleEnvelope(
      "praxis.tabs.open",
      log,
      z.object({
        sessionId: z.string().min(1, "sessionId"),
        courseTitle: z.string().optional(),
      }),
      async (opts) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.tabs.open({
          studentId,
          sessionId: opts.sessionId as SessionId,
          ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
        });
      },
    ),
  );

  handle(
    "praxis.tabs.openDocument",
    handleEnvelope(
      "praxis.tabs.openDocument",
      log,
      z.object({
        documentId: z.string().min(1, "documentId"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.tabs.openDocument({
          studentId,
          documentId: opts.documentId as DocumentId,
          title: opts.title,
        });
      },
    ),
  );

  handle(
    "praxis.tabs.reopen",
    handleEnvelope("praxis.tabs.reopen", log, tabIdSchema, async (tabId) => {
      return services.tabs.reopen(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.close",
    handleEnvelope("praxis.tabs.close", log, tabIdSchema, async (tabId) => {
      return services.tabs.close(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.touch",
    handleEnvelope("praxis.tabs.touch", log, tabIdSchema, async (tabId) => {
      return services.tabs.touch(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.rename",
    handleEnvelope(
      "praxis.tabs.rename",
      log,
      z.object({
        tabId: z.string().min(1, "tabId"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        return services.tabs.rename(opts.tabId as TabId, opts.title);
      },
    ),
  );

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

  const sketchPutSchema = z.object({
    snapshot: z.unknown(),
    imageBase64: z.string().min(1, "imageBase64"),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  });

  handle(
    "praxis.sketches.put",
    handleEnvelope("praxis.sketches.put", log, sketchPutSchema, async (opts) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      const image = Buffer.from(opts.imageBase64, "base64");
      return services.sketches.put({
        studentId,
        snapshot: opts.snapshot,
        image,
        width: opts.width,
        height: opts.height,
      });
    }),
  );

  const sketchIdSchema = z.string().min(1, "sketchId");

  handle(
    "praxis.sketches.get",
    handleEnvelope("praxis.sketches.get", log, sketchIdSchema, async (sketchId) => {
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
    }),
  );

  handle(
    "praxis.sketches.getSummary",
    handleEnvelope("praxis.sketches.getSummary", log, sketchIdSchema, async (sketchId) => {
      return services.sketches.getSummary(sketchId as SketchId);
    }),
  );

  // ── Phase 15b: Concept maps ──────────────────────────────────────────────────

  handle(
    "praxis.conceptMaps.create",
    handleEnvelope(
      "praxis.conceptMaps.create",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.conceptMaps.create({
          studentId,
          courseId: opts.courseId as CourseId,
          title: opts.title,
        });
      },
    ),
  );

  const conceptMapIdSchema = z.string().min(1, "id");

  handle(
    "praxis.conceptMaps.get",
    handleEnvelope("praxis.conceptMaps.get", log, conceptMapIdSchema, async (id) => {
      return services.conceptMaps.get(id as ConceptMapId);
    }),
  );

  handle(
    "praxis.conceptMaps.list",
    handleEnvelope(
      "praxis.conceptMaps.list",
      log,
      z.object({ courseId: z.string().min(1, "courseId") }),
      async (opts) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.conceptMaps.list({
          studentId,
          courseId: opts.courseId as CourseId,
        });
      },
    ),
  );

  handle(
    "praxis.conceptMaps.rename",
    handleEnvelope(
      "praxis.conceptMaps.rename",
      log,
      z.object({
        id: z.string().min(1, "id"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        return services.conceptMaps.rename(opts.id as ConceptMapId, opts.title);
      },
    ),
  );

  handle(
    "praxis.conceptMaps.delete",
    handleEnvelope("praxis.conceptMaps.delete", log, conceptMapIdSchema, async (id) => {
      return services.conceptMaps.delete(id as ConceptMapId);
    }),
  );

  const conceptMapUpdateSceneSchema = z.object({
    id: z.string().min(1, "id"),
    scene: z.unknown(),
    conceptLinks: z.array(z.unknown()),
  });

  handle(
    "praxis.conceptMaps.updateScene",
    handleEnvelope(
      "praxis.conceptMaps.updateScene",
      log,
      conceptMapUpdateSceneSchema,
      async (opts) =>
        services.conceptMaps.updateScene({
          id: opts.id as ConceptMapId,
          scene: opts.scene as TldrawSnapshot,
          conceptLinks: opts.conceptLinks as ConceptLink[],
        }),
    ),
  );

  handle(
    "praxis.conceptMaps.listVersions",
    handleEnvelope("praxis.conceptMaps.listVersions", log, conceptMapIdSchema, async (id) => {
      return services.conceptMaps.listVersions(id as ConceptMapId);
    }),
  );

  // ── Activity rail ─────────────────────────────────────────────────────────────

  registerActivityHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Sub-agent transparency ─────────────────────────────────────────────────────

  registerSubAgentHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Bootstrap-mode draft stream ──────────────────────────────────────────────

  registerBootstrapDraftsHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Phase 17: QuickCheck ──────────────────────────────────────────────────────

  registerQuickCheckHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Phase 16: Polymorphic scope ↔ document attachments ───────────────────────

  registerDocumentScopesHandlers(services, log);

  // ── Workbench recommendation engine ──────────────────────────────────────────

  registerRecommendationsHandlers(services, log);

  // ── Shell helpers ─────────────────────────────────────────────────────────────

  handle(
    "praxis.shell.openExternal",
    handleEnvelope(
      "praxis.shell.openExternal",
      log,
      z.string().min(1, "url").refine(isAllowedExternalUrl, "url must be http(s)"),
      async (url) => {
        const { shell } = await import("electron");
        await shell.openExternal(url);
      },
    ),
  );

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
