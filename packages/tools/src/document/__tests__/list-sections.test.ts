import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { documentListSectionsTool } from "../list-sections.js";

type MockChunk = { chunkIndex: number; text: string; page?: number; section?: string };

function makeCtx(chunks: MockChunk[], titleMap: Map<string, string> = new Map([["doc-1", "Sullivan Algebra"]])) {
  const documents = {
    chunksForDocument: vi.fn().mockResolvedValue(chunks),
    titlesByIds: vi.fn().mockResolvedValue(titleMap),
    pageImage: vi.fn().mockResolvedValue(null),
  };
  return makeToolContext({ services: { documents } });
}

describe("document.list_sections handler", () => {
  it("groups chunks by section with page ranges", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "Intro", page: 1, section: "Introduction" },
      { chunkIndex: 1, text: "More intro", page: 2, section: "Introduction" },
      { chunkIndex: 2, text: "Linear eq", page: 10, section: "Chapter 1" },
      { chunkIndex: 3, text: "More linear", page: 12, section: "Chapter 1" },
      { chunkIndex: 4, text: "Quadratic", page: 20, section: "Chapter 2" },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentListSectionsTool.handler({ documentId: "doc-1" }, ctx);

    expect(result.documentId).toBe("doc-1");
    expect(result.documentTitle).toBe("Sullivan Algebra");
    expect(result.sections).toHaveLength(3);

    const intro = result.sections.find((s) => s.section === "Introduction");
    expect(intro?.firstPage).toBe(1);
    expect(intro?.lastPage).toBe(2);
    expect(intro?.chunkCount).toBe(2);

    const ch1 = result.sections.find((s) => s.section === "Chapter 1");
    expect(ch1?.firstPage).toBe(10);
    expect(ch1?.lastPage).toBe(12);
    expect(ch1?.chunkCount).toBe(2);
  });

  it("returns empty sections for empty document", async () => {
    const ctx = makeCtx([]);
    const result = await documentListSectionsTool.handler({ documentId: "doc-1" }, ctx);
    expect(result.sections).toHaveLength(0);
  });

  it("handles chunks without pages (omits firstPage/lastPage)", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "No page", section: "Intro" },
      { chunkIndex: 1, text: "Also no page", section: "Intro" },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentListSectionsTool.handler({ documentId: "doc-1" }, ctx);

    const intro = result.sections.find((s) => s.section === "Intro");
    expect(intro?.firstPage).toBeUndefined();
    expect(intro?.lastPage).toBeUndefined();
    expect(intro?.chunkCount).toBe(2);
  });

  it("groups chunks without section under (no section)", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "No section chunk", page: 1 },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentListSectionsTool.handler({ documentId: "doc-1" }, ctx);
    const noSection = result.sections.find((s) => s.section === "(no section)");
    expect(noSection).toBeDefined();
  });

  it("has correct name, tier, effects", () => {
    expect(documentListSectionsTool.name).toBe("document.list_sections");
    expect(documentListSectionsTool.tier).toBe("deterministic");
    expect(documentListSectionsTool.effects).toContain("none");
  });

  it("passes studentId to chunksForDocument", async () => {
    const ctx = makeCtx([]);
    await documentListSectionsTool.handler({ documentId: "doc-1" }, ctx);
    expect(ctx.services.documents.chunksForDocument).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: ctx.studentId }),
    );
  });
});
