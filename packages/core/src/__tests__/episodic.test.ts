import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { appendEpisodic, createSession, endSession } from "../session/episodic.js";

const db = useTempDb();

describe("createSession", () => {
  it("inserts a session row and returns its id", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-1",
      modeId: "teach",
      engineId: "claude-code",
    });
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);

    const rows = client.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.modeId).toBe("teach");
  });
});

describe("appendEpisodic", () => {
  it("inserts an episodic event row and returns its id", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-1",
      modeId: "teach",
      engineId: "claude-code",
    });
    const event = { type: "model_message" as const, content: "hello" };
    const eventId = appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-1",
      engineId: "claude-code",
      modeId: "teach",
      turnIndex: 0,
      event,
    });
    expect(typeof eventId).toBe("string");

    const rows = client.select().from(episodicEvents).where(eq(episodicEvents.id, eventId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBe(sessionId);
    expect(rows[0]?.turnIndex).toBe(0);
  });
});

describe("endSession", () => {
  it("sets endedAt on the session row", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-1",
      modeId: "teach",
      engineId: "claude-code",
    });

    const before = client.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(before[0]?.endedAt).toBeNull();

    endSession(client, sessionId);

    const after = client.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(after[0]?.endedAt).not.toBeNull();
  });
});
