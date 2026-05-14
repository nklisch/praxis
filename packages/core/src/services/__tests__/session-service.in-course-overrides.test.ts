/**
 * Integration tests for SessionServiceImpl's course-aware override path.
 *
 * Verifies the wiring landed by the course-aware mode-prompts foundation:
 *   1. A teach session with `courseId` set produces a system prompt that
 *      contains BOTH the rendered course-context fragment text AND the
 *      mode-specific in-course behavior addendum.
 *   2. A teach session with no `courseId` (or with no resolvable snapshot)
 *      produces only the mode's fallback templates — neither dynamic block
 *      appears.
 *   3. The behavior is identical for at least one other in-course mode
 *      (we exercise quiz here).
 *
 * Strategy: mirror `session-service.prompt-customization.test.ts` —
 * `useTempDb()` for isolated SQLite + a fake engine that captures the
 * `systemPrompt` passed to `engine.open()`. Wire a minimal `courseState`
 * fake so the dynamic block runs.
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type {
  CourseId,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  PromptFragment,
} from "../../types/index.js";
import { SessionServiceImpl } from "../session-service.js";
import { getOrCreateDefaultStudentId } from "../student.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

// ── Helpers ──────────────────────────────────────────────────────────────────

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
 * A minimal mode definition with the four fragments the override path touches:
 *   - preamble.default — non-course, non-customizable verification of the join
 *   - context.course-state — replaced when courseId resolves
 *   - context.behavior-in-course.<modeId> — replaced when in the in-course set
 *
 * Default templates use sentinel strings so we can assert exact replacement.
 */
function makeMinimalMode(modeId: string) {
  const preamble: PromptFragment = {
    id: "preamble.default",
    position: "preamble",
    customizable: false,
    template: "PREAMBLE",
  };
  const courseContext: PromptFragment = {
    id: "context.course-state",
    position: "context",
    customizable: true,
    template: "FALLBACK_COURSE_STATE",
  };
  const behaviorInCourse: PromptFragment = {
    id: `context.behavior-in-course.${modeId}`,
    position: "context",
    customizable: true,
    template: "FALLBACK_BEHAVIOR_IN_COURSE",
  };
  return {
    id: modeId,
    label: modeId,
    displayName: modeId,
    description: `${modeId} mode`,
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [preamble, courseContext, behaviorInCourse],
  };
}

function makeCourseStateFake() {
  return {
    read: vi.fn().mockResolvedValue({
      course: {
        id: "course-1",
        title: "Algebra Adventures",
        subject: "math",
        gradeLevel: "Grade 8",
      },
      lessons: [
        {
          id: "lesson-1",
          courseId: "course-1",
          title: "Variables and Constants",
          orderIndex: 0,
          conceptIds: [],
          references: [],
          suggestedStrategy: "worked-examples",
          estimatedMinutes: 30,
        },
      ],
      currentLesson: {
        id: "lesson-1",
        courseId: "course-1",
        title: "Variables and Constants",
        orderIndex: 0,
        conceptIds: [],
        references: [],
        suggestedStrategy: "worked-examples",
        estimatedMinutes: 30,
      },
      conceptsByLesson: new Map(),
      conceptsById: new Map(),
      gates: [],
      activeGate: null,
      visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
    }),
  };
}

function makeService(
  db: ReturnType<typeof openDb>["db"],
  engine: Engine,
  modeId: string,
  opts: { withCourseState: boolean },
): SessionServiceImpl {
  const log = makeLog();
  const mode = makeMinimalMode(modeId);
  const toolServices: Record<string, unknown> = {
    documentScopes: {
      listForScope: vi.fn().mockResolvedValue([]),
      // listForScopeDetailed is invoked via typeof === "function" guard;
      // returning [] keeps the documents listing absent so we can assert
      // on the lesson-title text instead.
      listForScopeDetailed: vi.fn().mockResolvedValue([]),
    },
    artifacts: { newlyUnlockedCount: vi.fn().mockResolvedValue(0) },
  };
  if (opts.withCourseState) {
    toolServices.courseState = makeCourseStateFake();
  }
  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([[mode.id, mode]]),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub — only exercised by these tests
    toolServices: toolServices as any,
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

async function openOneTurn(
  svc: SessionServiceImpl,
  modeId: string,
  courseId: CourseId | undefined,
): Promise<void> {
  const handle = await svc.start({
    modeId,
    ...(courseId !== undefined && { courseId }),
  });
  const gen = svc.send(handle.sessionId, "hello");
  for await (const _ of gen) {
    // drain
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SessionService course-aware override path", () => {
  it("teach with courseId — prompt contains both course-context and behavior-in-course addendum", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, "teach", { withCourseState: true });
    await openOneTurn(svc, "teach", "course-1" as CourseId);

    expect(openCalls).toHaveLength(1);
    const prompt = openCalls[0]?.systemPrompt ?? "";

    // composeCourseContextFragment text — names the course and lesson.
    expect(prompt).toContain("Algebra Adventures");
    expect(prompt).toContain("Variables and Constants");
    expect(prompt).toContain("Current lesson:");
    // composeInCourseBehaviorFragment teach branch — names lesson + has the
    // teach-specific verbs.
    expect(prompt).toContain("Course-aware behavior (teach)");
    expect(prompt).toContain("Variables and Constants");
    // Fallbacks must NOT appear — the dynamic blocks replaced them.
    expect(prompt).not.toContain("FALLBACK_COURSE_STATE");
    expect(prompt).not.toContain("FALLBACK_BEHAVIOR_IN_COURSE");
  });

  it("teach without courseId — prompt contains only the fallback templates", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const { engine, openCalls } = makeFakeEngine();
    // No courseState service registered AND no courseId passed — neither
    // branch runs.
    const svc = makeService(db, engine, "teach", { withCourseState: false });
    await openOneTurn(svc, "teach", undefined);

    expect(openCalls).toHaveLength(1);
    const prompt = openCalls[0]?.systemPrompt ?? "";
    expect(prompt).toContain("FALLBACK_COURSE_STATE");
    expect(prompt).toContain("FALLBACK_BEHAVIOR_IN_COURSE");
    // The dynamic content must NOT appear.
    expect(prompt).not.toContain("Algebra Adventures");
    expect(prompt).not.toContain("Course-aware behavior (teach)");
  });

  it("quiz with courseId — quiz-specific behavior addendum is injected", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    getOrCreateDefaultStudentId(db);
    const { engine, openCalls } = makeFakeEngine();
    const svc = makeService(db, engine, "quiz", { withCourseState: true });
    await openOneTurn(svc, "quiz", "course-1" as CourseId);

    const prompt = openCalls[0]?.systemPrompt ?? "";
    expect(prompt).toContain("Algebra Adventures");
    // Quiz branch text — distinct from teach.
    expect(prompt).toContain("Course-aware behavior (quiz)");
    expect(prompt).not.toContain("Course-aware behavior (teach)");
    expect(prompt).not.toContain("FALLBACK_BEHAVIOR_IN_COURSE");
  });
});
