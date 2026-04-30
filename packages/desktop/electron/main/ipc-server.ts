import type { IpcStreamMessage } from "@praxis/client";
import type { AssignmentId, CourseId, StudentId } from "@praxis/core/types";
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
