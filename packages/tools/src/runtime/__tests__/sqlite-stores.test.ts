/**
 * Tests for SqliteVecStore + SqliteFtsStore using real SQLite + sqlite-vec.
 * Uses a temporary in-memory-equivalent DB — no Drizzle migrations needed since
 * sqlite-vec and FTS5 are virtual tables created by initVectorStore/initFtsStore.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initFtsStore, initVectorStore } from "@praxis/core/db";
import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteFtsStore } from "../sqlite-fts-store.js";
import { SqliteVecStore } from "../sqlite-vec-store.js";

let tmpDir: string;
let sqlite: Database.Database;
let vecStore: SqliteVecStore;
let ftsStore: SqliteFtsStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-stores-test-"));
  const dbPath = join(tmpDir, "test.db");
  // No Drizzle migrations needed — virtual tables are created programmatically
  sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initVectorStore(sqlite);
  initFtsStore(sqlite);
  vecStore = new SqliteVecStore(sqlite);
  ftsStore = new SqliteFtsStore(sqlite);
});

afterEach(() => {
  sqlite.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeVec(seed: number, dim = 384): number[] {
  const arr = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    // Give each seed a distinct unit direction
    arr[i] = i === seed % dim ? 1 : 0.001;
  }
  // Normalize
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  return arr.map((v) => v / norm);
}

describe("SqliteFtsStore", () => {
  it("upsert and search returns matching chunks", async () => {
    await ftsStore.upsert({
      chunkId: "c1",
      documentId: "doc1",
      chunkText: "ATP synthase catalyzes the formation of ATP",
    });
    await ftsStore.upsert({
      chunkId: "c2",
      documentId: "doc1",
      chunkText: "Photosynthesis converts sunlight into chemical energy",
    });

    const results = await ftsStore.search({ query: "ATP synthase", topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunkText).toContain("ATP");
  });

  it("upsertBatch writes multiple rows in a transaction", async () => {
    await ftsStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", chunkText: "Cell membrane structure" },
      { chunkId: "c2", documentId: "doc1", chunkText: "Mitochondria power plant" },
      { chunkId: "c3", documentId: "doc2", chunkText: "Nucleus contains DNA" },
    ]);

    const results = await ftsStore.search({ query: "cell", topK: 10 });
    expect(results.length).toBeGreaterThan(0);
  });

  it("search returns empty array for empty query", async () => {
    await ftsStore.upsert({ chunkId: "c1", documentId: "doc1", chunkText: "Some text." });
    const results = await ftsStore.search({ query: "", topK: 5 });
    expect(results).toHaveLength(0);
  });

  it("search filters by documentIds", async () => {
    await ftsStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", chunkText: "Biology is the study of life" },
      { chunkId: "c2", documentId: "doc2", chunkText: "Biology covers cells and organisms" },
    ]);

    const results = await ftsStore.search({
      query: "biology",
      topK: 5,
      documentIds: ["doc1"],
    });
    expect(results.every((r) => r.documentId === "doc1")).toBe(true);
  });

  it("search filters by sectionPattern", async () => {
    await ftsStore.upsertBatch([
      {
        chunkId: "c1",
        documentId: "doc1",
        chunkText: "Enzyme kinetics intro",
        section: "Chapter 3",
      },
      {
        chunkId: "c2",
        documentId: "doc1",
        chunkText: "Enzyme catalysis continues",
        section: "Chapter 5",
      },
    ]);

    const results = await ftsStore.search({
      query: "enzyme",
      topK: 5,
      sectionPattern: "Chapter 3",
    });
    expect(results.every((r) => r.section === "Chapter 3")).toBe(true);
  });

  it("search filters by pageRange", async () => {
    await ftsStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", chunkText: "Early chapter content", page: 5 },
      { chunkId: "c2", documentId: "doc1", chunkText: "Later chapter content", page: 45 },
    ]);

    const results = await ftsStore.search({
      query: "chapter",
      topK: 5,
      pageRange: { from: 40, to: 50 },
    });
    expect(results.every((r) => (r.page ?? 0) >= 40 && (r.page ?? 0) <= 50)).toBe(true);
  });

  it("deleteByDocumentId removes all chunks for that document", async () => {
    await ftsStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", chunkText: "DNA replication" },
      { chunkId: "c2", documentId: "doc1", chunkText: "RNA transcription" },
      { chunkId: "c3", documentId: "doc2", chunkText: "Protein synthesis" },
    ]);

    await ftsStore.deleteByDocumentId("doc1");

    const results = await ftsStore.search({ query: "DNA", topK: 5 });
    expect(results.every((r) => r.documentId !== "doc1")).toBe(true);

    const doc2Results = await ftsStore.search({ query: "protein", topK: 5 });
    expect(doc2Results.some((r) => r.documentId === "doc2")).toBe(true);
  });

  it("sanitizes FTS5 syntax chars in query without throwing", async () => {
    await ftsStore.upsert({
      chunkId: "c1",
      documentId: "doc1",
      chunkText: "ATP synthase is an enzyme",
    });

    await expect(ftsStore.search({ query: 'ATP "synthase"', topK: 5 })).resolves.toBeDefined();
  });

  it("results include section and page when set", async () => {
    await ftsStore.upsert({
      chunkId: "c1",
      documentId: "doc1",
      chunkText: "Mitosis cell division",
      section: "Chapter 7",
      page: 102,
    });

    const results = await ftsStore.search({ query: "mitosis", topK: 1 });
    expect(results[0]?.section).toBe("Chapter 7");
    expect(results[0]?.page).toBe(102);
  });
});

describe("SqliteVecStore", () => {
  it("upsert and search returns nearest chunk", async () => {
    const vec = makeVec(0);
    await vecStore.upsert({
      chunkId: "c1",
      documentId: "doc1",
      embedding: vec,
      chunkText: "First chunk",
    });

    const results = await vecStore.search({ embedding: vec, topK: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.chunkId).toBe("c1");
    expect(results[0]?.chunkText).toBe("First chunk");
  });

  it("upsertBatch writes multiple vectors", async () => {
    await vecStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", embedding: makeVec(0), chunkText: "Alpha" },
      { chunkId: "c2", documentId: "doc1", embedding: makeVec(1), chunkText: "Beta" },
      { chunkId: "c3", documentId: "doc2", embedding: makeVec(2), chunkText: "Gamma" },
    ]);

    const results = await vecStore.search({ embedding: makeVec(0), topK: 3 });
    expect(results.length).toBeGreaterThan(0);
  });

  it("search filters by documentIds", async () => {
    await vecStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", embedding: makeVec(0), chunkText: "Doc1 content" },
      { chunkId: "c2", documentId: "doc2", embedding: makeVec(0), chunkText: "Doc2 content" },
    ]);

    const results = await vecStore.search({
      embedding: makeVec(0),
      topK: 5,
      documentIds: ["doc1"],
    });
    expect(results.every((r) => r.documentId === "doc1")).toBe(true);
  });

  it("search filters by pageRange", async () => {
    await vecStore.upsertBatch([
      {
        chunkId: "c1",
        documentId: "doc1",
        embedding: makeVec(0),
        chunkText: "Early page",
        page: 5,
      },
      {
        chunkId: "c2",
        documentId: "doc1",
        embedding: makeVec(0),
        chunkText: "Later page",
        page: 45,
      },
    ]);

    const results = await vecStore.search({
      embedding: makeVec(0),
      topK: 5,
      pageRange: { from: 40, to: 50 },
    });
    expect(results.every((r) => (r.page ?? 0) >= 40 && (r.page ?? 0) <= 50)).toBe(true);
  });

  it("deleteByDocumentId removes vectors for that document", async () => {
    await vecStore.upsertBatch([
      { chunkId: "c1", documentId: "doc1", embedding: makeVec(0), chunkText: "Chunk 1" },
      { chunkId: "c2", documentId: "doc2", embedding: makeVec(1), chunkText: "Chunk 2" },
    ]);

    await vecStore.deleteByDocumentId("doc1");

    const results = await vecStore.search({ embedding: makeVec(0), topK: 5 });
    expect(results.every((r) => r.documentId !== "doc1")).toBe(true);
  });

  it("upsert on existing chunk_id updates in place", async () => {
    const vec = makeVec(0);
    await vecStore.upsert({
      chunkId: "c1",
      documentId: "doc1",
      embedding: vec,
      chunkText: "Original text",
    });
    await vecStore.upsert({
      chunkId: "c1",
      documentId: "doc1",
      embedding: vec,
      chunkText: "Updated text",
    });

    const results = await vecStore.search({ embedding: vec, topK: 1 });
    expect(results[0]?.chunkText).toBe("Updated text");
  });
});
