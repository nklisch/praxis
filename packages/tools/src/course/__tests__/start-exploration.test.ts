/**
 * Tests for the course.start_exploration tool handler.
 *
 * Focuses on the sub-agent registration branch:
 *   - When ctx.callId is defined, subAgent.start() is called.
 *   - When ctx.callId is absent (undefined), subAgent.start() must NOT be called.
 *
 * Uses a real BootstrapServiceImpl with an in-memory temp DB and an inline
 * scripted engine — the same approach used by the explorer unit tests in
 * packages/curriculum/src/bootstrap/__tests__/explorer.test.ts.
 */

import { openDb } from "@praxis/core/db";
import { BootstrapServiceImpl } from "@praxis/core/services";
import type {
  Engine,
  EngineEvent,
  Logger,
  SubAgentHandle,
  SubAgentItem,
  SubAgentListener,
  SubAgentRegistry,
  SubAgentStartInput,
  ToolRegistry,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { makeEmptyPedagogyPackService } from "@praxis/curriculum/pedagogy";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { startExplorationTool } from "../start-exploration.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_LOG: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const MOCK_COURSE_DOCUMENTS = {
  listForCourse: vi.fn().mockResolvedValue([]),
  listForCourseDetailed: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({ attached: true }),
  detach: vi.fn().mockResolvedValue({ detached: true }),
  attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
};

function makeBootstrapService(db: ReturnType<typeof openDb>["db"]) {
  return new BootstrapServiceImpl({
    db,
    log: MOCK_LOG,
    engineResolver: () => {
      throw new Error("engineResolver not used in handler unit tests");
    },
    courseDocuments: MOCK_COURSE_DOCUMENTS,
    sweepIntervalMs: 9_999_999,
  });
}

/**
 * Minimal spy SubAgentRegistry. Tracks whether `start()` was called and
 * returns a no-op handle when it is (so the explorer can call finish() etc.
 * without errors).
 */
function makeSpySubAgentRegistry() {
  const startSpy = vi.fn().mockImplementation(
    (input: SubAgentStartInput): SubAgentHandle => ({
      parentCallId: input.parentCallId,
      stepStarted: vi.fn(),
      stepSettled: vi.fn(),
      setLabel: vi.fn(),
      finish: vi.fn(),
    }),
  ) as unknown as SubAgentRegistry["start"] & ReturnType<typeof vi.fn>;

  const registry: SubAgentRegistry = {
    start: startSpy,
    list: (): readonly SubAgentItem[] => [],
    subscribe:
      (_listener: SubAgentListener): (() => void) =>
      () => {},
  };

  return { registry, startSpy };
}

/**
 * Minimal inline engine that drives a single draft_init call then stops.
 * Same pattern as the inline engines in the explorer tests.
 */
function makeMinimalScriptedEngine(): Engine {
  return {
    id: "scripted-minimal",
    kind: "looped" as const,
    async open(opts: { tools: ToolRegistry; maxSteps?: number }) {
      const { tools } = opts;
      return {
        id: "scripted-session",
        send(_msg: string): AsyncIterable<EngineEvent> {
          return {
            [Symbol.asyncIterator]: async function* () {
              const callId = "call-draft-init-test";
              yield {
                type: "tool_call" as const,
                toolName: "course.draft_init",
                args: {
                  courseTitle: "Algebra 1",
                  subject: "math.algebra-1",
                  gradeLevel: "9-12",
                  documentIds: ["doc-test"],
                },
                callId,
              };
              const result = await tools.dispatch("course.draft_init", {
                courseTitle: "Algebra 1",
                subject: "math.algebra-1",
                gradeLevel: "9-12",
                documentIds: ["doc-test"],
              });
              yield { type: "tool_result" as const, callId, result };
              yield { type: "final" as const, usage: { inputTokens: 0, outputTokens: 0 } };
            },
          };
        },
        close: async () => {},
      };
    },
    async health() {
      return {
        ok: true,
        capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 0 },
      };
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("course.start_exploration handler — sub-agent registration guard", () => {
  const dbCtx = useTempDb();

  it("does not call subAgent.start() when ctx.callId is absent", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);
    const engine = makeMinimalScriptedEngine();
    const { registry, startSpy } = makeSpySubAgentRegistry();

    // makeToolContext does not set callId — it will be absent (undefined).
    const ctx = makeToolContext({
      sessionId: "session-no-callid-test",
      services: {
        bootstrap,
        subAgent: registry,
        courseDocuments: MOCK_COURSE_DOCUMENTS,
        pedagogyPack: makeEmptyPedagogyPackService(),
        engineResolver: () => engine,
        bootstrapConfigResolver: () => ({ maxSteps: 200 }),
      },
      log: MOCK_LOG,
    });

    // Confirm callId is absent so the test invariant is clear.
    expect(ctx.callId).toBeUndefined();

    const result = await startExplorationTool.handler(
      {
        documentIds: ["doc-test"],
        courseTitle: "Algebra 1",
        subject: "math.algebra-1",
        gradeLevel: "9-12",
      },
      ctx,
    );

    // Sub-agent registry must not have been called at all.
    expect(startSpy).not.toHaveBeenCalled();

    // Explorer should still complete its work — draft was created.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.draftId).toBe("string");
      expect(result.stepsUsed).toBeGreaterThan(0);
    }

    bootstrap.shutdown();
  });

  it("calls subAgent.start() when ctx.callId is present", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);
    const engine = makeMinimalScriptedEngine();
    const { registry, startSpy } = makeSpySubAgentRegistry();

    const ctx = {
      ...makeToolContext({
        sessionId: "session-with-callid-test",
        services: {
          bootstrap,
          subAgent: registry,
          courseDocuments: MOCK_COURSE_DOCUMENTS,
          pedagogyPack: makeEmptyPedagogyPackService(),
          engineResolver: () => engine,
          bootstrapConfigResolver: () => ({ maxSteps: 200 }),
        },
        log: MOCK_LOG,
      }),
      callId: "parent-call-id-abc",
    };

    const result = await startExplorationTool.handler(
      {
        documentIds: ["doc-test"],
        courseTitle: "Algebra 1",
        subject: "math.algebra-1",
        gradeLevel: "9-12",
      },
      ctx,
    );

    // Sub-agent registry must be called once with the parent callId.
    expect(startSpy).toHaveBeenCalledOnce();
    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({ parentCallId: "parent-call-id-abc" }),
    );

    expect(result.ok).toBe(true);

    bootstrap.shutdown();
  });
});
