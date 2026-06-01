import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { courses, lessons } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { CourseCreateServiceImpl } from "@praxis/core/services";
import { brandId } from "@praxis/core/types";
import { concepts, packImports } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { ConceptEmbeddingsStore } from "../concept-embeddings.js";
import { SqliteConceptEmbeddingsStore } from "../concept-embeddings.js";
import { PackImportServiceImpl } from "../import-service.js";
import type { PackManifest } from "../types.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const noopLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLog,
};

/** Mock EmbeddingService — returns deterministic canned vectors. */
function makeEmbeddings(dim = 384) {
  return {
    dimension: dim,
    modelId: "mock-bge",
    async embed(text: string): Promise<number[]> {
      const seed = text.length % 100;
      const v = Array.from({ length: dim }, (_, i) => Math.sin(seed + i * 0.01));
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / norm);
    },
    async embedQuery(query: string): Promise<number[]> {
      return this.embed(query);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return Promise.all(texts.map((t) => this.embed(t)));
    },
  };
}

// ─── Fixture pack manifests ───────────────────────────────────────────────────

function makeAlgebra1Manifest(overrides: Partial<PackManifest> = {}): PackManifest {
  const concepts = Array.from({ length: 5 }, (_, i) => ({
    id: `test-pack.concept-${i}`,
    name: `Concept ${i}`,
    description: `Description of concept ${i} in the test pack.`,
    aliases: [],
    standardsTags: [`CCSS.Math.Content.HSA-SSE.A.${i + 1}`],
  }));
  const edges = [
    { fromId: "test-pack.concept-0", toId: "test-pack.concept-1", strength: 0.8 },
    { fromId: "test-pack.concept-1", toId: "test-pack.concept-2", strength: 0.9 },
    { fromId: "test-pack.concept-2", toId: "test-pack.concept-3", strength: 0.7 },
    { fromId: "test-pack.concept-3", toId: "test-pack.concept-4", strength: 0.6 },
  ];
  return {
    id: "test-pack",
    version: "1.0.0",
    name: "Test Pack",
    subject: "math.test",
    gradeLevel: "9-12",
    standardsRef: { body: "CCSS-Math", version: "2010" },
    authoredBy: "Test author",
    authoredAt: "2026-04-29T00:00:00.000Z",
    concepts,
    edges,
    ...overrides,
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

describe("PackImportServiceImpl", () => {
  const ctx = useTempDb();
  let packsDir = "";

  beforeEach(() => {
    packsDir = mkdtempSync(join(tmpdir(), "praxis-packs-"));
  });

  afterEach(() => {
    rmSync(packsDir, { recursive: true, force: true });
  });

  function writePackFile(manifest: PackManifest): void {
    writeFileSync(join(packsDir, `${manifest.id}.json`), JSON.stringify(manifest, null, 2));
  }

  function makeService() {
    const { db, sqlite } = openDb({ path: ctx.dbPath });
    const embeddingStore = new SqliteConceptEmbeddingsStore(sqlite, noopLog);
    return new PackImportServiceImpl({
      db,
      log: noopLog,
      embeddings: makeEmbeddings(),
      conceptEmbeddings: embeddingStore,
      packsDir,
    });
  }

  describe("listAvailablePacks", () => {
    it("returns an empty array when no pack JSONs exist", async () => {
      const svc = makeService();
      const packs = await svc.listAvailablePacks();
      expect(packs).toHaveLength(0);
    });

    it("returns summaries for valid pack JSON files", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      const packs = await svc.listAvailablePacks();

      expect(packs).toHaveLength(1);
      expect(packs[0]?.id).toBe("test-pack");
      expect(packs[0]?.conceptCount).toBe(5);
      expect(packs[0]?.edgeCount).toBe(4);
      expect(packs[0]?.imported).toBe(false);
    });

    it("marks a pack as imported after import", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      await svc.importPack("test-pack");

      const packs = await svc.listAvailablePacks();
      expect(packs[0]?.imported).toBe(true);
    });

    it("skips invalid JSON files with a warning", async () => {
      writeFileSync(join(packsDir, "bad.json"), "not valid json {{{");
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      const packs = await svc.listAvailablePacks();
      // Only the valid file returned; bad.json skipped
      expect(packs).toHaveLength(1);
      expect(packs[0]?.id).toBe("test-pack");
    });
  });

  describe("importPack", () => {
    it("creates conceptGraph + concepts + edges + pack_imports row", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      const result = await svc.importPack("test-pack");

      expect(result.packId).toBe("test-pack");
      expect(result.version).toBe("1.0.0");
      expect(typeof result.conceptGraphId).toBe("string");
      expect(result.conceptGraphId.length).toBeGreaterThan(0);
      expect(typeof result.importedAt).toBe("number");
    });

    it("is idempotent — re-importing same version returns existing record", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      const first = await svc.importPack("test-pack");
      const second = await svc.importPack("test-pack");

      expect(second.conceptGraphId).toBe(first.conceptGraphId);
      expect(second.importedAt).toBe(first.importedAt);
    });

    it("repairs embeddings when the first vector write fails after relational import", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const { db } = openDb({ path: ctx.dbPath });
      let upsertCalls = 0;
      let repairedCount = 0;
      const embeddingStore: ConceptEmbeddingsStore = {
        async upsert() {
          throw new Error("single upsert not used in pack import");
        },
        async upsertBatch(inputs) {
          upsertCalls += 1;
          if (upsertCalls === 1) {
            throw new Error("simulated vector write failure");
          }
          repairedCount = inputs.length;
        },
        async findSimilar() {
          return [];
        },
        async deleteByGraphId() {},
      };
      const svc = new PackImportServiceImpl({
        db,
        log: noopLog,
        embeddings: makeEmbeddings(),
        conceptEmbeddings: embeddingStore,
        packsDir,
      });

      await expect(svc.importPack("test-pack")).rejects.toThrow("simulated vector write failure");
      expect(db.select().from(packImports).all()).toHaveLength(1);

      const repaired = await svc.importPack("test-pack");

      expect(repaired.packId).toBe("test-pack");
      expect(upsertCalls).toBe(2);
      expect(repairedCount).toBe(manifest.concepts.length);
      expect(db.select().from(packImports).all()).toHaveLength(1);
    });

    it("creates a NEW conceptGraphId for a new version", async () => {
      const v1 = makeAlgebra1Manifest({ version: "1.0.0" });
      const v2 = makeAlgebra1Manifest({ version: "2.0.0" });
      writeFileSync(join(packsDir, "test-pack.json"), JSON.stringify(v2, null, 2));

      const svc = makeService();

      // Write v1, import it
      writeFileSync(join(packsDir, "test-pack.json"), JSON.stringify(v1, null, 2));
      const r1 = await svc.importPack("test-pack");

      // Switch to v2, import again — should create new graph
      writeFileSync(join(packsDir, "test-pack.json"), JSON.stringify(v2, null, 2));
      const r2 = await svc.importPack("test-pack");

      expect(r2.conceptGraphId).not.toBe(r1.conceptGraphId);
    });

    it("throws when pack file does not exist", async () => {
      const svc = makeService();
      await expect(svc.importPack("nonexistent")).rejects.toThrow(/failed to read pack file/);
    });

    it("throws when pack fails schema validation", async () => {
      writeFileSync(
        join(packsDir, "bad-pack.json"),
        JSON.stringify({ id: "bad-pack", version: "not-semver" }),
      );
      const svc = makeService();
      await expect(svc.importPack("bad-pack")).rejects.toThrow(/validation failed/);
    });
  });

  describe("listImportedPacks", () => {
    it("returns empty array when nothing imported", async () => {
      const svc = makeService();
      const packs = await svc.listImportedPacks();
      expect(packs).toHaveLength(0);
    });

    it("returns records after import", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      await svc.importPack("test-pack");

      const imported = await svc.listImportedPacks();
      expect(imported).toHaveLength(1);
      expect(imported[0]?.packId).toBe("test-pack");
      expect(imported[0]?.version).toBe("1.0.0");
    });
  });

  describe("findPackBySubject", () => {
    it("returns the matching pack summary", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      const found = await svc.findPackBySubject("math.test");
      expect(found?.id).toBe("test-pack");
    });

    it("returns null for an unknown subject", async () => {
      const svc = makeService();
      const found = await svc.findPackBySubject("biology.unknown");
      expect(found).toBeNull();
    });
  });

  describe("getConceptGraphForPack", () => {
    it("returns null when not imported", async () => {
      const svc = makeService();
      const graphId = await svc.getConceptGraphForPack("test-pack");
      expect(graphId).toBeNull();
    });

    it("returns the conceptGraphId after import", async () => {
      const manifest = makeAlgebra1Manifest();
      writePackFile(manifest);

      const svc = makeService();
      const { conceptGraphId } = await svc.importPack("test-pack");
      const graphId = await svc.getConceptGraphForPack("test-pack");

      expect(graphId).toBe(conceptGraphId);
    });
  });

  describe("biology pack smoke test", () => {
    // Points at the real packs/ directory so this exercises the actual pack
    // file shipped with the repo, not a fixture.
    function makeServiceForRealPacks() {
      const { db, sqlite } = openDb({ path: ctx.dbPath });
      const embeddingStore = new SqliteConceptEmbeddingsStore(sqlite, noopLog);
      // Path: __tests__/ → packs/ → src/ → curriculum/ → packs/
      const realPacksDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packs");
      return new PackImportServiceImpl({
        db,
        log: noopLog,
        embeddings: makeEmbeddings(),
        conceptEmbeddings: embeddingStore,
        packsDir: realPacksDir,
      });
    }

    it("imports the real biology.json end-to-end", async () => {
      const svc = makeServiceForRealPacks();
      const result = await svc.importPack("biology");

      expect(result.packId).toBe("biology");
      expect(result.version).toBe("1.0.0");
      expect(typeof result.conceptGraphId).toBe("string");
      expect(result.conceptGraphId.length).toBeGreaterThan(0);
    });

    it("listAvailablePacks reports biology with realistic counts", async () => {
      const svc = makeServiceForRealPacks();
      const packs = await svc.listAvailablePacks();
      const bio = packs.find((p) => p.id === "biology");
      expect(bio, "biology pack must be discoverable in packs/").toBeDefined();
      if (bio) {
        expect(bio.conceptCount).toBeGreaterThanOrEqual(90);
        expect(bio.conceptCount).toBeLessThanOrEqual(120);
        expect(bio.edgeCount).toBeGreaterThanOrEqual(100);
      }
    });

    it("re-importing biology is idempotent", async () => {
      const svc = makeServiceForRealPacks();
      const first = await svc.importPack("biology");
      const second = await svc.importPack("biology");
      expect(second.conceptGraphId).toBe(first.conceptGraphId);
      expect(second.importedAt).toBe(first.importedAt);
    });

    it("anchor concept ids exist in concepts table after import", async () => {
      const svc = makeServiceForRealPacks();
      const { conceptGraphId } = await svc.importPack("biology");

      const { db } = openDb({ path: ctx.dbPath });
      const rows = db
        .select({ id: concepts.id })
        .from(concepts)
        .where(eq(concepts.graphId, conceptGraphId))
        .all();

      // Import prefixes concept ids: "<conceptGraphId>:<manifest-concept-id>"
      const ids = new Set(rows.map((r) => r.id));
      const anchor = (slug: string) => `${conceptGraphId}:${slug}`;
      expect(ids.has(anchor("biology.cell-theory")), "biology.cell-theory must be present").toBe(
        true,
      );
      expect(
        ids.has(anchor("biology.photosynthesis")),
        "biology.photosynthesis must be present",
      ).toBe(true);
      expect(
        ids.has(anchor("biology.natural-selection")),
        "biology.natural-selection must be present",
      ).toBe(true);
      // All 106 biology concepts must be in the graph.
      expect(ids.size).toBe(106);
    });

    it("createCourseFromPack produces a course with correctly-ordered lessons", async () => {
      const MOCK_DOCUMENT_SCOPES = {
        listForScope: async () => [],
        listForScopeDetailed: async () => [],
        attach: async () => ({ attached: true }),
        detach: async () => ({ detached: true }),
        attachMany: async () => ({ newlyAttached: [] }),
        listScopesForDocument: async () => [],
        promoteScope: async () => ({ promoted: [] }),
        listOrphaned: async () => [],
      };

      const svc = makeServiceForRealPacks();
      const { conceptGraphId } = await svc.importPack("biology");

      const { db } = openDb({ path: ctx.dbPath });
      const bootstrap = new CourseCreateServiceImpl({
        db,
        log: noopLog,
        engineResolver: () => {
          throw new Error("engine not used in createCourseFromPack");
        },
        documentScopes: MOCK_DOCUMENT_SCOPES,
        sweepIntervalMs: 9_999_999,
      });

      try {
        const { courseId, conceptCount } = await bootstrap.createCourseFromPack({
          studentId: brandId<"StudentId">("student-bio-test"),
          packId: "biology",
          conceptGraphId: brandId<"ConceptGraphId">(conceptGraphId),
          courseTitle: "Biology",
          gradeLevel: "9-12",
        });

        // Course row must exist.
        const courseRows = db.select().from(courses).where(eq(courses.id, courseId)).all();
        expect(courseRows).toHaveLength(1);
        expect(courseRows[0]?.title).toBe("Biology");

        // Concept count must match the full pack size.
        expect(conceptCount).toBe(106);

        // Lessons: ceil(106 / 7) = 16 lessons.
        const lessonRows = db.select().from(lessons).where(eq(lessons.courseId, courseId)).all();
        // Sort by orderIndex to verify ordering.
        const ordered = [...lessonRows].sort((a, b) => a.orderIndex - b.orderIndex);
        expect(ordered.length).toBe(16);

        // Each lesson's orderIndex must be sequential (0..15).
        for (let i = 0; i < ordered.length; i++) {
          expect(ordered[i]?.orderIndex, `lesson ${i} orderIndex`).toBe(i);
        }

        // Import prefixes concept ids: "<conceptGraphId>:<manifest-concept-id>"
        // Concepts are returned in DB order (alphabetical by prefixed id).
        // Alphabetically-first biology concept: biology.abiotic-factors (lesson 0)
        // Alphabetically-last biology concept: biology.water-cycle (lesson 15)
        const prefixedId = (slug: string) => `${conceptGraphId}:${slug}`;
        const firstLesson = ordered[0];
        expect(
          firstLesson?.conceptIdsJson,
          "first lesson must contain biology.abiotic-factors (alphabetically first)",
        ).toContain(prefixedId("biology.abiotic-factors"));

        // The last lesson covers the tail group; biology.water-cycle is the
        // alphabetically-last concept and belongs in lesson 15.
        const lastLesson = ordered[15];
        expect(
          lastLesson?.conceptIdsJson,
          "last lesson must contain biology.water-cycle (alphabetically last)",
        ).toContain(prefixedId("biology.water-cycle"));
      } finally {
        bootstrap.shutdown();
      }
    });
  });
});
