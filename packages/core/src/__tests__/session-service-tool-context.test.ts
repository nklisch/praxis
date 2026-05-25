/**
 * Tests for questionConstraints threading through ToolContext.
 *
 * story: feature-mode-aware-question-constraints-step-2-toolcontext-threading
 *
 * Three paths are verified without spinning up a full SessionServiceImpl:
 *
 *   A) Resolver unit tests — resolveQuestionConstraints() in isolation.
 *      Fast, no DB, no engine.
 *
 *   B) EngineSessionManager integration — openActive() threads resolved
 *      constraints into the ToolContext that ends up on the InProcessToolRegistry.
 *      Uses a capturing engine factory to inspect what was passed to engine.open().
 *      Exercises defaults, merged overrides, and missing-override paths.
 */

import { FALLBACK_QUESTION_CONSTRAINTS, resolveQuestionConstraints } from "@praxis/curriculum";
import { sessions } from "@praxis/memory/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import {
  inMemorySecretStorage,
  noopDocumentScopes,
  noopLogger,
} from "../../../../tests/helpers/mocks.js";
import { openDb } from "../db/index.js";
import type { EngineSessionManagerDeps } from "../services/session/engine-session-manager.js";
import { EngineSessionManager } from "../services/session/engine-session-manager.js";
import { getOrCreateDefaultStudentId } from "../services/student.js";
import type {
  Engine,
  EngineOpenOptions,
  EngineSession,
  Mode,
  SessionId,
  StudentId,
  ToolRegistry,
} from "../types/index.js";

// ── shared test helpers ────────────────────────────────────────────────────────

const dbCtx = useTempDb();

function makeMode(id: string, questionConstraintsOverride?: Mode["questionConstraints"]): Mode {
  return {
    id,
    label: id,
    displayName: id,
    description: "",
    requiredRole: "student",
    uiSurface: "chat",
    toolNames: [],
    promptFragments: [],
    ...(questionConstraintsOverride !== undefined && {
      questionConstraints: questionConstraintsOverride,
    }),
  };
}

function makeFakeHandle(): EngineSession {
  return {
    id: "fake-engine-session",
    send: vi.fn().mockImplementation(async function* () {}),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(
  db: ReturnType<typeof openDb>["db"],
  engineFactory: EngineSessionManagerDeps["engineFactory"],
): EngineSessionManagerDeps {
  return {
    db,
    log: noopLogger(),
    secretStorage: inMemorySecretStorage(),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub — only documentScopes.listForScope is exercised
    toolServices: { documentScopes: noopDocumentScopes() } as any,
    indexerOrchestrator: undefined,
    activity: undefined,
    subAgent: undefined,
    promptCustomization: undefined,
    engineFactory,
  };
}

function insertSession(
  db: ReturnType<typeof openDb>["db"],
  sessionId: string,
  studentId: StudentId,
  modeId: string,
): void {
  db.insert(sessions)
    .values({
      id: sessionId,
      studentId,
      modeId,
      engineId: "test-engine",
      startedAt: new Date(),
    })
    .run();
}

/**
 * Build a capturing engine factory. The tools registry passed to engine.open()
 * is stashed in `captured.tools` so tests can call dispatch() on it.
 *
 * We capture the `ToolRegistry` (the `tools` argument to engine.open()) because
 * InProcessToolRegistry holds the ToolContext internally and exposes it via
 * dispatch(). We invoke a sentinel tool that returns the context so we can
 * inspect questionConstraints without poking private fields.
 */
function makeCapturingFactory(captured: {
  tools?: ToolRegistry;
}): EngineSessionManagerDeps["engineFactory"] {
  return () => {
    const handle = makeFakeHandle();
    const openSpy = vi.fn().mockImplementation(async (opts: EngineOpenOptions) => {
      captured.tools = opts.tools;
      opts.onEngineSessionReady?.("fake-engine-session-id");
      return handle;
    });
    return {
      id: "fake-engine",
      kind: "looped" as const,
      health: vi.fn().mockResolvedValue({ ok: true }),
      open: openSpy,
    } as unknown as Engine;
  };
}

// ── Path A: resolveQuestionConstraints unit tests ──────────────────────────────

describe("resolveQuestionConstraints — unit", () => {
  it("returns teach defaults for teach mode with no override", () => {
    const result = resolveQuestionConstraints("teach", undefined);
    // Use the expected concrete shape rather than indexing the Record directly
    // (noUncheckedIndexedAccess: Record<string,T> returns T | undefined).
    expect(result).toEqual({
      promptMaxWords: 30,
      choiceMaxWords: 10,
      choiceCount: 4,
      multiSelectCap: 4,
    });
  });

  it("returns quiz defaults for quiz mode with no override", () => {
    const result = resolveQuestionConstraints("quiz", undefined);
    expect(result).toEqual({
      promptMaxWords: 60,
      choiceMaxWords: 25,
      choiceCount: 5,
      multiSelectCap: 6,
    });
  });

  it("returns FALLBACK_QUESTION_CONSTRAINTS for an unknown mode with no override", () => {
    const result = resolveQuestionConstraints("unknown-mode-xyz", undefined);
    expect(result).toEqual(FALLBACK_QUESTION_CONSTRAINTS);
  });

  it("merges a partial override on top of teach defaults", () => {
    const result = resolveQuestionConstraints("teach", { choiceCount: 3 });
    // teach defaults: { promptMaxWords: 30, choiceMaxWords: 10, choiceCount: 4, multiSelectCap: 4 }
    // override replaces choiceCount only.
    expect(result).toEqual({
      promptMaxWords: 30,
      choiceMaxWords: 10,
      choiceCount: 3,
      multiSelectCap: 4,
    });
  });

  it("honours all four fields when a full override is supplied", () => {
    const full = { promptMaxWords: 10, choiceMaxWords: 5, choiceCount: 2, multiSelectCap: 3 };
    const result = resolveQuestionConstraints("teach", full);
    expect(result).toEqual(full);
  });
});

// ── Path B: EngineSessionManager.openActive threads questionConstraints ────────

describe("EngineSessionManager.openActive — questionConstraints in ToolContext", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: StudentId;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  /**
   * Open a session via EngineSessionManager and return the questionConstraints
   * field that was present on the ToolContext at session-open time.
   *
   * Strategy: InProcessToolRegistry stores ToolContext internally. We add a
   * zero-arg sentinel tool definition that returns ctx.questionConstraints;
   * after openActive() we dispatch it via the captured registry.
   */
  async function openAndGetConstraints(
    sessionId: string,
    mode: Mode,
  ): Promise<Required<import("../types/index.js").QuestionConstraints> | undefined> {
    insertSession(db, sessionId, studentId, mode.id);

    const captured: { tools?: ToolRegistry } = {};
    const factory = makeCapturingFactory(captured);

    // We need to inject a sentinel tool into toolDefinitions so we can round-trip
    // questionConstraints out of the registry via dispatch. Use a lazy approach:
    // after openActive, call setContextField-free inspection by dispatching.
    // However, InProcessToolRegistry requires tools to be registered up-front.
    // We thread a sentinel tool through deps.toolDefinitions.
    let capturedConstraints: Required<import("../types/index.js").QuestionConstraints> | undefined;

    const sentinelTool = {
      name: "test.get_constraints",
      description: "Returns questionConstraints from ToolContext.",
      input: (await import("zod")).z.object({}),
      output: (await import("zod")).z.unknown(),
      tier: "deterministic" as const,
      effects: [] as const,
      handler: async (
        _args: Record<string, never>,
        ctx: import("../types/index.js").ToolContext,
      ) => {
        capturedConstraints = ctx.questionConstraints;
        return { ok: true };
      },
    };

    const deps = makeDeps(db, factory);
    // biome-ignore lint/suspicious/noExplicitAny: inject sentinel into the read-only array
    (deps as any).toolDefinitions = [sentinelTool];

    const manager = new EngineSessionManager(deps);
    await manager.openActive({
      sessionId: sessionId as SessionId,
      engineId: "test-engine",
      mode,
      studentId,
      priorTurns: [],
    });

    // Dispatch the sentinel via the captured registry.
    if (!captured.tools) throw new Error("engine.open was not called — registry not captured");
    await captured.tools.dispatch("test.get_constraints", {});

    return capturedConstraints;
  }

  it("ToolContext has teach defaults when mode has no questionConstraints override", async () => {
    const constraints = await openAndGetConstraints("session-constraints-teach", makeMode("teach"));
    // teach defaults: { promptMaxWords: 30, choiceMaxWords: 10, choiceCount: 4, multiSelectCap: 4 }
    expect(constraints).toEqual({
      promptMaxWords: 30,
      choiceMaxWords: 10,
      choiceCount: 4,
      multiSelectCap: 4,
    });
  });

  it("ToolContext has merged result when mode has a partial questionConstraints override", async () => {
    const mode = makeMode("teach", { choiceCount: 3 });
    const constraints = await openAndGetConstraints("session-constraints-merged", mode);
    // teach defaults with choiceCount overridden to 3.
    expect(constraints).toEqual({
      promptMaxWords: 30,
      choiceMaxWords: 10,
      choiceCount: 3,
      multiSelectCap: 4,
    });
  });

  it("ToolContext has FALLBACK_QUESTION_CONSTRAINTS when mode id is unknown", async () => {
    // Use a mode id not in DEFAULT_QUESTION_CONSTRAINTS_BY_MODE.
    const mode = makeMode("custom-mode");
    const constraints = await openAndGetConstraints("session-constraints-fallback", mode);
    expect(constraints).toEqual(FALLBACK_QUESTION_CONSTRAINTS);
  });

  it("questionConstraints is always defined (never undefined) on ToolContext", async () => {
    const constraints = await openAndGetConstraints(
      "session-constraints-defined",
      makeMode("quiz"),
    );
    expect(constraints).toBeDefined();
  });
});
