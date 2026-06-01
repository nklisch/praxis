import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PraxisDb } from "@praxis/core/db";
import type { EmbeddingService, Logger } from "@praxis/core/types";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { conceptGraphs, concepts, packImports, prerequisiteEdges } from "../schema.js";
import type { ConceptEmbeddingsStore } from "./concept-embeddings.js";
import { PackManifestSchema } from "./schema.js";
import type { ImportedPack, PackManifest, PackSummary } from "./types.js";

export interface PackImportServiceDeps {
  db: PraxisDb;
  log: Logger;
  embeddings: EmbeddingService;
  conceptEmbeddings: ConceptEmbeddingsStore;
  /**
   * Filesystem directory containing pack JSON files.
   * Defaults to a path resolved relative to this file's location: ../../../packs/
   * (i.e., packages/curriculum/packs/).
   */
  packsDir?: string;
}

/**
 * PackImportServiceImpl — loads validated pack manifests from disk, imports
 * them into the relational DB + concept embedding store.
 *
 * Design decisions:
 * - `importPack` is idempotent: re-importing the same (packId, version) is a
 *   no-op returning the existing record.
 * - The relational write (concept_graphs + concepts + prerequisite_edges +
 *   pack_imports) is one Drizzle transaction.
 * - Embedding writes are OUTSIDE the transaction (different store). If they
 *   fail after the transaction commits, re-importing recovers them.
 * - New pack version → new conceptGraphId. Existing courses keep their old graph.
 */
export class PackImportServiceImpl {
  private readonly packsDir: string;

  constructor(private readonly deps: PackImportServiceDeps) {
    this.packsDir = deps.packsDir ?? defaultPacksDir();
  }

  /**
   * Read all .json files in the packs directory and return summaries.
   * Invalid files are skipped with a warning.
   */
  async listAvailablePacks(): Promise<PackSummary[]> {
    let entries: string[];
    try {
      entries = readdirSync(this.packsDir).filter((f) => f.endsWith(".json"));
    } catch {
      this.deps.log.warn("packs.dir_not_found", { dir: this.packsDir });
      return [];
    }

    const summaries: PackSummary[] = [];
    for (const entry of entries) {
      try {
        const manifest = this.loadManifest(join(this.packsDir, entry));
        const imported = await this.isImported(manifest.id, manifest.version);
        summaries.push({
          id: manifest.id,
          version: manifest.version,
          name: manifest.name,
          subject: manifest.subject,
          gradeLevel: manifest.gradeLevel,
          conceptCount: manifest.concepts.length,
          edgeCount: manifest.edges.length,
          imported,
        });
      } catch (err) {
        this.deps.log.warn("pack.invalid", { file: entry, error: String(err) });
      }
    }
    return summaries;
  }

  /**
   * Import a pack by its id. Idempotent — re-importing the same version returns
   * the existing record. Existing imports verify that concept embeddings are
   * present and repair them only when a previous vector write failed.
   *
   * For a new version of the same pack, a new conceptGraphId is created.
   */
  async importPack(packId: string): Promise<ImportedPack> {
    const file = join(this.packsDir, `${packId}.json`);
    const manifest = this.loadManifest(file);

    // Check for existing import of this exact version.
    const existing = await this.findImportRecord(manifest.id, manifest.version);
    if (existing) {
      if (!(await this.hasCompleteConceptEmbeddings(manifest, existing.conceptGraphId))) {
        await this.writeConceptEmbeddings(manifest, existing.conceptGraphId);
      }
      this.deps.log.debug("pack.already_imported", {
        packId,
        version: manifest.version,
        conceptGraphId: existing.conceptGraphId,
      });
      return existing;
    }

    const conceptGraphId = uuidv7();
    const now = new Date();

    // Concept rows store with prefixed ids so multiple pack versions can coexist
    // without primary-key collisions. The manifest's stable id (e.g., "algebra-1.real-numbers")
    // becomes "<conceptGraphId>:algebra-1.real-numbers" in the row. Cross-version linking
    // happens via embeddings (semantic similarity), not via id matching — see CONTRACT.md.
    const prefixedId = (manifestId: string): string => `${conceptGraphId}:${manifestId}`;

    // Relational write — one transaction.
    this.deps.db.transaction((tx) => {
      tx.insert(conceptGraphs)
        .values({
          id: conceptGraphId,
          source: "canonical",
          standardsBody: manifest.standardsRef?.body ?? null,
          standardsVersion: manifest.standardsRef?.version ?? null,
          name: manifest.name,
          version: manifest.version,
          createdAt: now,
        })
        .run();

      tx.insert(concepts)
        .values(
          manifest.concepts.map((c) => ({
            id: prefixedId(c.id),
            graphId: conceptGraphId,
            name: c.name,
            description: c.description,
            aliasesJson: c.aliases as string[],
            standardsTagsJson: c.standardsTags as string[],
          })),
        )
        .run();

      if (manifest.edges.length > 0) {
        tx.insert(prerequisiteEdges)
          .values(
            manifest.edges.map((e) => ({
              fromId: prefixedId(e.fromId),
              toId: prefixedId(e.toId),
              strengthMilli: Math.round(e.strength * 1000),
              source: "canonical" as const,
            })),
          )
          .run();
      }

      tx.insert(packImports)
        .values({
          packId: manifest.id,
          version: manifest.version,
          conceptGraphId,
          importedAt: now,
        })
        .run();
    });

    // Embedding writes outside the transaction (separate store). Re-importing
    // the same pack version also takes this path to repair any partial vector
    // write that failed after the relational import record committed.
    await this.writeConceptEmbeddings(manifest, conceptGraphId);

    this.deps.log.info("pack.imported", {
      packId,
      version: manifest.version,
      conceptGraphId,
      conceptCount: manifest.concepts.length,
    });

    return {
      packId: manifest.id,
      version: manifest.version,
      conceptGraphId: conceptGraphId as ImportedPack["conceptGraphId"],
      importedAt: now.getTime(),
    };
  }

  /** Return all imported packs (all versions, all subjects). */
  async listImportedPacks(): Promise<ImportedPack[]> {
    const rows = this.deps.db.select().from(packImports).all();
    return rows.map(rowToImportedPack);
  }

  /**
   * Find a pack manifest by subject id. Used by the course-create-mode flow to
   * detect available packs when the student names a subject.
   */
  async findPackBySubject(subject: string): Promise<PackSummary | null> {
    const all = await this.listAvailablePacks();
    return all.find((p) => p.subject === subject) ?? null;
  }

  /**
   * Return the conceptGraphId for the latest imported version of a pack.
   * Returns null when the pack has not been imported yet.
   */
  async getConceptGraphForPack(packId: string): Promise<string | null> {
    const rows = this.deps.db
      .select()
      .from(packImports)
      .where(eq(packImports.packId, packId))
      .all();
    if (rows.length === 0) return null;

    // Return the most-recently imported version.
    // biome-ignore lint/style/noNonNullAssertion: rows.length > 0 checked above
    const latest = rows.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())[0]!;
    return latest.conceptGraphId;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async isImported(packId: string, version: string): Promise<boolean> {
    return (await this.findImportRecord(packId, version)) !== null;
  }

  private async findImportRecord(packId: string, version: string): Promise<ImportedPack | null> {
    const rows = this.deps.db
      .select()
      .from(packImports)
      .where(eq(packImports.packId, packId))
      .all();
    const match = rows.find((r) => r.version === version);
    return match ? rowToImportedPack(match) : null;
  }

  private async writeConceptEmbeddings(
    manifest: PackManifest,
    conceptGraphId: string,
  ): Promise<void> {
    const embeddingTexts = manifest.concepts.map((c) => `${c.name}: ${c.description}`);
    const embeddings = await this.deps.embeddings.embedBatch(embeddingTexts);
    const prefixedId = (manifestId: string): string => `${conceptGraphId}:${manifestId}`;

    await this.deps.conceptEmbeddings.upsertBatch(
      manifest.concepts.map((c, i) => ({
        conceptId: prefixedId(c.id),
        graphId: conceptGraphId,
        conceptName: c.name,
        // biome-ignore lint/style/noNonNullAssertion: embedBatch returns one vector per input text — index is always valid
        embedding: embeddings[i]!,
      })),
    );
  }

  private async hasCompleteConceptEmbeddings(
    manifest: PackManifest,
    conceptGraphId: string,
  ): Promise<boolean> {
    const count = await this.deps.conceptEmbeddings.countByGraphId(conceptGraphId);
    return count >= manifest.concepts.length;
  }

  /**
   * Load and validate a pack manifest from a JSON file.
   * Throws on parse error or schema validation failure.
   */
  private loadManifest(filePath: string): PackManifest {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch (err) {
      throw new Error(`failed to read pack file ${filePath}: ${String(err)}`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns any by design
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`invalid JSON in pack file ${filePath}: ${String(err)}`);
    }

    const result = PackManifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`pack manifest validation failed for ${filePath}:\n${result.error.message}`);
    }
    return result.data as PackManifest;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PackImportRow = typeof packImports.$inferSelect;

function rowToImportedPack(row: PackImportRow): ImportedPack {
  return {
    packId: row.packId,
    version: row.version,
    conceptGraphId: row.conceptGraphId as ImportedPack["conceptGraphId"],
    importedAt: row.importedAt.getTime(),
  };
}

/**
 * Resolve the default packs directory from this file's location.
 * At dev time: packages/curriculum/src/packs/ → packages/curriculum/packs/
 * At runtime: resolved from the compiled output similarly.
 */
function defaultPacksDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../packs");
}
