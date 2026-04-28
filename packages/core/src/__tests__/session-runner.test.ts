import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { SessionRunner } from "../session/runner.js";
import type {
  Brief,
  Engine,
  EngineEvent,
  HealthStatus,
  Mode,
  ToolRegistry,
} from "../types/index.js";

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

function makeTestEngine(events: EngineEvent[]): Engine {
  return {
    id: "test-engine",
    kind: "single-shot",
    async *run() {
      for (const e of events) yield e;
    },
    async health(): Promise<HealthStatus> {
      return {
        ok: true,
        capabilities: { vision: false, streaming: true, nativeMCP: false, contextWindow: 8192 },
      };
    },
  };
}

const fakeMode: Mode = {
  id: "teach",
  label: "Teach",
  description: "Test mode",
  requiredRole: "student",
  promptFragments: [],
  toolNames: [],
  uiSurface: "chat",
};

const fakeTools: ToolRegistry = {
  list: () => [],
  dispatch: async () => ({
    ok: false,
    error: { code: "not_found", message: "no tools", recoverable: false },
  }),
};

const fakeBrief: Brief = {
  systemPrompt: "You are a test engine.",
  userMessage: "Hello",
  context: { retrievedChunks: [], artifactRefs: [] },
};

describe("SessionRunner", () => {
  it("writes episodic events and returns RunTurnResult", async () => {
    const { db } = openDb({ path: dbPath });
    const engineEvents: EngineEvent[] = [
      { type: "model_message", content: "Hello!" },
      { type: "model_message", content: " World" },
      { type: "final", usage: { inputTokens: 10, outputTokens: 5 } },
    ];
    const engine = makeTestEngine(engineEvents);
    const runner = new SessionRunner({
      db,
      studentId: "student-1",
      mode: fakeMode,
      engine,
      tools: fakeTools,
    });

    const gen = runner.runTurn({ brief: fakeBrief });
    const collected: EngineEvent[] = [];
    let result = await gen.next();
    while (!result.done) {
      collected.push(result.value);
      result = await gen.next();
    }
    const turnResult = result.value;

    expect(turnResult.events).toHaveLength(3);
    expect(turnResult.finalEvent?.type).toBe("final");
    expect(typeof turnResult.sessionId).toBe("string");

    const rows = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, turnResult.sessionId))
      .all();
    expect(rows).toHaveLength(3);
    expect(rows[0]?.engineId).toBe("test-engine");
    expect(rows[0]?.modeId).toBe("teach");
    expect(rows[0]?.turnIndex).toBe(0);
  });

  it("reuses sessionId across two runTurn calls", async () => {
    const { db } = openDb({ path: dbPath });
    const engine = makeTestEngine([{ type: "final", usage: { inputTokens: 1, outputTokens: 1 } }]);
    const runner = new SessionRunner({
      db,
      studentId: "student-1",
      mode: fakeMode,
      engine,
      tools: fakeTools,
    });

    // First turn — creates session
    const gen1 = runner.runTurn({ brief: fakeBrief });
    let r = await gen1.next();
    while (!r.done) r = await gen1.next();
    const sessionId = r.value.sessionId;

    // Second turn — reuses same session, turn 1
    const gen2 = runner.runTurn({ brief: fakeBrief, sessionId, turnIndex: 1 });
    let r2 = await gen2.next();
    while (!r2.done) r2 = await gen2.next();
    expect(r2.value.sessionId).toBe(sessionId);

    const rows = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .all();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.turnIndex).toBe(0);
    expect(rows[1]?.turnIndex).toBe(1);
  });

  it("endSession sets ended_at on the session row", async () => {
    const { db } = openDb({ path: dbPath });
    const engine = makeTestEngine([{ type: "final", usage: { inputTokens: 1, outputTokens: 1 } }]);
    const runner = new SessionRunner({
      db,
      studentId: "student-1",
      mode: fakeMode,
      engine,
      tools: fakeTools,
    });

    const gen = runner.runTurn({ brief: fakeBrief });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    const { sessionId } = r.value;

    const before = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(before[0]?.endedAt).toBeNull();

    runner.endSession(sessionId);

    const after = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(after[0]?.endedAt).not.toBeNull();
  });
});
