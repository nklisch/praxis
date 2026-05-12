/**
 * End-to-end integration test for Phase 7 mastery loop.
 *
 * Verifies:
 * 1. `applySignal` writes to student_mastery and is reflected in `studentModel()`.
 * 2. Multiple signals update pKnown monotonically.
 * 3. `runAtSessionEnd` is called correctly (no error) during session.end().
 * 4. The formatMasteryTag helper produces graduated tags (used in course-context fragment).
 *
 * Uses real DB (via useTempDb) for full integration coverage.
 */

import { openDb } from "@praxis/core/db";
import {
  ArtifactsServiceImpl,
  IndexerOrchestratorImpl,
  MasteryIndexer,
  MemoryServiceImpl,
  SessionServiceImpl,
} from "@praxis/core/services";
import type {
  CodeSandbox,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  MasterySignal,
  SymPyService,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { teachMode } from "@praxis/curriculum/modes";
import { sessions, studentMastery } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { inMemorySecretStorage, noopLockService, noopLogger } from "./helpers/mocks.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── FakeEngine ─────────────────────────────────────────────────────────────────

class FakeSession implements EngineSession {
  readonly id = "fake-session";

  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: "Hello!", partial: false };
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

// ── Tests ──────────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

beforeEach(() => {
  process.env.PRAXIS_ENGINE = "direct.anthropic";
});

afterEach(() => {
  delete process.env.PRAXIS_ENGINE;
});

describe("mastery end-to-end", () => {
  it("applySignal writes student_mastery and is readable via studentModel", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger(),
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-e2e-1");
    const conceptId = brandId<"ConceptId">("concept-fractions");

    // Apply a correct signal
    memoryService.applySignal({
      studentId,
      conceptId,
      signals: [{ conceptId, kind: "correct", evidenceEventIds: [] }],
    });

    // Raw DB check
    const rows = client
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, studentId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.conceptId).toBe(conceptId);
    const initialPKnown = (rows[0]?.pKnown ?? 0) / 1000;
    expect(initialPKnown).toBeGreaterThan(0.1); // above prior after one correct signal

    // Read via studentModel
    const model = await memoryService.studentModel(studentId);
    const mastery = model.conceptMastery.get(conceptId);
    expect(mastery).toBeDefined();
    expect(mastery?.pKnown).toBeCloseTo(initialPKnown, 4);
  });

  it("multiple correct signals monotonically increase pKnown", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger(),
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-e2e-2");
    const conceptId = brandId<"ConceptId">("concept-derivatives");

    let prevPKnown = 0.1; // starting from prior

    for (let i = 0; i < 5; i++) {
      memoryService.applySignal({
        studentId,
        conceptId,
        signals: [{ conceptId, kind: "correct", evidenceEventIds: [] }],
      });

      const model = await memoryService.studentModel(studentId);
      const mastery = model.conceptMastery.get(conceptId);
      const newPKnown = mastery?.pKnown ?? 0;
      expect(newPKnown).toBeGreaterThanOrEqual(prevPKnown);
      prevPKnown = newPKnown;
    }

    // After 5 correct signals, pKnown should be well above the threshold
    const model = await memoryService.studentModel(studentId);
    const mastery = model.conceptMastery.get(conceptId);
    expect(mastery?.pKnown).toBeGreaterThan(0.3);
  });

  it("incorrect signals after correct signals reduce pKnown", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger(),
      decayDaysFor: () => 14,
    });

    const studentId = brandId<"StudentId">("student-e2e-3");
    const conceptId = brandId<"ConceptId">("concept-integrals");

    // First build up mastery with 3 correct signals
    for (let i = 0; i < 3; i++) {
      memoryService.applySignal({
        studentId,
        conceptId,
        signals: [{ conceptId, kind: "correct", evidenceEventIds: [] }],
      });
    }

    const afterCorrect = await memoryService.studentModel(studentId);
    const pKnownAfterCorrect = afterCorrect.conceptMastery.get(conceptId)?.pKnown ?? 0;

    // Then apply an incorrect signal
    memoryService.applySignal({
      studentId,
      conceptId,
      signals: [{ conceptId, kind: "incorrect", evidenceEventIds: [] }],
    });

    const afterIncorrect = await memoryService.studentModel(studentId);
    const pKnownAfterIncorrect = afterIncorrect.conceptMastery.get(conceptId)?.pKnown ?? 0;

    // pKnown should decrease after incorrect
    expect(pKnownAfterIncorrect).toBeLessThan(pKnownAfterCorrect);
  });

  it("session.end() completes cleanly with indexerOrchestrator wired", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const memoryService = new MemoryServiceImpl({
      db: client,
      log: noopLogger(),
      decayDaysFor: () => 14,
    });
    const artifactsService = new ArtifactsServiceImpl({
      db: client,
      log: noopLogger(),
      masteryReader: memoryService,
      gradeReader: { readGrade: vi.fn().mockResolvedValue(null) },
    });

    const masteryIndexer = new MasteryIndexer({
      db: client,
      log: noopLogger(),
      courseStateReader: artifactsService,
      sessionCourseId: (sessionId) => {
        const row = client.select().from(sessions).where(eq(sessions.id, sessionId)).get();
        return row?.courseId ?? null;
      },
    });

    const indexerOrchestrator = new IndexerOrchestratorImpl({
      db: client,
      log: noopLogger(),
      indexers: [masteryIndexer],
      debounceMs: 100_000, // very long debounce so it doesn't fire during the test
    });

    const svc = new SessionServiceImpl({
      db: client,
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
        courseState: null,
        memory: memoryService,
        // Phase 16: minimal stub for course-scoped session bootstrapping.
        courseDocuments: { listForCourse: vi.fn().mockResolvedValue([]) },
      } as any,
      indexerOrchestrator,
      engineFactory: () => new FakeEngine(),
      lockService: noopLockService(),
      secretStorage: inMemorySecretStorage(),
    });

    const handle = await svc.start({ modeId: "teach" });
    for await (const _ of svc.send(handle.sessionId, "hello")) {
      /* drain */
    }

    // session.end() should call indexerOrchestrator.runAtSessionEnd internally
    const summary = await svc.end(handle.sessionId);
    expect(summary.endedAt).toBeDefined();

    // Verify session is ended in DB
    const row = client.select().from(sessions).where(eq(sessions.id, handle.sessionId)).get();
    expect(row?.endedAt).not.toBeNull();
  });

  it("formatMasteryTag produces graduated labels correctly", async () => {
    const { formatMasteryTag } = await import("@praxis/curriculum/brief/course-context");

    expect(formatMasteryTag(0.85, true)).toBe("mastered (0.85)");
    expect(formatMasteryTag(0.8, false)).toBe("mastered (0.80)");
    expect(formatMasteryTag(0.55, false)).toBe("in progress (0.55)");
    expect(formatMasteryTag(0.4, false)).toBe("in progress (0.40)");
    expect(formatMasteryTag(0.39, false)).toBe("not yet started");
    expect(formatMasteryTag(undefined, true)).toBe("studied");
    expect(formatMasteryTag(undefined, false)).toBe("not yet studied");
  });
});
