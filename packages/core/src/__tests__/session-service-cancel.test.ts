/**
 * Tests for SessionServiceImpl cancel / AbortSignal path (story: signal).
 *
 * Validates that:
 *   - `send(sessionId, message, signal)` threads the signal into the engine.
 *   - When the signal aborts mid-turn, the next yielded event is
 *     `{ type: "interrupted", reason: "user_cancel" }`.
 *   - That event is appended to the episodic log via appendEpisodic.
 *   - The generator returns cleanly without throwing.
 *   - The no-signal path is not regressed.
 */
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { SessionServiceImpl } from "../services/session-service.js";
import { getOrCreateDefaultStudentId } from "../services/student.js";
import type { ServiceDeps } from "../services/types.js";
import type { Engine, EngineEvent, SessionId } from "../types/index.js";
import { brandId } from "../types/index.js";

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

function makeMode(id: string) {
  return {
    id,
    label: id,
    description: "",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

/**
 * Build a SessionServiceImpl with a controllable fake engine whose send()
 * implementation is provided by the caller.
 */
function makeService(
  db: ReturnType<typeof openDb>["db"],
  fakeSend: (msg: string, signal?: AbortSignal) => AsyncIterable<EngineEvent>,
): SessionServiceImpl {
  const log = makeLog();

  const fakeEngineHandle = {
    id: "fake-handle",
    send: vi.fn().mockImplementation(fakeSend),
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
    modes: new Map([["teach", makeMode("teach")]]),
    toolDefinitions: [],
    toolServices: {
      // biome-ignore lint/suspicious/noExplicitAny: test stub — send path only calls courseDocuments.listForCourse
      courseDocuments: { listForCourse: vi.fn().mockResolvedValue([]) },
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
  };

  return new SessionServiceImpl(deps);
}

/** Insert a minimal session row directly so we can call send() without start(). */
function insertSession(db: ReturnType<typeof openDb>["db"], studentId: string): SessionId {
  const id = uuidv7();
  db.insert(sessions)
    .values({
      id,
      studentId,
      modeId: "teach",
      engineId: "fake-engine",
      startedAt: new Date(),
    })
    .run();
  return brandId<"SessionId">(id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl.send — AbortSignal / cancel", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("threads the AbortSignal into EngineSession.send", async () => {
    let capturedSignal: AbortSignal | undefined;

    async function* fakeSend(_msg: string, signal?: AbortSignal): AsyncIterable<EngineEvent> {
      capturedSignal = signal;
      yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } };
    }

    const svc = makeService(db, fakeSend);
    const sessionId = insertSession(db, studentId);
    const controller = new AbortController();

    const events: EngineEvent[] = [];
    for await (const ev of svc.send(sessionId, "hello", controller.signal)) {
      events.push(ev);
    }

    expect(capturedSignal).toBe(controller.signal);
  });

  it("yields interrupted event when signal aborts mid-turn and returns cleanly", async () => {
    const controller = new AbortController();

    async function* fakeSend(): AsyncIterable<EngineEvent> {
      // First event: yield one model_message, then abort the signal.
      yield { type: "model_message", content: "Starting…", partial: true };
      // Simulate the signal firing after the first yield (synchronous abort here).
      controller.abort();
      // Yield a second event that the session service will see, triggering the defensive check.
      yield { type: "model_message", content: "Never finished", partial: true };
      // This final event should never be reached.
      yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } };
    }

    const svc = makeService(db, fakeSend);
    const sessionId = insertSession(db, studentId);

    const events: EngineEvent[] = [];
    let threw = false;
    try {
      for await (const ev of svc.send(sessionId, "hello", controller.signal)) {
        events.push(ev);
      }
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);

    const types = events.map((e) => e.type);
    // Sanity: user_message + model_message from the first yield
    expect(types).toContain("user_message");
    expect(types).toContain("model_message");
    // The interrupted event must be present as the terminal event.
    expect(types).toContain("interrupted");

    const interrupted = events.find((e) => e.type === "interrupted");
    expect(interrupted).toMatchObject({ type: "interrupted", reason: "user_cancel" });

    // After interrupted, there should be no more events (final was not reached).
    const interruaptedIdx = events.findIndex((e) => e.type === "interrupted");
    expect(events.length - 1).toBe(interruaptedIdx);
  });

  it("appends the interrupted event to the episodic log", async () => {
    const controller = new AbortController();
    controller.abort(); // pre-aborted — will fire after first model_message

    async function* fakeSend(_msg: string, signal?: AbortSignal): AsyncIterable<EngineEvent> {
      yield { type: "model_message", content: "hi", partial: false };
      // The signal is already aborted; the defensive check fires after this yield.
      if (signal?.aborted) return;
      yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } };
    }

    const svc = makeService(db, fakeSend);
    const sessionId = insertSession(db, studentId);

    for await (const _ of svc.send(sessionId, "hello", controller.signal)) {
      /* drain */
    }

    // Inspect episodic log for the interrupted event.
    const rows = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .orderBy(asc(episodicEvents.ts))
      .all();

    // biome-ignore lint/suspicious/noExplicitAny: eventJson is EngineEvent stored as JSON
    const types = rows.map((r) => (r.eventJson as any)?.type);
    expect(types).toContain("interrupted");
  });

  it("does not emit interrupted event when signal is not aborted", async () => {
    async function* fakeSend(): AsyncIterable<EngineEvent> {
      yield { type: "model_message", content: "Done.", partial: false };
      yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } };
    }

    const svc = makeService(db, fakeSend);
    const sessionId = insertSession(db, studentId);
    const controller = new AbortController();
    // Do NOT abort the controller.

    const events: EngineEvent[] = [];
    for await (const ev of svc.send(sessionId, "hello", controller.signal)) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types).not.toContain("interrupted");
    expect(types).toContain("final");
  });

  it("works correctly when no signal is passed (backward compat)", async () => {
    async function* fakeSend(): AsyncIterable<EngineEvent> {
      yield { type: "model_message", content: "All good.", partial: false };
      yield { type: "final", usage: { inputTokens: 2, outputTokens: 2 } };
    }

    const svc = makeService(db, fakeSend);
    const sessionId = insertSession(db, studentId);

    const events: EngineEvent[] = [];
    for await (const ev of svc.send(sessionId, "hello")) {
      // No signal passed — original call signature.
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain("model_message");
    expect(types).toContain("final");
    expect(types).not.toContain("interrupted");
  });
});
