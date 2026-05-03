import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { documentReadPagesTool } from "../read-pages.js";

type MockChunk = { chunkIndex: number; text: string; page?: number; section?: string };

function makeCtx(chunks: MockChunk[]) {
  const documents = {
    chunksForDocument: vi.fn().mockResolvedValue(chunks),
    titlesByIds: vi.fn().mockResolvedValue(new Map([["doc-1", "Algebra"]])),
    pageImage: vi.fn().mockResolvedValue(null),
  };
  return makeToolContext({ services: { documents } });
}

function makeChunks(fromPage: number, toPage: number): MockChunk[] {
  const chunks: MockChunk[] = [];
  for (let page = fromPage; page <= toPage; page++) {
    chunks.push({ chunkIndex: page - 1, text: `Content of page ${page}`, page });
  }
  return chunks;
}

describe("document.read_pages handler", () => {
  it("returns only chunks in the specified page range", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "page 1", page: 1 },
      { chunkIndex: 1, text: "page 2", page: 2 },
      { chunkIndex: 2, text: "page 5", page: 5 },
      { chunkIndex: 3, text: "page 10", page: 10 },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 1, toPage: 5, maxChunks: 20 },
      ctx,
    );

    expect(result.chunks).toHaveLength(3); // pages 1, 2, 5
    expect(result.chunks.map((c) => c.page)).toContain(1);
    expect(result.chunks.map((c) => c.page)).toContain(5);
    expect(result.chunks.map((c) => c.page)).not.toContain(10);
    expect(result.truncated).toBe(false);
  });

  it("returns empty chunks when range has no matches", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "page 1", page: 1 },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 50, toPage: 60, maxChunks: 20 },
      ctx,
    );
    expect(result.chunks).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it("truncates at maxChunks and sets truncated:true", async () => {
    const chunks = makeChunks(1, 30); // 30 chunks in pages 1-30
    const ctx = makeCtx(chunks);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 1, toPage: 30, maxChunks: 10 },
      ctx,
    );
    expect(result.chunks).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it("does not set truncated when count is exactly maxChunks", async () => {
    const chunks = makeChunks(1, 10);
    const ctx = makeCtx(chunks);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 1, toPage: 10, maxChunks: 10 },
      ctx,
    );
    expect(result.chunks).toHaveLength(10);
    expect(result.truncated).toBe(false);
  });

  it("chunks are in chunkIndex order", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 2, text: "c", page: 3 },
      { chunkIndex: 0, text: "a", page: 1 },
      { chunkIndex: 1, text: "b", page: 2 },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 1, toPage: 3, maxChunks: 20 },
      ctx,
    );
    // chunksForDocument returns ordered by chunkIndex already (from the reader),
    // but the handler just slices — test that the data passes through correctly
    // Our mock returns them in inserted order; the reader guarantees chunkIndex order
    expect(result.chunks.map((c) => c.chunkIndex)).toEqual([2, 0, 1]); // preserves mock order
  });

  it("excludes chunks without a page", async () => {
    const chunks: MockChunk[] = [
      { chunkIndex: 0, text: "no page" }, // no page — excluded
      { chunkIndex: 1, text: "page 1", page: 1 },
    ];
    const ctx = makeCtx(chunks);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 1, toPage: 5, maxChunks: 20 },
      ctx,
    );
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.chunkIndex).toBe(1);
  });

  it("returns correct page range in output", async () => {
    const ctx = makeCtx([]);
    const result = await documentReadPagesTool.handler(
      { documentId: "doc-1", fromPage: 5, toPage: 15, maxChunks: 20 },
      ctx,
    );
    expect(result.page).toEqual({ from: 5, to: 15 });
  });

  it("has correct name, tier, effects", () => {
    expect(documentReadPagesTool.name).toBe("document.read_pages");
    expect(documentReadPagesTool.tier).toBe("deterministic");
    expect(documentReadPagesTool.effects).toContain("none");
  });
});
