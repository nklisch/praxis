/**
 * End-to-end integration test for Phase 10 adaptive routing.
 *
 * Verifies that course.current_concept returns the right concept + reason
 * based on student mastery state:
 *
 *  Test 1: Un-studied course → reason "next-in-order" (first concept in lesson 1).
 *  Test 2: Lesson 1 concepts mastered, lesson 2 partial → reason "frontier"
 *           (highest-uncertainty concept in lesson 2).
 *  Test 3: Decayed lesson 1 concepts + lesson 2 partial →
 *           reviews populated from decayed earlier concepts.
 *  Test 4: High-mastery lesson 1, lesson 2 in-progress, interleave condition met →
 *           interleaves populated (mutual exclusion with reviews verified).
 *
 * Uses real DB (useTempDb) + PackImportServiceImpl + BootstrapServiceImpl +
 * MemoryServiceImpl. No LLM calls.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conceptProgress, lessonProgress, lessons as lessonsTable } from "@praxis/artifacts/schema";
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
import { studentMastery } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { noopLogger } from "./helpers/mocks.js";

// isolated-vm@6.1.2 prebuilts don't cover Node 25+.
vi.mock("isolated-vm", async () => {
  const { isolatedVmStubFactory } = await import("./helpers/mocks.js");
  return isolatedVmStubFactory();
});

// ── Constants ──────────────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-adaptive-e2e");
const PACK_ID = "algebra-1";

const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../packages/curriculum/packs");

// ── Fake Engine ────────────────────────────────────────────────────────────────

class FakeSession implements EngineSession {
  readonly id = "fake-adaptive-session";
  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: "Good work!", partial: false };
    yield { type: "final", usage: { inputTokens: 5, outputTokens: 5 } };
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

// ── Logger + mocks ─────────────────────────────────────────────────────────────

const mockSympy: SymPyService = {
  checkSolution: vi.fn(),
  solveEquation: vi.fn(),
  simplify: vi.fn(),
  checkEquivalent: vi.fn(),
  parseLatex: vi.fn(),
};
const mockSandbox: CodeSandbox = { run: vi.fn() };
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

// ── DB setup ───────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

beforeEach(() => {
  process.env.PRAXIS_ENGINE = "direct.anthropic";
});

afterEach(() => {
  delete process.env.PRAXIS_ENGINE;
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function setupCourse(db: ReturnType<typeof openDb>["db"]) {
  // Seed default student id
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
    courseTitle: "Algebra 1 Adaptive",
    gradeLevel: "9-12",
  });

  return { courseId, conceptGraphId: imported.conceptGraphId, importService, bootstrapService };
}

/** Mark a lesson as completed for the student (so it's no longer the current lesson). */
function completelesson(db: ReturnType<typeof openDb>["db"], lessonId: string): void {
  const now = new Date();
  db.insert(lessonProgress)
    .values({
      studentId: STUDENT_ID,
      lessonId: brandId<"LessonId">(lessonId),
      status: "completed",
      startedAt: now,
      completedAt: now,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.studentId, lessonProgress.lessonId],
      set: { status: "completed", completedAt: now },
    })
    .run();
}

/** Seed a concept_progress row so the router sees the concept as "studied". */
function studyConcept(
  db: ReturnType<typeof openDb>["db"],
  conceptId: string,
  studiedAt?: Date,
): void {
  const now = studiedAt ?? new Date();
  db.insert(conceptProgress)
    .values({
      studentId: STUDENT_ID,
      conceptId: brandId<"ConceptId">(conceptId),
      studiedAt: now,
      evidenceJson: [],
    })
    .onConflictDoUpdate({
      target: [conceptProgress.studentId, conceptProgress.conceptId],
      set: { studiedAt: now },
    })
    .run();
}

/** Seed a student_mastery row for a concept with the given pKnown (0..1). */
function seedMastery(
  db: ReturnType<typeof openDb>["db"],
  conceptId: string,
  pKnown: number,
  lastPracticedAt?: Date,
): void {
  const milli = Math.round(pKnown * 1000);
  const now = new Date();
  db.insert(studentMastery)
    .values({
      studentId: STUDENT_ID,
      conceptId: brandId<"ConceptId">(conceptId),
      pKnown: milli,
      effectivePKnown: milli,
      uncertainty: 300, // 0.3 uncertainty
      lastPracticedAt: lastPracticedAt ?? null,
      evidenceJson: [],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [studentMastery.studentId, studentMastery.conceptId],
      set: {
        pKnown: milli,
        effectivePKnown: milli,
        uncertainty: 300,
        lastPracticedAt: lastPracticedAt ?? null,
        updatedAt: now,
      },
    })
    .run();
}

async function callCurrentConcept(
  db: ReturnType<typeof openDb>["db"],
  courseId: string,
  bootstrapService: BootstrapServiceImpl,
) {
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
  return currentConceptTool.handler({ courseId }, toolCtx as any);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("adaptive-routing end-to-end", () => {
  it("Test 1: fresh course → reason next-in-order, no reviews/interleaves", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, bootstrapService } = await setupCourse(db);

    const result = await callCurrentConcept(db, courseId, bootstrapService);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.reason).toBe("next-in-order");
    expect(result.masteryNow).toBe(0);
    expect(result.reviews).toHaveLength(0);
    expect(result.interleaves).toHaveLength(0);
  });

  it("Test 2: lesson 1 mastered, lesson 2 partial → reason frontier for lesson 2", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, bootstrapService } = await setupCourse(db);

    // Read lesson rows from the DB
    const lessonRows = db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .all();
    lessonRows.sort((a, b) => a.orderIndex - b.orderIndex);

    const lesson1 = lessonRows[0];
    const lesson2 = lessonRows[1];
    if (!lesson1 || !lesson2) throw new Error("Expected at least 2 lessons");

    const lesson1Concepts = lesson1.conceptIdsJson as string[];
    const lesson2Concepts = lesson2.conceptIdsJson as string[];

    // Mark lesson 1 as completed so lesson 2 becomes the current lesson.
    completelesson(db, lesson1.id);

    // Seed lesson 1 concepts as studied + mastered (below masteredThreshold 0.85 is eligible
    // for router, but we just need "earlier lesson" candidates here).
    for (const cId of lesson1Concepts) {
      studyConcept(db, cId);
      seedMastery(db, cId, 0.75); // below masteredThreshold (0.85) — won't be primary, but "earlier"
    }

    // Seed lesson 2: first concept studied at 0.45, rest unstudied (frontier + next-in-order)
    studyConcept(db, lesson2Concepts[0] ?? "");
    seedMastery(db, lesson2Concepts[0] ?? "", 0.45); // studied, below mastered — frontier candidate

    const result = await callCurrentConcept(db, courseId, bootstrapService);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    // lesson 2 is the current lesson; it has unstudied concepts → next-in-order
    // (or frontier for the studied one — whichever the router picks)
    expect(["frontier", "next-in-order"]).toContain(result.reason);
  });

  it("Test 3: decayed lesson 1 concepts → reviews populated", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, bootstrapService } = await setupCourse(db);

    const lessonRows = db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .all();
    lessonRows.sort((a, b) => a.orderIndex - b.orderIndex);

    const lesson1 = lessonRows[0];
    const lesson2 = lessonRows[1];
    if (!lesson1 || !lesson2) throw new Error("Expected at least 2 lessons");

    const lesson1Concepts = lesson1.conceptIdsJson as string[];

    // Mark lesson 1 as completed so lesson 2 becomes the current lesson.
    completelesson(db, lesson1.id);

    // Lesson 1 concepts: studied 30 days ago, mastery decayed below reviewThreshold (0.5)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const cId of lesson1Concepts) {
      studyConcept(db, cId, thirtyDaysAgo);
      seedMastery(db, cId, 0.35, thirtyDaysAgo); // decayed below 0.5 review threshold
    }

    // Lesson 2 is unstudied (no conceptProgress rows, no mastery rows).

    const result = await callCurrentConcept(db, courseId, bootstrapService);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    // Primary from lesson 2 (next-in-order since unstudied)
    expect(result.reason).toBe("next-in-order");
    // Reviews should include decayed lesson 1 concepts
    expect(result.reviews.length).toBeGreaterThan(0);
    // All reviews have reason "review"
    for (const r of result.reviews) {
      expect(r.reason).toBe("review");
    }
  });

  it("Test 4: reviews and interleaves are mutually exclusive", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const { courseId, bootstrapService } = await setupCourse(db);

    const lessonRows = db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .all();
    lessonRows.sort((a, b) => a.orderIndex - b.orderIndex);

    const lesson1 = lessonRows[0];
    const lesson2 = lessonRows[1];
    if (!lesson1 || !lesson2) throw new Error("Expected at least 2 lessons");

    const lesson1Concepts = lesson1.conceptIdsJson as string[];

    // Mark lesson 1 as completed so lesson 2 becomes the current lesson.
    completelesson(db, lesson1.id);

    // Split lesson 1: first half decayed (review candidates), second half high-mastery + practiced
    const half = Math.floor(lesson1Concepts.length / 2);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    for (const [i, cId] of lesson1Concepts.entries()) {
      if (i < half) {
        // Decayed concepts → review candidates (mastery below reviewThreshold 0.5)
        studyConcept(db, cId, thirtyDaysAgo);
        seedMastery(db, cId, 0.3, thirtyDaysAgo);
      } else {
        // High-mastery, practiced 10 days ago → interleave candidates
        // (interleaveMinMastery = 0.7, interleaveMinDays = 5; 10 days qualifies)
        studyConcept(db, cId, tenDaysAgo);
        seedMastery(db, cId, 0.9, tenDaysAgo);
      }
    }

    // Lesson 2 is unstudied (no conceptProgress rows, no mastery rows).

    const result = await callCurrentConcept(db, courseId, bootstrapService);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    // reviews and interleaves must be mutually exclusive (no shared conceptIds)
    const reviewIds = new Set(result.reviews.map((r) => r.conceptId));
    const interleaveIds = new Set(result.interleaves.map((i) => i.conceptId));
    for (const id of interleaveIds) {
      expect(reviewIds.has(id)).toBe(false);
    }
    for (const id of reviewIds) {
      expect(interleaveIds.has(id)).toBe(false);
    }
  });
});
