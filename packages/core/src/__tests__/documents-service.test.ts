/**
 * Unit tests for DocumentsServiceImpl.
 *
 * Verifies that delete() cascades through vectorStore, ftsStore, pageImageStore,
 * and the DB row (FK cascade removes document_chunks automatically).
 * Uses a real temp SQLite DB so the list() query runs against real rows.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents } from "@praxis/artifacts/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { FsEmbeddedImageStore } from "../ingestion/embedded-images.js";
import { FsPageImageStore } from "../ingestion/page-images.js";
import { DocumentsServiceImpl } from "../services/documents-service.js";

const dbCtx = useTempDb();

let tmpDir: string;
let pageImageStore: FsPageImageStore;
let embeddedImageStore: FsEmbeddedImageStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-doc-svc-test-"));
  pageImageStore = new FsPageImageStore(tmpDir);
  embeddedImageStore = new FsEmbeddedImageStore(join(tmpDir, "embedded"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeMockStores() {
  return {
    vectorStore: {
      upsert: vi.fn(),
      upsertBatch: vi.fn(),
      search: vi.fn().mockResolvedValue([]),
      deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
    },
    ftsStore: {
      upsert: vi.fn(),
      upsertBatch: vi.fn(),
      search: vi.fn().mockResolvedValue([]),
      deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function insertDoc(
  db: ReturnType<typeof openDb>["db"],
  docId: string,
  opts: { filename?: string; chunkCount?: number; ingestorId?: string } = {},
) {
  db.insert(documents)
    .values({
      id: docId,
      studentId: "student-1",
      filename: opts.filename ?? "test.txt",
      mimeType: "text/plain",
      ingestedAt: new Date(),
      manifestJson: {
        title: "Test",
        pageCount: null,
        ingestorId: opts.ingestorId ?? "plain-text",
      },
      chunkCount: opts.chunkCount ?? 5,
    })
    .run();
}

describe("DocumentsServiceImpl.list()", () => {
  it("returns empty array when no documents exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    const docs = await svc.list();
    expect(docs).toHaveLength(0);
  });

  it("returns all ingested documents with correct shape", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertDoc(db, "doc-1", { filename: "biology.txt", chunkCount: 10, ingestorId: "plain-text" });
    insertDoc(db, "doc-2", { filename: "chemistry.md", chunkCount: 20, ingestorId: "markdown" });

    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    const docs = await svc.list();
    expect(docs).toHaveLength(2);

    const bio = docs.find((d) => d.documentId === "doc-1");
    expect(bio).toBeDefined();
    expect(bio?.filename).toBe("biology.txt");
    expect(bio?.chunkCount).toBe(10);
    expect(bio?.ingestorId).toBe("plain-text");
  });

  it("falls back to 'unknown' ingestorId when manifestJson has no ingestorId field", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Insert with a manifest that has no ingestorId field
    db.insert(documents)
      .values({
        id: "doc-no-ingestor-id",
        studentId: "student-1",
        filename: "raw.bin",
        mimeType: "application/octet-stream",
        ingestedAt: new Date(),
        manifestJson: { title: "Raw", pageCount: null },
        chunkCount: 0,
      })
      .run();

    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    const docs = await svc.list();
    const doc = docs.find((d) => d.documentId === "doc-no-ingestor-id");
    expect(doc?.ingestorId).toBe("unknown");
    expect(doc?.ingestorLabel).toBe("Unknown");
  });
});

describe("DocumentsServiceImpl.delete()", () => {
  it("calls deleteByDocumentId on vectorStore, ftsStore, and pageImageStore", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertDoc(db, "doc-to-delete");

    const { vectorStore, ftsStore } = makeMockStores();
    const pageImageDeleteSpy = vi.spyOn(pageImageStore, "deleteByDocumentId");

    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });
    await svc.delete("doc-to-delete");

    expect(vectorStore.deleteByDocumentId).toHaveBeenCalledWith("doc-to-delete");
    expect(ftsStore.deleteByDocumentId).toHaveBeenCalledWith("doc-to-delete");
    expect(pageImageDeleteSpy).toHaveBeenCalledWith("doc-to-delete");
  });

  it("calls embeddedImageStore.deleteByDocumentId — cascade regression", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertDoc(db, "doc-embedded-cascade");

    const { vectorStore, ftsStore } = makeMockStores();
    const embeddedDeleteSpy = vi.spyOn(embeddedImageStore, "deleteByDocumentId");

    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });
    await svc.delete("doc-embedded-cascade");

    expect(embeddedDeleteSpy).toHaveBeenCalledWith("doc-embedded-cascade");
  });

  it("removes the document row from the DB", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertDoc(db, "doc-delete-row");

    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    await svc.delete("doc-delete-row");

    const remaining = db.select().from(documents).all();
    expect(remaining.every((r) => r.id !== "doc-delete-row")).toBe(true);
  });

  it("after delete, list() no longer includes the document", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertDoc(db, "doc-gone");
    insertDoc(db, "doc-stays");

    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    await svc.delete("doc-gone");

    const docs = await svc.list();
    expect(docs.every((d) => d.documentId !== "doc-gone")).toBe(true);
    expect(docs.some((d) => d.documentId === "doc-stays")).toBe(true);
  });
});

describe("DocumentsServiceImpl.pageImage()", () => {
  it("returns null when no image has been saved", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    const buf = await svc.pageImage({ documentId: "doc-no-img", page: 1 });
    expect(buf).toBeNull();
  });

  it("returns Buffer when a page image has been saved", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await pageImageStore.save({ documentId: "doc-img", page: 1, pngBytes });

    const { vectorStore, ftsStore } = makeMockStores();
    const svc = new DocumentsServiceImpl({
      db,
      vectorStore,
      ftsStore,
      pageImageStore,
      embeddedImageStore,
    });

    const buf = await svc.pageImage({ documentId: "doc-img", page: 1 });
    expect(buf).not.toBeNull();
    expect(buf?.compare(pngBytes)).toBe(0);
  });
});
