import type Database from "better-sqlite3";

const EMBEDDING_DIMENSION = 384;

/**
 * Load the sqlite-vec extension and create the `document_embeddings` virtual
 * table (if it doesn't already exist).
 *
 * Called by `openDb()` after Drizzle migrations, so the table is ready for
 * use immediately after DB open.
 *
 * The dimension is hardcoded to 384 (bge-small-en-v1.5). If you swap models,
 * update `EMBEDDING_DIMENSION` and run a migration to recreate the table.
 */
export function initVectorStore(
  sqlite: Database.Database,
  dimension: number = EMBEDDING_DIMENSION,
): void {
  loadSqliteVec(sqlite);
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vec0(
      chunk_id TEXT PRIMARY KEY,
      document_id TEXT,
      embedding FLOAT[${dimension}],
      +chunk_text TEXT,
      +page INTEGER,
      +section TEXT
    );
  `);
}

/**
 * Create the `document_chunks_fts` FTS5 virtual table (if it doesn't already
 * exist). FTS5 is built into SQLite — no extension load needed.
 *
 * Tokenizer: `porter unicode61` for English stemming (ATP → atp, synthesize →
 * synthes, etc.) and Unicode normalization. Combined with the vector index,
 * this enables hybrid BM25 + semantic retrieval via Reciprocal Rank Fusion.
 *
 * Note: FTS5 virtual tables do not support `ON CONFLICT` or `UPSERT`. For
 * re-ingestion, callers must `deleteByDocumentId` before re-inserting.
 */
export function initFtsStore(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      document_id UNINDEXED,
      page UNINDEXED,
      section,
      text,
      tokenize = 'porter unicode61'
    );
  `);
}

function loadSqliteVec(sqlite: Database.Database): void {
  // Lazy require keeps the native binary out of the module graph when tests
  // mock this module. Tests that don't exercise the real extension can mock
  // this entire file; tests that need the real extension use useTempDb.
  const sqliteVec = require("sqlite-vec") as { load: (db: Database.Database) => void };
  sqliteVec.load(sqlite);
}
