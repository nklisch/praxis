import type { Logger } from "@praxis/core/types";
import type Database from "better-sqlite3";

export interface ConceptEmbeddingUpsertInput {
  conceptId: string;
  graphId: string;
  conceptName: string;
  embedding: number[];
}

export interface ConceptEmbeddingMatch {
  conceptId: string;
  graphId: string;
  conceptName: string;
  /** Cosine distance; lower = more similar. */
  distance: number;
}

/**
 * Port for the concept embeddings store.
 * Implementation: SqliteConceptEmbeddingsStore backed by the sqlite-vec
 * `concept_embeddings` virtual table (created by initConceptEmbeddingStore).
 */
export interface ConceptEmbeddingsStore {
  upsert(input: ConceptEmbeddingUpsertInput): Promise<void>;
  /** Insert or replace a batch of embeddings in a single transaction. */
  upsertBatch(inputs: ConceptEmbeddingUpsertInput[]): Promise<void>;
  /** Find concepts whose embeddings are nearest the given vector. */
  findSimilar(input: {
    embedding: number[];
    topK: number;
    /** When provided, restricts results to concepts NOT in these graph ids. */
    excludeGraphIds?: string[];
  }): Promise<ConceptEmbeddingMatch[]>;
  /** Remove all embeddings for a given graph (used when re-importing a pack version). */
  deleteByGraphId(graphId: string): Promise<void>;
}

/**
 * sqlite-vec backed implementation of ConceptEmbeddingsStore.
 *
 * Follows the same vectorToBuffer pattern as SqliteVecStore (Phase 5).
 * sqlite-vec uses `INSERT OR REPLACE` for upserts on virtual tables —
 * unlike document_embeddings which uses delete-then-insert, concept_embeddings
 * uses INSERT OR REPLACE because concept_id is the PRIMARY KEY in the vec0
 * schema, which sqlite-vec supports for exact replacement.
 */
export class SqliteConceptEmbeddingsStore implements ConceptEmbeddingsStore {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly log: Logger,
  ) {}

  async upsert(input: ConceptEmbeddingUpsertInput): Promise<void> {
    return this.upsertBatch([input]);
  }

  async upsertBatch(inputs: ConceptEmbeddingUpsertInput[]): Promise<void> {
    if (inputs.length === 0) return;
    // sqlite-vec virtual tables don't support INSERT OR REPLACE the way regular
    // tables do. Use delete-then-insert per row to get upsert semantics.
    const delStmt = this.sqlite.prepare(`DELETE FROM concept_embeddings WHERE concept_id = ?`);
    const insStmt = this.sqlite.prepare(`
      INSERT INTO concept_embeddings(concept_id, graph_id, embedding, concept_name)
      VALUES (?, ?, ?, ?)
    `);
    const tx = this.sqlite.transaction((rows: ConceptEmbeddingUpsertInput[]) => {
      for (const r of rows) {
        delStmt.run(r.conceptId);
        insStmt.run(r.conceptId, r.graphId, vectorToBuffer(r.embedding), r.conceptName);
      }
    });
    tx(inputs);
    this.log.debug("concept_embeddings.upsertBatch", { count: inputs.length });
  }

  async findSimilar(input: {
    embedding: number[];
    topK: number;
    excludeGraphIds?: string[];
  }): Promise<ConceptEmbeddingMatch[]> {
    const exclude = input.excludeGraphIds ?? [];

    // sqlite-vec KNN: embedding MATCH + k = N must be in the WHERE clause.
    // graph_id filters are applied post-KNN (sqlite-vec auxiliary columns
    // can filter on the vec0 shadow tables for indexed columns, but graph_id
    // here is not a filtered index — simple post-filter is safe for pack sizes).
    const knnSql = `
      SELECT concept_id, graph_id, concept_name, distance
      FROM concept_embeddings
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance
    `;

    const knnParams: unknown[] = [vectorToBuffer(input.embedding), input.topK + exclude.length * 5];

    type Row = { concept_id: string; graph_id: string; concept_name: string; distance: number };
    const allRows = this.sqlite.prepare(knnSql).all(...knnParams) as Row[];

    const excludeSet = new Set(exclude);
    const filtered = allRows.filter((r) => !excludeSet.has(r.graph_id));

    return filtered.slice(0, input.topK).map((r) => ({
      conceptId: r.concept_id,
      graphId: r.graph_id,
      conceptName: r.concept_name,
      distance: r.distance,
    }));
  }

  async deleteByGraphId(graphId: string): Promise<void> {
    // sqlite-vec virtual tables support DELETE with auxiliary column filters
    // on the shadow tables. For graph_id (non-indexed), we must use a subquery
    // approach or delete by concept_id. The simplest correct approach:
    // fetch matching concept_ids first, then delete by primary key.
    type IdRow = { concept_id: string };
    const rows = this.sqlite
      .prepare("SELECT concept_id FROM concept_embeddings WHERE graph_id = ?")
      .all(graphId) as IdRow[];

    if (rows.length === 0) return;

    const delStmt = this.sqlite.prepare("DELETE FROM concept_embeddings WHERE concept_id = ?");
    const tx = this.sqlite.transaction((ids: string[]) => {
      for (const id of ids) delStmt.run(id);
    });
    tx(rows.map((r) => r.concept_id));
    this.log.debug("concept_embeddings.deleteByGraphId", { graphId, deleted: rows.length });
  }
}

/**
 * Convert a number[] embedding to a Buffer of Float32 little-endian bytes.
 * This is the binary format sqlite-vec expects for FLOAT[N] vector operations.
 * Mirrors the vectorToBlob helper in SqliteVecStore (Phase 5).
 */
function vectorToBuffer(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i] ?? 0, i * 4);
  }
  return buf;
}
