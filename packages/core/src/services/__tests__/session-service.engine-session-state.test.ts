/**
 * Tests for SessionServiceImpl engine session continuity (Unit 5d):
 *   - First open: passes neither resumeEngineSessionId nor priorTurns.
 *     After the open, the row has a state entry for the active engine.
 *   - Reopen same engine: passes resumeEngineSessionId; no priorTurns.
 *   - Reopen after engine swap: passes priorTurns; no resumeEngineSessionId.
 *   - Merging: two different engines accumulate both entries.
 */

import { sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../../tests/helpers/mocks.js";
import { writeEngineConfig } from "../../config/index.js";
import { openDb } from "../../db/index.js";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  SessionId,
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
    description: "Open tutoring session.",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

interface FakeEngineCall {
  openOpts: EngineOpenOptions;
}

/**
 * Build a fake engine that records every `open()` call's options.
 * The `onEngineSessionReady` callback fires with `fakeEngineSessionId`
 * during open(), simulating the real adapter behavior.
 */
function makeFakeEngine(
  engineId: string,
  fakeEngineSessionId: string,
): { engine: Engine; calls: FakeEngineCall[] } {
  const calls: FakeEngineCall[] = [];

  const fakeHandle: EngineSession = {
    id: fakeEngineSessionId,
    send: vi.fn().mockImplementation(async function* () {
      const events: EngineEvent[] = [
        { type: "model_message", content: "ok", partial: false },
        { type: "final", usage: { inputTokens: 1, outputTokens: 1 } },
      ];
      for (const ev of events) yield ev;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const engine: Engine = {
    id: engineId,
    kind: "looped" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockImplementation(async (opts: EngineOpenOptions) => {
      calls.push({ openOpts: opts });
      // Fire the callback synchronously during open() like the real adapter would.
      opts.onEngineSessionReady?.(fakeEngineSessionId);
      return fakeHandle;
    }),
  } as unknown as Engine;

  return { engine, calls };
}

function makeService(db: ReturnType<typeof openDb>["db"], engine: Engine): SessionServiceImpl {
  const log = makeLog();

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([["teach", makeTeachMode()]]),
    toolDefinitions: [],
    toolServices: {
      courseDocuments: { listForCourse: vi.fn().mockResolvedValue([]) },
      // biome-ignore lint/suspicious/noExplicitAny: minimal test stub — only courseDocuments is exercised by these tests
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
  };

  return new SessionServiceImpl(deps);
}

async function startAndSendOneTurn(svc: SessionServiceImpl): Promise<SessionId> {
  const handle = await svc.start({ modeId: "teach" });
  const sessionId = handle.sessionId;
  // Drain the first turn so the engine session is opened and the callback fires.
  const gen = svc.send(sessionId, "hello");
  for await (const _ of gen) {
    // no-op
  }
  return sessionId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl engine session continuity", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    // Seed the default student so start() can find them.
    getOrCreateDefaultStudentId(db);
  });

  it("first open: passes neither resumeEngineSessionId nor priorTurns; records state on ready", async () => {
    const { engine, calls } = makeFakeEngine("claude-code", "cli-session-001");
    const svc = makeService(db, engine);

    const sessionId = await startAndSendOneTurn(svc);

    // First open should pass neither resume nor priorTurns
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    if (!firstCall) throw new Error("expected one engine open call");
    const openOpts = firstCall.openOpts;
    expect(openOpts.resumeEngineSessionId).toBeUndefined();
    expect(openOpts.priorTurns ?? []).toHaveLength(0);

    // State should be recorded in the DB
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.engineSessionStateJson).toBeDefined();
    expect(row?.engineSessionStateJson?.["claude-code"]?.engineSessionId).toBe("cli-session-001");
  });

  it("reopen same engine: passes resumeEngineSessionId; passes no priorTurns", async () => {
    const { engine: engine1, calls: calls1 } = makeFakeEngine("claude-code", "cli-session-A");
    const svc1 = makeService(db, engine1);
    const sessionId = await startAndSendOneTurn(svc1);
    // svc1 is abandoned (simulates process restart) — the Praxis session row
    // stays active (endedAt is null) so svc2 can send to it.

    // Reopen with the same engineId — config still defaults to "claude-code".
    // svc2 starts with an empty activeSessions map so openActive is called.
    const { engine: engine2, calls: calls2 } = makeFakeEngine("claude-code", "cli-session-A2");
    const svc2 = makeService(db, engine2);

    const gen = svc2.send(sessionId, "continue");
    for await (const _ of gen) {
      // no-op
    }

    expect(calls1).toHaveLength(1);
    expect(calls2).toHaveLength(1);
    const reopenCall = calls2[0];
    if (!reopenCall) throw new Error("expected one reopen call");
    const reopenOpts = reopenCall.openOpts;
    // Must use native resume
    expect(reopenOpts.resumeEngineSessionId).toBe("cli-session-A");
    // Must NOT pass priorTurns (text-splice skipped)
    expect(reopenOpts.priorTurns).toBeUndefined();
  });

  it("reopen after engine swap: passes priorTurns from episodic; passes no resumeEngineSessionId", async () => {
    // Start with the default engine ("claude-code")
    const { engine: ccEngine } = makeFakeEngine("claude-code", "cli-session-B");
    const svc1 = makeService(db, ccEngine);
    const sessionId = await startAndSendOneTurn(svc1);
    // svc1 is abandoned (simulates process restart / engine swap).

    // Swap the stored engine config to "codex" so readEngineConfig returns it.
    writeEngineConfig(db, inMemorySecretStorage(), { engineId: "codex" });

    // svc2 uses a fresh activeSessions map; it will call openActive with engineId="codex".
    const { engine: codexEngine, calls: codexCalls } = makeFakeEngine("codex", "codex-session-B");
    const svc2 = makeService(db, codexEngine);

    const gen = svc2.send(sessionId, "continue with codex");
    for await (const _ of gen) {
      // no-op
    }

    expect(codexCalls).toHaveLength(1);
    const swapCall = codexCalls[0];
    if (!swapCall) throw new Error("expected one swap call");
    const swapOpts = swapCall.openOpts;
    // No native resume — engine changed, so no state for "codex" yet
    expect(swapOpts.resumeEngineSessionId).toBeUndefined();
    // Should have priorTurns from the episodic log (at least the user message from turn 1)
    expect(swapOpts.priorTurns).toBeDefined();
  });

  it("merging state: opens for two different engines accumulate both entries", async () => {
    // Start with the default engine ("claude-code")
    const { engine: engine1 } = makeFakeEngine("claude-code", "cli-session-C");
    const svc1 = makeService(db, engine1);
    const sessionId = await startAndSendOneTurn(svc1);
    // svc1 abandoned (simulates process restart).

    // Switch config to "codex" so the second open uses a different engine.
    writeEngineConfig(db, inMemorySecretStorage(), { engineId: "codex" });

    const { engine: engine2 } = makeFakeEngine("codex", "codex-session-C");
    const svc2 = makeService(db, engine2);
    const gen = svc2.send(sessionId, "hello from codex");
    for await (const _ of gen) {
      // no-op
    }

    // Both engine state entries must be present in the sessions row.
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.engineSessionStateJson?.["claude-code"]?.engineSessionId).toBe("cli-session-C");
    expect(row?.engineSessionStateJson?.codex?.engineSessionId).toBe("codex-session-C");
  });
});
