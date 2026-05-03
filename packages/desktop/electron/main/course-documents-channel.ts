import type { CourseId, DocumentId, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Register IPC handlers for the course ↔ document attachment service.
 *
 * All channels are invoke-only (non-streaming):
 *   praxis.courseDocuments.listForCourse   → DocumentSummaryItem[]
 *   praxis.courseDocuments.attach          → { attached: boolean }
 *   praxis.courseDocuments.detach          → { detached: boolean }
 */
export function registerCourseDocumentsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle("praxis.courseDocuments.listForCourse", async (_event, courseId: string) => {
    return services.courseDocuments.listForCourseDetailed(
      brandId<"CourseId">(courseId) as CourseId,
    );
  });

  handle(
    "praxis.courseDocuments.attach",
    async (
      _event,
      input: {
        courseId: string;
        documentId: string;
        source?: "manual" | "bootstrap" | "ingestion";
      },
    ) => {
      return services.courseDocuments.attach({
        courseId: brandId<"CourseId">(input.courseId) as CourseId,
        documentId: brandId<"DocumentId">(input.documentId) as DocumentId,
        source: input.source ?? "manual",
      });
    },
  );

  handle(
    "praxis.courseDocuments.detach",
    async (_event, input: { courseId: string; documentId: string }) => {
      return services.courseDocuments.detach({
        courseId: brandId<"CourseId">(input.courseId) as CourseId,
        documentId: brandId<"DocumentId">(input.documentId) as DocumentId,
      });
    },
  );
}
