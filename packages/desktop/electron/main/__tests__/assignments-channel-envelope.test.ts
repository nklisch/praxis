/**
 * Integration tests: envelope wiring for praxis.assignments.* invoke channels.
 *
 * Channels exercised (all with structured object payloads — assignmentInputSchema):
 *   praxis.assignments.get          — returns Assignment | null
 *   praxis.assignments.getResponses — returns AssignmentResponse[]
 *   praxis.assignments.submit       — mutation; returns AssignmentSubmissionResult
 *
 * All three share z.object({ assignmentId: z.string().min(1) }) validation.
 * submit is security-relevant (mutation); tested for validation + INTERNAL paths.
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: 13 (success paths, validation failures for missing/empty/wrong-type
 * assignmentId, INTERNAL on throw, path-leakage guard for submit).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFakeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function makeFakeLoggerChild() {
      return makeFakeLogger();
    }),
    ingestRendererRecord: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

type AssignmentsOverrides = {
  get?: (input: unknown) => Promise<unknown>;
  getResponses?: (input: unknown) => Promise<unknown>;
  submit?: (input: unknown) => Promise<unknown>;
};

function makeServices(assignmentsOverrides: AssignmentsOverrides = {}) {
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
    bootstrapConfig: vi.fn().mockResolvedValue({}),
    setBootstrapConfig: vi.fn().mockResolvedValue(undefined),
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
    courses: vi.fn().mockResolvedValue([]),
    course: vi.fn().mockResolvedValue(null),
    lessons: vi.fn().mockResolvedValue([]),
    gates: vi.fn().mockResolvedValue([]),
    progress: vi.fn().mockResolvedValue({}),
    gateView: vi.fn().mockResolvedValue([]),
    evaluateAndPersistGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
    markGatesViewed: vi.fn().mockResolvedValue(undefined),
    newlyUnlockedCount: vi.fn().mockResolvedValue(0),
    concepts: vi.fn().mockResolvedValue([]),
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
    get: assignmentsOverrides.get
      ? vi.fn().mockImplementation(assignmentsOverrides.get)
      : vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    recordResponse: vi.fn().mockResolvedValue(undefined),
    getResponses: assignmentsOverrides.getResponses
      ? vi.fn().mockImplementation(assignmentsOverrides.getResponses)
      : vi.fn().mockResolvedValue([]),
    submit: assignmentsOverrides.submit
      ? vi.fn().mockImplementation(assignmentsOverrides.submit)
      : vi.fn().mockResolvedValue({ score: 0, passed: false }),
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

// ── praxis.assignments.get ────────────────────────────────────────────────────

describe("praxis.assignments.get — envelope wiring", () => {
  it("resolves with { ok: true, value: <assignment> } for a valid assignmentId", async () => {
    const assignment = { id: "asgn-1", title: "Chapter 1 Quiz", kind: "quiz" };
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => assignment });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-1" });
    expect(result).toMatchObject({ ok: true, value: assignment });
    expect(services.assignments.get).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when the assignment is not found", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-missing" });
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty assignmentId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignments.get).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when assignmentId is missing from the payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignments.get).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when the payload is not an object (e.g. string)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "asgn-1");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      get: async () => {
        throw new Error("DB read error");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.get");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { assignmentId: "asgn-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.assignments.getResponses ──────────────────────────────────────────

describe("praxis.assignments.getResponses — envelope wiring", () => {
  it("resolves with { ok: true, value: <responses> } for a valid assignmentId", async () => {
    const responses = [{ itemId: "item-1", response: "42", work: "2 + 2 = 4" }];
    const log = makeFakeLogger();
    const services = makeServices({ getResponses: async () => responses });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.getResponses");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-1" });
    expect(result).toMatchObject({ ok: true, value: responses });
    expect(services.assignments.getResponses).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: [] } when no responses exist yet", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ getResponses: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.getResponses");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-1" });
    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("returns VALIDATION_FAILED for an empty assignmentId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.getResponses");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignments.getResponses).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when assignmentId is missing from the payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.getResponses");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      getResponses: async () => {
        throw new Error("responses table missing");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.getResponses");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { assignmentId: "asgn-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.assignments.submit ─────────────────────────────────────────────────

describe("praxis.assignments.submit — envelope wiring", () => {
  it("resolves with { ok: true, value: <result> } for a valid assignmentId", async () => {
    const submissionResult = { score: 85, passed: true, feedback: "Well done" };
    const log = makeFakeLogger();
    const services = makeServices({ submit: async () => submissionResult });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.submit");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-1" });
    expect(result).toMatchObject({ ok: true, value: submissionResult });
    expect(services.assignments.submit).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty assignmentId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.submit");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignments.submit).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when assignmentId is missing from the payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.submit");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignments.submit).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      submit: async () => {
        throw new Error("grading service unavailable");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.submit");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { assignmentId: "asgn-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      submit: async () => {
        throw new Error("/home/user/.praxis/dev.db: SQLITE_BUSY: database is locked");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.submit");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-1" });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});
