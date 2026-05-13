/**
 * Tests for SessionServiceImpl Phase 16 additions:
 *   - notifySession() appends a system_note event to the episodic transcript
 *   - notifySession() does not throw when session is unknown or ended
 *   - spawnFromAssignment() creates a child session with parentSessionId set
 *
 * These tests directly insert DB rows rather than going through session.start()
 * (which requires full engine wiring), then assert on the resulting DB state.
 */

import { assignments, courses } from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type {
  AssignmentId,
  CourseId,
  Engine,
  EngineEvent,
  SessionId,
  SystemNoteOrigin,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { SessionServiceImpl } from "../session-service.js";
import { getOrCreateDefaultStudentId } from "../student.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

// ── helpers ───────────────────────────────────────────────────────────────────

function makeLog() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => log),
  };
  return log;
}

function makeQuizMode() {
  return {
    id: "quiz",
    label: "Quiz",
    displayName: "quiz",
    description: "Take a short quiz to test understanding.",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

function makeTeachMode() {
  return {
    id: "teach",
    label: "Teach",
    displayName: "teach",
    description: "Open tutoring session.",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

/**
 * Minimal service that only needs notifySession / spawnFromAssignment:
 * modes map has "quiz" wired; engineFactory returns a controllable fake.
 */
function makeService(
  db: ReturnType<typeof openDb>["db"],
  opts: { engineEvents?: EngineEvent[] } = {},
): {
  svc: SessionServiceImpl;
  log: ReturnType<typeof makeLog>;
} {
  const log = makeLog();
  const fakeEngineHandle = {
    id: "fake-handle",
    send: vi.fn().mockImplementation(async function* () {
      for (const ev of opts.engineEvents ?? []) yield ev;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const fakeEngine: Engine = {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockResolvedValue(fakeEngineHandle),
  } as unknown as Engine;

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([
      ["quiz", makeQuizMode()],
      ["teach", makeTeachMode()],
    ]),
    toolDefinitions: [],
    toolServices: {
      courseDocuments: { listForCourse: vi.fn().mockResolvedValue([]) },
      // biome-ignore lint/suspicious/noExplicitAny: test stub — spawnFromAssignment only calls courseDocuments.listForCourse
    } as any,
    lockService: {
      isSet: async () => false,
      isUnlocked: async () => true,
      setLockCode: async () => {},
      unlock: async () => ({ ok: true }),
      lock: async () => {},
      clearLock: async () => {},
    },
    engineFactory: () => fakeEngine,
    secretStorage: inMemorySecretStorage(),
  };

  return { svc: new SessionServiceImpl(deps), log };
}

function insertSession(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    studentId: string;
    modeId?: string;
    endedAt?: Date;
  },
): SessionId {
  const id = uuidv7();
  db.insert(sessions)
    .values({
      id,
      studentId: opts.studentId,
      modeId: opts.modeId ?? "quiz",
      engineId: "fake-engine",
      startedAt: new Date(),
      ...(opts.endedAt !== undefined && { endedAt: opts.endedAt }),
    })
    .run();
  return brandId<"SessionId">(id);
}

function seedCourseAndAssignment(
  db: ReturnType<typeof openDb>["db"],
  opts: { studentId: string; kind: "quiz" | "homework" | "exam" },
): { courseId: CourseId; assignmentId: AssignmentId } {
  const graphId = uuidv7();
  db.insert(conceptGraphs)
    .values({ id: graphId, source: "extracted", name: "Test", version: "1", createdAt: new Date() })
    .run();

  const courseId = uuidv7();
  db.insert(courses)
    .values({
      id: courseId,
      studentId: opts.studentId,
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
      kind: opts.kind,
      title: "Test Assignment",
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl.notifySession", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("appends a system_note event to the episodic transcript for an active session", async () => {
    const sessionId = insertSession(db, { studentId, modeId: "quiz" });
    const { svc } = makeService(db);

    const origin: SystemNoteOrigin = {
      kind: "assignment_submission",
      assignmentId: brandId<"AssignmentId">("assign-test"),
      childSessionId: brandId<"SessionId">("child-1"),
      gradeTotal: 0.8,
      submittedAt: Date.now(),
    };

    await svc.notifySession({
      sessionId,
      note: "The student just submitted quiz: My Quiz.",
      origin,
    });

    const events = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .orderBy(asc(episodicEvents.ts))
      .all();

    expect(events).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: eventJson is EngineEvent stored as JSON
    const ev = events[0]?.eventJson as any;
    expect(ev?.type).toBe("system_note");
    expect(ev?.content).toBe("The student just submitted quiz: My Quiz.");
    expect(ev?.origin?.kind).toBe("assignment_submission");
  });

  it("does not throw when session does not exist", async () => {
    const { svc } = makeService(db);
    const fakeId = brandId<"SessionId">(uuidv7());

    await expect(
      svc.notifySession({
        sessionId: fakeId,
        note: "test note",
        origin: {
          kind: "assignment_submission",
          assignmentId: brandId<"AssignmentId">("x"),
          childSessionId: brandId<"SessionId">("y"),
          gradeTotal: 0,
          submittedAt: Date.now(),
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when session is already ended", async () => {
    const sessionId = insertSession(db, {
      studentId,
      modeId: "quiz",
      endedAt: new Date(),
    });
    const { svc } = makeService(db);

    await expect(
      svc.notifySession({
        sessionId,
        note: "test note",
        origin: {
          kind: "assignment_submission",
          assignmentId: brandId<"AssignmentId">("x"),
          childSessionId: brandId<"SessionId">("y"),
          gradeTotal: 0,
          submittedAt: Date.now(),
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("SessionServiceImpl.spawnFromAssignment", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("creates a child session and sets parentSessionId on the session row", async () => {
    const parentSessionId = insertSession(db, { studentId, modeId: "teach" });
    const { assignmentId, courseId } = seedCourseAndAssignment(db, { studentId, kind: "quiz" });
    const { svc } = makeService(db);

    const handle = await svc.spawnFromAssignment({
      assignmentId,
      parentSessionId,
    });

    // Returned handle should carry parentSessionId
    expect(handle.parentSessionId).toBe(parentSessionId);
    expect(handle.modeId).toBe("quiz");
    expect(handle.assignmentId).toBe(assignmentId);
    expect(handle.courseId).toBe(courseId);

    // The session row in the DB should have parentSessionId set
    const row = db.select().from(sessions).where(eq(sessions.id, handle.sessionId)).get();
    expect(row).toBeDefined();
    expect(row?.parentSessionId).toBe(parentSessionId);
    expect(row?.modeId).toBe("quiz");
  });

  it("throws when assignment does not exist", async () => {
    const parentSessionId = insertSession(db, { studentId, modeId: "teach" });
    const { svc } = makeService(db);

    await expect(
      svc.spawnFromAssignment({
        assignmentId: brandId<"AssignmentId">(uuidv7()),
        parentSessionId,
      }),
    ).rejects.toThrow(/Assignment not found/);
  });
});
