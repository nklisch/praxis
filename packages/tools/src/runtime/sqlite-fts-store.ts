import type { FtsSearchInput, FtsSearchResult, FtsStore, FtsUpsertInput } from "@praxis/core/types";
import type Database from "better-sqlite3";

/**
 * SqliteFtsStore — BM25 full-text search backed by SQLite FTS5.
 *
 * Requires `initFtsStore(sqlite)` to have been called before use (done
 * automatically by `openDb()` unless `initVectors: false`).
 *
 * FTS5 does not support `ON CONFLICT` / `UPSERT` for virtual tables. For
 * re-ingestion, call `deleteByDocumentId` before re-inserting. This is fine
 * for Phase 5 where ingestion is a one-time operation per document.
 *
 * The `bm25()` auxiliary function returns negative log-probability scores
 * (lower = more relevant). Results are returned `ORDER BY score` ascending
 * so callers receive the most relevant results first.
 *
 * Filter support (dynamically composed SQL WHERE clauses):
 * - `documentIds`: restricts results to specific documents.
 * - `sectionPattern`: LIKE filter on the `section` column.
 * - `pageRange`: BETWEEN filter on the `page` column.
 */
export class SqliteFtsStore implements FtsStore {
  private readonly upsertStmt: Database.Statement;
  private readonly deleteByDocStmt: Database.Statement;

  constructor(private readonly sqlite: Database.Database) {
    this.upsertStmt = sqlite.prepare(`
      INSERT INTO document_chunks_fts (chunk_id, document_id, page, section, text)
      VALUES (?, ?, ?, ?, ?);
    `);
    this.deleteByDocStmt = sqlite.prepare("DELETE FROM document_chunks_fts WHERE document_id = ?");
  }

  async upsert(input: FtsUpsertInput): Promise<void> {
    this.upsertStmt.run(
      input.chunkId,
      input.documentId,
      input.page ?? null,
      input.section ?? null,
      input.chunkText,
    );
  }

  async upsertBatch(items: ReadonlyArray<FtsUpsertInput>): Promise<void> {
    const txn = this.sqlite.transaction((rows: ReadonlyArray<FtsUpsertInput>) => {
      for (const row of rows) {
        this.upsertStmt.run(
          row.chunkId,
          row.documentId,
          row.page ?? null,
          row.section ?? null,
          row.chunkText,
        );
      }
    });
    txn(items);
  }

  async search(input: FtsSearchInput): Promise<FtsSearchResult[]> {
    // Sanitize query: strip FTS5 syntactic characters that could cause parse
    // errors. Normal user input is plain words — FTS5 tokenizes naturally.
    const safeQuery = input.query.replace(/["()]/g, " ").trim();
    if (!safeQuery) return [];

    const conds: string[] = ["text MATCH ?"];
    // biome-ignore lint/suspicious/noExplicitAny: SQLite parameter binding requires mixed types
    const params: any[] = [safeQuery];

    if (input.documentIds && input.documentIds.length > 0) {
      conds.push(`document_id IN (${input.documentIds.map(() => "?").join(",")})`);
      params.push(...input.documentIds);
    }
    if (input.sectionPattern) {
      conds.push("section LIKE ?");
      params.push(`%${input.sectionPattern}%`);
    }
    if (input.pageRange) {
      conds.push("page BETWEEN ? AND ?");
      params.push(input.pageRange.from, input.pageRange.to);
    }

    const sql = `
      SELECT chunk_id, document_id, page, section, text, bm25(document_chunks_fts) AS score
      FROM document_chunks_fts
      WHERE ${conds.join(" AND ")}
      ORDER BY score
      LIMIT ?;
    `;
    params.push(input.topK);

    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      chunk_id: string;
      document_id: string;
      page: number | null;
      section: string | null;
      text: string;
      score: number;
    }>;

    return rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      chunkText: r.text,
      ...(r.page !== null && { page: r.page }),
      ...(r.section !== null && { section: r.section }),
      score: r.score,
    }));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    this.deleteByDocStmt.run(documentId);
  }
}
