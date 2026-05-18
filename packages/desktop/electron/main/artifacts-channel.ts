import type { Logger, StudentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the artifacts service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.artifacts.courses
 *   praxis.artifacts.course
 *   praxis.artifacts.lessons
 *   praxis.artifacts.units
 *   praxis.artifacts.lessonAssessments
 *   praxis.artifacts.gates
 *   praxis.artifacts.progress
 *   praxis.artifacts.gateView
 *   praxis.artifacts.evaluateGates
 *   praxis.artifacts.markGatesViewed
 *   praxis.artifacts.newlyUnlockedCount
 *   praxis.artifacts.concepts
 */
export function registerArtifactsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

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
    "praxis.artifacts.units",
    handleEnvelope(
      "praxis.artifacts.units",
      log,
      courseIdSchema,
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (courseId) => services.artifacts.units(brandId<"CourseId">(courseId) as any),
    ),
  );

  handle(
    "praxis.artifacts.lessonAssessments",
    handleEnvelope(
      "praxis.artifacts.lessonAssessments",
      log,
      z.string().min(1, "lessonId"),
      async (lessonId) => {
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        return services.artifacts.lessonAssessments(brandId<"LessonId">(lessonId) as any);
      },
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

  // Phase 9: Gate view + evaluation

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

  // Phase 10: Concepts (read-only)

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
}
