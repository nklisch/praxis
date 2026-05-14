import type {
  CourseId,
  LessonId,
  Note,
  NoteBody,
  NoteContext,
  NoteId,
  NotesClient,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

/** Canonical channel names for the notes IPC surface. */
const C = {
  create: "praxis.notes.create",
  update: "praxis.notes.update",
  get: "praxis.notes.get",
  list: "praxis.notes.list",
  delete: "praxis.notes.delete",
} as const;

/**
 * NotesClient — Phase 12 implementation.
 * Thin wrappers over the praxis.notes.* IPC channels.
 *
 * Implements the client-side NotesClient from @praxis/core/types/client.
 */
class NotesClientImpl implements NotesClient {
  constructor(private readonly transport: ClientTransport) {}

  create(input: {
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note> {
    return this.transport.invoke<Note>(C.create, input);
  }

  async update(input: { noteId: NoteId; body: NoteBody }): Promise<Note> {
    const result = await this.transport.invoke<IpcEnvelope<Note> | Note>(C.update, input);
    return unwrapEnvelope(result);
  }

  async get(noteId: NoteId): Promise<Note | null> {
    const result = await this.transport.invoke<IpcEnvelope<Note | null> | Note | null>(
      C.get,
      noteId,
    );
    return unwrapEnvelope(result);
  }

  list(input?: {
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]> {
    return this.transport.invoke<Note[]>(C.list, input);
  }

  async delete(noteId: NoteId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(C.delete, noteId);
    return unwrapEnvelope(result);
  }
}

export { NotesClientImpl as NotesClient };
