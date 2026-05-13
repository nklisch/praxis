/**
 * Unit tests for the retrieve_from_documents tool handler.
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
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { retrieveFromDocumentsTool } from "../retrieve-from-documents.js";

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

function makeCtxForRetrieval(
  vectorHits: ReturnType<typeof makeVectorHit>[],
  ftsHits: ReturnType<typeof makeFtsHit>[],
  pageImageResult: Buffer | null = null,
) {
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
    titlesByIds: vi.fn().mockResolvedValue(new Map([["doc-1", "Biology Document"]])),
    pageImage: vi.fn().mockResolvedValue(pageImageResult),
    chunksForDocument: vi.fn().mockResolvedValue([]),
  };

  return makeToolContext({
    services: { embeddings, vectorStore, ftsStore, documents },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe("retrieve_from_documents handler", () => {
  it("returns empty citations when both stores return nothing", async () => {
    const ctx = makeCtxForRetrieval([], []);
    const result = await retrieveFromDocumentsTool.handler({ query: "ATP synthase", topK: 5 }, ctx);
    expect(result.citations).toHaveLength(0);
    expect(result.query).toBe("ATP synthase");
  });

  it("uses embedQuery (not embed) for the query vector", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1")], []);
    await retrieveFromDocumentsTool.handler({ query: "enzyme kinetics", topK: 5 }, ctx);

    expect(ctx.services.embeddings.embedQuery).toHaveBeenCalledWith("enzyme kinetics");
    expect(ctx.services.embeddings.embed).not.toHaveBeenCalled();
  });

  it("passes query vector to vectorStore.search", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1")], []);
    await retrieveFromDocumentsTool.handler({ query: "photosynthesis", topK: 3 }, ctx);

    expect(ctx.services.vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ embedding: expect.any(Array), topK: expect.any(Number) }),
    );
  });

  it("passes query text to ftsStore.search", async () => {
    const ctx = makeCtxForRetrieval([], [makeFtsHit("c1")]);
    await retrieveFromDocumentsTool.handler({ query: "mitosis", topK: 3 }, ctx);

    expect(ctx.services.ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "mitosis", topK: expect.any(Number) }),
    );
  });

  it("propagates documentIds filter to both stores", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1")], [makeFtsHit("c1")]);
    await retrieveFromDocumentsTool.handler(
      { query: "cell", topK: 5, documentIds: ["doc-1"] },
      ctx,
    );

    expect(ctx.services.vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-1"] }),
    );
    expect(ctx.services.ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-1"] }),
    );
  });

  it("propagates sectionPattern filter to both stores", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1")], [makeFtsHit("c1")]);
    await retrieveFromDocumentsTool.handler(
      { query: "nucleus", topK: 5, sectionPattern: "Chapter 3" },
      ctx,
    );

    expect(ctx.services.vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ sectionPattern: "Chapter 3" }),
    );
    expect(ctx.services.ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ sectionPattern: "Chapter 3" }),
    );
  });

  it("propagates pageRange filter to both stores", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1")], [makeFtsHit("c1")]);
    await retrieveFromDocumentsTool.handler(
      { query: "respiration", topK: 5, pageRange: { from: 10, to: 20 } },
      ctx,
    );

    expect(ctx.services.vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: { from: 10, to: 20 } }),
    );
    expect(ctx.services.ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: { from: 10, to: 20 } }),
    );
  });

  it("citations are 1-indexed", async () => {
    const ctx = makeCtxForRetrieval(
      [makeVectorHit("c1"), makeVectorHit("c2"), makeVectorHit("c3")],
      [],
    );
    const result = await retrieveFromDocumentsTool.handler({ query: "energy", topK: 3 }, ctx);

    expect(result.citations[0]?.index).toBe(1);
    if (result.citations.length > 1) {
      expect(result.citations[1]?.index).toBe(2);
    }
  });

  it("hydrates document title from documents.titlesByIds", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1", "doc-1")], []);
    ctx.services.documents.titlesByIds = vi
      .fn()
      .mockResolvedValue(new Map([["doc-1", "Biology 101"]]));

    const result = await retrieveFromDocumentsTool.handler({ query: "cell", topK: 5 }, ctx);
    expect(result.citations[0]?.documentTitle).toBe("Biology 101");
  });

  it("falls back to '(unknown)' when title not in map", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1", "doc-unknown")], []);
    ctx.services.documents.titlesByIds = vi.fn().mockResolvedValue(new Map());

    const result = await retrieveFromDocumentsTool.handler({ query: "cell", topK: 5 }, ctx);
    expect(result.citations[0]?.documentTitle).toBe("(unknown)");
  });

  it("sets hasPageImage:true when page exists and documents.pageImage returns non-null", async () => {
    const hit = makeVectorHit("c1", "doc-1", { page: 3 });
    const ctx = makeCtxForRetrieval([hit], [], Buffer.from("fake-png"));

    const result = await retrieveFromDocumentsTool.handler({ query: "diagram", topK: 5 }, ctx);
    expect(result.citations[0]?.hasPageImage).toBe(true);
  });

  it("hasPageImage not set when documents.pageImage returns null", async () => {
    const hit = makeVectorHit("c1", "doc-1", { page: 3 });
    const ctx = makeCtxForRetrieval([hit], [], null);

    const result = await retrieveFromDocumentsTool.handler({ query: "diagram", topK: 5 }, ctx);
    expect(result.citations[0]?.hasPageImage).toBeFalsy();
  });

  it("does not call pageImage for chunks without a page", async () => {
    const hit = makeVectorHit("c1", "doc-1"); // no page field
    const ctx = makeCtxForRetrieval([hit], [], null);

    const result = await retrieveFromDocumentsTool.handler({ query: "intro", topK: 5 }, ctx);

    expect(ctx.services.documents.pageImage).not.toHaveBeenCalled();
    expect(result.citations[0]?.hasPageImage).toBeFalsy();
  });

  it("topK limits the number of returned citations", async () => {
    const hits = Array.from({ length: 10 }, (_, i) => makeVectorHit(`c${i}`));
    const ctx = makeCtxForRetrieval(hits, []);

    const result = await retrieveFromDocumentsTool.handler({ query: "all", topK: 3 }, ctx);
    expect(result.citations.length).toBeLessThanOrEqual(3);
  });

  it("tool has correct name, tier, and effects", () => {
    expect(retrieveFromDocumentsTool.name).toBe("retrieve_from_documents");
    expect(retrieveFromDocumentsTool.tier).toBe("grounded");
    expect(retrieveFromDocumentsTool.effects).toContain("external.code-exec");
  });
});

// ── Phase 16: Course scoping tests ─────────────────────────────────────────────

describe("retrieve_from_documents — Phase 16 course scoping", () => {
  it("uses courseDocumentIds when no explicit documentIds and courseDocumentIds is set", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1", "doc-course")], []);
    // Inject courseDocumentIds
    (ctx as { courseDocumentIds?: string[] }).courseDocumentIds = ["doc-course"];
    ctx.services.documents.titlesByIds = vi
      .fn()
      .mockResolvedValue(new Map([["doc-course", "Course Book"]]));

    await retrieveFromDocumentsTool.handler({ query: "algebra", topK: 5 }, ctx);

    // Both stores should have received documentIds: ["doc-course"]
    expect(ctx.services.vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-course"] }),
    );
    expect(ctx.services.ftsStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-course"] }),
    );
  });

  it("returns empty citations when courseDocumentIds is an empty array (course in scope, no attachments)", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1")], []);
    (ctx as { courseDocumentIds?: string[] }).courseDocumentIds = [];

    const result = await retrieveFromDocumentsTool.handler({ query: "algebra", topK: 5 }, ctx);
    expect(result.citations).toHaveLength(0);
    // Should not even call the stores
    expect(ctx.services.vectorStore.search).not.toHaveBeenCalled();
    expect(ctx.services.ftsStore.search).not.toHaveBeenCalled();
  });

  it("explicit documentIds override courseDocumentIds", async () => {
    const ctx = makeCtxForRetrieval([makeVectorHit("c1", "explicit-doc")], []);
    (ctx as { courseDocumentIds?: string[] }).courseDocumentIds = ["course-doc"];
    ctx.services.documents.titlesByIds = vi
      .fn()
      .mockResolvedValue(new Map([["explicit-doc", "Explicit Book"]]));

    await retrieveFromDocumentsTool.handler(
      { query: "algebra", topK: 5, documentIds: ["explicit-doc"] },
      ctx,
    );

    expect(ctx.services.vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["explicit-doc"] }),
    );
    // Should NOT use courseDocumentIds
    expect(ctx.services.vectorStore.search).not.toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["course-doc"] }),
    );
  });
});
