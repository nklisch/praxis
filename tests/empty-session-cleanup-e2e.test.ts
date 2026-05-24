/**
 * E2E integration test: empty-session-cleanup lazy-persist + promotion.
 *
 * Covers:
 * - start() without send() leaves no row in `sessions` (lazy-persist)
 * - discardIfUnpromoted() returns { discarded: true } and the tab is cleaned up
 * - start() + send() promotes the session (row appears in `sessions` after send)
 * - start() + send() + discardIfUnpromoted() returns { discarded: false }
 * - spawnFromAssignment() persists immediately (_persistImmediately: true path)
 */

import { assignments, courses } from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { openDb } from "@praxis/core/db";
import { SessionServiceImpl, SessionPromotionRegistryImpl } from "@praxis/core/services";
import type { ServiceDeps } from "@praxis/core/services";
import type {
  AssignmentId,
  CourseId,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  SessionId,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { quizMode, teachMode } from "@praxis/curriculum/modes";
import { tabs } from "@praxis/memory/schema";
import { sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { inMemorySecretStorage, noopLockService, noopLogger } from "./helpers/mocks.js";

// ── FakeEngine ─────────────────────────────────────────────────────────────────

class FakeSession implements EngineSession {
  readonly id = "fake-session-1";

  async *send(_userMessage: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: "hello", partial: false };
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

// ── Helpers ────────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();
const log = noopLogger();

function openTestDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

function makeService(db: ReturnType<typeof openTestDb>) {
  const registry = new SessionPromotionRegistryImpl({
    db,
    log,
    engineSessionManager: () => svc.engineManager,
  });

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([
      ["teach", teachMode],
      ["quiz", quizMode],
    ]),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: test stub — only documentScopes.listForScope is needed
    toolServices: {
      documentScopes: { listForScope: vi.fn().mockResolvedValue([]) },
    } as any,
    lockService: noopLockService(),
    engineFactory: () => new FakeEngine(),
    secretStorage: inMemorySecretStorage(),
    sessionPromotionRegistry: registry,
  };

  const svc = new SessionServiceImpl(deps);
  return { svc, registry };
}

function insertTab(
  db: ReturnType<typeof openTestDb>,
  tabId: string,
  sessionId: string,
) {
  db.insert(tabs)
    .values({
      id: tabId,
      studentId: "student-test",
      kind: "session",
      sessionId,
      title: "test tab",
      sortOrder: 0,
      openedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .run();
}

function seedCourseAndAssignment(
  db: ReturnType<typeof openTestDb>,
  studentId: string,
): { courseId: CourseId; assignmentId: AssignmentId } {
  const graphId = uuidv7();
  db.insert(conceptGraphs)
    .values({ id: graphId, source: "extracted", name: "Test", version: "1", createdAt: new Date() })
    .run();

  const courseId = uuidv7();
  db.insert(courses)
    .values({
      id: courseId,
      studentId,
      title: "Test Course",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "authored", authorRole: "teacher" },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  const assignmentId = uuidv7();
  db.insert(assignments)
    .values({
      id: assignmentId,
      courseId,
      kind: "quiz",
      title: "Test Quiz",
      itemsJson: [],
      conceptIdsJson: [],
      assignedAt: new Date(),
    })
    .run();

  return {
    courseId: brandId<"CourseId">(courseId),
    assignmentId: brandId<"AssignmentId">(assignmentId),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("empty-session-cleanup e2e", () => {
  let db: ReturnType<typeof openTestDb>;

  beforeEach(() => {
    process.env.PRAXIS_ENGINE = "direct.anthropic";
    db = openTestDb();
  });

  afterEach(() => {
    delete process.env.PRAXIS_ENGINE;
  });

  it("start then close without send — no row in sessions", async () => {
    const { svc } = makeService(db);
    const handle = await svc.start({ modeId: "teach" });

    // No send() call — simulates tab close before first message.
    const all = db.select().from(sessions).all();
    expect(all.find((r) => r.id === handle.sessionId)).toBeUndefined();
  });

  it("discardIfUnpromoted returns { discarded: true } for unpromoted session", async () => {
    const { svc } = makeService(db);
    const handle = await svc.start({ modeId: "teach" });

    const result = await svc.discardIfUnpromoted(handle.sessionId);

    expect(result).toEqual({ discarded: true });
    // Still no row in sessions.
    const all = db.select().from(sessions).all();
    expect(all.find((r) => r.id === handle.sessionId)).toBeUndefined();
  });

  it("discardIfUnpromoted cleans up orphan tab for unpromoted session", async () => {
    const { svc } = makeService(db);
    const handle = await svc.start({ modeId: "teach" });
    const tabId = "tab-discard-test";
    insertTab(db, tabId, handle.sessionId);

    await svc.discardIfUnpromoted(handle.sessionId);

    // Tab should have been deleted by the registry discard step.
    const remainingTabs = db.select().from(tabs).where(eq(tabs.id, tabId)).all();
    expect(remainingTabs).toHaveLength(0);
  });

  it("start then send promotes the session row into sessions", async () => {
    const { svc } = makeService(db);
    const handle = await svc.start({ modeId: "teach" });

    // Drain the send stream.
    for await (const _ev of svc.send(handle.sessionId, "hello")) {
      // consume
    }

    const row = db.select().from(sessions).where(eq(sessions.id, handle.sessionId)).get();
    expect(row).toBeDefined();
    expect(row?.modeId).toBe("teach");
  });

  it("discardIfUnpromoted returns { discarded: false } after promotion via send", async () => {
    const { svc } = makeService(db);
    const handle = await svc.start({ modeId: "teach" });

    for await (const _ev of svc.send(handle.sessionId, "hello")) {
      // consume
    }

    const result = await svc.discardIfUnpromoted(handle.sessionId);
    expect(result).toEqual({ discarded: false });
  });

  it("discardIfUnpromoted is safe to call twice (idempotent)", async () => {
    const { svc } = makeService(db);
    const handle = await svc.start({ modeId: "teach" });

    const first = await svc.discardIfUnpromoted(handle.sessionId);
    const second = await svc.discardIfUnpromoted(handle.sessionId);

    expect(first).toEqual({ discarded: true });
    expect(second).toEqual({ discarded: false });
  });

  it("spawnFromAssignment persists the row immediately (no registry entry)", async () => {
    const { svc, registry } = makeService(db);

    // Seed a parent session (must be in sessions table).
    const parentId = uuidv7();
    db.insert(sessions)
      .values({
        id: parentId,
        studentId: "student-test",
        modeId: "teach",
        engineId: "fake-engine",
        startedAt: new Date(),
      })
      .run();
    const parentSessionId = brandId<"SessionId">(parentId);

    // Need a real studentId for seedCourseAndAssignment.
    const studentId = db
      .select()
      .from(sessions)
      .where(eq(sessions.id, parentId))
      .get()?.studentId ?? "student-test";

    const { assignmentId } = seedCourseAndAssignment(db, studentId);

    const handle = await svc.spawnFromAssignment({ assignmentId, parentSessionId });

    // Row must be in sessions immediately — _persistImmediately: true path.
    const row = db.select().from(sessions).where(eq(sessions.id, handle.sessionId)).get();
    expect(row).toBeDefined();
    expect(row?.modeId).toBe("quiz");

    // Must NOT be in the registry (already persisted, never registered lazily).
    expect(registry.get(handle.sessionId)).toBeNull();
  });
});
