import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@praxis/core/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
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
});
