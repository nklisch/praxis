import type {
  VectorSearchInput,
  VectorSearchResult,
  VectorStore,
  VectorUpsertInput,
} from "@praxis/core/types";
import type Database from "better-sqlite3";

/**
 * SqliteVecStore — semantic vector index backed by the sqlite-vec extension.
 *
 * Requires `initVectorStore(sqlite)` to have been called before use (done
 * automatically by `openDb()` unless `initVectors: false`).
 *
 * Vector data is stored as Float32 little-endian bytes — the format sqlite-vec
 * expects.
 *
 * Note: sqlite-vec virtual tables do NOT support `ON CONFLICT DO UPDATE`
 * (UPSERT). The `upsert` method deletes the existing row by chunk_id before
 * inserting. For fresh ingestion this is fine; for re-ingestion callers should
 * `deleteByDocumentId` first.
 *
 * Filter support (dynamically composed SQL WHERE clauses):
 * - `documentIds`: restricts results to specific documents.
 * - `sectionPattern`: LIKE filter on the `section` column (case-insensitive).
 * - `pageRange`: BETWEEN filter on the `page` column.
 */
export class SqliteVecStore implements VectorStore {
  private readonly insertStmt: Database.Statement;
  private readonly deleteByChunkStmt: Database.Statement;
  private readonly deleteByDocStmt: Database.Statement;

  constructor(private readonly sqlite: Database.Database) {
    this.insertStmt = sqlite.prepare(`
      INSERT INTO document_embeddings (chunk_id, document_id, embedding, chunk_text, page, section)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    this.deleteByChunkStmt = sqlite.prepare("DELETE FROM document_embeddings WHERE chunk_id = ?");
    this.deleteByDocStmt = sqlite.prepare("DELETE FROM document_embeddings WHERE document_id = ?");
  }

  async upsert(input: VectorUpsertInput): Promise<void> {
    // sqlite-vec doesn't support ON CONFLICT DO UPDATE for virtual tables.
    // Delete-then-insert is safe: for new ingestion, the delete is a no-op.
    this.deleteByChunkStmt.run(input.chunkId);
    this.insertStmt.run(
      input.chunkId,
      input.documentId,
      vectorToBlob(input.embedding),
      input.chunkText,
      // sqlite-vec requires strict INTEGER type for auxiliary integer columns.
      // Use BigInt to force SQLite INTEGER binding via better-sqlite3.
      input.page !== undefined ? BigInt(Math.trunc(input.page)) : null,
      input.section ?? null,
    );
  }

  async upsertBatch(items: ReadonlyArray<VectorUpsertInput>): Promise<void> {
    const txn = this.sqlite.transaction((rows: ReadonlyArray<VectorUpsertInput>) => {
      for (const row of rows) {
        this.deleteByChunkStmt.run(row.chunkId);
        this.insertStmt.run(
          row.chunkId,
          row.documentId,
          vectorToBlob(row.embedding),
          row.chunkText,
          // sqlite-vec requires strict INTEGER type for auxiliary integer columns.
          // Use BigInt to force SQLite INTEGER binding via better-sqlite3.
          row.page !== undefined ? BigInt(Math.trunc(row.page)) : null,
          row.section ?? null,
        );
      }
    });
    txn(items);
  }

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    // sqlite-vec KNN queries only support `embedding MATCH ?` and `k = ?`
    // in the WHERE clause. Auxiliary column filters (document_id, section, page)
    // must be applied post-KNN in the outer query or in application code.
    //
    // We fetch up to topK * 4 results from the KNN query and apply filters in
    // a wrapping query. document_id filtering uses the outer WHERE clause
    // (sqlite-vec allows filtering on document_id via the vec0 shadow tables),
    // while section/page filtering is done in the outer SELECT.
    //
    // For large result sets where filters are selective, this may return fewer
    // than topK results. For Phase 5's use case (moderate document sets),
    // this is acceptable.

    const candidateK = input.topK * 4; // Fetch more candidates to allow for filtering
    // biome-ignore lint/suspicious/noExplicitAny: SQLite parameter binding requires mixed types
    const knnParams: any[] = [vectorToBlob(input.embedding), candidateK];

    const knnSql = `
      SELECT chunk_id, document_id, chunk_text, page, section, distance
      FROM document_embeddings
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance
    `;

    const allRows = this.sqlite.prepare(knnSql).all(...knnParams) as Array<{
      chunk_id: string;
      document_id: string;
      chunk_text: string;
      page: number | bigint | null;
      section: string | null;
      distance: number;
    }>;

    // Apply filters in application code
    let filtered = allRows;

    if (input.documentIds && input.documentIds.length > 0) {
      const idSet = new Set(input.documentIds);
      filtered = filtered.filter((r) => idSet.has(r.document_id));
    }
    if (input.sectionPattern) {
      const lower = input.sectionPattern.toLowerCase();
      filtered = filtered.filter((r) => r.section?.toLowerCase().includes(lower) ?? false);
    }
    if (input.pageRange) {
      const { from, to } = input.pageRange;
      filtered = filtered.filter((r) => {
        if (r.page === null) return false;
        const p = Number(r.page);
        return p >= from && p <= to;
      });
    }

    return filtered.slice(0, input.topK).map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      chunkText: r.chunk_text,
      ...(r.page !== null && { page: Number(r.page) }),
      ...(r.section !== null && { section: r.section }),
      distance: r.distance,
    }));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    this.deleteByDocStmt.run(documentId);
  }
}

/**
 * Convert a number[] embedding to a Buffer of Float32 little-endian bytes.
 * This is the binary format sqlite-vec expects for vector operations.
 */
function vectorToBlob(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i] ?? 0, i * 4);
  }
  return buf;
}
