import type {
  CourseId,
  LessonId,
  Note,
  NoteBody,
  NoteContext,
  NoteId,
  NotesClient,
} from "@praxis/core/types";
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

  update(input: { noteId: NoteId; body: NoteBody }): Promise<Note> {
    return this.transport.invoke<Note>(C.update, input);
  }

  get(noteId: NoteId): Promise<Note | null> {
    return this.transport.invoke<Note | null>(C.get, noteId);
  }

  list(input?: {
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]> {
    return this.transport.invoke<Note[]>(C.list, input);
  }

  delete(noteId: NoteId): Promise<void> {
    return this.transport.invoke<void>(C.delete, noteId);
  }
}

export { NotesClientImpl as NotesClient };
