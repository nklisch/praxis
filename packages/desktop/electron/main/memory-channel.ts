import type { EpisodicEvent, Logger, SessionId, StudentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerGeneratorStream } from "./stream-handler.js";

/**
 * IPC handlers for the memory service.
 *
 * Non-streaming channels (all invoke-only, envelope-wrapped):
 *   praxis.memory.studentModel    — getter returning StudentModel (Map serialized as entries)
 *   praxis.memory.misconceptions  — getter returning Misconception[]
 *   praxis.memory.procedural      — getter returning ProceduralModel (Map serialized)
 *   praxis.memory.affective       — getter returning AffectiveModel
 *   praxis.memory.export          — returns full MemoryExport blob
 *   praxis.memory.delete          — destructive, returns void
 *
 * Streaming channel:
 *   praxis.memory.episodic.start  (invoke with streamId, opts) — starts generator stream
 *   praxis.memory.episodic.events.<streamId>                   — pushed EpisodicEvent chunks
 *   praxis.memory.episodic.cancel (on)                         — aborts stream
 */
export function registerMemoryHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

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
  registerGeneratorStream<
    EpisodicEvent,
    [{ sessionId?: string; range?: { fromMs: number; toMs: number } }]
  >(
    {
      channelBase: "praxis.memory.episodic",
      log,
      webContentsGetter,
      activeAbortControllers,
    },
    { handle, on },
    {
      iterate: ([opts], _signal) => {
        const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
        return services.memory.episodic({
          studentId,
          ...(opts.sessionId !== undefined && {
            sessionId: brandId<"SessionId">(opts.sessionId) as SessionId,
          }),
          ...(opts.range !== undefined && { range: opts.range }),
        });
      },
    },
  );
}
