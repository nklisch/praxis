/**
 * End-to-end integration test for Phase 10 pack import flow.
 *
 * Verifies:
 *  1. importPack() persists concept_graphs, concepts, prerequisite_edges, pack_imports rows.
 *  2. concept ids in the DB are prefixed with conceptGraphId.
 *  3. Re-importing the same version is idempotent (no duplicate rows).
 *  4. createCourseFromPack() creates a course + lessons + gates pointing at the conceptGraphId.
 *  5. course.current_concept returns the first concept with reason "next-in-order" for a
 *     freshly created course (student has not studied anything yet).
 *
 * Uses a real DB (useTempDb) + mocked EmbeddingService (returns canned zeros).
 * No LLM calls; the pack JSON is read from packages/curriculum/packs/algebra-1.json.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { courses, gates, lessons } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { configKv } from "@praxis/core/schema";
import {
  ArtifactsServiceImpl,
  BootstrapServiceImpl,
  MemoryServiceImpl,
} from "@praxis/core/services";
import type {
  CodeSandbox,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  SymPyService,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { PackImportServiceImpl, SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";
import { conceptGraphs, concepts, packImports, prerequisiteEdges } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { noopLogger } from "./helpers/mocks.js";

// ── Fake Engine (no LLM calls) ─────────────────────────────────────────────────

class FakeSession implements EngineSession {
  readonly id = "fake-pack-session";

  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: "Let's study Real Numbers!", partial: false };
    yield { type: "final", usage: { inputTokens: 5, outputTokens: 10 } };
  }

  async close(): Promise<void> {}
}

class FakeEngine implements Engine {
  readonly id = "direct.anthropic";
  readonly kind = "single-shot" as const;

  async open(_opts: EngineOpenOptions): Promise<EngineSession> {
    return new FakeSession();
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    };
  }
}

// ── Logger stub ────────────────────────────────────────────────────────────────

// ── Mock services ──────────────────────────────────────────────────────────────

const mockSympy: SymPyService = {
  checkSolution: vi.fn(),
  solveEquation: vi.fn(),
  simplify: vi.fn(),
  checkEquivalent: vi.fn(),
  parseLatex: vi.fn(),
};
const mockSandbox: CodeSandbox = { availableLanguages: ["javascript", "python"], run: vi.fn() };
const mockVectorStore = {
  upsert: vi.fn(),
  upsertBatch: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  deleteByDocumentId: vi.fn(),
};
const mockFtsStore = {
  upsert: vi.fn(),
  upsertBatch: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  deleteByDocumentId: vi.fn(),
};
/** Canned embedding service — always returns zeros (384-dim). */
const mockEmbeddings = {
  embed: vi.fn().mockResolvedValue(new Array(384).fill(0)),
  embedQuery: vi.fn().mockResolvedValue(new Array(384).fill(0)),
  embedBatch: vi
    .fn()
    .mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => new Array(384).fill(0))),
    ),
  dimension: 384,
  modelId: "test",
};
const mockDocuments = {
  titlesByIds: vi.fn().mockResolvedValue(new Map()),
  pageImage: vi.fn().mockResolvedValue(null),
};

// ── Constants ──────────────────────────────────────────────────────────────────

const PACK_ID = "algebra-1";
const STUDENT_ID = brandId<"StudentId">("student-pack-e2e");

const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../packages/curriculum/packs");

// ── DB setup ───────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

beforeEach(() => {
  process.env.PRAXIS_ENGINE = "direct.anthropic";
  // Reset call counts so per-test assertions are isolated.
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.PRAXIS_ENGINE;
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("pack-import end-to-end", () => {
  it("importPack persists concept_graphs, concepts, prerequisite_edges, pack_imports", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const conceptEmbeddings = new SqliteConceptEmbeddingsStore(
      // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 handle exposed via PraxisDb
      (db as any).$client,
      noopLogger(),
    );

    const importService = new PackImportServiceImpl({
      db,
      log: noopLogger(),
      embeddings: mockEmbeddings,
      conceptEmbeddings,
      packsDir: PACKS_DIR,
    });

    const imported = await importService.importPack(PACK_ID);

    expect(imported.packId).toBe(PACK_ID);
    expect(imported.version).toBe("1.0.0");
    expect(imported.conceptGraphId).toBeTruthy();

    // concept_graphs row persisted
    const graphRows = db.select().from(conceptGraphs).all();
    expect(graphRows).toHaveLength(1);
    expect(graphRows[0]?.id).toBe(imported.conceptGraphId);
    expect(graphRows[0]?.source).toBe("canonical");

    // concepts rows persisted — algebra-1 has 33 concepts
    const conceptRows = db.select().from(concepts).all();
    expect(conceptRows.length).toBe(33);

    // concept ids are prefixed with conceptGraphId
    const firstConcept = conceptRows[0];
    expect(firstConcept?.id).toMatch(new RegExp(`^${imported.conceptGraphId}:`));

    // prerequisite_edges persisted
    const edgeRows = db.select().from(prerequisiteEdges).all();
    expect(edgeRows.length).toBeGreaterThan(0);

    // pack_imports row persisted
    const importRows = db.select().from(packImports).all();
    expect(importRows).toHaveLength(1);
    expect(importRows[0]?.packId).toBe(PACK_ID);
    expect(importRows[0]?.conceptGraphId).toBe(imported.conceptGraphId);
  });

  it("re-importing the same version is idempotent — no duplicate rows", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const conceptEmbeddings = new SqliteConceptEmbeddingsStore(
      // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 handle
      (db as any).$client,
      noopLogger(),
    );

    const importService = new PackImportServiceImpl({
      db,
      log: noopLogger(),
      embeddings: mockEmbeddings,
      conceptEmbeddings,
      packsDir: PACKS_DIR,
    });

    const first = await importService.importPack(PACK_ID);
    const second = await importService.importPack(PACK_ID);

    // Same conceptGraphId returned both times
    expect(second.conceptGraphId).toBe(first.conceptGraphId);

    // No duplicates in any table
    expect(db.select().from(conceptGraphs).all()).toHaveLength(1);
    expect(db.select().from(packImports).all()).toHaveLength(1);
    expect(db.select().from(concepts).all()).toHaveLength(33);

    // embedBatch should only be called once (first import), not second
    expect(mockEmbeddings.embedBatch).toHaveBeenCalledTimes(1);
  });

  it("createCourseFromPack creates course + lessons + gates for the imported pack", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    // Seed the default student id
    db.insert(configKv)
      .values({ key: "default_student_id", valueJson: STUDENT_ID, updatedAt: new Date() })
      .run();

    const conceptEmbeddings = new SqliteConceptEmbeddingsStore(
      // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 handle
      (db as any).$client,
      noopLogger(),
    );

    const importService = new PackImportServiceImpl({
      db,
      log: noopLogger(),
      embeddings: mockEmbeddings,
      conceptEmbeddings,
      packsDir: PACKS_DIR,
    });

    const imported = await importService.importPack(PACK_ID);

    const bootstrapService = new BootstrapServiceImpl({
      db,
      log: noopLogger(),
      engineResolver: () => new FakeEngine(),
    });

    const { courseId, conceptCount } = await bootstrapService.createCourseFromPack({
      studentId: STUDENT_ID,
      packId: PACK_ID,
      conceptGraphId: imported.conceptGraphId as import("@praxis/core/types").ConceptGraphId,
      courseTitle: "Algebra 1 (Canonical Pack)",
      gradeLevel: "9-12",
    });

    expect(conceptCount).toBe(33);

    // Course row exists
    const courseRows = db.select().from(courses).where(eq(courses.id, courseId)).all();
    expect(courseRows).toHaveLength(1);
    expect(courseRows[0]?.conceptGraphId).toBe(imported.conceptGraphId);
    expect(courseRows[0]?.studentId).toBe(STUDENT_ID);

    // Lessons created — 33 concepts / 7 per lesson = 5 lessons (ceil)
    const lessonRows = db.select().from(lessons).where(eq(lessons.courseId, courseId)).all();
    expect(lessonRows.length).toBeGreaterThan(0);
    expect(lessonRows.length).toBeLessThanOrEqual(6); // ceil(33/7) = 5

    // All lesson conceptIds are prefixed with conceptGraphId
    for (const lesson of lessonRows) {
      const cIds = lesson.conceptIdsJson as string[];
      for (const cId of cIds) {
        expect(cId).toMatch(new RegExp(`^${imported.conceptGraphId}:`));
      }
    }

    // Gates created — one per lesson
    const gateRows = db.select().from(gates).where(eq(gates.courseId, courseId)).all();
    expect(gateRows.length).toBe(lessonRows.length);
  });

  it("course.current_concept returns first concept with reason next-in-order", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    db.insert(configKv)
      .values({ key: "default_student_id", valueJson: STUDENT_ID, updatedAt: new Date() })
      .run();

    const conceptEmbeddings = new SqliteConceptEmbeddingsStore(
      // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 handle
      (db as any).$client,
      noopLogger(),
    );

    const importService = new PackImportServiceImpl({
      db,
      log: noopLogger(),
      embeddings: mockEmbeddings,
      conceptEmbeddings,
      packsDir: PACKS_DIR,
    });

    const imported = await importService.importPack(PACK_ID);

    const bootstrapService = new BootstrapServiceImpl({
      db,
      log: noopLogger(),
      engineResolver: () => new FakeEngine(),
    });

    const { courseId } = await bootstrapService.createCourseFromPack({
      studentId: STUDENT_ID,
      packId: PACK_ID,
      conceptGraphId: imported.conceptGraphId as import("@praxis/core/types").ConceptGraphId,
      courseTitle: "Algebra 1",
      gradeLevel: "9-12",
    });

    const memoryService = new MemoryServiceImpl({
      db,
      log: noopLogger(),
      decayDaysFor: () => 14,
    });

    const artifactsService = new ArtifactsServiceImpl({
      db,
      log: noopLogger(),
      masteryReader: memoryService,
      gradeReader: { readGrade: vi.fn().mockResolvedValue(null) },
    });

    const { currentConceptTool } = await import("@praxis/tools/course");

    // Build ToolContext for the handler
    const toolCtx = {
      studentId: STUDENT_ID,
      courseId: brandId<"CourseId">(courseId),
      services: {
        courseState: artifactsService,
        memory: memoryService,
        sympy: mockSympy,
        sandbox: mockSandbox,
        vectorStore: mockVectorStore,
        ftsStore: mockFtsStore,
        embeddings: mockEmbeddings,
        documents: mockDocuments,
        artifacts: artifactsService,
        bootstrap: bootstrapService,
        // biome-ignore lint/suspicious/noExplicitAny: test-only partial ToolContext
        assignments: {} as any,
        // biome-ignore lint/suspicious/noExplicitAny: test-only partial ToolContext
        packs: {} as any,
      },
    };

    // biome-ignore lint/suspicious/noExplicitAny: handler accepts ToolContext shape
    const result = await currentConceptTool.handler({ courseId }, toolCtx as any);

    // First call should return the first un-studied concept (next-in-order)
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.reason).toBe("next-in-order");
      // Concept id should be prefixed with the conceptGraphId
      expect(result.conceptId).toMatch(new RegExp(`^${imported.conceptGraphId}:`));
      // Name should be a real concept name (not a UUID or prefixed id)
      expect(result.name).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);
      expect(result.name.length).toBeGreaterThan(3);
      expect(result.masteryNow).toBe(0); // no mastery yet
      expect(result.reviews).toHaveLength(0);
      expect(result.interleaves).toHaveLength(0);
    }
  });
});
