import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { documentOutlineTool } from "../outline.js";

type MockChunk = { chunkIndex: number; text: string; page?: number; section?: string };

function makeCtx(
  chunks: MockChunk[],
  titleMap: Map<string, string> = new Map([["doc-1", "Algebra Textbook"]]),
) {
  const documents = {
    chunksForDocument: vi.fn().mockResolvedValue(chunks),
    titlesByIds: vi.fn().mockResolvedValue(titleMap),
    pageImage: vi.fn().mockResolvedValue(null),
  };
  return makeToolContext({ services: { documents } });
}

describe("document.outline handler", () => {
  it("returns correct chunkCount and sectionCount for a document", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "Introduction to algebra.", page: 1, section: "Introduction" },
      { chunkIndex: 1, text: "Linear equations.", page: 2, section: "Chapter 1" },
      { chunkIndex: 2, text: "Quadratic equations.", page: 5, section: "Chapter 2" },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);

    expect(result.documentId).toBe("doc-1");
    expect(result.documentTitle).toBe("Algebra Textbook");
    expect(result.chunkCount).toBe(3);
    expect(result.sectionCount).toBe(3);
    expect(result.pageCount).toBe(5); // max page
    expect(result.preview).toBe("Introduction to algebra."); // first 200 chars
  });

  it("returns pageCount as max page found", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "A", page: 10 },
      { chunkIndex: 1, text: "B", page: 3 },
      { chunkIndex: 2, text: "C", page: 20 },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.pageCount).toBe(20);
  });

  it("omits pageCount when no chunks have a page", async () => {
    const chunks: MockChunk[] = [{ chunkIndex: 0, text: "No page info." }];
    const ctx = makeCtx(chunks);
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.pageCount).toBeUndefined();
  });

  it("returns empty preview and zero counts for empty document", async () => {
    const ctx = makeCtx([]);
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.chunkCount).toBe(0);
    expect(result.sectionCount).toBe(0);
    expect(result.preview).toBe("");
  });

  it("counts unique sections only", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "A", section: "Chapter 1" },
      { chunkIndex: 1, text: "B", section: "Chapter 1" }, // duplicate
      { chunkIndex: 2, text: "C", section: "Chapter 2" },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.sectionCount).toBe(2);
  });

  it("falls back to (unknown) title when not in map", async () => {
    const ctx = makeCtx([{ chunkIndex: 0, text: "x" }], new Map());
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.documentTitle).toBe("(unknown)");
  });

  it("preview is capped at 200 chars", async () => {
    const longText = "a".repeat(300);
    const ctx = makeCtx([{ chunkIndex: 0, text: longText }]);
    const result = await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.preview).toHaveLength(200);
  });

  it("has correct name, tier, and effects", () => {
    expect(documentOutlineTool.name).toBe("document.outline");
    expect(documentOutlineTool.tier).toBe("deterministic");
    expect(documentOutlineTool.effects).toContain("none");
  });

  it("passes studentId to chunksForDocument for ownership check", async () => {
    const ctx = makeCtx([]);
    await documentOutlineTool.handler({ documentId: "doc-1" }, ctx);
    expect(ctx.services.documents.chunksForDocument).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: ctx.studentId }),
    );
  });
});
