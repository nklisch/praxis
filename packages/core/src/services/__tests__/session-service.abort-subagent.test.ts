/**
 * Tests for SessionServiceImpl — abort-triggered sub-agent interrupt.
 *
 * When the turn AbortSignal fires and the defensive short-circuit in send()
 * runs, it must call `subAgent.interruptAllForSession(sessionId)` so that
 * in-flight sub-agent items transition to `interrupted` in the UI.
 *
 * Unit 7 (SubAgentRegistry.interruptAllForSession wiring) from the
 * cancellation-propagation feature.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  SessionId,
  SubAgentRegistry,
} from "../../types/index.js";
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
 * Engine whose send() generator yields a model_message then hangs — the
 * signal must abort it externally (simulated by the test aborting before
 * the final event, which triggers the defensive short-circuit in session-service).
 *
 * The engine yields `model_message` → waits for the caller to abort →
 * finally yields `final`. The session-service's defensive `signal?.aborted`
 * check fires after the model_message and before the final, causing the
 * short-circuit path to run.
 */
function makeAbortableEngine(abortFn: () => void): Engine {
  const fakeHandle: EngineSession = {
    id: "fake-engine-session",
    send: vi.fn().mockImplementation(async function* () {
      // Yield one event so the loop runs at least once.
      const event: EngineEvent = {
        type: "model_message",
        content: "thinking...",
        partial: false,
      };
      yield event;
      // Abort the signal AFTER the first event is yielded. The session-service
      // loop processes the event, then checks signal?.aborted and short-circuits.
      abortFn();
      // Yield a final event — the session-service should NOT reach this.
      yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } };
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const engine: Engine = {
    id: "test-engine",
    kind: "looped" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockImplementation(async (opts: EngineOpenOptions) => {
      opts.onEngineSessionReady?.("fake-engine-session");
      return fakeHandle;
    }),
  } as unknown as Engine;

  return engine;
}

function makeService(
  db: ReturnType<typeof openDb>["db"],
  engine: Engine,
  subAgent?: SubAgentRegistry,
): SessionServiceImpl {
  const log = makeLog();

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([["teach", makeTeachMode()]]),
    toolDefinitions: [],
    toolServices: {
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for abort tests
    } as any,
    lockService: {
      isSet: async () => false,
      isUnlocked: async () => true,
      setLockCode: async () => {},
      unlock: async () => ({ ok: true }),
      lock: async () => {},
      clearLock: async () => {},
    },
    engineFactory: () => engine,
    secretStorage: inMemorySecretStorage(),
    ...(subAgent !== undefined && { subAgent }),
  };

  return new SessionServiceImpl(deps);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl — abort triggers subAgent.interruptAllForSession", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    getOrCreateDefaultStudentId(db);
  });

  it("calls interruptAllForSession with the session id when the signal aborts", async () => {
    const ac = new AbortController();

    const interruptSpy = vi.fn();
    const fakeSubAgent: SubAgentRegistry = {
      start: vi.fn(),
      list: vi.fn(() => []),
      subscribe: vi.fn(() => () => {}),
      interruptAllForSession: interruptSpy,
    };

    const engine = makeAbortableEngine(() => ac.abort());
    const svc = makeService(db, engine, fakeSubAgent);

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId as SessionId;

    const events: EngineEvent[] = [];
    for await (const ev of svc.send(sessionId, "hello", ac.signal)) {
      events.push(ev);
    }

    // The defensive short-circuit should have fired — we expect an interrupted event.
    const interruptedEvent = events.find((e) => e.type === "interrupted");
    expect(interruptedEvent).toBeDefined();

    // interruptAllForSession must be called with the session id.
    expect(interruptSpy).toHaveBeenCalledOnce();
    expect(interruptSpy).toHaveBeenCalledWith(sessionId);
  });

  it("does not call interruptAllForSession when no subAgent is wired (optional dep)", async () => {
    const ac = new AbortController();
    // No subAgent wired — should not throw.
    const engine = makeAbortableEngine(() => ac.abort());
    const svc = makeService(db, engine);

    const handle = await svc.start({ modeId: "teach" });
    const sessionId = handle.sessionId as SessionId;

    const events: EngineEvent[] = [];
    // Should complete without error even though subAgent is absent.
    for await (const ev of svc.send(sessionId, "hello", ac.signal)) {
      events.push(ev);
    }

    const interruptedEvent = events.find((e) => e.type === "interrupted");
    expect(interruptedEvent).toBeDefined();
  });
});
