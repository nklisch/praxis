import type { CourseId, LessonId, Note, NoteBody, NoteContext, NoteId } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseNotesResult {
  notes: Note[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createNote: (input: {
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }) => Promise<Note>;
  deleteNote: (noteId: NoteId) => Promise<void>;
}

export interface UseNotesOptions {
  courseId?: CourseId;
  lessonId?: LessonId;
  format?: "cornell" | "feynman" | "outline" | "free";
  limit?: number;
}

/**
 * Hook for loading and managing student notes.
 * Uses useResource for loading/error/refresh state and mount-effect.
 */
export function useNotes(opts: UseNotesOptions = {}): UseNotesResult {
  const client = usePraxisClient();

  const loader = useCallback(
    () =>
      client.notes.list({
        ...(opts.courseId !== undefined && { courseId: opts.courseId }),
        ...(opts.lessonId !== undefined && { lessonId: opts.lessonId }),
        ...(opts.format !== undefined && { format: opts.format }),
        ...(opts.limit !== undefined && { limit: opts.limit }),
      }),
    [client, opts.courseId, opts.lessonId, opts.format, opts.limit],
  );

  const { data: notes = [], loading, error, refresh, setData } = useResource(loader);

  const createNote = useCallback(
    async (input: {
      format: "cornell" | "feynman" | "outline" | "free";
      body: NoteBody;
      context?: NoteContext;
    }): Promise<Note> => {
      const note = await client.notes.create(input);
      await refresh();
      return note;
    },
    [client, refresh],
  );

  const deleteNote = useCallback(
    async (noteId: NoteId): Promise<void> => {
      await client.notes.delete(noteId);
      setData((prev) => (prev ?? []).filter((n) => n.id !== noteId));
    },
    [client, setData],
  );

  return { notes, loading, error, refresh, createNote, deleteNote };
}
