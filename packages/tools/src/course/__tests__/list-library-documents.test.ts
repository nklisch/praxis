import type { ArtifactsService, DocumentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listLibraryDocumentsTool } from "../list-library-documents.js";

function makeDoc(id: string) {
  return {
    documentId: brandId<"DocumentId">(id) as DocumentId,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    chunkCount: 5,
    hasPageImages: false,
  };
}

describe("course.list_library_documents handler", () => {
  it("returns all library documents with attachedToCurrentCourse=false when no course in scope", async () => {
    const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue(docs),
    };
    const ctx = makeToolContext({
      services: { artifacts: artifacts as ArtifactsService },
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);
    expect(result.documents).toHaveLength(2);
    expect(result.documents.every((d) => d.attachedToCurrentCourse === false)).toBe(true);
  });

  it("marks attached docs correctly when courseDocumentIds is set", async () => {
    const doc1 = makeDoc("doc-1");
    const doc2 = makeDoc("doc-2");
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue([doc1, doc2]),
    };
    const courseDocumentIds = [brandId<"DocumentId">("doc-1") as DocumentId];
    const ctx = makeToolContext({
      services: { artifacts: artifacts as ArtifactsService },
      courseId: brandId<"CourseId">("course-x"),
      courseDocumentIds,
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);
    const d1 = result.documents.find((d) => d.documentId === "doc-1");
    const d2 = result.documents.find((d) => d.documentId === "doc-2");
    expect(d1?.attachedToCurrentCourse).toBe(true);
    expect(d2?.attachedToCurrentCourse).toBe(false);
  });

  it("passes studentId to artifacts.listDocuments", async () => {
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeToolContext({
      services: { artifacts: artifacts as ArtifactsService },
      studentId: "student-test",
    });
    await listLibraryDocumentsTool.handler({}, ctx);
    expect(artifacts.listDocuments).toHaveBeenCalledWith(ctx.studentId);
  });

  it("has correct name, tier, effects", () => {
    expect(listLibraryDocumentsTool.name).toBe("course.list_library_documents");
    expect(listLibraryDocumentsTool.tier).toBe("grounded");
    expect(listLibraryDocumentsTool.effects).toContain("none");
  });
});
