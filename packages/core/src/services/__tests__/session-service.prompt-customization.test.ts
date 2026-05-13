/**
 * Session-service prompt-customization-layers integration tests.
 *
 * Verifies that:
 *   1. Stored fragment overrides are read and applied at session-compose time.
 *   2. Global fragment injects at user-global slot in all modes.
 *   3. Per-mode append injects at user-append slot for the correct mode only.
 *   4. Dynamic course-context overrides WIN over stored fragment overrides for
 *      the same fragment id (regression: stale user override must not mask live
 *      course state).
 *
 * Uses a real migrated SQLite via useTempDb(). The engine is faked so we can
 * inspect the systemPrompt passed to engine.open().
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import { promptOverrides } from "../../schema.js";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  PromptFragment,
} from "../../types/index.js";
import { PromptCustomizationServiceImpl } from "../prompt-customization-service.js";
import { SessionServiceImpl } from "../session-service.js";
import { getOrCreateDefaultStudentId } from "../student.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

// ── Helpers ───────────────────────────────────────────────────────────────────

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

interface FakeOpenCall {
  systemPrompt: string;
  opts: EngineOpenOptions;
}

function makeFakeEngine(): { engine: Engine; openCalls: FakeOpenCall[] } {
  const openCalls: FakeOpenCall[] = [];

  const fakeHandle: EngineSession = {
    id: "fake-engine-session",
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
    id: "fake-engine",
    kind: "looped" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockImplementation(async (opts: EngineOpenOptions) => {
      openCalls.push({ systemPrompt: opts.systemPrompt, opts });
      opts.onEngineSessionReady?.("fake-engine-session");
      return fakeHandle;
    }),
  } as unknown as Engine;

  return { engine, openCalls };
}

/**
 * A minimal teach mode with one customizable fragment. Keeps test prompts
 * predictable (no big real fragment templates).
 */
function makeMinimalTeachMode() {
  const preamble: PromptFragment = {
    id: "preamble.default",
    position: "preamble",
    customizable: true,
    template: "PREAMBLE",
  };
  const constraints: PromptFragment = {
    id: "constraints.default",
    position: "constraints",
    customizable: true,
    template: "CONSTRAINTS",
  };
  const courseContext: PromptFragment = {
    id: "context.course-state",
    position: "context",
    customizable: true,
    template: "COURSE_CONTEXT_PLACEHOLDER",
  };
  return {
    id: "teach",
    label: "Teach",
    displayName: "teach",
    description: "Tutoring session",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [preamble, constraints, courseContext],
  };
}

function makeService(
  db: ReturnType<typeof openDb>["db"],
  engine: Engine,
  promptCustomization?: PromptCustomizationServiceImpl,
): SessionServiceImpl {
  const log = makeLog();
  const teachMode = makeMinimalTeachMode();
  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([[teachMode.id, teachMode]]),
    toolDefinitions: [],
    toolServices: {
      documentScopes: { listForScope: vi.fn().mockResolvedValue([]) },
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub — only exercised by these tests
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
    promptCustomization,
    secretStorage: inMemorySecretStorage(),
  };
  return new SessionServiceImpl(deps);
}

async function openOneTurn(svc: SessionServiceImpl): Promise<void> {
  const handle = await svc.start({ modeId: "teach" });
  const gen = svc.send(handle.sessionId, "hello");
  for await (const _ of gen) {
    // drain
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("session-service prompt-customization compose path", () => {
  it("no promptCustomization — session opens without error (backward compat)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, undefined);
    await openOneTurn(svc);
    expect(openCalls).toHaveLength(1);
    const prompt = openCalls[0]?.systemPrompt ?? "";
    expect(prompt).toContain("PREAMBLE");
  });

  it("stored fragment override is applied at session-compose time", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    // Insert a stored override directly (simulating AuthoringService.customizePrompt).
    db.insert(promptOverrides)
      .values({
        modeId: "teach",
        fragmentId: "preamble.default",
        override: "CUSTOM_PREAMBLE_TEXT",
        updatedAt: new Date(),
      })
      .run();
    const promptCustomization = new PromptCustomizationServiceImpl({ db });
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, promptCustomization);
    await openOneTurn(svc);
    const prompt = openCalls[0]?.systemPrompt ?? "";
    expect(prompt).toContain("CUSTOM_PREAMBLE_TEXT");
    // The ORIGINAL preamble template ("PREAMBLE") must not appear verbatim as a
    // standalone token. We use startsWith to avoid false-positive from
    // "CUSTOM_PREAMBLE_TEXT" containing the substring "PREAMBLE".
    expect(prompt.startsWith("PREAMBLE")).toBe(false);
  });

  it("stored global fragment injects at user-global slot", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const promptCustomization = new PromptCustomizationServiceImpl({ db });
    promptCustomization.setGlobalFragment("GLOBAL_INSTRUCTION");
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, promptCustomization);
    await openOneTurn(svc);
    const prompt = openCalls[0]?.systemPrompt ?? "";
    expect(prompt).toContain("GLOBAL_INSTRUCTION");
    // Must appear after constraints and before postamble (our mode has no postamble,
    // so just verify it's in the prompt).
    const constraintsIdx = prompt.indexOf("CONSTRAINTS");
    const globalIdx = prompt.indexOf("GLOBAL_INSTRUCTION");
    expect(constraintsIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(constraintsIdx);
  });

  it("per-mode append injects for the correct mode only", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const promptCustomization = new PromptCustomizationServiceImpl({ db });
    promptCustomization.setModeAppend("teach", "TEACH_APPEND");
    // quiz mode append must NOT appear in teach session.
    promptCustomization.setModeAppend("quiz", "QUIZ_APPEND");
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, promptCustomization);
    await openOneTurn(svc);
    const prompt = openCalls[0]?.systemPrompt ?? "";
    expect(prompt).toContain("TEACH_APPEND");
    expect(prompt).not.toContain("QUIZ_APPEND");
  });

  it("global fragment and per-mode append both appear in correct order", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const promptCustomization = new PromptCustomizationServiceImpl({ db });
    promptCustomization.setGlobalFragment("GLOBAL_TEXT");
    promptCustomization.setModeAppend("teach", "APPEND_TEXT");
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, promptCustomization);
    await openOneTurn(svc);
    const prompt = openCalls[0]?.systemPrompt ?? "";
    const globalIdx = prompt.indexOf("GLOBAL_TEXT");
    const appendIdx = prompt.indexOf("APPEND_TEXT");
    expect(globalIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeLessThan(appendIdx);
  });

  it("REGRESSION: dynamic course-context wins over stored context.course-state override", async () => {
    /**
     * This is the critical precedence test. If a user stored an override for
     * `context.course-state`, the live dynamic course state (computed from the
     * actual course snapshot) must OVERWRITE it — the dynamic block runs after
     * seeding stored overrides, so the dynamic value wins.
     *
     * We simulate a course context by injecting a mock courseState service.
     * The stored override for `context.course-state` must NOT appear.
     */
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);

    // Store a stale user override for context.course-state.
    db.insert(promptOverrides)
      .values({
        modeId: "teach",
        fragmentId: "context.course-state",
        override: "STALE_OVERRIDE",
        updatedAt: new Date(),
      })
      .run();

    const promptCustomization = new PromptCustomizationServiceImpl({ db });
    const { engine, openCalls } = makeFakeEngine();

    const log = makeLog();
    const teachMode = makeMinimalTeachMode();
    // Wire a minimal courseState service that returns a fragment with the LIVE content.
    const deps: ServiceDeps = {
      db,
      log,
      modes: new Map([[teachMode.id, teachMode]]),
      toolDefinitions: [],
      toolServices: {
        documentScopes: { listForScope: vi.fn().mockResolvedValue([]) },
        artifacts: { newlyUnlockedCount: vi.fn().mockResolvedValue(0) },
        courseState: {
          // Return a minimal valid CourseStateSnapshot so composeCourseContextFragment works.
          read: vi.fn().mockResolvedValue({
            course: {
              id: "course-1",
              title: "Math 101",
              subject: "Mathematics",
              gradeLevel: "Grade 5",
            },
            lessons: [],
            currentLesson: null,
            conceptsByLesson: new Map(),
            conceptsById: new Map(),
            gates: [],
            activeGate: null,
            visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
          }),
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub for regression test
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
      promptCustomization,
      secretStorage: inMemorySecretStorage(),
    };
    const svc = new SessionServiceImpl(deps);

    // Open a session with a courseId so the dynamic course-context path runs.
    const handle = await svc.start({
      modeId: "teach",
      courseId: "course-1" as import("../../types/index.js").CourseId,
    });
    const gen = svc.send(handle.sessionId, "hello");
    for await (const _ of gen) {
      // drain
    }

    const prompt = openCalls[0]?.systemPrompt ?? "";
    // The STALE_OVERRIDE must NOT appear — the dynamic block overwrites it.
    expect(prompt).not.toContain("STALE_OVERRIDE");
  });
});
