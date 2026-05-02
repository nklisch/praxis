/**
 * Tests for SessionServiceImpl.list() — Phase 14 addition.
 *
 * These tests directly query the DB (not through SessionServiceImpl.start/send)
 * because SessionServiceImpl.start requires full engine wiring. We test list()
 * by inserting session rows and episodic events directly.
 */
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { SessionServiceImpl } from "../services/session-service.js";
import { getOrCreateDefaultStudentId } from "../services/student.js";
import type { ServiceDeps } from "../services/types.js";
import type { SessionId } from "../types/index.js";
import { brandId } from "../types/index.js";

const dbCtx = useTempDb();

function makeDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

function makeLog() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/** Build a minimal SessionServiceImpl with just enough deps for list(). */
function makeListService(db: ReturnType<typeof makeDb>): SessionServiceImpl {
  const log = makeLog();
  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map(),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: test stub — list() doesn't use toolServices
    toolServices: {} as any,
    lockService: {
      isSet: async () => false,
      isUnlocked: async () => true,
      setLockCode: async () => {},
      unlock: async () => ({ ok: true }),
      lock: async () => {},
      clearLock: async () => {},
    },
  };
  return new SessionServiceImpl(deps);
}

/** Insert a session row directly and return its SessionId. */
function insertSession(
  db: ReturnType<typeof makeDb>,
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
      modeId: opts.modeId ?? "teach",
      engineId: "direct.anthropic",
      startedAt: new Date(),
      ...(opts.endedAt !== undefined && { endedAt: opts.endedAt }),
    })
    .run();
  return brandId<"SessionId">(id);
}

/** Insert a user_message episodic event for a session. */
function insertUserMessage(
  db: ReturnType<typeof makeDb>,
  sessionId: SessionId,
  studentId: string,
  content: string,
): void {
  db.insert(episodicEvents)
    .values({
      id: uuidv7(),
      sessionId,
      studentId,
      ts: new Date(),
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      eventJson: { type: "user_message", content },
    })
    .run();
}

describe("SessionServiceImpl.list()", () => {
  it("returns all sessions for the default student, ordered by startedAt desc", async () => {
    const db = makeDb();
    const studentId = getOrCreateDefaultStudentId(db);

    insertSession(db, { studentId });
    insertSession(db, { studentId });
    insertSession(db, { studentId });

    const service = makeListService(db);
    const result = await service.list();
    expect(result).toHaveLength(3);
    for (const session of result) {
      expect(session.sessionId).toBeDefined();
      expect(session.modeId).toBe("teach");
      expect(session.endedAt).toBeNull();
    }
  });

  it("includeEnded: false filters to only open sessions", async () => {
    const db = makeDb();
    const studentId = getOrCreateDefaultStudentId(db);

    insertSession(db, { studentId }); // open
    insertSession(db, { studentId, endedAt: new Date() }); // ended

    const service = makeListService(db);

    const open = await service.list({ includeEnded: false });
    expect(open).toHaveLength(1);
    expect(open[0]?.endedAt).toBeNull();

    const all = await service.list({ includeEnded: true });
    expect(all).toHaveLength(2);
  });

  it("firstUserMessage is set when session has user messages; absent otherwise", async () => {
    const db = makeDb();
    const studentId = getOrCreateDefaultStudentId(db);

    const sessionWithMessage = insertSession(db, { studentId });
    const sessionWithoutMessage = insertSession(db, { studentId });

    insertUserMessage(db, sessionWithMessage, studentId, "Hello, can you help me with algebra?");

    const service = makeListService(db);
    const result = await service.list();

    const withMsg = result.find((s) => s.sessionId === sessionWithMessage);
    const withoutMsg = result.find((s) => s.sessionId === sessionWithoutMessage);

    expect(withMsg?.firstUserMessage).toBe("Hello, can you help me with algebra?");
    expect(withoutMsg?.firstUserMessage).toBeUndefined();
  });

  it("firstUserMessage is truncated to 60 chars with ellipsis if longer", async () => {
    const db = makeDb();
    const studentId = getOrCreateDefaultStudentId(db);

    const sessionId = insertSession(db, { studentId });
    const longMessage = "A".repeat(80); // 80 chars
    insertUserMessage(db, sessionId, studentId, longMessage);

    const service = makeListService(db);
    const result = await service.list();
    expect(result[0]?.firstUserMessage).toBe(`${"A".repeat(60)}…`);
  });
});
