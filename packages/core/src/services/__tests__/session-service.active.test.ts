/**
 * Tests for SessionServiceImpl.active() — including the new modeId filter.
 *
 * Directly inserts DB rows (no engine wiring needed — active() is a pure DB query).
 *
 * Cases:
 *  1. No sessions → active({ modeId: 'configure' }) returns null.
 *  2. Only ended configure sessions → returns null.
 *  3. One open configure session → returns it (sessionId + modeId).
 *  4. Multiple open configure sessions → returns the most recent by startedAt.
 *  5. Open session of a different mode (teach) → active({ modeId: 'configure' }) returns null.
 *  6. Mix of open configure + open teach → each modeId filter returns the right one.
 *  7. Regression: active() (no args) still returns the most-recent open regardless of mode.
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
    ]),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: minimal test stub — active() only queries sessions
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

describe("SessionServiceImpl.active() — modeId filter", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("1. returns null when there are no sessions", async () => {
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result).toBeNull();
  });

  it("2. returns null when only ended configure sessions exist", async () => {
    insertSession(db, { studentId, modeId: "configure", endedAt: new Date() });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result).toBeNull();
  });

  it("3. returns the open configure session when exactly one exists", async () => {
    const sessionId = insertSession(db, { studentId, modeId: "configure" });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe(sessionId);
    expect(result?.modeId).toBe("configure");
  });

  it("4. returns the most-recent configure session when multiple open ones exist", async () => {
    const older = new Date(Date.now() - 60_000);
    const newer = new Date(Date.now());
    insertSession(db, { studentId, modeId: "configure", startedAt: older });
    const newestId = insertSession(db, { studentId, modeId: "configure", startedAt: newer });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result?.sessionId).toBe(newestId);
  });

  it("5. returns null when the only open session has a different mode (teach)", async () => {
    insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result).toBeNull();
  });

  it("6a. returns the configure session from a mix of configure + teach open sessions", async () => {
    const configureId = insertSession(db, { studentId, modeId: "configure" });
    insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result?.sessionId).toBe(configureId);
    expect(result?.modeId).toBe("configure");
  });

  it("6b. returns the teach session when filtering by teach from a mix", async () => {
    insertSession(db, { studentId, modeId: "configure" });
    const teachId = insertSession(db, { studentId, modeId: "teach" });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "teach" });
    expect(result?.sessionId).toBe(teachId);
    expect(result?.modeId).toBe("teach");
  });

  it("7. regression: active() with no args returns the most-recent open session regardless of mode", async () => {
    const older = new Date(Date.now() - 60_000);
    const newer = new Date(Date.now());
    insertSession(db, { studentId, modeId: "configure", startedAt: older });
    const newestId = insertSession(db, { studentId, modeId: "teach", startedAt: newer });
    const svc = makeService(db);
    const result = await svc.active();
    expect(result?.sessionId).toBe(newestId);
  });

  it("8. ignores configure sessions belonging to a different student", async () => {
    // Insert an open configure session for a different student — the runtime
    // current student has no sessions; active() must return null, not bleed
    // across the student boundary.
    insertSession(db, { studentId: "other-student", modeId: "configure" });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result).toBeNull();
  });

  it("9. returns own session but not another student's session of the same mode", async () => {
    // Both students have an open configure session; active() for the runtime
    // current student must return only their own session.
    const otherId = insertSession(db, {
      studentId: "other-student",
      modeId: "configure",
    });
    const ownId = insertSession(db, { studentId, modeId: "configure" });
    const svc = makeService(db);
    const result = await svc.active({ modeId: "configure" });
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe(ownId);
    expect(result?.sessionId).not.toBe(otherId);
  });
});
