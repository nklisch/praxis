import type { CourseDocumentsService } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { detachDocumentTool } from "../detach-document.js";

describe("course.detach_document handler", () => {
  it("detaches a document and returns detached:true", async () => {
    const courseDocuments: Partial<CourseDocumentsService> = {
      detach: vi.fn().mockResolvedValue({ detached: true }),
    };
    const ctx = makeToolContext({
      services: { courseDocuments: courseDocuments as CourseDocumentsService },
      courseId: brandId<"CourseId">("course-x"),
    });

    const result = await detachDocumentTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.detached).toBe(true);
    expect(result.message).toBe("Document detached.");
    expect(courseDocuments.detach).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1" }),
    );
  });

  it("returns detached:false when document was not attached", async () => {
    const courseDocuments: Partial<CourseDocumentsService> = {
      detach: vi.fn().mockResolvedValue({ detached: false }),
    };
    const ctx = makeToolContext({
      services: { courseDocuments: courseDocuments as CourseDocumentsService },
      courseId: brandId<"CourseId">("course-x"),
    });

    const result = await detachDocumentTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.detached).toBe(false);
    expect(result.message).toBe("Document was not attached.");
  });

  it("throws if no course in scope", async () => {
    const courseDocuments: Partial<CourseDocumentsService> = { detach: vi.fn() };
    const ctx = makeToolContext({
      services: { courseDocuments: courseDocuments as CourseDocumentsService },
    });

    await expect(detachDocumentTool.handler({ documentId: "doc-1" }, ctx)).rejects.toThrow(
      "course-scoped",
    );
  });

  it("has correct name, tier, effects", () => {
    expect(detachDocumentTool.name).toBe("course.detach_document");
    expect(detachDocumentTool.tier).toBe("grounded");
    expect(detachDocumentTool.effects).toContain("artifact.mutate");
  });
});
