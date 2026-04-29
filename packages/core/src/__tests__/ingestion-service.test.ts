/**
 * Unit tests for IngestionService.
 *
 * All infrastructure is mocked — no real SQLite, embeddings, or file I/O.
 * Focuses on:
 *  - Event sequence: start → ingestor_selected → parsing → parsed → indexing → done
 *  - Both vectorStore and ftsStore are written per batch
 *  - Page-image rename runs when pendingPageImageDocId is set
 *  - Abort signal stops the pipeline mid-batch and emits an error event
 *  - Error event emitted when ingestor.parse throws
 *  - Error event emitted when no ingestor is found
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IngestorRegistry } from "@praxis/tools/runtime/ingestion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { noopLogger } from "../../../../tests/helpers/mocks.js";
import { openDb } from "../db/index.js";
import { FsPageImageStore } from "../ingestion/page-images.js";
import { IngestionService } from "../ingestion/service.js";
import type { IngestionEvent } from "../types/index.js";

// ── DB setup ───────────────────────────────────────────────────────────────────
const dbCtx = useTempDb();

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeVec(dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => i / dim);
}

function makeIngestorResult(
  chunkCount = 2,
  extra: Partial<{
    pendingPageImageDocId: string;
    pageCount: number;
  }> = {},
) {
  return {
    title: "Test Document",
    ingestorId: "plain-text",
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      chunkIndex: i,
      text: `Chunk ${i} content`,
      page: i + 1,
    })),
    ...extra,
  };
}

function makeIngestor(result: ReturnType<typeof makeIngestorResult>) {
  return {
    id: "plain-text",
    label: "Plain Text",
    extensions: [".txt"],
    mimeTypes: ["text/plain"],
    isAvailable: vi.fn().mockResolvedValue(true),
    parse: vi.fn().mockResolvedValue(result),
  };
}

function makeRegistry(ingestor: ReturnType<typeof makeIngestor> | null = null): IngestorRegistry {
  return {
    select: vi.fn().mockResolvedValue(ingestor),
    candidatesFor: vi.fn().mockReturnValue([]),
    all: vi.fn().mockReturnValue([]),
  } as unknown as IngestorRegistry;
}

function makeStores() {
  const vectorStore = {
    upsert: vi.fn(),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    deleteByDocumentId: vi.fn(),
  };
  const ftsStore = {
    upsert: vi.fn(),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    deleteByDocumentId: vi.fn(),
  };
  const embeddings = {
    embed: vi.fn().mockResolvedValue([makeVec()]),
    embedQuery: vi.fn().mockResolvedValue(makeVec()),
    embedBatch: vi
      .fn()
      .mockImplementation((texts: string[]) => Promise.resolve(texts.map(() => makeVec()))),
    dimension: 4,
    modelId: "test",
  };
  return { vectorStore, ftsStore, embeddings };
}

async function collectEvents(
  svc: IngestionService,
  req: Parameters<typeof svc.ingest>[0],
  signal?: AbortSignal,
): Promise<IngestionEvent[]> {
  const events: IngestionEvent[] = [];
  for await (const event of svc.ingest(req, signal)) {
    events.push(event);
  }
  return events;
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe("IngestionService", () => {
  let tmpDir: string;
  let pageImageStore: FsPageImageStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "praxis-ingest-test-"));
    pageImageStore = new FsPageImageStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits full happy-path event sequence", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    const result = makeIngestorResult(2);
    const ingestor = makeIngestor(result);
    const registry = makeRegistry(ingestor);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: registry,
      pageImageStore,
    });

    const events = await collectEvents(svc, {
      filePath: "/fake/doc.txt",
      filename: "doc.txt",
      mimeType: "text/plain",
      studentId: "student-1",
    });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("start");
    expect(types).toContain("ingestor_selected");
    expect(types).toContain("parsing");
    expect(types).toContain("parsed");
    expect(types).toContain("indexing");
    expect(types[types.length - 1]).toBe("done");
  });

  it("emits done event with correct documentId and chunkCount", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    const result = makeIngestorResult(3);
    const ingestor = makeIngestor(result);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    const events = await collectEvents(svc, {
      filePath: "/fake/doc.txt",
      filename: "doc.txt",
      mimeType: "text/plain",
      studentId: "student-1",
    });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === "done") {
      expect(doneEvent.chunkCount).toBe(3);
      expect(typeof doneEvent.documentId).toBe("string");
      expect(doneEvent.documentId.length).toBeGreaterThan(0);
    }
  });

  it("writes to both vectorStore and ftsStore per batch", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    const result = makeIngestorResult(4);
    const ingestor = makeIngestor(result);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    await collectEvents(svc, {
      filePath: "/fake/doc.txt",
      filename: "doc.txt",
      mimeType: "text/plain",
      studentId: "student-1",
    });

    expect(vectorStore.upsertBatch).toHaveBeenCalled();
    expect(ftsStore.upsertBatch).toHaveBeenCalled();
  });

  it("embedBatch called with chunk texts", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    const result = makeIngestorResult(2);
    const ingestor = makeIngestor(result);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    await collectEvents(svc, {
      filePath: "/fake/doc.txt",
      filename: "doc.txt",
      mimeType: "text/plain",
      studentId: "student-1",
    });

    expect(embeddings.embedBatch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("Chunk")]),
    );
  });

  it("emits error event when no ingestor matches", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(null), // no ingestor
      pageImageStore,
    });

    const events = await collectEvents(svc, {
      filePath: "/fake/unknown.xyz",
      filename: "unknown.xyz",
      mimeType: "application/octet-stream",
      studentId: "student-1",
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.error.code).toBe("ingest.no_ingestor");
    }
  });

  it("emits error event when ingestor.parse throws", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    const ingestor = {
      ...makeIngestor(makeIngestorResult()),
      parse: vi.fn().mockRejectedValue(new Error("parse failed")),
    };

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    const events = await collectEvents(svc, {
      filePath: "/fake/bad.txt",
      filename: "bad.txt",
      mimeType: "text/plain",
      studentId: "student-1",
    });

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.error.code).toBe("ingest.parse_failed");
      expect(errorEvent.error.message).toBe("parse failed");
    }
  });

  it("abort signal stops pipeline and emits cancelled error", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    // Many chunks so there is a chance to cancel between batches
    const result = makeIngestorResult(64);
    const ingestor = makeIngestor(result);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    const controller = new AbortController();
    // Abort after the first embedBatch call
    embeddings.embedBatch.mockImplementationOnce(async (texts: string[]) => {
      controller.abort();
      return texts.map(() => makeVec());
    });

    const events = await collectEvents(
      svc,
      {
        filePath: "/fake/big.txt",
        filename: "big.txt",
        mimeType: "text/plain",
        studentId: "student-1",
      },
      controller.signal,
    );

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.error.code).toBe("ingest.cancelled");
    }
  });

  it("page-image rename is attempted when pendingPageImageDocId is set", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();

    const synthId = "synth-doc-id-123";
    const result = makeIngestorResult(1, { pendingPageImageDocId: synthId });
    const ingestor = makeIngestor(result);

    // Create the synthetic dir in the page image store so rename can run
    const pngBytes = Buffer.from("fake-png");
    await pageImageStore.save({ documentId: synthId, page: 1, pngBytes });

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    const events = await collectEvents(svc, {
      filePath: "/fake/scan.pdf",
      filename: "scan.pdf",
      mimeType: "application/pdf",
      studentId: "student-1",
    });

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();

    if (doneEvent?.type === "done") {
      // After rename: real docId dir should have the image; synth dir should be gone
      const readFromSynth = await pageImageStore.read({ documentId: synthId, page: 1 });
      const readFromReal = await pageImageStore.read({ documentId: doneEvent.documentId, page: 1 });
      // synthetic dir is removed after rename; real dir has the file
      expect(readFromSynth).toBeNull();
      expect(readFromReal).not.toBeNull();
    }
  });

  it("indexing events have chunksProcessed and totalChunks", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore, embeddings } = makeStores();
    const result = makeIngestorResult(2);
    const ingestor = makeIngestor(result);

    const svc = new IngestionService({
      db,
      log: noopLogger(),
      vectorStore,
      ftsStore,
      embeddings,
      ingestorRegistry: makeRegistry(ingestor),
      pageImageStore,
    });

    const events = await collectEvents(svc, {
      filePath: "/fake/doc.txt",
      filename: "doc.txt",
      mimeType: "text/plain",
      studentId: "student-1",
    });

    const indexingEvents = events.filter((e) => e.type === "indexing");
    expect(indexingEvents.length).toBeGreaterThan(0);
    for (const ev of indexingEvents) {
      if (ev.type === "indexing") {
        expect(ev.totalChunks).toBe(2);
        expect(ev.chunksProcessed).toBeGreaterThan(0);
      }
    }
  });
});
