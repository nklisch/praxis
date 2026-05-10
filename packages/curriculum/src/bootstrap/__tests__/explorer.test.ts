/**
 * Tests for runConceptExplorer.
 *
 * Uses ScriptedEngine to drive a real InProcessToolRegistry without any LLM
 * calls — tool dispatch is real (BootstrapServiceImpl), only the model
 * driving is fake.
 *
 * Exit policy under test:
 *   - If a draft was created, return `ok: true` regardless of how complete
 *     it is. The tutor decides whether to continue or confirm.
 *   - `exhaustedBudget` is set when stepsUsed hit the cap.
 *   - `ok: false` only when no draft exists (`no_draft_init`) or the engine
 *     hard-errored (`engine_error`).
 */

import { openDb } from "@praxis/core/db";
import { BootstrapServiceImpl } from "@praxis/core/services";
import type {
  BootstrapService,
  DocumentId,
  Logger,
  ToolContext,
  ToolDefinition,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { makeEmptyPedagogyPackService } from "../../pedagogy/pedagogy-pack-service.js";
import {
  draftAddConceptsTool,
  draftAddEdgesTool,
  draftAddLessonsTool,
  draftInitTool,
  showDraftTool,
} from "@praxis/tools/course";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { runConceptExplorer } from "../explorer.js";
import { ScriptedEngine } from "./helpers/scripted-engine.js";

const STUDENT_ID = brandId<"StudentId">("student-explorer-test");

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
      throw new Error("engineResolver not used in explorer tests");
    },
    courseDocuments: MOCK_COURSE_DOCUMENTS,
    sweepIntervalMs: 9999999,
  });
}

function makeBaseContext(
  bootstrap: BootstrapService,
): Omit<ToolContext, "courseId" | "courseDocumentIds"> {
  return {
    studentId: STUDENT_ID,
    sessionId: brandId<"SessionId">("session-explorer"),
    services: {
      bootstrap,
      // biome-ignore lint/suspicious/noExplicitAny: stub for unused services in explorer tests
      memory: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      artifacts: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      courseState: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      vectorStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      ftsStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      embeddings: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      documents: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      sandbox: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      sympy: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      assignments: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      packs: null as any,
      pedagogyPack: makeEmptyPedagogyPackService(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      lock: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      authoring: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      notes: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      flashcards: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      fsrsScheduler: null as any,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      engineResolver: null as any,
    },
    log: MOCK_LOG,
  };
}

const EXPLORER_TOOLS = [
  draftInitTool,
  draftAddConceptsTool,
  draftAddEdgesTool,
  draftAddLessonsTool,
  showDraftTool,
];

const DOC_IDS: DocumentId[] = [brandId<"DocumentId">("doc-1")];

// ─── success path — fresh draft ───────────────────────────────────────────────

describe("runConceptExplorer — fresh draft success path", () => {
  const dbCtx = useTempDb();

  it("returns ok:true with draftId and summary built from live state", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    const engine = new ScriptedEngine([
      {
        toolName: "course.draft_init",
        args: {
          courseTitle: "Algebra 1",
          subject: "math.algebra-1",
          gradeLevel: "9-12",
          documentIds: ["doc-1"],
        },
      },
      {
        toolName: "course.draft_add_concepts",
        args: {
          concepts: [
            { name: "Variables", description: "Symbols that represent numbers" },
            { name: "Equations", description: "Statements of equality between expressions" },
          ],
        },
      },
      {
        toolName: "course.draft_add_edges",
        args: {
          edges: [
            {
              fromName: "Variables",
              toName: "Equations",
              strength: 0.8,
              rationale: "Must know variables to write equations",
            },
          ],
        },
      },
      {
        toolName: "course.draft_add_lessons",
        args: {
          lessons: [
            {
              title: "Introduction to Variables",
              conceptNames: ["Variables"],
              references: [],
            },
            {
              title: "Writing Equations",
              conceptNames: ["Equations"],
              references: [],
            },
          ],
        },
      },
    ]);

    const result = await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Algebra 1",
      subject: "math.algebra-1",
      gradeLevel: "9-12",
      log: MOCK_LOG,
      maxSteps: 30,
    });

    expect(result.ok).toBe(true);
    expect(typeof result.draftId).toBe("string");
    expect(result.summary?.title).toBe("Algebra 1");
    expect(result.summary?.conceptCount).toBe(2);
    expect(result.summary?.lessonCount).toBe(2);
    expect(result.summary?.edgeCount).toBe(1);
    // 4 tool calls (init + concepts + edges + lessons), all batched.
    expect(result.stepsUsed).toBe(4);
    expect(result.exhaustedBudget).toBeUndefined();

    bootstrap.shutdown();
  });
});

// ─── exhaustedBudget ─────────────────────────────────────────────────────────

describe("runConceptExplorer — exhaustedBudget", () => {
  const dbCtx = useTempDb();

  it("returns ok:true with exhaustedBudget=true when stepsUsed hits the cap with a live draft", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    // 1 init + 4 concept-batch calls = 5 tool calls. Budget is 5.
    const steps = [
      {
        toolName: "course.draft_init",
        args: {
          courseTitle: "Algebra 1",
          subject: "math",
          gradeLevel: "9",
          documentIds: ["doc-1"],
        },
      },
    ];
    for (let i = 0; i < 4; i++) {
      steps.push({
        toolName: "course.draft_add_concepts",
        args: {
          concepts: [{ name: `Concept ${i}`, description: "desc" }],
          // biome-ignore lint/suspicious/noExplicitAny: scripted args type is loose
        } as any,
      });
    }

    const engine = new ScriptedEngine(steps);

    const result = await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
      log: MOCK_LOG,
      maxSteps: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.exhaustedBudget).toBe(true);
    expect(result.stepsUsed).toBe(5);
    expect(typeof result.draftId).toBe("string");
    expect(result.summary?.conceptCount).toBe(4);

    bootstrap.shutdown();
  });
});

// ─── early stop without finalize is success ──────────────────────────────────

describe("runConceptExplorer — early stop without finalize", () => {
  const dbCtx = useTempDb();

  it("returns ok:true when the engine simply stops; no exhaustedBudget if budget left", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    const engine = new ScriptedEngine([
      {
        toolName: "course.draft_init",
        args: {
          courseTitle: "Incomplete",
          subject: "test",
          gradeLevel: "1",
          documentIds: ["doc-1"],
        },
      },
      {
        toolName: "course.draft_add_concepts",
        args: { concepts: [{ name: "Test Concept", description: "desc" }] },
      },
    ]);

    const result = await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Incomplete",
      subject: "test",
      gradeLevel: "1",
      log: MOCK_LOG,
      maxSteps: 30,
    });

    expect(result.ok).toBe(true);
    expect(result.stepsUsed).toBe(2);
    expect(result.exhaustedBudget).toBeUndefined();
    expect(typeof result.draftId).toBe("string");
    expect(result.summary?.conceptCount).toBe(1);

    bootstrap.shutdown();
  });
});

// ─── continuation — pass existing draftId ────────────────────────────────────

describe("runConceptExplorer — continuation with existing draftId", () => {
  const dbCtx = useTempDb();

  it("skips draft_init and adds to the existing draft when draftId is supplied", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    // Seed a draft externally (as if a prior run had created it).
    const { draftId } = await bootstrap.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });
    await bootstrap.addConcept({ draftId, name: "Variables", description: "x" });

    // Continuation script: the model reads the prior state and adds more.
    const engine = new ScriptedEngine([
      // No draft_init — this is continuation.
      {
        toolName: "course.show_draft",
        args: { draftId },
      },
      {
        toolName: "course.draft_add_concepts",
        args: {
          concepts: [
            { name: "Equations", description: "y" },
            { name: "Inequalities", description: "z" },
          ],
        },
      },
    ]);

    const result = await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
      log: MOCK_LOG,
      maxSteps: 30,
      draftId,
    });

    expect(result.ok).toBe(true);
    expect(result.draftId).toBe(draftId);
    // 1 prior concept + 2 added in continuation = 3.
    expect(result.summary?.conceptCount).toBe(3);
    expect(result.stepsUsed).toBe(2);

    bootstrap.shutdown();
  });
});

// ─── no_draft_init ───────────────────────────────────────────────────────────

describe("runConceptExplorer — no draft created", () => {
  it("returns ok:false reason:no_draft_init when the model never calls draft_init", async () => {
    const dbCtx = useTempDb();
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    // No tool calls at all — empty script.
    const engine = new ScriptedEngine([]);

    const result = await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Empty",
      subject: "test",
      gradeLevel: "1",
      log: MOCK_LOG,
      maxSteps: 30,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_draft_init");
    expect(result.stepsUsed).toBe(0);
    expect(result.draftId).toBeUndefined();

    bootstrap.shutdown();
  });
});

// ─── engine_error ─────────────────────────────────────────────────────────────

describe("runConceptExplorer — engine_error", () => {
  it("returns ok:false reason:engine_error when session emits an error event", async () => {
    const errorEngine: import("@praxis/core/types").Engine = {
      id: "error-engine",
      kind: "looped" as const,
      open: async () => ({
        id: "err-session",
        send: (_msg: string): AsyncIterable<import("@praxis/core/types").EngineEvent> => ({
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: "error" as const,
              error: { code: "network_error", message: "connection refused", recoverable: false },
            };
          },
        }),
        close: async () => {},
      }),
      health: async () => ({
        ok: false,
        capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 0 },
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: stub context for engine_error test
    const baseContext = makeBaseContext(null as any);

    const result = await runConceptExplorer({
      engine: errorEngine,
      baseContext,
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Error Course",
      subject: "test",
      gradeLevel: "1",
      log: MOCK_LOG,
      maxSteps: 30,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("engine_error");
    expect(result.stepsUsed).toBe(0);
  });
});

// ─── tutor instructions threading ─────────────────────────────────────────────

describe("runConceptExplorer — tutor instructions", () => {
  it("surfaces the instructions verbatim in the initial message under a clear header", async () => {
    let capturedMessage: string | undefined;

    const recordingEngine: import("@praxis/core/types").Engine = {
      id: "recording",
      kind: "looped" as const,
      open: async () => ({
        id: "rec-session",
        send: (msg: string): AsyncIterable<import("@praxis/core/types").EngineEvent> => {
          capturedMessage = msg;
          return {
            [Symbol.asyncIterator]: async function* () {
              // No tool calls — just close the stream cleanly so the explorer
              // exits with reason: no_draft_init.
              yield {
                type: "final" as const,
                usage: { inputTokens: 0, outputTokens: 0 },
              };
            },
          };
        },
        close: async () => {},
      }),
      health: async () => ({
        ok: true,
        capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 0 },
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: bootstrap stub fine — the recording engine never dispatches
    const baseContext = makeBaseContext(null as any);

    const instructions =
      "Focus on Ch. R through Ch. 4 of Sullivan only. Skip trig and conics entirely. " +
      "Student has weak fractions — emphasize fraction operations early.";

    await runConceptExplorer({
      engine: recordingEngine,
      baseContext,
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Algebra 1",
      subject: "math.algebra-1",
      gradeLevel: "9-12",
      log: MOCK_LOG,
      maxSteps: 30,
      instructions,
    });

    expect(capturedMessage).toBeDefined();
    expect(capturedMessage).toContain("==== Tutor instructions ====");
    expect(capturedMessage).toContain(instructions);
    // Sanity: the structured fields still come through.
    expect(capturedMessage).toContain("Course title: Algebra 1");
    expect(capturedMessage).toContain("Tool-call budget: 30 steps");
  });

  it("omits the Tutor instructions block entirely when no instructions are provided", async () => {
    let capturedMessage: string | undefined;

    const recordingEngine: import("@praxis/core/types").Engine = {
      id: "recording",
      kind: "looped" as const,
      open: async () => ({
        id: "rec-session",
        send: (msg: string): AsyncIterable<import("@praxis/core/types").EngineEvent> => {
          capturedMessage = msg;
          return {
            [Symbol.asyncIterator]: async function* () {
              yield {
                type: "final" as const,
                usage: { inputTokens: 0, outputTokens: 0 },
              };
            },
          };
        },
        close: async () => {},
      }),
      health: async () => ({
        ok: true,
        capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 0 },
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: stub
    const baseContext = makeBaseContext(null as any);

    await runConceptExplorer({
      engine: recordingEngine,
      baseContext,
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
      log: MOCK_LOG,
      maxSteps: 30,
    });

    expect(capturedMessage).toBeDefined();
    expect(capturedMessage).not.toContain("Tutor instructions");
  });

  it("treats an all-whitespace instructions string as absent", async () => {
    let capturedMessage: string | undefined;

    const recordingEngine: import("@praxis/core/types").Engine = {
      id: "recording",
      kind: "looped" as const,
      open: async () => ({
        id: "rec-session",
        send: (msg: string): AsyncIterable<import("@praxis/core/types").EngineEvent> => {
          capturedMessage = msg;
          return {
            [Symbol.asyncIterator]: async function* () {
              yield {
                type: "final" as const,
                usage: { inputTokens: 0, outputTokens: 0 },
              };
            },
          };
        },
        close: async () => {},
      }),
      health: async () => ({
        ok: true,
        capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 0 },
      }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: stub
    const baseContext = makeBaseContext(null as any);

    await runConceptExplorer({
      engine: recordingEngine,
      baseContext,
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
      log: MOCK_LOG,
      maxSteps: 30,
      instructions: "   \n\t  ",
    });

    expect(capturedMessage).not.toContain("Tutor instructions");
  });
});

// ─── document scoping ────────────────────────────────────────────────────────

describe("runConceptExplorer — document scoping", () => {
  const dbCtx = useTempDb();

  it("pins ctx.courseDocumentIds to input.documentIds so retrieval auto-scopes", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    let capturedCourseDocumentIds: readonly string[] | undefined;
    let capturedHadDocId: boolean | undefined;

    // A test-only tool that just records the courseDocumentIds it sees on its
    // ToolContext, then returns ok. The scripted engine triggers it once.
    const recordCtxTool: ToolDefinition<typeof recordCtxInput, typeof recordCtxOutput> = {
      name: "test.record_ctx",
      description: "Test-only: record courseDocumentIds from ToolContext.",
      input: recordCtxInput,
      output: recordCtxOutput,
      tier: "deterministic",
      effects: ["none"],
      async handler(_args, ctx: ToolContext) {
        capturedCourseDocumentIds = ctx.courseDocumentIds;
        capturedHadDocId = ctx.courseDocumentIds !== undefined;
        return { ok: true };
      },
    };

    const engine = new ScriptedEngine([{ toolName: "test.record_ctx", args: {} }]);

    const docIds: DocumentId[] = [
      brandId<"DocumentId">("doc-sullivan"),
      brandId<"DocumentId">("doc-stewart"),
    ];

    await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: [recordCtxTool, ...EXPLORER_TOOLS],
      documentIds: docIds,
      courseTitle: "Algebra 1",
      subject: "math.algebra-1",
      gradeLevel: "9-12",
      log: MOCK_LOG,
      maxSteps: 5,
    });

    expect(capturedHadDocId).toBe(true);
    expect(capturedCourseDocumentIds).toEqual(["doc-sullivan", "doc-stewart"]);

    bootstrap.shutdown();
  });
});

const recordCtxInput = z.object({});
const recordCtxOutput = z.object({ ok: z.literal(true) });
