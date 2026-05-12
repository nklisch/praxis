/**
 * End-to-end integration test for Phase 9 gates + progress map.
 *
 * Verifies the full flow:
 *  1. Gate starts locked. mastery below threshold → still locked after session.end().
 *  2. Mastery raised above threshold → session.end() unlocks the gate, writes event row.
 *  3. newlyUnlockedCount reflects the unviewed event, then drops to 0 after markGatesViewed.
 *  4. session.end() is non-fatal when evaluateAndPersistGates is not available
 *     (backward compat: no courseId on session).
 *
 * Uses a real DB (useTempDb) + FakeEngine (no LLM calls).
 * Seeds the gates table directly since no bootstrap flow is required.
 */

import { courses, gates as gatesTable, lessons } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { configKv } from "@praxis/core/schema";
import { ArtifactsServiceImpl, MemoryServiceImpl, SessionServiceImpl } from "@praxis/core/services";
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
import { teachMode } from "@praxis/curriculum/modes";
import { conceptGraphs, concepts } from "@praxis/curriculum/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { inMemorySecretStorage, noopLockService, noopLogger } from "./helpers/mocks.js";

// ── FakeEngine ─────────────────────────────────────────────────────────────────

class FakeSession implements EngineSession {
  readonly id = "fake-gates-session";

  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: "Great work!", partial: false };
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

// ── Constants ──────────────────────────────────────────────────────────────────

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
const mockEmbeddings = {
  embed: vi.fn().mockResolvedValue([]),
  embedQuery: vi.fn().mockResolvedValue([]),
  embedBatch: vi.fn().mockResolvedValue([]),
  dimension: 384,
  modelId: "test",
};
const mockDocuments = {
  titlesByIds: vi.fn().mockResolvedValue(new Map()),
  pageImage: vi.fn().mockResolvedValue(null),
};

// ── DB / service setup ─────────────────────────────────────────────────────────

const dbCtx = useTempDb();

const STUDENT_ID = brandId<"StudentId">("student-gates-e2e");
const COURSE_ID = brandId<"CourseId">("course-gates-e2e");
const LESSON_ID = brandId<"LessonId">("lesson-gates-e2e");
const CONCEPT_ID = brandId<"ConceptId">("concept-gates-e2e");
const GATE_ID = brandId<"GateId">("gate-gates-e2e");

beforeEach(() => {
  process.env.PRAXIS_ENGINE = "direct.anthropic";
});

afterEach(() => {
  delete process.env.PRAXIS_ENGINE;
});

/** Seed the minimum rows: concept_graph, course, lesson, gate. Also pre-seeds the
 * default_student_id config key so that getOrCreateDefaultStudentId() returns STUDENT_ID. */
function seedCourseWithGate(db: ReturnType<typeof openDb>["db"], mastery: number = 0.3) {
  // Pre-seed default student ID so SessionService uses STUDENT_ID.
  db.insert(configKv)
    .values({ key: "default_student_id", valueJson: STUDENT_ID, updatedAt: new Date() })
    .run();

  const graphId = "graph-gates-e2e";
  db.insert(conceptGraphs)
    .values({
      id: graphId,
      source: "extracted",
      name: "E2E Graph",
      version: "1",
      createdAt: new Date(),
    })
    .run();
  db.insert(concepts)
    .values({
      id: CONCEPT_ID,
      graphId,
      name: "Fractions",
      description: "Basic fraction concepts",
      aliasesJson: [],
      standardsTagsJson: [],
    })
    .run();
  db.insert(courses)
    .values({
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Math E2E",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "bootstrapped", sourceMaterials: [] },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  db.insert(lessons)
    .values({
      id: LESSON_ID,
      courseId: COURSE_ID,
      title: "Lesson 1",
      orderIndex: 0,
      conceptIdsJson: [CONCEPT_ID],
      referencesJson: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 30,
    })
    .run();
  db.insert(gatesTable)
    .values({
      id: GATE_ID,
      courseId: COURSE_ID,
      guardsJson: { kind: "lesson", lessonId: LESSON_ID },
      prerequisitesJson: [],
      successCriteriaJson: { kind: "mastery-threshold", conceptIds: [CONCEPT_ID], minScore: 0.7 },
      stateJson: { kind: "locked", missingPrerequisites: [] },
      evidenceJson: [],
    })
    .run();
  return mastery;
}

function buildServices(db: ReturnType<typeof openDb>["db"], masteryScore: number) {
  const memoryService = new MemoryServiceImpl({
    db,
    log: noopLogger(),
    decayDaysFor: () => 14,
  });

  const artifactsService = new ArtifactsServiceImpl({
    db,
    log: noopLogger(),
    masteryReader: {
      // Stub: returns the seeded mastery score for the one concept we care about.
      read: vi.fn().mockResolvedValue(masteryScore),
    },
    gradeReader: { readGrade: vi.fn().mockResolvedValue(null) },
  });

  const sessionService = new SessionServiceImpl({
    db,
    log: noopLogger(),
    modes: new Map([[teachMode.id, teachMode]]),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: test stub — partial service deps
    toolServices: {
      sympy: mockSympy,
      sandbox: mockSandbox,
      vectorStore: mockVectorStore,
      ftsStore: mockFtsStore,
      embeddings: mockEmbeddings,
      documents: mockDocuments,
      artifacts: artifactsService,
      bootstrap: null,
      courseState: artifactsService,
      memory: memoryService,
      // Phase 16: minimal stub for course-scoped session bootstrapping.
      courseDocuments: { listForCourse: vi.fn().mockResolvedValue([]) },
    } as any,
    engineFactory: () => new FakeEngine(),
    lockService: noopLockService(),
    secretStorage: inMemorySecretStorage(),
  });

  return { memoryService, artifactsService, sessionService };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("gates end-to-end", () => {
  it("gate remains locked when mastery is below threshold after session.end()", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourseWithGate(db, 0.3); // 0.3 < 0.7 threshold → no unlock

    const { sessionService, artifactsService } = buildServices(db, 0.3);

    const handle = await sessionService.start({
      modeId: "teach",
      courseId: COURSE_ID,
    });

    for await (const _ of sessionService.send(handle.sessionId, "hello")) {
      /* drain */
    }

    const summary = await sessionService.end(handle.sessionId);
    expect(summary.unlockedGates).toHaveLength(0);

    // Gate should still be locked.
    const gateRow = db.select().from(gatesTable).all().at(0);
    expect((gateRow?.stateJson as { kind: string } | undefined)?.kind).toBe("locked");

    // No unlock events written.
    const count = await artifactsService.newlyUnlockedCount({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    });
    expect(count).toBe(0);
  });

  it("gate unlocks when mastery exceeds threshold; unlock event is written", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourseWithGate(db, 0.9); // 0.9 >= 0.7 threshold → unlock

    const { sessionService, artifactsService } = buildServices(db, 0.9);

    const handle = await sessionService.start({
      modeId: "teach",
      courseId: COURSE_ID,
    });

    for await (const _ of sessionService.send(handle.sessionId, "hello")) {
      /* drain */
    }

    const summary = await sessionService.end(handle.sessionId);
    expect(summary.unlockedGates).toHaveLength(1);
    expect(summary.unlockedGates[0]).toBe(GATE_ID);

    // Gate DB row should be unlocked.
    const gateRow = db.select().from(gatesTable).all().at(0);
    expect((gateRow?.stateJson as { kind: string } | undefined)?.kind).toBe("unlocked");

    // newlyUnlockedCount should be 1.
    const count = await artifactsService.newlyUnlockedCount({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    });
    expect(count).toBe(1);
  });

  it("markGatesViewed drops the newly-unlocked count to 0", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourseWithGate(db, 0.9);

    const { sessionService, artifactsService } = buildServices(db, 0.9);

    const handle = await sessionService.start({
      modeId: "teach",
      courseId: COURSE_ID,
    });
    for await (const _ of sessionService.send(handle.sessionId, "hello")) {
      /* drain */
    }
    await sessionService.end(handle.sessionId);

    expect(
      await artifactsService.newlyUnlockedCount({
        studentId: STUDENT_ID,
        courseId: COURSE_ID,
      }),
    ).toBe(1);

    await artifactsService.markGatesViewed({ studentId: STUDENT_ID, courseId: COURSE_ID });

    expect(
      await artifactsService.newlyUnlockedCount({
        studentId: STUDENT_ID,
        courseId: COURSE_ID,
      }),
    ).toBe(0);
  });

  it("session.end() is non-fatal when session has no courseId (no gate evaluation)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // No course seeded — session started without a courseId.

    const { sessionService } = buildServices(db, 0);

    // Start a session without courseId (default teach session).
    const handle = await sessionService.start({ modeId: "teach" });
    for await (const _ of sessionService.send(handle.sessionId, "hello")) {
      /* drain */
    }

    // Should complete without errors.
    const summary = await sessionService.end(handle.sessionId);
    expect(summary.endedAt).toBeDefined();
    expect(summary.unlockedGates).toHaveLength(0);
  });

  it("second session.end() with same gate is idempotent (no new unlock events)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourseWithGate(db, 0.9);

    const { sessionService, artifactsService } = buildServices(db, 0.9);

    // First session
    const h1 = await sessionService.start({
      modeId: "teach",
      courseId: COURSE_ID,
    });
    for await (const _ of sessionService.send(h1.sessionId, "hello")) {
      /* drain */
    }
    const s1 = await sessionService.end(h1.sessionId);
    expect(s1.unlockedGates).toHaveLength(1);

    // Second session
    const h2 = await sessionService.start({
      modeId: "teach",
      courseId: COURSE_ID,
    });
    for await (const _ of sessionService.send(h2.sessionId, "hi")) {
      /* drain */
    }
    const s2 = await sessionService.end(h2.sessionId);
    // No new unlocks on the second run (already unlocked)
    expect(s2.unlockedGates).toHaveLength(0);

    // Still only one unlock event in the DB.
    const count = await artifactsService.newlyUnlockedCount({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    });
    expect(count).toBe(1);
  });
});
