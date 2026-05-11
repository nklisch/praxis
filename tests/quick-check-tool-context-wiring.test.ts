/**
 * Regression test for the structured-question card never appearing in
 * bootstrap and configure modes.
 *
 * Symptom (user-reported): the tutor calls `ask_student_question`, the card
 * never shows up in the chat, and the model immediately observes
 * `{ abandoned: true }` and replays the question as plain chat text.
 *
 * Root cause: `SessionServiceImpl.openActive` (packages/core/src/services/
 * session-service.ts) builds the `ToolContext.services` object by hand-copying
 * fields from `ServiceDeps.toolServices`, and the Phase 17 wire-up omitted
 * `quickCheck`. So inside `ask_student_question` (and the five
 * `quick_check.*` handlers), `ctx.services.quickCheck` is `undefined`. The
 * handler's `await ctx.services.quickCheck?.await(...)` returns `undefined`,
 * the `!answer` short-circuit fires, and the tool returns
 * `{ answers: [], abandoned: true }` without ever surfacing the card via
 * the QuickCheck event stream.
 *
 * This test wires `QuickCheckServiceImpl` into `toolServices.quickCheck`,
 * dispatches `ask_student_question` through the `ToolRegistry` that
 * `SessionServiceImpl` constructed for the engine, and asserts:
 *   1. A `pending` QuickCheck event reaches subscribers (so the renderer
 *      would have surfaced the card).
 *   2. After we resolve the check (simulating the student submitting),
 *      the tool handler returns the chosen answer — NOT `{ abandoned: true }`.
 */
import { openDb } from "@praxis/core/db";
import type { ServiceDeps } from "@praxis/core/services";
import { QuickCheckServiceImpl, SessionServiceImpl } from "@praxis/core/services";
import type {
  Engine,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  QuickCheckEvent,
  ToolRegistry,
} from "@praxis/core/types";
import { bootstrapMode } from "@praxis/curriculum/modes";
import { askStudentQuestionTool } from "@praxis/tools/dialog";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child(): typeof noopLogger {
    return this;
  },
};

/**
 * Engine stub that captures the `ToolRegistry` handed to `open()` so the
 * test can drive `dispatch()` directly — the same path the real adapter
 * takes from the MCP bridge — without running a full SDK loop.
 */
class CapturingEngine implements Engine {
  readonly id = "direct.anthropic";
  readonly kind = "single-shot" as const;
  capturedTools: ToolRegistry | null = null;

  async open(opts: EngineOpenOptions): Promise<EngineSession> {
    this.capturedTools = opts.tools;
    return {
      id: "capture-1",
      async *send(): AsyncIterable<never> {
        // No-op; the test drives dispatch directly via the captured registry.
      },
      async close(): Promise<void> {},
    };
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    };
  }
}

const dbHelper = useTempDb();

describe("QuickCheckService wiring into ToolContext", () => {
  it("ask_student_question reaches the QuickCheck service and returns a real answer", async () => {
    const { db: client } = openDb({ path: dbHelper.dbPath });

    const quickCheck = new QuickCheckServiceImpl();

    // Capture every event the service emits so we can assert `pending` fired.
    const events: QuickCheckEvent[] = [];
    quickCheck.subscribe((e) => events.push(e));

    // Simulate the renderer: as soon as a `pending` event arrives, "the
    // student submits" — resolve with a real structured-question answer.
    quickCheck.subscribe((e) => {
      if (e.kind === "pending") {
        quickCheck.resolve({
          callId: e.callId,
          answer: {
            kind: "structured-question",
            answers: [{ questionIndex: 0, selectedIndices: [1] }],
          },
        });
      }
    });

    const engine = new CapturingEngine();
    const modes = new Map([[bootstrapMode.id, bootstrapMode]]);

    // Minimum stub for toolServices. openActive only consults the fields it
    // copies into ToolContext.services; we deliberately wire `quickCheck` —
    // the field whose absence triggers the bug.
    /* biome-ignore-start lint/suspicious/noExplicitAny: partial test stub — only `quickCheck` is exercised */
    const toolServices = {
      sympy: {} as any,
      sandbox: {} as any,
      vectorStore: {} as any,
      ftsStore: {} as any,
      embeddings: {} as any,
      documents: {} as any,
      courseDocuments: { listForCourse: vi.fn().mockResolvedValue([]) } as any,
      quickCheck,
    } as unknown as ServiceDeps["toolServices"];
    /* biome-ignore-end lint/suspicious/noExplicitAny: partial test stub — only `quickCheck` is exercised */

    const svc = new SessionServiceImpl({
      db: client,
      log: noopLogger,
      modes,
      toolDefinitions: [askStudentQuestionTool],
      toolServices,
      // biome-ignore lint/suspicious/noExplicitAny: test stubs LockService through engineFactory path; not exercised here
      lockService: { isUnlocked: vi.fn().mockResolvedValue(true) } as any,
      engineFactory: () => engine,
    });

    // start() eagerly calls openActive(), which builds the ToolContext and
    // hands the resulting registry to engine.open().
    const handle = await svc.start({ modeId: bootstrapMode.id });
    expect(engine.capturedTools).not.toBeNull();

    // Drive dispatch through the SAME registry the engine adapter would use.
    const result = await engine.capturedTools!.dispatch("ask_student_question", {
      questions: [
        {
          header: "Path",
          prompt: "Which way do you want to go?",
          options: [{ label: "Canonical pack" }, { label: "Explore textbook" }, { label: "Both" }],
        },
      ],
    });

    await svc.end(handle.sessionId);

    // 1. The `pending` event must have reached subscribers — i.e. the
    //    renderer would have surfaced the card to the student.
    expect(events.some((e) => e.kind === "pending")).toBe(true);

    // 2. The handler must have round-tripped through QuickCheck and
    //    received the student's real answer — not the short-circuit
    //    abandoned result that the bug produced.
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = result.value as { answers: unknown[]; abandoned?: boolean };
      expect(value.abandoned).toBeUndefined();
      expect(value.answers).toEqual([{ questionIndex: 0, selectedIndices: [1] }]);
    }
  });
});
