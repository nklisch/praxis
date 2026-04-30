import { createRequire } from "node:module";
import type Database from "better-sqlite3";

const EMBEDDING_DIMENSION = 384;

/**
 * Module-level idempotent guard for the sqlite-vec native extension.
 * The extension must be loaded once per process; a second call to `.load()`
 * will crash with "already loaded". This flag prevents that.
 *
 * Note: This guard is process-scoped. In tests each test gets a fresh DB file
 * but shares the same process; the guard is intentionally NOT reset between
 * tests because the native extension stays loaded in the process.
 */
let _vecLoaded = false;

/**
 * ESM-compatible require function rooted at this file's directory.
 * Used to load the sqlite-vec CJS module (which uses require.resolve internally
 * to find the native .dylib/.so). The `createRequire` approach is the only way
 * to use `require()` in ESM scope without `--experimental-require-module`.
 *
 * Why this works in both vitest and tsx:
 * - vitest: resolves via the pnpm node_modules symlink structure correctly.
 * - tsx (db:migrate): ESM context without global require — createRequire provides it.
 *
 * The original bare `require("sqlite-vec")` worked in vitest (which polyfills
 * CJS globals) but failed in tsx ESM mode. createRequire works in both.
 */
const _require = createRequire(import.meta.url);

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
  loadSqliteVecIfNeeded(sqlite);
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
 * Create the `concept_embeddings` virtual table (if it doesn't already exist).
 *
 * Phase 10: concept embeddings are stored in a separate virtual table from
 * document embeddings so that concept queries don't load document vectors.
 * Keyed on concept_id with graph_id for multi-graph isolation.
 */
export function initConceptEmbeddingStore(
  sqlite: Database.Database,
  dimension: number = EMBEDDING_DIMENSION,
): void {
  loadSqliteVecIfNeeded(sqlite);
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS concept_embeddings USING vec0(
      concept_id TEXT PRIMARY KEY,
      graph_id TEXT,
      embedding FLOAT[${dimension}],
      +concept_name TEXT
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

/**
 * Load the sqlite-vec native extension into the given SQLite connection.
 *
 * Uses `createRequire` (ESM-compatible) instead of bare `require()`, which
 * fails in ESM scope. The `_vecLoaded` flag prevents double-loading the
 * extension within a process — sqlite-vec throws if loaded twice.
 */
function loadSqliteVecIfNeeded(sqlite: Database.Database): void {
  if (_vecLoaded) return;
  const sqliteVec = _require("sqlite-vec") as { load: (db: Database.Database) => void };
  sqliteVec.load(sqlite);
  _vecLoaded = true;
}
