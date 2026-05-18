import type { ConceptGraphId } from "./ids.js";

// ─── Phase 10: PackImportService (port) ──────────────────────────────────────

/** Compact summary of a pack manifest (id, name, subject, concept count, etc.). */
export interface PackSummaryView {
  id: string;
  version: string;
  name: string;
  subject: string;
  gradeLevel: string;
  conceptCount: number;
  edgeCount: number;
  imported: boolean;
}

/** Record of a successfully imported pack. */
export interface ImportedPackView {
  packId: string;
  version: string;
  conceptGraphId: ConceptGraphId;
  importedAt: number;
}

/**
 * Port for pack import + listing operations.
 * Implemented by PackImportServiceImpl in @praxis/curriculum.
 * Exposed to tools via ToolServices.packs.
 */
export interface PackImportService {
  /** List all pack JSON files available in the packs directory. */
  listAvailablePacks(): Promise<PackSummaryView[]>;
  /**
   * Import a pack by its id. Idempotent — re-importing the same version returns
   * the existing record without re-writing DB rows or embeddings.
   */
  importPack(packId: string): Promise<ImportedPackView>;
  /** Return all imported packs (all versions, all subjects). */
  listImportedPacks(): Promise<ImportedPackView[]>;
  /** Find a pack manifest by subject id. */
  findPackBySubject(subject: string): Promise<PackSummaryView | null>;
  /** Return the conceptGraphId for the latest imported version of a pack. */
  getConceptGraphForPack(packId: string): Promise<string | null>;
}
