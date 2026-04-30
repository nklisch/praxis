/**
 * db:packs — CLI script to list imported packs and available pack JSONs.
 *
 * Usage:
 *   pnpm db:packs                    — list all imported packs
 *   pnpm db:packs --import algebra-1 — import a pack by id then list
 *
 * Reads from the local .praxis/dev.db. The pack JSON files are resolved
 * from packages/curriculum/packs/ relative to the repo root.
 */

import { openDb } from "@praxis/core/db";
import { PackImportServiceImpl, SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";
import { conceptGraphs, packImports } from "@praxis/curriculum/schema";
import { LocalEmbeddingService } from "@praxis/tools/runtime";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const importFlagIdx = args.indexOf("--import");
const importPackId = importFlagIdx >= 0 ? args[importFlagIdx + 1] : null;

if (importPackId !== null && !importPackId) {
  console.error("Error: --import requires a pack id (e.g., pnpm db:packs --import algebra-1)");
  process.exit(1);
}

const { db, sqlite } = openDb({ readonly: importPackId === null });

const log = {
  debug: (msg: string, meta?: object) => console.debug("[packs]", msg, meta ?? ""),
  info: (msg: string, meta?: object) => console.info("[packs]", msg, meta ?? ""),
  warn: (msg: string, meta?: object) => console.warn("[packs]", msg, meta ?? ""),
  error: (msg: string, meta?: object) => console.error("[packs]", msg, meta ?? ""),
};

if (importPackId) {
  console.log(`\nImporting pack: ${importPackId} ...\n`);

  // Construct a minimal services bundle for the import (no Pyodide needed).
  const embeddings = new LocalEmbeddingService();
  const conceptEmbeddings = new SqliteConceptEmbeddingsStore(sqlite, log);
  const packService = new PackImportServiceImpl({
    db,
    log,
    embeddings,
    conceptEmbeddings,
  });

  try {
    const imported = await packService.importPack(importPackId);
    console.log("✓ Pack imported successfully:");
    console.log(`  packId:         ${imported.packId}`);
    console.log(`  version:        ${imported.version}`);
    console.log(`  conceptGraphId: ${imported.conceptGraphId}`);
    console.log(`  importedAt:     ${new Date(imported.importedAt).toISOString()}`);
    console.log();
  } catch (err) {
    console.error(
      `Error importing pack '${importPackId}':`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

// List imported packs joined to their concept graph.
const rows = db
  .select({
    packId: packImports.packId,
    version: packImports.version,
    conceptGraphId: packImports.conceptGraphId,
    importedAt: packImports.importedAt,
    graphName: conceptGraphs.name,
  })
  .from(packImports)
  .innerJoin(conceptGraphs, eq(packImports.conceptGraphId, conceptGraphs.id))
  .all();

if (rows.length === 0) {
  console.log("No packs imported yet.");
  console.log("Run: pnpm db:packs --import algebra-1");
} else {
  console.log(`\nImported packs (${rows.length} total):\n`);
  console.table(
    rows.map((r) => ({
      packId: r.packId,
      version: r.version,
      name: r.graphName,
      conceptGraphId: r.conceptGraphId.slice(0, 8) + "…",
      importedAt: r.importedAt.toISOString().slice(0, 19),
    })),
  );
}
