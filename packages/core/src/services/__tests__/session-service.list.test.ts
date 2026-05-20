/**
 * Tests for SessionServiceImpl.list() — including the new excludeModeIds filter.
 *
 * Directly inserts DB rows (no engine wiring needed — list() is a pure DB query).
 *
 * Cases:
 *  1. list() (no args) — returns all sessions (regression guard).
 *  2. list({ excludeModeIds: ["configure"] }) — configure sessions absent.
 *  3. list({ excludeModeIds: ["configure", "exam"] }) — both modes absent.
 *  4. list({ excludeModeIds: [] }) — no-op; returns everything.
 *  5. list({ limit: 5, excludeModeIds: ["configure"] }) — filter before LIMIT:
 *     insert 8 configure + 5 teach; expect 5 teach back.
 */

import { sessions } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type { SessionId } from "../../types/index.js";
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

function makeService(db: ReturnType<typeof openDb>["db"]): SessionServiceImpl {
  const log = makeLog();
  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([
      [
        "configure",
        {
          id: "configure",
          label: "Configure",
          displayName: "configure",
          description: "Configure mode.",
          requiredRole: "student" as const,
          uiSurface: "chat" as const,
          toolNames: [],
          promptFragments: [],
        },
      ],
      [
        "teach",
        {
          id: "teach",
          label: "Teach",
          displayName: "teach",
          description: "Teach mode.",
          requiredRole: "student" as const,
          uiSurface: "chat" as const,
          toolNames: [],
          promptFragments: [],
        },
      ],
      [
        "exam",
        {
          id: "exam",
          label: "Exam",
          displayName: "exam",
          description: "Exam mode.",
          requiredRole: "student" as const,
          uiSurface: "chat" as const,
          toolNames: [],
          promptFragments: [],
        },
      ],
    ]),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: minimal test stub — list() only queries sessions
    toolServices: {} as any,
    lockService: {
      isSet: async () => false,
      isUnlocked: async () => true,
      setLockCode: async () => {},
      unlock: async () => ({ ok: true }),
      lock: async () => {},
      clearLock: async () => {},
    },
    secretStorage: inMemorySecretStorage(),
  };
  return new SessionServiceImpl(deps);
}

/**
 * Insert a session row directly — bypasses start() so tests don't need engine wiring.
 * Returns the branded SessionId.
 */
function insertSession(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    studentId: string;
    modeId: string;
    startedAt?: Date;
    endedAt?: Date;
  },
): SessionId {
  const id = uuidv7();
  db.insert(sessions)
    .values({
      id,
      studentId: opts.studentId,
      modeId: opts.modeId,
      engineId: "fake-engine",
      startedAt: opts.startedAt ?? new Date(),
      ...(opts.endedAt !== undefined && { endedAt: opts.endedAt }),
    })
    .run();
  return brandId<"SessionId">(id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl.list() — excludeModeIds filter", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("1. list() (no args) — returns all sessions (regression guard)", async () => {
    const configId = insertSession(db, { studentId, modeId: "configure" });
    const teachId = insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);

    const results = await svc.list();
    const ids = results.map((s) => s.sessionId);

    expect(ids).toContain(configId);
    expect(ids).toContain(teachId);
  });

  it("2. list({ excludeModeIds: ['configure'] }) — configure sessions absent", async () => {
    insertSession(db, { studentId, modeId: "configure" });
    const teachId = insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);

    const results = await svc.list({ excludeModeIds: ["configure"] });
    const ids = results.map((s) => s.sessionId);
    const modeIds = results.map((s) => s.modeId);

    expect(ids).toContain(teachId);
    expect(modeIds).not.toContain("configure");
  });

  it("3. list({ excludeModeIds: ['configure', 'exam'] }) — both modes absent", async () => {
    insertSession(db, { studentId, modeId: "configure" });
    insertSession(db, { studentId, modeId: "exam" });
    const teachId = insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);

    const results = await svc.list({ excludeModeIds: ["configure", "exam"] });
    const ids = results.map((s) => s.sessionId);
    const modeIds = results.map((s) => s.modeId);

    expect(ids).toContain(teachId);
    expect(modeIds).not.toContain("configure");
    expect(modeIds).not.toContain("exam");
  });

  it("4. list({ excludeModeIds: [] }) — no-op; returns everything", async () => {
    const configId = insertSession(db, { studentId, modeId: "configure" });
    const teachId = insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);

    const results = await svc.list({ excludeModeIds: [] });
    const ids = results.map((s) => s.sessionId);

    expect(ids).toContain(configId);
    expect(ids).toContain(teachId);
  });

  it("5. filter applies before LIMIT: 8 configure + 5 teach, limit 5 → 5 teach", async () => {
    // Insert 8 configure sessions with staggered timestamps
    for (let i = 0; i < 8; i++) {
      insertSession(db, {
        studentId,
        modeId: "configure",
        startedAt: new Date(Date.now() - (100 - i) * 1000),
      });
    }
    // Insert 5 teach sessions with more-recent timestamps
    const teachIds: SessionId[] = [];
    for (let i = 0; i < 5; i++) {
      teachIds.push(
        insertSession(db, {
          studentId,
          modeId: "teach",
          startedAt: new Date(Date.now() - i * 1000),
        }),
      );
    }
    const svc = makeService(db);

    const results = await svc.list({ limit: 5, excludeModeIds: ["configure"] });

    expect(results).toHaveLength(5);
    const modeIds = results.map((s) => s.modeId);
    expect(modeIds.every((m) => m === "teach")).toBe(true);
  });
});
