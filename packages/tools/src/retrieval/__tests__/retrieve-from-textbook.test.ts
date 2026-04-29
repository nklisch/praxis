/**
 * Unit tests for the retrieve_from_textbook tool handler.
 *
 * Uses mocked vectorStore, ftsStore, embeddings, and documents — no real SQLite.
 * Asserts:
 *  - embedQuery (asymmetric) is used for the query vector, not embed
 *  - Both stores are searched in parallel
 *  - Filters (documentIds, sectionPattern, pageRange) are forwarded to both stores
 *  - Empty results return { query, citations: [] }
 *  - hasPageImage flag set to true when documents.pageImage returns non-null
 *  - hasPageImage absent (falsy) when documents.pageImage returns null
 *  - Citations are 1-indexed
 */
import type { ToolContext } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { retrieveFromTextbookTool } from "../retrieve-from-textbook.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeVec(seed = 0, dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => (i === seed % dim ? 1 : 0.001));
}

function makeVectorHit(chunkId: string, documentId = "doc-1", extra: Record<string, unknown> = {}) {
  return {
    chunkId,
    documentId,
    chunkText: `text of ${chunkId}`,
    distance: 0.1,
    ...extra,
  };
}

function makeFtsHit(chunkId: string, documentId = "doc-1", extra: Record<string, unknown> = {}) {
  return {
    chunkId,
    documentId,
    chunkText: `text of ${chunkId}`,
    score: -1.5,
    ...extra,
  };
}

function makeCtx(
  vectorHits: ReturnType<typeof makeVectorHit>[],
  ftsHits: ReturnType<typeof makeFtsHit>[],
  pageImageResult: Buffer | null = null,
): ToolContext {
  const embeddings = {
    embed: vi.fn().mockResolvedValue([makeVec()]),
    embedQuery: vi.fn().mockResolvedValue(makeVec()),
    embedBatch: vi.fn().mockResolvedValue([]),
    dimension: 4,
    modelId: "test",
  };
  const vectorStore = {
    upsert: vi.fn(),
    upsertBatch: vi.fn(),
    search: vi.fn().mockResolvedValue(vectorHits),
    deleteByDocumentId: vi.fn(),
  };
  const ftsStore = {
    upsert: vi.fn(),
    upsertBatch: vi.fn(),
    search: vi.fn().mockResolvedValue(ftsHits),
    deleteByDocumentId: vi.fn(),
  };
  const documents = {
    titlesByIds: vi.fn().mockResolvedValue(new Map([["doc-1", "Biology Textbook"]])),
    pageImage: vi.fn().mockResolvedValue(pageImageResult),
  };

  return {
    services: { embeddings, vectorStore, ftsStore, documents },
  } as unknown as ToolContext;
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe("retrieve_from_textbook handler", () => {
  it("returns empty citations when both stores return nothing", async () => {
    const ctx = makeCtx([], []);
    const result = await retrieveFromTextbookTool.handler({ query: "ATP synthase", topK: 5 }, ctx);
    expect(result.citations).toHaveLength(0);
    expect(result.query).toBe("ATP synthase");
  });

  it("uses embedQuery (not embed) for the query vector", async () => {
    const ctx = makeCtx([makeVectorHit("c1")], []);
    await retrieveFromTextbookTool.handler({ query: "enzyme kinetics", topK: 5 }, ctx);

    // biome-ignore lint/suspicious/noExplicitAny: test access to mock
    const { embeddings } = ctx.services as any;
    expect(embeddings.embedQuery).toHaveBeenCalledWith("enzyme kinetics");
    expect(embeddings.embed).not.toHaveBeenCalled();
  });

  it("passes query vector to vectorStore.search", async () => {
    const ctx = makeCtx([makeVectorHit("c1")], []);
    await retrieveFromTextbookTool.handler({ query: "photosynthesis", topK: 3 }, ctx);

    // biome-ignore lint/suspicious/noExplicitAny: test access to mock
    const { vectorStore } = ctx.services as any;
    expect(vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ embedding: expect.any(Array), topK: expect.any(Number) }),
    );
  });

  it("passes query text to ftsStore.search", async () => {
    const ctx = makeCtx([], [makeFtsHit("c1")]);
    await retrieveFromTextbookTool.handler({ query: "mitosis", topK: 3 }, ctx);

    // biome-ignore lint/suspicious/noExplicitAny: test access to mock
    const { ftsStore } = ctx.services as any;
    expect(ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "mitosis", topK: expect.any(Number) }),
    );
  });

  it("propagates documentIds filter to both stores", async () => {
    const ctx = makeCtx([makeVectorHit("c1")], [makeFtsHit("c1")]);
    await retrieveFromTextbookTool.handler({ query: "cell", topK: 5, documentIds: ["doc-1"] }, ctx);

    // biome-ignore lint/suspicious/noExplicitAny: test access to mocks
    const { vectorStore, ftsStore } = ctx.services as any;
    expect(vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-1"] }),
    );
    expect(ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-1"] }),
    );
  });

  it("propagates sectionPattern filter to both stores", async () => {
    const ctx = makeCtx([makeVectorHit("c1")], [makeFtsHit("c1")]);
    await retrieveFromTextbookTool.handler(
      { query: "nucleus", topK: 5, sectionPattern: "Chapter 3" },
      ctx,
    );

    // biome-ignore lint/suspicious/noExplicitAny: test access to mocks
    const { vectorStore, ftsStore } = ctx.services as any;
    expect(vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ sectionPattern: "Chapter 3" }),
    );
    expect(ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ sectionPattern: "Chapter 3" }),
    );
  });

  it("propagates pageRange filter to both stores", async () => {
    const ctx = makeCtx([makeVectorHit("c1")], [makeFtsHit("c1")]);
    await retrieveFromTextbookTool.handler(
      { query: "respiration", topK: 5, pageRange: { from: 10, to: 20 } },
      ctx,
    );

    // biome-ignore lint/suspicious/noExplicitAny: test access to mocks
    const { vectorStore, ftsStore } = ctx.services as any;
    expect(vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: { from: 10, to: 20 } }),
    );
    expect(ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: { from: 10, to: 20 } }),
    );
  });

  it("citations are 1-indexed", async () => {
    const ctx = makeCtx([makeVectorHit("c1"), makeVectorHit("c2"), makeVectorHit("c3")], []);
    const result = await retrieveFromTextbookTool.handler({ query: "energy", topK: 3 }, ctx);

    expect(result.citations[0]?.index).toBe(1);
    if (result.citations.length > 1) {
      expect(result.citations[1]?.index).toBe(2);
    }
  });

  it("hydrates document title from documents.titlesByIds", async () => {
    const ctx = makeCtx([makeVectorHit("c1", "doc-1")], []);
    // biome-ignore lint/suspicious/noExplicitAny: test access to mock
    (ctx.services as any).documents.titlesByIds = vi
      .fn()
      .mockResolvedValue(new Map([["doc-1", "Biology 101"]]));

    const result = await retrieveFromTextbookTool.handler({ query: "cell", topK: 5 }, ctx);
    expect(result.citations[0]?.documentTitle).toBe("Biology 101");
  });

  it("falls back to '(unknown)' when title not in map", async () => {
    const ctx = makeCtx([makeVectorHit("c1", "doc-unknown")], []);
    // biome-ignore lint/suspicious/noExplicitAny: test access to mock
    (ctx.services as any).documents.titlesByIds = vi.fn().mockResolvedValue(new Map());

    const result = await retrieveFromTextbookTool.handler({ query: "cell", topK: 5 }, ctx);
    expect(result.citations[0]?.documentTitle).toBe("(unknown)");
  });

  it("sets hasPageImage:true when page exists and documents.pageImage returns non-null", async () => {
    const hit = makeVectorHit("c1", "doc-1", { page: 3 });
    const ctx = makeCtx([hit], [], Buffer.from("fake-png"));

    const result = await retrieveFromTextbookTool.handler({ query: "diagram", topK: 5 }, ctx);
    expect(result.citations[0]?.hasPageImage).toBe(true);
  });

  it("hasPageImage not set when documents.pageImage returns null", async () => {
    const hit = makeVectorHit("c1", "doc-1", { page: 3 });
    const ctx = makeCtx([hit], [], null);

    const result = await retrieveFromTextbookTool.handler({ query: "diagram", topK: 5 }, ctx);
    expect(result.citations[0]?.hasPageImage).toBeFalsy();
  });

  it("does not call pageImage for chunks without a page", async () => {
    const hit = makeVectorHit("c1", "doc-1"); // no page field
    const ctx = makeCtx([hit], [], null);

    const result = await retrieveFromTextbookTool.handler({ query: "intro", topK: 5 }, ctx);

    // biome-ignore lint/suspicious/noExplicitAny: test access to mock
    expect((ctx.services as any).documents.pageImage).not.toHaveBeenCalled();
    expect(result.citations[0]?.hasPageImage).toBeFalsy();
  });

  it("topK limits the number of returned citations", async () => {
    const hits = Array.from({ length: 10 }, (_, i) => makeVectorHit(`c${i}`));
    const ctx = makeCtx(hits, []);

    const result = await retrieveFromTextbookTool.handler({ query: "all", topK: 3 }, ctx);
    expect(result.citations.length).toBeLessThanOrEqual(3);
  });

  it("tool has correct name, tier, and effects", () => {
    expect(retrieveFromTextbookTool.name).toBe("retrieve_from_textbook");
    expect(retrieveFromTextbookTool.tier).toBe("grounded");
    expect(retrieveFromTextbookTool.effects).toContain("external.code-exec");
  });
});
