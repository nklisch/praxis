/**
 * Integration tests: envelope wiring for praxis.artifacts.* invoke channels.
 *
 * Channels exercised:
 *   praxis.artifacts.courses          — no-payload getter; bare wrapEnvelope
 *   praxis.artifacts.progress         — no-payload getter; bare wrapEnvelope
 *   praxis.artifacts.course           — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.lessons          — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.gates            — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.gateView         — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.evaluateGates    — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.markGatesViewed  — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.newlyUnlockedCount — string (courseId); handleEnvelope + courseIdSchema
 *   praxis.artifacts.concepts         — string (courseId); handleEnvelope + courseIdSchema
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count target: 10-15 (1 no-payload success, 1 no-payload INTERNAL, 2 string-payload
 * success, 4 validation-failure paths across different channels, 2 INTERNAL error paths,
 * 1 path-leakage guard).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpyLogger } from "../../../../../tests/helpers/mocks.js";

// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.2",
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
    on: () => {},
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import AFTER mock is in place — Vitest hoists vi.mock() automatically.
import { registerIpcHandlers } from "../ipc-server.js";

type ArtifactsOverrides = {
  courses?: () => Promise<unknown>;
  course?: (id: unknown) => Promise<unknown>;
  lessons?: (id: unknown) => Promise<unknown>;
  gates?: (id: unknown) => Promise<unknown>;
  progress?: () => Promise<unknown>;
  gateView?: (opts: unknown) => Promise<unknown>;
  evaluateAndPersistGates?: (opts: unknown) => Promise<unknown>;
  markGatesViewed?: (opts: unknown) => Promise<unknown>;
  newlyUnlockedCount?: (opts: unknown) => Promise<unknown>;
  concepts?: (id: unknown) => Promise<unknown>;
};

function makeServices(artifactsOverrides: ArtifactsOverrides = {}) {
  const session = {
    active: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({ summary: "ended" }),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: vi.fn().mockResolvedValue({ id: "sess-child-1" }),
    notifySession: vi.fn().mockResolvedValue(undefined),
  };

  const lock = {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(true),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    isLocked: vi.fn().mockResolvedValue(false),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue(undefined),
    selectedEngine: vi.fn().mockResolvedValue("claude-code"),
    setSelectedEngine: vi.fn().mockResolvedValue(undefined),
    engineConfig: vi.fn().mockResolvedValue({}),
    revealApiKey: vi.fn().mockResolvedValue({}),
    setEngineConfig: vi.fn().mockResolvedValue(undefined),
    courseCreateConfig: vi.fn().mockResolvedValue({}),
    setCourseCreateConfig: vi.fn().mockResolvedValue(undefined),
    firstRunCompleted: vi.fn().mockResolvedValue(false),
    markFirstRunComplete: vi.fn().mockResolvedValue(undefined),
  };

  const documents = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    pageImage: vi.fn().mockResolvedValue(null),
  };

  const authoring = {
    setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
    getGlobalPrompt: vi.fn().mockResolvedValue(null),
    setModeAppend: vi.fn().mockResolvedValue(undefined),
    getModeAppend: vi.fn().mockResolvedValue(null),
    previewPrompt: vi.fn().mockResolvedValue(""),
    previewPromptWithAttribution: vi.fn().mockResolvedValue(""),
    setFragmentOverride: vi.fn().mockResolvedValue(undefined),
    clearFragmentOverride: vi.fn().mockResolvedValue(undefined),
    setStyleSliders: vi.fn().mockResolvedValue(undefined),
    getStyleSliders: vi.fn().mockResolvedValue({ socratic: 5, verbosity: 5, formality: 5 }),
    resetConcept: vi.fn().mockResolvedValue(undefined),
    openConfigurator: vi.fn().mockResolvedValue(undefined),
    listActions: vi.fn().mockResolvedValue([]),
    setGateStatus: vi.fn().mockResolvedValue(undefined),
    setGateLockdown: vi.fn().mockResolvedValue(undefined),
    updateCourse: vi.fn().mockResolvedValue(undefined),
    createLesson: vi.fn().mockResolvedValue(undefined),
    updateLesson: vi.fn().mockResolvedValue(undefined),
    deleteLesson: vi.fn().mockResolvedValue(undefined),
    createGate: vi.fn().mockResolvedValue(undefined),
    updateGate: vi.fn().mockResolvedValue(undefined),
    deleteGate: vi.fn().mockResolvedValue(undefined),
    overrideGate: vi.fn().mockResolvedValue(undefined),
    getCourseSummary: vi.fn().mockResolvedValue({}),
    customizePrompt: vi.fn().mockResolvedValue(undefined),
    listFragmentOverrides: vi.fn().mockResolvedValue([]),
    clearMisconception: vi.fn().mockResolvedValue(undefined),
    exportMemory: vi.fn().mockResolvedValue(undefined),
    deleteAllMemory: vi.fn().mockResolvedValue(undefined),
    listConfiguratorActions: vi.fn().mockResolvedValue([]),
  };

  const update = {
    checkLatest: vi.fn().mockResolvedValue({ status: "disabled" }),
  };

  const artifacts = {
    courses: artifactsOverrides.courses
      ? vi.fn().mockImplementation(artifactsOverrides.courses)
      : vi.fn().mockResolvedValue([]),
    course: artifactsOverrides.course
      ? vi.fn().mockImplementation(artifactsOverrides.course)
      : vi.fn().mockResolvedValue(null),
    lessons: artifactsOverrides.lessons
      ? vi.fn().mockImplementation(artifactsOverrides.lessons)
      : vi.fn().mockResolvedValue([]),
    gates: artifactsOverrides.gates
      ? vi.fn().mockImplementation(artifactsOverrides.gates)
      : vi.fn().mockResolvedValue([]),
    progress: artifactsOverrides.progress
      ? vi.fn().mockImplementation(artifactsOverrides.progress)
      : vi.fn().mockResolvedValue({}),
    gateView: artifactsOverrides.gateView
      ? vi.fn().mockImplementation(artifactsOverrides.gateView)
      : vi.fn().mockResolvedValue([]),
    evaluateAndPersistGates: artifactsOverrides.evaluateAndPersistGates
      ? vi.fn().mockImplementation(artifactsOverrides.evaluateAndPersistGates)
      : vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
    markGatesViewed: artifactsOverrides.markGatesViewed
      ? vi.fn().mockImplementation(artifactsOverrides.markGatesViewed)
      : vi.fn().mockResolvedValue(undefined),
    newlyUnlockedCount: artifactsOverrides.newlyUnlockedCount
      ? vi.fn().mockImplementation(artifactsOverrides.newlyUnlockedCount)
      : vi.fn().mockResolvedValue(0),
    concepts: artifactsOverrides.concepts
      ? vi.fn().mockImplementation(artifactsOverrides.concepts)
      : vi.fn().mockResolvedValue([]),
  };

  const memory = {
    studentModel: vi.fn().mockResolvedValue({ conceptMastery: new Map() }),
    misconceptions: vi.fn().mockResolvedValue([]),
    procedural: vi.fn().mockResolvedValue({ strategies: new Map() }),
    affective: vi.fn().mockResolvedValue({}),
    export: vi.fn().mockResolvedValue({
      studentModel: { conceptMastery: new Map() },
      procedural: { strategies: new Map() },
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    episodic: vi.fn(async function* () {}),
  };

  const assignments = {
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    recordResponse: vi.fn().mockResolvedValue(undefined),
    getResponses: vi.fn().mockResolvedValue([]),
    submit: vi.fn().mockResolvedValue(undefined),
  };

  const packs = {
    listAvailablePacks: vi.fn().mockResolvedValue([]),
    listImportedPacks: vi.fn().mockResolvedValue([]),
    importPack: vi.fn().mockResolvedValue(undefined),
  };

  const claudeAuth = {
    status: vi.fn().mockResolvedValue({ authenticated: false }),
    login: vi.fn(async function* () {}),
  };

  const tabs = {
    listOpen: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    open: vi.fn().mockResolvedValue({}),
    openDocument: vi.fn().mockResolvedValue({}),
    reopen: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  };

  const notes = {
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const flashcards = {
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    review: vi.fn().mockResolvedValue({}),
    dueCount: vi.fn().mockResolvedValue(0),
  };

  const sketches = {
    put: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({
      id: "s1",
      snapshot: {},
      width: 0,
      height: 0,
      createdAt: 0,
      image: Buffer.from(""),
    }),
    getSummary: vi.fn().mockResolvedValue({}),
  };

  const conceptMaps = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    updateScene: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
  };

  const activity = {
    subscribe: vi.fn().mockReturnValue(() => {}),
  };

  const subAgent = {
    subscribe: vi.fn().mockReturnValue(() => {}),
  };

  const bootstrap = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    startExploration: vi.fn(async function* () {}),
  };

  const quickCheck = {
    subscribe: vi.fn().mockReturnValue(() => {}),
  };

  const documentScopes = {
    list: vi.fn().mockResolvedValue([]),
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
  };

  const ingestorRegistry = {
    supported: vi.fn().mockReturnValue([]),
  };

  return {
    session,
    config,
    update,
    lock,
    authoring,
    documents,
    artifacts,
    memory,
    assignments,
    packs,
    claudeAuth,
    tabs,
    notes,
    flashcards,
    sketches,
    conceptMaps,
    activity,
    subAgent,
    bootstrap,
    quickCheck,
    documentScopes,
    ingestorRegistry,
    getDefaultStudentId: () => "student-1",
    // biome-ignore lint/suspicious/noExplicitAny: partial stub — only specific paths exercised
  } as any;
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.artifacts.courses — no-payload envelope ───────────────────────────

describe("praxis.artifacts.courses — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no courses exist", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.courses");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("resolves with { ok: true, value: <courses> } when courses exist", async () => {
    const courses = [{ id: "c-1", title: "Algebra 1" }];
    const log = makeSpyLogger();
    const services = makeServices({ courses: async () => courses });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.courses");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: courses });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      courses: async () => {
        throw new Error("DB gone");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.courses");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      courses: async () => {
        throw new Error("/home/user/.praxis/dev.db: SQLITE_CANTOPEN");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.courses");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.artifacts.progress — no-payload envelope ──────────────────────────

describe("praxis.artifacts.progress — envelope wiring", () => {
  it("resolves with { ok: true, value: <snapshot> } on success", async () => {
    const snapshot = { completedLessons: 3, totalLessons: 10 };
    const log = makeSpyLogger();
    const services = makeServices({ progress: async () => snapshot });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.progress");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: snapshot });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      progress: async () => {
        throw new Error("query failed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.progress");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.artifacts.course — string-payload envelope ────────────────────────

describe("praxis.artifacts.course — envelope wiring", () => {
  it("resolves with { ok: true, value: <course> } for a valid courseId", async () => {
    const course = { id: "c-1", title: "Algebra 1" };
    const log = makeSpyLogger();
    const services = makeServices({ course: async () => course });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: course });
    expect(services.artifacts.course).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when the course is not found", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ course: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-missing");
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.artifacts.course).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for a non-string courseId (e.g. number)", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    const result = await handler?.({}, 42);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for undefined courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      course: async () => {
        throw new Error("disk I/O error");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "c-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      course: async () => {
        throw new Error("/home/user/.praxis/dev.db: no such table: courses");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.course");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.artifacts.lessons — string-payload envelope ───────────────────────

describe("praxis.artifacts.lessons — envelope wiring", () => {
  it("resolves with { ok: true, value: <lessons> } for a valid courseId", async () => {
    const lessons = [{ id: "l-1", title: "Intro" }];
    const log = makeSpyLogger();
    const services = makeServices({ lessons: async () => lessons });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.lessons");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: lessons });
    expect(services.artifacts.lessons).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.lessons");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.artifacts.lessons).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for undefined courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.lessons");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.artifacts.gates — string-payload envelope ─────────────────────────

describe("praxis.artifacts.gates — envelope wiring", () => {
  it("resolves with { ok: true, value: <gates> } for a valid courseId", async () => {
    const gates = [{ id: "g-1", title: "Chapter 1 Gate" }];
    const log = makeSpyLogger();
    const services = makeServices({ gates: async () => gates });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.gates");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: gates });
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.gates");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.artifacts.gateView — string-payload envelope ──────────────────────

describe("praxis.artifacts.gateView — envelope wiring", () => {
  it("resolves with { ok: true, value: <gateViews> } for a valid courseId", async () => {
    const gateViews = [{ gateId: "g-1", unlocked: true }];
    const log = makeSpyLogger();
    const services = makeServices({ gateView: async () => gateViews });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.gateView");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: gateViews });
    expect(services.artifacts.gateView).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.gateView");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.artifacts.gateView).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      gateView: async () => {
        throw new Error("gate computation failed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.gateView");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "c-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.artifacts.evaluateGates — string-payload envelope ─────────────────

describe("praxis.artifacts.evaluateGates — envelope wiring", () => {
  it("resolves with { ok: true, value: <result> } for a valid courseId", async () => {
    const evalResult = { unlockedGateIds: ["g-1", "g-2"] };
    const log = makeSpyLogger();
    const services = makeServices({ evaluateAndPersistGates: async () => evalResult });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.evaluateGates");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: evalResult });
    expect(services.artifacts.evaluateAndPersistGates).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.evaluateGates");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.artifacts.evaluateAndPersistGates).not.toHaveBeenCalled();
  });
});

// ── praxis.artifacts.markGatesViewed — string-payload envelope ───────────────

describe("praxis.artifacts.markGatesViewed — envelope wiring", () => {
  it("resolves with { ok: true } for a valid courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ markGatesViewed: async () => undefined });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.markGatesViewed");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.artifacts.markGatesViewed).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for a non-string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.markGatesViewed");
    expect(handler).toBeDefined();

    const result = await handler?.({}, 123);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.artifacts.newlyUnlockedCount — string-payload envelope ─────────────

describe("praxis.artifacts.newlyUnlockedCount — envelope wiring", () => {
  it("resolves with { ok: true, value: <count> } for a valid courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ newlyUnlockedCount: async () => 3 });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.newlyUnlockedCount");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: 3 });
    expect(services.artifacts.newlyUnlockedCount).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.newlyUnlockedCount");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.artifacts.concepts — string-payload envelope ──────────────────────

describe("praxis.artifacts.concepts — envelope wiring", () => {
  it("resolves with { ok: true, value: <concepts> } for a valid courseId", async () => {
    const concepts = [{ id: "algebra-1:unit-1.real-numbers", name: "Real Numbers" }];
    const log = makeSpyLogger();
    const services = makeServices({ concepts: async () => concepts });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.concepts");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: true, value: concepts });
    expect(services.artifacts.concepts).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.concepts");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.artifacts.concepts).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for undefined courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.concepts");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      concepts: async () => {
        throw new Error("graph store unavailable");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.concepts");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "c-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      concepts: async () => {
        throw new Error("/home/user/.praxis/dev.db: no such table: concept_graph_concepts");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.artifacts.concepts");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "c-1");
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});
