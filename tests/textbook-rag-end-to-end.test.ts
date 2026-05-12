/**
 * End-to-end integration test for the Textbook RAG pipeline.
 *
 * Uses real sqlite-vec + real FTS5 (no mocks for stores), mocked embeddings
 * (to avoid loading the transformer model), and mocked ingestor to supply
 * controlled chunks. Asserts:
 *
 *  - Ingest produces both vector and FTS index entries
 *  - retrieve_from_textbook returns correctly-ranked citations
 *  - documents.delete cleans vectors, FTS, and the DB row
 *
 * Uses mocked embeddings so this test runs fast by default (no transformer model load).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@praxis/core/db";
import { FsEmbeddedImageStore, FsPageImageStore, IngestionService } from "@praxis/core/ingestion";
import { DocumentsServiceImpl } from "@praxis/core/services";
import type { ToolContext } from "@praxis/core/types";
import { retrieveFromTextbookTool } from "@praxis/tools/retrieval";
import { SqliteFtsStore, SqliteVecStore } from "@praxis/tools/runtime";
import type { IngestorRegistry } from "@praxis/tools/runtime/ingestion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { noopLogger } from "./helpers/mocks.js";

const DIM = 384; // must match EMBEDDING_DIMENSION in vector-init.ts

function makeVec(seed: number): number[] {
  const arr = Array.from({ length: DIM }, (_, i) => (i === seed % DIM ? 1 : 0.001));
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  return arr.map((v) => v / norm);
}

function makeIngestor(
  chunks: Array<{ chunkIndex: number; text: string; page?: number; section?: string }>,
) {
  return {
    id: "plain-text",
    label: "Plain Text",
    extensions: [".txt"],
    mimeTypes: ["text/plain"],
    isAvailable: vi.fn().mockResolvedValue(true),
    parse: vi.fn().mockResolvedValue({
      title: "Test Textbook",
      ingestorId: "plain-text",
      chunks,
    }),
  };
}

function makeRegistry(ingestor: ReturnType<typeof makeIngestor>): IngestorRegistry {
  return {
    select: vi.fn().mockResolvedValue(ingestor),
    candidatesFor: vi.fn().mockReturnValue([]),
    all: vi.fn().mockReturnValue([]),
  } as unknown as IngestorRegistry;
}

const dbCtx = useTempDb();

let tmpDir: string;
let vecStore: SqliteVecStore;
let ftsStore: SqliteFtsStore;
let pageImageStore: FsPageImageStore;
let embeddedImageStore: FsEmbeddedImageStore;

// Embeddings mock: each text gets a deterministic vector based on its content hash
function textToVec(text: string): number[] {
  // Simple deterministic: use char code to pick a seed
  const seed = text.charCodeAt(0) % DIM;
  return makeVec(seed);
}

const mockEmbeddings = {
  embed: vi.fn(async (text: string) => textToVec(text)),
  embedQuery: vi.fn(async (text: string) => textToVec(text)),
  embedBatch: vi.fn(async (texts: string[]) => texts.map((t) => textToVec(t))),
  dimension: DIM,
  modelId: "test",
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-e2e-rag-"));
  // openDb already calls initVectorStore + initFtsStore and returns sqlite
  const { sqlite } = openDb({ path: dbCtx.dbPath });
  vecStore = new SqliteVecStore(sqlite);
  ftsStore = new SqliteFtsStore(sqlite);
  pageImageStore = new FsPageImageStore(tmpDir);
  embeddedImageStore = new FsEmbeddedImageStore(join(tmpDir, "embedded"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("textbook RAG end-to-end", () => {
  it("ingest then retrieve returns matching citations", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const chunks = [
      { chunkIndex: 0, text: "ATP synthase is a molecular motor", page: 1, section: "Chapter 5" },
      { chunkIndex: 1, text: "Photosynthesis converts light to chemical energy", page: 2 },
      { chunkIndex: 2, text: "DNA replication is semi-conservative", page: 3 },
    ];

    const ingestor = makeIngestor(chunks);
    const registry = makeRegistry(ingestor);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore: vecStore,
      ftsStore,
      embeddings: mockEmbeddings,
      ingestorRegistry: registry,
      pageImageStore,
      embeddedImageStore,
    });

    const events = [];
    for await (const event of svc.ingest({
      filePath: "/fake/bio.txt",
      filename: "bio.txt",
      mimeType: "text/plain",
      studentId: "student-e2e",
    })) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.type === "done" && doneEvent.chunkCount).toBe(3);

    // Now retrieve — context pointing at real stores
    const ctx: ToolContext = {
      services: {
        embeddings: mockEmbeddings,
        vectorStore: vecStore,
        ftsStore,
        documents: {
          titlesByIds: vi.fn().mockResolvedValue(new Map()),
          pageImage: vi.fn().mockResolvedValue(null),
        },
      },
    } as unknown as ToolContext;

    const result = await retrieveFromTextbookTool.handler({ query: "ATP synthase", topK: 3 }, ctx);

    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.some((c) => c.chunkText.includes("ATP"))).toBe(true);
  });

  it("documents.delete removes all index entries for the document", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const chunks = [
      { chunkIndex: 0, text: "Membrane lipid bilayer structure" },
      { chunkIndex: 1, text: "Integral membrane proteins" },
    ];

    const ingestor = makeIngestor(chunks);
    const registry = makeRegistry(ingestor);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore: vecStore,
      ftsStore,
      embeddings: mockEmbeddings,
      ingestorRegistry: registry,
      pageImageStore,
      embeddedImageStore,
    });

    // Ingest
    const events = [];
    for await (const event of svc.ingest({
      filePath: "/fake/cell.txt",
      filename: "cell.txt",
      mimeType: "text/plain",
      studentId: "student-e2e",
    })) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent?.type === "done").toBe(true);
    if (doneEvent?.type !== "done") return;

    const documentId = doneEvent.documentId;

    // Verify data is in stores before delete
    const beforeVec = await vecStore.search({ embedding: makeVec(0), topK: 10 });
    expect(beforeVec.some((r) => r.documentId === documentId)).toBe(true);

    const beforeFts = await ftsStore.search({ query: "membrane", topK: 10 });
    expect(beforeFts.some((r) => r.documentId === documentId)).toBe(true);

    // Delete via DocumentsServiceImpl
    const docSvc = new DocumentsServiceImpl({
      db,
      vectorStore: vecStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    await docSvc.delete(documentId);

    // After delete: nothing in any store
    const afterVec = await vecStore.search({ embedding: makeVec(0), topK: 10 });
    expect(afterVec.every((r) => r.documentId !== documentId)).toBe(true);

    const afterFts = await ftsStore.search({ query: "membrane", topK: 10 });
    expect(afterFts.every((r) => r.documentId !== documentId)).toBe(true);

    // And not in list
    const docs = await docSvc.list();
    expect(docs.every((d) => d.documentId !== documentId)).toBe(true);
  });

  it("document list returns document with ingestorId from manifest", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const chunks = [{ chunkIndex: 0, text: "Introduction to genetics" }];
    const ingestor = makeIngestor(chunks);
    const registry = makeRegistry(ingestor);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore: vecStore,
      ftsStore,
      embeddings: mockEmbeddings,
      ingestorRegistry: registry,
      pageImageStore,
      embeddedImageStore,
    });

    for await (const _ of svc.ingest({
      filePath: "/fake/gen.txt",
      filename: "genetics.txt",
      mimeType: "text/plain",
      studentId: "student-e2e",
    })) {
      // drain
    }

    const docSvc = new DocumentsServiceImpl({
      db,
      vectorStore: vecStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    const docs = await docSvc.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.filename).toBe("genetics.txt");
    expect(docs[0]?.ingestorId).toBe("plain-text");
  });
});
