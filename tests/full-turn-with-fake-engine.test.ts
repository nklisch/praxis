/**
 * End-to-end integration test: real DB (temp dir) + InProcessToolRegistry +
 * composeBrief + SessionRunner + FakeEngine that emits a canned event sequence.
 *
 * Asserts:
 * - episodic rows persisted (count matches events emitted)
 * - session row created with correct engineId/modeId
 * - RunTurnResult.events.length matches
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { SessionRunner } from "@praxis/core/session";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { composeBrief } from "@praxis/curriculum/brief";
import { teachMode } from "@praxis/curriculum/modes";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { InProcessToolRegistry } from "@praxis/tools";
import { echoTool } from "@praxis/tools/test-tools";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ── FakeEngine ─────────────────────────────────────────────────────────────────

const CANNED_EVENTS: EngineEvent[] = [
  { type: "model_message", content: "Calling echo...", partial: true },
  { type: "tool_call", toolName: "test.echo", args: { text: "hello" }, callId: "call-1" },
  {
    type: "tool_result",
    callId: "call-1",
    result: { ok: true, value: { echoed: "hello" }, tier: "deterministic" },
  },
  { type: "model_message", content: "...done", partial: false },
  { type: "final", usage: { inputTokens: 10, outputTokens: 20 } },
];

class FakeEngine implements Engine {
  readonly id = "fake-engine";
  readonly kind = "single-shot" as const;

  async *run(_brief: Brief, _tools: ToolRegistry): AsyncIterable<EngineEvent> {
    for (const event of CANNED_EVENTS) {
      yield event;
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    };
  }
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-full-turn-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
  runMigrations({ path: dbPath });
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("full turn with fake engine", () => {
  it("persists episodic rows equal to emitted events", async () => {
    const { db } = openDb({ path: dbPath });
    const studentId = brandId<"StudentId">("student-1");
    const toolContext = {
      studentId,
      sessionId: brandId<"SessionId">("session-ctx-1"),
      services: {
        memory: null,
        artifacts: null,
        vectorStore: null,
        sandbox: null,
        sympy: null,
        pedagogyPack: null,
      },
      log: noopLogger,
    };

    const tools = new InProcessToolRegistry({
      tools: [echoTool],
      context: toolContext,
    });

    const engine = new FakeEngine();
    const brief = composeBrief({ mode: teachMode, userMessage: "hello" });

    const runner = new SessionRunner({ db, studentId, mode: teachMode, engine, tools });
    const turn = runner.runTurn({ brief });

    const collectedEvents: EngineEvent[] = [];
    for (;;) {
      const next = await turn.next();
      if (next.done) {
        const result = next.value;
        expect(result.events.length).toBe(CANNED_EVENTS.length);
        expect(result.finalEvent).toBeDefined();
        expect(result.finalEvent?.type).toBe("final");

        // Verify episodic rows in DB
        const rows = db
          .select()
          .from(episodicEvents)
          .where(eq(episodicEvents.sessionId, result.sessionId))
          .all();
        expect(rows.length).toBe(CANNED_EVENTS.length);

        // Check event types match
        const rowTypes = rows.map((r) => (r.eventJson as { type: string }).type);
        expect(rowTypes).toContain("model_message");
        expect(rowTypes).toContain("tool_call");
        expect(rowTypes).toContain("tool_result");
        expect(rowTypes).toContain("final");

        break;
      }
      collectedEvents.push(next.value);
    }
    expect(collectedEvents.length).toBe(CANNED_EVENTS.length);
  });

  it("session row is created with correct engineId and modeId", async () => {
    const { db } = openDb({ path: dbPath });
    const studentId = brandId<"StudentId">("student-2");
    const toolContext = {
      studentId,
      sessionId: brandId<"SessionId">("session-ctx-2"),
      services: {
        memory: null,
        artifacts: null,
        vectorStore: null,
        sandbox: null,
        sympy: null,
        pedagogyPack: null,
      },
      log: noopLogger,
    };

    const tools = new InProcessToolRegistry({ tools: [], context: toolContext });
    const engine = new FakeEngine();
    const brief = composeBrief({ mode: teachMode, userMessage: "test" });
    const runner = new SessionRunner({ db, studentId, mode: teachMode, engine, tools });

    const turn = runner.runTurn({ brief });
    let sessionId: string | undefined;
    for (;;) {
      const next = await turn.next();
      if (next.done) {
        sessionId = next.value.sessionId;
        break;
      }
    }

    expect(sessionId).toBeDefined();
    if (sessionId) {
      const sessionRows = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
      expect(sessionRows.length).toBe(1);
      const sess = sessionRows[0];
      expect(sess).toBeDefined();
      if (sess) {
        expect(sess.engineId).toBe("fake-engine");
        expect(sess.modeId).toBe("teach");
      }
    }
  });

  it("RunTurnResult.events.length matches events emitted", async () => {
    const { db } = openDb({ path: dbPath });
    const studentId = brandId<"StudentId">("student-3");
    const toolContext = {
      studentId,
      sessionId: brandId<"SessionId">("session-ctx-3"),
      services: {
        memory: null,
        artifacts: null,
        vectorStore: null,
        sandbox: null,
        sympy: null,
        pedagogyPack: null,
      },
      log: noopLogger,
    };

    const tools = new InProcessToolRegistry({ tools: [echoTool], context: toolContext });
    const engine = new FakeEngine();
    const brief = composeBrief({ mode: teachMode, userMessage: "verify count" });
    const runner = new SessionRunner({ db, studentId, mode: teachMode, engine, tools });

    const turn = runner.runTurn({ brief });
    let result: Awaited<ReturnType<typeof turn.next>>;
    do {
      result = await turn.next();
    } while (!result.done);

    expect(result.done).toBe(true);
    expect(result.value.events.length).toBe(CANNED_EVENTS.length);
  });
});
