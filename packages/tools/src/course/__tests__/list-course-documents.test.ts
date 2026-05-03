import type { CourseDocumentsService, DocumentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listCourseDocumentsTool } from "../list-course-documents.js";

function makeDoc(id: string) {
  return {
    documentId: brandId<"DocumentId">(id) as DocumentId,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    chunkCount: 5,
    hasPageImages: false,
  };
}

describe("course.list_course_documents handler", () => {
  it("returns documents for the active course", async () => {
    const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
    const courseDocuments: Partial<CourseDocumentsService> = {
      listForCourseDetailed: vi.fn().mockResolvedValue(docs),
    };
    const ctx = makeToolContext({
      services: { courseDocuments: courseDocuments as CourseDocumentsService },
      courseId: brandId<"CourseId">("course-x"),
    });

    const result = await listCourseDocumentsTool.handler({}, ctx);
    expect(result.documents).toHaveLength(2);
    expect(result.documents.map((d) => d.documentId)).toContain("doc-1");
  });

  it("throws if no course is in scope", async () => {
    const courseDocuments: Partial<CourseDocumentsService> = {
      listForCourseDetailed: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeToolContext({
      services: { courseDocuments: courseDocuments as CourseDocumentsService },
    });

    await expect(listCourseDocumentsTool.handler({}, ctx)).rejects.toThrow("course-scoped");
  });

  it("has correct name, tier, effects", () => {
    expect(listCourseDocumentsTool.name).toBe("course.list_course_documents");
    expect(listCourseDocumentsTool.tier).toBe("grounded");
    expect(listCourseDocumentsTool.effects).toContain("none");
  });
});
