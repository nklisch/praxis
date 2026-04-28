import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { appendEpisodic, createSession, endSession } from "../session/episodic.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
  runMigrations({ path: dbPath });
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("createSession", () => {
  it("inserts a session row and returns its id", () => {
    const { db } = openDb({ path: dbPath });
    const sessionId = createSession({
      db,
      studentId: "student-1",
      modeId: "teach",
      engineId: "claude-code",
    });
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);

    const rows = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.modeId).toBe("teach");
  });
});

describe("appendEpisodic", () => {
  it("inserts an episodic event row and returns its id", () => {
    const { db } = openDb({ path: dbPath });
    const sessionId = createSession({
      db,
      studentId: "student-1",
      modeId: "teach",
      engineId: "claude-code",
    });
    const event = { type: "model_message" as const, content: "hello" };
    const eventId = appendEpisodic({
      db,
      sessionId,
      studentId: "student-1",
      engineId: "claude-code",
      modeId: "teach",
      turnIndex: 0,
      event,
    });
    expect(typeof eventId).toBe("string");

    const rows = db.select().from(episodicEvents).where(eq(episodicEvents.id, eventId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBe(sessionId);
    expect(rows[0]?.turnIndex).toBe(0);
  });
});

describe("endSession", () => {
  it("sets endedAt on the session row", () => {
    const { db } = openDb({ path: dbPath });
    const sessionId = createSession({
      db,
      studentId: "student-1",
      modeId: "teach",
      engineId: "claude-code",
    });

    const before = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(before[0]?.endedAt).toBeNull();

    endSession(db, sessionId);

    const after = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(after[0]?.endedAt).not.toBeNull();
  });
});
