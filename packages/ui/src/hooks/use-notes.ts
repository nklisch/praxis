import type { CourseId, LessonId, Note, NoteBody, NoteContext, NoteId } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

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
 * Pattern matches useCourses — loading/error/refresh state, mount-effect.
 */
export function useNotes(opts: UseNotesOptions = {}): UseNotesResult {
  const client = usePraxisClient();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.notes.list({
        ...(opts.courseId !== undefined && { courseId: opts.courseId }),
        ...(opts.lessonId !== undefined && { lessonId: opts.lessonId }),
        ...(opts.format !== undefined && { format: opts.format }),
        ...(opts.limit !== undefined && { limit: opts.limit }),
      });
      setNotes(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, opts.courseId, opts.lessonId, opts.format, opts.limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    },
    [client],
  );

  return { notes, loading, error, refresh, createNote, deleteNote };
}
