import { openDb } from "@praxis/core/db";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import {
  type ConceptEmbeddingUpsertInput,
  SqliteConceptEmbeddingsStore,
} from "../concept-embeddings.js";

const noopLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLog,
};

function makeEmbedding(seed: number, dim = 384): number[] {
  const v = Array.from({ length: dim }, (_, i) => Math.sin(seed + i * 0.01));
  // Normalize so cosine distance is meaningful
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

describe("SqliteConceptEmbeddingsStore", () => {
  const ctx = useTempDb();

  function makeStore() {
    const { sqlite } = openDb({ path: ctx.dbPath });
    return new SqliteConceptEmbeddingsStore(sqlite, noopLog);
  }

  it("upserts a single embedding and retrieves it via findSimilar", async () => {
    const store = makeStore();
    const embedding = makeEmbedding(1);

    await store.upsert({
      conceptId: "algebra-1.real-numbers",
      graphId: "graph-1",
      conceptName: "Real Numbers",
      embedding,
    });

    const results = await store.findSimilar({ embedding, topK: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.conceptId).toBe("algebra-1.real-numbers");
    expect(results[0]?.graphId).toBe("graph-1");
    expect(results[0]?.conceptName).toBe("Real Numbers");
    expect(results[0]?.distance).toBeCloseTo(0, 2); // same vector → distance ≈ 0
  });

  it("upsertBatch writes 5 concepts in one transaction", async () => {
    const store = makeStore();
    const inputs: ConceptEmbeddingUpsertInput[] = Array.from({ length: 5 }, (_, i) => ({
      conceptId: `batch-graph.concept-${i}`,
      graphId: "batch-graph",
      conceptName: `Concept ${i}`,
      embedding: makeEmbedding(i * 10),
    }));

    await store.upsertBatch(inputs);

    // Query with a vector similar to the first concept
    const results = await store.findSimilar({ embedding: makeEmbedding(0), topK: 5 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Closest result should be concept-0 (seed=0 matches query seed=0)
    expect(results[0]?.conceptId).toBe("batch-graph.concept-0");
  });

  it("respects topK limit", async () => {
    const store = makeStore();
    const inputs: ConceptEmbeddingUpsertInput[] = Array.from({ length: 10 }, (_, i) => ({
      conceptId: `topk-graph.c-${i}`,
      graphId: "topk-graph",
      conceptName: `C${i}`,
      embedding: makeEmbedding(i * 5),
    }));
    await store.upsertBatch(inputs);

    const results = await store.findSimilar({ embedding: makeEmbedding(0), topK: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("excludeGraphIds filters out specified graphs", async () => {
    const store = makeStore();
    await store.upsertBatch([
      {
        conceptId: "graph-a.c1",
        graphId: "graph-a",
        conceptName: "A1",
        embedding: makeEmbedding(1),
      },
      {
        conceptId: "graph-b.c1",
        graphId: "graph-b",
        conceptName: "B1",
        embedding: makeEmbedding(1.001), // nearly identical embedding
      },
    ]);

    const results = await store.findSimilar({
      embedding: makeEmbedding(1),
      topK: 5,
      excludeGraphIds: ["graph-a"],
    });
    expect(results.every((r) => r.graphId !== "graph-a")).toBe(true);
    expect(results.some((r) => r.graphId === "graph-b")).toBe(true);
  });

  it("deleteByGraphId removes only that graph's rows", async () => {
    const store = makeStore();
    await store.upsertBatch([
      {
        conceptId: "del-graph.c1",
        graphId: "del-graph",
        conceptName: "Del1",
        embedding: makeEmbedding(50),
      },
      {
        conceptId: "keep-graph.c1",
        graphId: "keep-graph",
        conceptName: "Keep1",
        embedding: makeEmbedding(51),
      },
    ]);

    await store.deleteByGraphId("del-graph");

    const results = await store.findSimilar({ embedding: makeEmbedding(50), topK: 10 });
    expect(results.every((r) => r.graphId !== "del-graph")).toBe(true);
    expect(results.some((r) => r.graphId === "keep-graph")).toBe(true);
  });

  it("upsert replaces an existing embedding (INSERT OR REPLACE)", async () => {
    const store = makeStore();
    const conceptId = "replace-graph.c1";

    await store.upsert({
      conceptId,
      graphId: "replace-graph",
      conceptName: "Original",
      embedding: makeEmbedding(100),
    });

    // Replace with different embedding
    await store.upsert({
      conceptId,
      graphId: "replace-graph",
      conceptName: "Updated",
      embedding: makeEmbedding(200),
    });

    const results = await store.findSimilar({ embedding: makeEmbedding(200), topK: 5 });
    const match = results.find((r) => r.conceptId === conceptId);
    expect(match?.conceptName).toBe("Updated");
  });
});
