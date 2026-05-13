import type { DocumentId, DocumentScopesService } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listCourseDocsTool } from "../list-course-documents.js";

function makeDoc(id: string) {
  return {
    documentId: brandId<"DocumentId">(id) as DocumentId,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    chunkCount: 5,
    hasPageImages: false,
    source: "manual" as const,
    attachedAt: new Date(),
  };
}

describe("course.list_course_documents handler", () => {
  it("returns documents for the active course", async () => {
    const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
    const documentScopes: Partial<DocumentScopesService> = {
      listForScopeDetailed: vi.fn().mockResolvedValue(docs),
    };
    const ctx = makeToolContext({
      services: { documentScopes: documentScopes as DocumentScopesService },
      courseId: brandId<"CourseId">("course-x"),
    });

    const result = await listCourseDocsTool.handler({}, ctx);
    expect(result.documents).toHaveLength(2);
    expect(result.documents.map((d) => d.documentId)).toContain("doc-1");
  });

  it("throws if no course is in scope", async () => {
    const documentScopes: Partial<DocumentScopesService> = {
      listForScopeDetailed: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeToolContext({
      services: { documentScopes: documentScopes as DocumentScopesService },
    });

    await expect(listCourseDocsTool.handler({}, ctx)).rejects.toThrow("course-scoped");
  });

  it("has correct name, tier, effects", () => {
    expect(listCourseDocsTool.name).toBe("course.list_course_documents");
    expect(listCourseDocsTool.tier).toBe("grounded");
    expect(listCourseDocsTool.effects).toContain("none");
  });
});
