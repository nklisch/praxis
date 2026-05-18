import type { ConceptId, CourseId, LessonId, Logger, NoteId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for the notes service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.notes.create
 *   praxis.notes.update
 *   praxis.notes.get
 *   praxis.notes.list
 *   praxis.notes.delete
 *   praxis.notes.setAnnotations
 *   praxis.notes.getAnnotations
 */
export function registerNotesHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

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
      const studentId = getStudentId(services);
      return services.notes.create({
        studentId,
        format: input.format,
        // biome-ignore lint/suspicious/noExplicitAny: NoteBody validated inside service
        body: input.body as any,
        ...(input.context !== undefined && {
          context: {
            ...(input.context.courseId !== undefined && {
              courseId: brandId<"CourseId">(input.context.courseId) as CourseId,
            }),
            ...(input.context.lessonId !== undefined && {
              lessonId: brandId<"LessonId">(input.context.lessonId) as LessonId,
            }),
            ...(input.context.sessionId !== undefined && {
              sessionId: input.context.sessionId,
            }),
            ...(input.context.conceptIds !== undefined && {
              conceptIds: input.context.conceptIds.map(
                (id) => brandId<"ConceptId">(id) as ConceptId,
              ),
            }),
          },
        }),
      });
    }),
  );

  const noteIdSchema = z.string().min(1, "noteId");

  handle(
    "praxis.notes.update",
    handleEnvelope(
      "praxis.notes.update",
      log,
      z.object({ noteId: z.string().min(1, "noteId"), body: z.unknown() }),
      async (input) => {
        const studentId = getStudentId(services);
        return services.notes.update({
          studentId,
          noteId: brandId<"NoteId">(input.noteId) as NoteId,
          // biome-ignore lint/suspicious/noExplicitAny: NoteBody validated inside service
          body: input.body as any,
        });
      },
    ),
  );

  handle(
    "praxis.notes.get",
    handleEnvelope("praxis.notes.get", log, noteIdSchema, async (noteId) => {
      const studentId = getStudentId(services);
      return services.notes.get({ studentId, noteId: brandId<"NoteId">(noteId) as NoteId });
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
      const studentId = getStudentId(services);
      return services.notes.list({
        studentId,
        ...(input?.courseId !== undefined && {
          courseId: brandId<"CourseId">(input.courseId) as CourseId,
        }),
        ...(input?.lessonId !== undefined && {
          lessonId: brandId<"LessonId">(input.lessonId) as LessonId,
        }),
        ...(input?.format !== undefined && { format: input.format }),
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    }),
  );

  handle(
    "praxis.notes.delete",
    handleEnvelope("praxis.notes.delete", log, noteIdSchema, async (noteId) => {
      const studentId = getStudentId(services);
      return services.notes.delete({ studentId, noteId: brandId<"NoteId">(noteId) as NoteId });
    }),
  );

  const annotationSchema = z.object({
    rangeStart: z.number().int().nonnegative(),
    rangeEnd: z.number().int().nonnegative(),
    text: z.string(),
    severity: z.enum(["soft", "load_bearing"]),
  });

  const setAnnotationsSchema = z.object({
    noteId: z.string().min(1, "noteId"),
    annotations: z.array(annotationSchema),
  });

  handle(
    "praxis.notes.setAnnotations",
    handleEnvelope("praxis.notes.setAnnotations", log, setAnnotationsSchema, async (input) => {
      const studentId = getStudentId(services);
      return services.notes.setAnnotations({
        studentId,
        noteId: brandId<"NoteId">(input.noteId) as NoteId,
        annotations: input.annotations,
      });
    }),
  );

  handle(
    "praxis.notes.getAnnotations",
    handleEnvelope("praxis.notes.getAnnotations", log, noteIdSchema, async (noteId) => {
      const studentId = getStudentId(services);
      return services.notes.getAnnotations({
        studentId,
        noteId: brandId<"NoteId">(noteId) as NoteId,
      });
    }),
  );
}
