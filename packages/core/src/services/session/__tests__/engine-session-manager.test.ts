/**
 * Isolation tests for EngineSessionManager.
 *
 * Exercises the three lifecycle branches of `acquire()` and the
 * `closeAll()` teardown path directly — without going through
 * SessionServiceImpl.  Coverage via session-service tests is transitive
 * only and misses the error-tolerance and swap-with-close-failure paths.
 */

import { sessions } from "@praxis/memory/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import {
  inMemorySecretStorage,
  noopDocumentScopes,
  noopLogger,
  recordingLogger,
} from "../../../../../../tests/helpers/mocks.js";
import { openDb } from "../../../db/index.js";
import type {
  Engine,
  EngineOpenOptions,
  EngineSession,
  SessionId,
  StudentId,
} from "../../../types/index.js";
import { getOrCreateDefaultStudentId } from "../../student.js";
import type { EngineSessionManagerDeps } from "../engine-session-manager.js";
import { EngineSessionManager } from "../engine-session-manager.js";

// ── test helpers ──────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

/** Minimal Mode that satisfies composeSystemPrompt (empty fragments list is fine). */
function makeMode(id = "teach") {
  return {
    id,
    label: "Teach",
    displayName: "teach",
    description: "Open tutoring session.",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [] as string[],
    promptFragments: [],
  };
}

/**
 * Build a fake EngineSession. The `closeSpy` is exposed so tests can assert
 * on how many times close() was called and whether it was awaited.
 */
function makeFakeHandle(
  opts: { closeRejects?: boolean } = {},
): { handle: EngineSession; closeSpy: ReturnType<typeof vi.fn> } {
  const closeSpy = opts.closeRejects
    ? vi.fn().mockRejectedValue(new Error("simulated close failure"))
    : vi.fn().mockResolvedValue(undefined);

  const handle: EngineSession = {
    id: "fake-engine-session",
    send: vi.fn().mockImplementation(async function* () {}),
    close: closeSpy,
  };

  return { handle, closeSpy };
}

/**
 * Build a fake Engine that returns the supplied handle on `open()`.
 * `openSpy` records every call so tests can assert on open-call count.
 */
function makeFakeEngine(
  handle: EngineSession,
): { engine: Engine; openSpy: ReturnType<typeof vi.fn> } {
  const openSpy = vi.fn().mockImplementation(async (opts: EngineOpenOptions) => {
    opts.onEngineSessionReady?.("fake-engine-session-id");
    return handle;
  });

  const engine = {
    id: "fake-engine",
    kind: "looped" as const,
    health: vi.fn().mockResolvedValue({ ok: true }),
    open: openSpy,
  } as unknown as Engine;

  return { engine, openSpy };
}

/** Minimal EngineSessionManagerDeps with an injected engineFactory. */
function makeDeps(
  db: ReturnType<typeof openDb>["db"],
  engineFactory: EngineSessionManagerDeps["engineFactory"],
  log: EngineSessionManagerDeps["log"] = noopLogger(),
): EngineSessionManagerDeps {
  return {
    db,
    log,
    secretStorage: inMemorySecretStorage(),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: minimal test stub — only documentScopes.listForScope is exercised
    toolServices: { documentScopes: noopDocumentScopes() } as any,
    indexerOrchestrator: undefined,
    activity: undefined,
    subAgent: undefined,
    promptCustomization: undefined,
    engineFactory,
  };
}

/**
 * Insert a minimal sessions row so EngineSessionManager.openActive() can
 * resolve (it queries the sessions table for resumeEngineSessionId).
 */
function insertSession(
  db: ReturnType<typeof openDb>["db"],
  sessionId: string,
  studentId: StudentId,
  engineId = "test-engine",
): void {
  db.insert(sessions)
    .values({
      id: sessionId,
      studentId,
      modeId: "teach",
      engineId,
      startedAt: new Date(),
    })
    .run();
}

// ── describe blocks ───────────────────────────────────────────────────────────

describe("EngineSessionManager.acquire", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: StudentId;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("returns the existing entry when called twice with the same engineId", async () => {
    const sessionId = "session-acquire-idempotent" as SessionId;
    insertSession(db, sessionId, studentId, "eng-A");

    const { handle } = makeFakeHandle();
    let openCallCount = 0;
    const factory = () => {
      const { engine } = makeFakeEngine(handle);
      // Override open to track calls across factory invocations.
      const original = engine.open.bind(engine);
      // biome-ignore lint/suspicious/noExplicitAny: test-only spy wrapper
      (engine as any).open = vi.fn().mockImplementation((opts: EngineOpenOptions) => {
        openCallCount++;
        return original(opts);
      });
      return engine;
    };

    const manager = new EngineSessionManager(makeDeps(db, factory));
    const mode = makeMode();
    const acquireArgs = {
      sessionId,
      currentEngineId: "eng-A",
      mode,
      studentId,
    };

    const first = await manager.acquire(acquireArgs);
    const second = await manager.acquire(acquireArgs);

    // Same object reference — no new open was issued.
    expect(first).toBe(second);
    // Engine was opened exactly once.
    expect(openCallCount).toBe(1);
  });

  it("closes the old session and opens a new one when engineId differs", async () => {
    const sessionId = "session-acquire-swap" as SessionId;
    insertSession(db, sessionId, studentId, "eng-A");

    // First handle — used for engineId "eng-A"
    const { handle: handleA, closeSpy: closeSpyA } = makeFakeHandle();
    // Second handle — used for engineId "eng-B"
    const { handle: handleB } = makeFakeHandle();

    // Factory alternates between handleA and handleB on successive calls.
    let callIndex = 0;
    const handles = [handleA, handleB];
    const factory = () => {
      const h = handles[callIndex % handles.length]!;
      callIndex++;
      const { engine } = makeFakeEngine(h);
      return engine;
    };

    const manager = new EngineSessionManager(makeDeps(db, factory));
    const mode = makeMode();

    await manager.acquire({ sessionId, currentEngineId: "eng-A", mode, studentId });

    // Swap to a different engine.
    const newEntry = await manager.acquire({
      sessionId,
      currentEngineId: "eng-B",
      mode,
      studentId,
    });

    // The old session's close() must have been called exactly once.
    expect(closeSpyA).toHaveBeenCalledTimes(1);
    // The new entry carries the new engineId.
    expect(newEntry.engineId).toBe("eng-B");
    // The manager now holds the new entry — get() returns it.
    expect(manager.get(sessionId)).toBe(newEntry);
  });

  it("survives an old-session close that rejects (logs warn, opens new entry)", async () => {
    const sessionId = "session-acquire-close-fail" as SessionId;
    insertSession(db, sessionId, studentId, "eng-A");

    // First handle's close() throws.
    const { handle: handleA, closeSpy: closeSpyA } = makeFakeHandle({ closeRejects: true });
    const { handle: handleB } = makeFakeHandle();

    let callIndex = 0;
    const handles = [handleA, handleB];
    const factory = () => {
      const h = handles[callIndex % handles.length]!;
      callIndex++;
      const { engine } = makeFakeEngine(h);
      return engine;
    };

    const log = recordingLogger();
    const manager = new EngineSessionManager(makeDeps(db, factory, log));
    const mode = makeMode();

    await manager.acquire({ sessionId, currentEngineId: "eng-A", mode, studentId });

    // Swap — should not throw despite the close() rejection.
    let newEntry: Awaited<ReturnType<typeof manager.acquire>> | undefined;
    await expect(
      manager
        .acquire({ sessionId, currentEngineId: "eng-B", mode, studentId })
        .then((e) => {
          newEntry = e;
        }),
    ).resolves.toBeUndefined();

    // close() was attempted.
    expect(closeSpyA).toHaveBeenCalledTimes(1);
    // A warn-level log entry was emitted for the failure.
    const warnEntries = log.records.filter((r) => r.level === "warn");
    expect(warnEntries.length).toBeGreaterThanOrEqual(1);
    expect(warnEntries.some((r) => r.message === "session.engine_swap.close_failed")).toBe(true);
    // The new entry is still opened correctly.
    expect(newEntry).toBeDefined();
    expect(newEntry!.engineId).toBe("eng-B");
  });
});

describe("EngineSessionManager.closeAll", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: StudentId;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("closes every active entry and clears the map", async () => {
    const sessionIds = [
      "session-close-all-1" as SessionId,
      "session-close-all-2" as SessionId,
      "session-close-all-3" as SessionId,
    ];

    for (const sid of sessionIds) {
      insertSession(db, sid, studentId, "eng-multi");
    }

    // Each call to the factory produces a fresh handle with its own closeSpy.
    const closeSpies: ReturnType<typeof vi.fn>[] = [];
    const factory = () => {
      const { handle, closeSpy } = makeFakeHandle();
      closeSpies.push(closeSpy);
      const { engine } = makeFakeEngine(handle);
      return engine;
    };

    const manager = new EngineSessionManager(makeDeps(db, factory));
    const mode = makeMode();

    // Open three distinct sessions via openActive.
    for (const sid of sessionIds) {
      await manager.openActive({
        sessionId: sid,
        engineId: "eng-multi",
        mode,
        studentId,
        priorTurns: [],
      });
    }

    // Verify they're all tracked.
    for (const sid of sessionIds) {
      expect(manager.get(sid)).toBeDefined();
    }

    await manager.closeAll();

    // Every handle must have been closed.
    expect(closeSpies).toHaveLength(sessionIds.length);
    for (const spy of closeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }

    // The map is empty — no entry survives closeAll.
    for (const sid of sessionIds) {
      expect(manager.get(sid)).toBeUndefined();
    }
  });
});
