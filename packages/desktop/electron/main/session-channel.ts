import type {
  AssignmentId,
  CourseId,
  DocumentId,
  Logger,
  NoteId,
  SessionId,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerGeneratorStream } from "./stream-handler.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for the session service.
 *
 * Non-streaming channels (all invoke-only, envelope-wrapped):
 *   praxis.session.active
 *   praxis.session.start
 *   praxis.session.end
 *   praxis.session.spawnFromAssignment
 *   praxis.session.spawnFromNote
 *   praxis.session.spawnFromPassage
 *   praxis.session.list
 *
 * Streaming channel (hot path for every tutor turn):
 *   praxis.session.send.start  (invoke with streamId, sessionId, message) — starts generator
 *   praxis.session.send.events.<streamId>                                 — pushed EngineEvents
 *   praxis.session.send.cancel (on)                                       — aborts stream
 */
export function registerSessionHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  const SpawnFromAssignmentSchema = z.object({
    assignmentId: z.string().min(1, "assignmentId"),
    parentSessionId: z.string().min(1, "parentSessionId"),
  });

  const sessionActiveSchema = z.object({ modeId: z.string().optional() }).optional();

  handle(
    "praxis.session.active",
    handleEnvelope("praxis.session.active", log, sessionActiveSchema, async (opts) =>
      services.session.active(
        opts !== undefined
          ? { ...(opts.modeId !== undefined && { modeId: opts.modeId }) }
          : undefined,
      ),
    ),
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
      const studentId = getStudentId(services);
      return services.session.spawnFromNote({
        studentId,
        noteId: brandId<"NoteId">(opts.noteId) as NoteId,
        ...(opts.cueId !== undefined && { cueId: opts.cueId }),
      });
    }),
  );

  const SpawnFromPassageSchema = z.object({
    documentId: z.string().min(1, "documentId"),
    range: z
      .object({
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().nonnegative(),
      })
      .refine((r) => r.endOffset >= r.startOffset, {
        message: "endOffset must be >= startOffset",
      }),
  });

  // Open a teach session scoped to a document passage.
  // studentId is resolved server-side (consistent with all document/* channels).
  handle(
    "praxis.session.spawnFromPassage",
    handleEnvelope("praxis.session.spawnFromPassage", log, SpawnFromPassageSchema, async (opts) => {
      const studentId = getStudentId(services);
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

  // Phase 14: Session list (archive)

  const sessionListSchema = z
    .object({
      includeEnded: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
      excludeModeIds: z.array(z.string()).optional(),
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
              ...(opts.excludeModeIds !== undefined && { excludeModeIds: opts.excludeModeIds }),
            }
          : undefined,
      ),
    ),
  );

  // empty-session-cleanup: discard an unpromoted session (best-effort, tab-close path).
  // Input: { sessionId: string }. Output: { discarded: boolean }.
  const discardIfUnpromotedSchema = z.object({ sessionId: z.string().min(1, "sessionId") });

  handle(
    "praxis.session.discardIfUnpromoted",
    handleEnvelope(
      "praxis.session.discardIfUnpromoted",
      log,
      discardIfUnpromotedSchema,
      async (opts) =>
        services.session.discardIfUnpromoted(brandId<"SessionId">(opts.sessionId) as SessionId),
    ),
  );
}
