/**
 * End-to-end integration test: real DB (temp dir) + SessionServiceImpl +
 * FakeEngine injected via engineFactory that emits a canned event sequence.
 *
 * Asserts:
 * - episodic rows persisted (count matches events emitted + user_message)
 * - session row created with correct modeId
 * - collected events match CANNED_EVENTS (plus framework-emitted user_message)
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { SessionServiceImpl } from "@praxis/core/services";
import type {
  CodeSandbox,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  SymPyService,
} from "@praxis/core/types";
import { teachMode } from "@praxis/curriculum/modes";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// isolated-vm@6.1.2 prebuilts don't cover Node 25 (ABI 141).
// @praxis/core/services imports @praxis/tools which exports IsolatedVmHost → isolated-vm.
// Provide a minimal stub so the module graph loads without a native binary.
// vi.mock is hoisted by Vitest above all imports.
vi.mock("isolated-vm", () => ({
  default: {
    Isolate: class {
      async createContext() {
        return { global: { set: async () => {}, derefInto: () => ({}) }, release: () => {} };
      }
      async compileScript(_code: string) {
        return { run: async () => {} };
      }
      dispose() {}
    },
    Reference: class {
      // biome-ignore lint/complexity/noUselessConstructor: mock needs constructor to match API
      // biome-ignore lint/suspicious/noExplicitAny: mock constructor param
      constructor(_fn: (...args: any[]) => unknown) {}
    },
  },
}));

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

class FakeSession implements EngineSession {
  readonly id = "fake-session-1";

  async *send(_userMessage: string): AsyncIterable<EngineEvent> {
    for (const event of CANNED_EVENTS) {
      yield event;
    }
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

// ── Test setup ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const mockSympy: SymPyService = {
  checkSolution: vi.fn(),
  solveEquation: vi.fn(),
  simplify: vi.fn(),
  checkEquivalent: vi.fn(),
  parseLatex: vi.fn(),
};

const mockSandbox: CodeSandbox = {
  run: vi.fn(),
};

const mockToolServices = { sympy: mockSympy, sandbox: mockSandbox };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-full-turn-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
  process.env.PRAXIS_ENGINE = "direct.anthropic";
  runMigrations({ path: dbPath });
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  delete process.env.PRAXIS_ENGINE;
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("full turn with fake engine", () => {
  it("persists episodic rows equal to emitted events (plus user_message)", async () => {
    const { db } = openDb({ path: dbPath });

    const modes = new Map([["teach", teachMode]]);
    const svc = new SessionServiceImpl({
      db,
      log: noopLogger,
      modes,
      toolDefinitions: [],
      toolServices: mockToolServices,
      engineFactory: () => new FakeEngine(),
    });

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId;

    const collectedEvents: EngineEvent[] = [];
    for await (const event of svc.send(sessionId, "hello")) {
      collectedEvents.push(event);
    }

    await svc.end(sessionId);

    // Framework emits user_message first, then CANNED_EVENTS
    const expectedCount = 1 + CANNED_EVENTS.length;
    expect(collectedEvents).toHaveLength(expectedCount);
    expect(collectedEvents[0]).toMatchObject({ type: "user_message", content: "hello" });
    expect(collectedEvents[collectedEvents.length - 1]).toMatchObject({ type: "final" });

    // Verify episodic rows in DB: user_message row + CANNED_EVENTS rows
    const rows = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .all();
    expect(rows.length).toBe(expectedCount);

    const rowTypes = rows.map((r) => (r.eventJson as { type: string }).type);
    expect(rowTypes).toContain("user_message");
    expect(rowTypes).toContain("model_message");
    expect(rowTypes).toContain("tool_call");
    expect(rowTypes).toContain("tool_result");
    expect(rowTypes).toContain("final");
  });

  it("session row is created with correct engineId and modeId", async () => {
    const { db } = openDb({ path: dbPath });

    const modes = new Map([["teach", teachMode]]);
    const svc = new SessionServiceImpl({
      db,
      log: noopLogger,
      modes,
      toolDefinitions: [],
      toolServices: mockToolServices,
      engineFactory: () => new FakeEngine(),
    });

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId;

    // drain send so the session row is fully populated
    for await (const _ of svc.send(sessionId, "test")) {
      /* drain */
    }
    await svc.end(sessionId);

    const sessionRows = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(sessionRows.length).toBe(1);
    const sess = sessionRows[0];
    expect(sess).toBeDefined();
    if (sess) {
      expect(sess.engineId).toBe("direct.anthropic");
      expect(sess.modeId).toBe("teach");
    }
  });

  it("collected events length matches CANNED_EVENTS plus user_message", async () => {
    const { db } = openDb({ path: dbPath });

    const modes = new Map([["teach", teachMode]]);
    const svc = new SessionServiceImpl({
      db,
      log: noopLogger,
      modes,
      toolDefinitions: [],
      toolServices: mockToolServices,
      engineFactory: () => new FakeEngine(),
    });

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId;

    const events: EngineEvent[] = [];
    for await (const event of svc.send(sessionId, "verify count")) {
      events.push(event);
    }
    await svc.end(sessionId);

    // user_message (1) + CANNED_EVENTS (5) = 6
    expect(events).toHaveLength(1 + CANNED_EVENTS.length);
  });

  it("second send on same session reuses the engine session (open called once)", async () => {
    const { db } = openDb({ path: dbPath });

    let openCount = 0;
    class CountingFakeEngine extends FakeEngine {
      override async open(opts: EngineOpenOptions): Promise<EngineSession> {
        openCount++;
        return super.open(opts);
      }
    }

    const modes = new Map([["teach", teachMode]]);
    const svc = new SessionServiceImpl({
      db,
      log: noopLogger,
      modes,
      toolDefinitions: [],
      toolServices: mockToolServices,
      engineFactory: () => new CountingFakeEngine(),
    });

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId;

    for await (const _ of svc.send(sessionId, "first")) {
      /* drain */
    }
    for await (const _ of svc.send(sessionId, "second")) {
      /* drain */
    }
    await svc.end(sessionId);

    // engine.open() is called once during start() — subsequent sends reuse same EngineSession
    expect(openCount).toBe(1);
  });

  it("end() marks session as ended; subsequent send yields session.ended error", async () => {
    const { db } = openDb({ path: dbPath });

    const modes = new Map([["teach", teachMode]]);
    const svc = new SessionServiceImpl({
      db,
      log: noopLogger,
      modes,
      toolDefinitions: [],
      toolServices: mockToolServices,
      engineFactory: () => new FakeEngine(),
    });

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId;

    for await (const _ of svc.send(sessionId, "hello")) {
      /* drain */
    }
    await svc.end(sessionId);

    const events: EngineEvent[] = [];
    for await (const event of svc.send(sessionId, "after-end")) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
    if (events[0]?.type === "error") {
      expect(events[0].error.code).toBe("session.ended");
    }
  });

  it("active() returns null before start; returns handle after start", async () => {
    const { db } = openDb({ path: dbPath });

    const modes = new Map([["teach", teachMode]]);
    const svc = new SessionServiceImpl({
      db,
      log: noopLogger,
      modes,
      toolDefinitions: [],
      toolServices: mockToolServices,
      engineFactory: () => new FakeEngine(),
    });

    expect(await svc.active()).toBeNull();

    const handle = await svc.start({ modeId: "teach" });
    const active = await svc.active();
    expect(active).toBeDefined();
    expect(active?.sessionId).toBe(handle.sessionId);

    await svc.end(handle.sessionId);
  });
});
