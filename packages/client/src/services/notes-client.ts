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

  async create(input: {
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note> {
    const result = await this.transport.invoke<IpcEnvelope<Note> | Note>(C.create, input);
    return unwrapEnvelope(result);
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

  async list(input?: {
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]> {
    const result = await this.transport.invoke<IpcEnvelope<Note[]> | Note[]>(C.list, input);
    return unwrapEnvelope(result);
  }

  async delete(noteId: NoteId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(C.delete, noteId);
    return unwrapEnvelope(result);
  }
}

export { NotesClientImpl as NotesClient };
