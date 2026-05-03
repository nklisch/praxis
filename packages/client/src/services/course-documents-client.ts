import type {
  CourseDocumentsClientApi,
  CourseId,
  DocumentId,
  DocumentSummaryItem,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.courseDocuments" as const;

/**
 * CourseDocumentsClient — Phase 16 typed wrapper for course ↔ document attachment IPC.
 *
 * Implements CourseDocumentsClientApi (renderer-facing). All methods delegate to
 * transport.invoke over the `praxis.courseDocuments.*` channels.
 */
export class CourseDocumentsClient implements CourseDocumentsClientApi {
  constructor(private readonly transport: ClientTransport) {}

  listForCourse(courseId: CourseId): Promise<DocumentSummaryItem[]> {
    return this.transport.invoke<DocumentSummaryItem[]>(`${C}.listForCourse`, courseId);
  }

  attach(input: {
    courseId: CourseId;
    documentId: DocumentId;
    source?: "manual" | "bootstrap" | "ingestion";
  }): Promise<{ attached: boolean }> {
    return this.transport.invoke<{ attached: boolean }>(`${C}.attach`, {
      courseId: input.courseId,
      documentId: input.documentId,
      ...(input.source !== undefined && { source: input.source }),
    });
  }

  detach(input: { courseId: CourseId; documentId: DocumentId }): Promise<{ detached: boolean }> {
    return this.transport.invoke<{ detached: boolean }>(`${C}.detach`, {
      courseId: input.courseId,
      documentId: input.documentId,
    });
  }
}
