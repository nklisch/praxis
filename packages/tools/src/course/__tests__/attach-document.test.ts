import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { attachDocumentTool } from "../attach-document.js";

describe("course.attach_document handler", () => {
  it("attaches a document and returns attached:true", async () => {
    const courseDocuments = { attach: vi.fn().mockResolvedValue({ attached: true }) };
    const ctx = makeToolContext({
      services: { courseDocuments },
      courseId: brandId<"CourseId">("course-x"),
    });

    const result = await attachDocumentTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.attached).toBe(true);
    expect(result.message).toBe("Document attached.");
    expect(courseDocuments.attach).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1", source: "manual" }),
    );
  });

  it("returns attached:false with message when already attached", async () => {
    const courseDocuments = { attach: vi.fn().mockResolvedValue({ attached: false }) };
    const ctx = makeToolContext({
      services: { courseDocuments },
      courseId: brandId<"CourseId">("course-x"),
    });

    const result = await attachDocumentTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.attached).toBe(false);
    expect(result.message).toBe("Document was already attached.");
  });

  it("throws if no course in scope", async () => {
    const courseDocuments = { attach: vi.fn() };
    const ctx = makeToolContext({ services: { courseDocuments } });

    await expect(attachDocumentTool.handler({ documentId: "doc-1" }, ctx)).rejects.toThrow(
      "course-scoped",
    );
  });

  it("has correct name, tier, effects", () => {
    expect(attachDocumentTool.name).toBe("course.attach_document");
    expect(attachDocumentTool.tier).toBe("grounded");
    expect(attachDocumentTool.effects).toContain("artifact.mutate");
  });
});
