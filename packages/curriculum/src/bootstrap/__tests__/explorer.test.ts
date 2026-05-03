/**
 * Tests for runConceptExplorer — Phase 16.
 *
 * Uses ScriptedEngine to drive a real InProcessToolRegistry without any LLM calls.
 * Tool dispatch is real (BootstrapServiceImpl), only the model driving is fake.
 */

import { openDb } from "@praxis/core/db";
import { BootstrapServiceImpl } from "@praxis/core/services";
import type {
  BootstrapService,
  DocumentId,
  DraftIssue,
  Logger,
  ToolContext,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import {
  draftAddConceptTool,
  draftAddEdgeTool,
  draftAddLessonTool,
  draftFinalizeTool,
  draftInitTool,
} from "@praxis/tools/course";
import { describe, expect, it, vi } from "vitest";
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
      pedagogyPack: null,
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
  draftAddConceptTool,
  draftAddEdgeTool,
  draftAddLessonTool,
  draftFinalizeTool,
];

const DOC_IDS: DocumentId[] = [brandId<"DocumentId">("doc-1")];

// ─── success path ─────────────────────────────────────────────────────────────

describe("runConceptExplorer — success path", () => {
  const dbCtx = useTempDb();

  it("returns ok:true with draftId and summary when explorer finalizes correctly", async () => {
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
        toolName: "course.draft_add_concept",
        args: { name: "Variables", description: "Symbols that represent numbers" },
      },
      {
        toolName: "course.draft_add_concept",
        args: { name: "Equations", description: "Statements of equality between expressions" },
      },
      {
        toolName: "course.draft_add_edge",
        args: {
          fromName: "Variables",
          toName: "Equations",
          strength: 0.8,
          rationale: "Must know variables to write equations",
        },
      },
      {
        toolName: "course.draft_add_lesson",
        args: {
          title: "Introduction to Variables",
          conceptNames: ["Variables"],
          references: [],
        },
      },
      {
        toolName: "course.draft_add_lesson",
        args: {
          title: "Writing Equations",
          conceptNames: ["Equations"],
          references: [],
        },
      },
      {
        toolName: "course.draft_finalize",
        args: {},
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
    expect(result.stepsUsed).toBe(7);

    bootstrap.shutdown();
  });
});

// ─── max_steps_reached ────────────────────────────────────────────────────────

describe("runConceptExplorer — max_steps_reached", () => {
  const dbCtx = useTempDb();

  it("returns ok:false, reason:max_steps_reached when budget exhausted", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    // Many concept additions but never a finalize — budget exhausted.
    const steps = [];
    steps.push({
      toolName: "course.draft_init",
      args: {
        courseTitle: "Algebra 1",
        subject: "math",
        gradeLevel: "9",
        documentIds: ["doc-1"],
      },
    });
    // Add 4 more tool calls to reach exactly maxSteps=5 (1 init + 4 = 5).
    for (let i = 0; i < 4; i++) {
      steps.push({
        toolName: "course.draft_add_concept",
        args: { name: `Concept ${i}`, description: "desc" },
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
      maxSteps: 5, // tight budget
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("max_steps_reached");
    expect(result.stepsUsed).toBe(5);
    expect(typeof result.draftId).toBe("string"); // draft was created

    bootstrap.shutdown();
  });
});

// ─── validation_failed ────────────────────────────────────────────────────────

describe("runConceptExplorer — validation_failed", () => {
  const dbCtx = useTempDb();

  it("returns ok:false, reason:validation_failed when finalize returns issues", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    // Init draft but never add concepts or lessons — finalize will reject.
    const engine = new ScriptedEngine([
      {
        toolName: "course.draft_init",
        args: {
          courseTitle: "Empty Course",
          subject: "test",
          gradeLevel: "1",
          documentIds: ["doc-1"],
        },
      },
      {
        toolName: "course.draft_finalize",
        args: {},
      },
    ]);

    const result = await runConceptExplorer({
      engine,
      baseContext: makeBaseContext(bootstrap),
      toolDefinitions: EXPLORER_TOOLS,
      documentIds: DOC_IDS,
      courseTitle: "Empty Course",
      subject: "test",
      gradeLevel: "1",
      log: MOCK_LOG,
      maxSteps: 30,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("validation_failed");
    expect(Array.isArray(result.issues)).toBe(true);
    expect((result.issues as DraftIssue[]).length).toBeGreaterThan(0);
    expect(typeof result.draftId).toBe("string");

    bootstrap.shutdown();
  });
});

// ─── no_finalize_call ─────────────────────────────────────────────────────────

describe("runConceptExplorer — no_finalize_call", () => {
  const dbCtx = useTempDb();

  it("returns ok:false, reason:no_finalize_call when engine ends without finalizing", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const bootstrap = makeBootstrapService(db);

    // Init draft and add a concept but never finalize.
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
        toolName: "course.draft_add_concept",
        args: { name: "Test Concept", description: "desc" },
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
      maxSteps: 30, // high budget — won't be exhausted
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_finalize_call");
    // 2 tool calls, neither exhausted budget
    expect(result.stepsUsed).toBe(2);

    bootstrap.shutdown();
  });
});

// ─── engine_error ─────────────────────────────────────────────────────────────

describe("runConceptExplorer — engine_error", () => {
  it("returns ok:false, reason:engine_error when session emits an error event", async () => {
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
