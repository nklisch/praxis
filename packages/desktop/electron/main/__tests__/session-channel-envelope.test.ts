/**
 * Integration tests: envelope wiring for praxis.session.* invoke channels.
 *
 * Channels exercised:
 *   praxis.session.active          — no-payload getter; bare wrapEnvelope
 *   praxis.session.end             — string payload; handleEnvelope + z.string().min(1)
 *   praxis.session.spawnFromAssignment — structured payload; handleEnvelope + object schema
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
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

function makeServices(
  overrides: {
    sessionActive?: (opts?: unknown) => Promise<unknown>;
    sessionEnd?: (sessionId: unknown) => Promise<unknown>;
    sessionSpawnFromAssignment?: (opts: unknown) => Promise<unknown>;
  } = {},
) {
  const session = {
    active: overrides.sessionActive
      ? vi.fn().mockImplementation(overrides.sessionActive)
      : vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({}),
    end: overrides.sessionEnd
      ? vi.fn().mockImplementation(overrides.sessionEnd)
      : vi.fn().mockResolvedValue({ summary: "ended" }),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: overrides.sessionSpawnFromAssignment
      ? vi.fn().mockImplementation(overrides.sessionSpawnFromAssignment)
      : vi.fn().mockResolvedValue({ id: "sess-child-1" }),
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
    courses: vi.fn().mockResolvedValue([]),
    course: vi.fn().mockResolvedValue(null),
    lessons: vi.fn().mockResolvedValue([]),
    gates: vi.fn().mockResolvedValue([]),
    progress: vi.fn().mockResolvedValue({}),
    gateView: vi.fn().mockResolvedValue([]),
    evaluateAndPersistGates: vi.fn().mockResolvedValue([]),
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

// ── praxis.session.active — optional modeId filter envelope ──────────────────

describe("praxis.session.active — envelope wiring", () => {
  it("resolves with { ok: true, value: null } when no active session", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    // handleEnvelope with optional schema: handler receives (event, payload?).
    // Omitting payload → undefined → accepted by z.object({...}).optional().
    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("resolves with { ok: true, value: <handle> } when a session is active", async () => {
    const handle = { id: "sess-1", modeId: "teach" };
    const log = makeFakeLogger();
    const services = makeServices({ sessionActive: async () => handle });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: handle });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionActive: async () => {
        throw new Error("DB gone");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL envelope with no path leakage when service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionActive: async () => {
        throw new Error("/home/user/.praxis/dev.db: SQLITE_CANTOPEN");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.session.end — string-payload envelope ──────────────────────────────

describe("praxis.session.end — envelope wiring", () => {
  it("resolves with { ok: true } for a valid sessionId string", async () => {
    const endSummary = { summary: "ended" };
    const log = makeFakeLogger();
    const services = makeServices({ sessionEnd: async () => endSummary });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.end");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "sess-abc-123");
    expect(result).toMatchObject({ ok: true, value: endSummary });
    expect(services.session.end).toHaveBeenCalledWith("sess-abc-123");
  });

  it("returns VALIDATION_FAILED for an empty string sessionId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.end");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.session.end).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for a non-string sessionId (e.g. number)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.end");
    expect(handler).toBeDefined();

    const result = await handler?.({}, 42);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for undefined sessionId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.end");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionEnd: async () => {
        throw new Error("session already ended");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.end");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "sess-abc-123")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionEnd: async () => {
        throw new Error("/home/user/.praxis/dev.db: disk I/O error");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.end");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "sess-abc-123");
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.session.spawnFromAssignment — structured-payload envelope ──────────

describe("praxis.session.spawnFromAssignment — envelope wiring", () => {
  it("resolves with { ok: true, value: <handle> } for a valid payload", async () => {
    const childHandle = { id: "sess-child-1", modeId: "quiz" };
    const log = makeFakeLogger();
    const services = makeServices({ sessionSpawnFromAssignment: async () => childHandle });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.(
      {},
      {
        assignmentId: "asgn-001",
        parentSessionId: "sess-parent-001",
      },
    );
    expect(result).toMatchObject({ ok: true, value: childHandle });
    expect(services.session.spawnFromAssignment).toHaveBeenCalledWith({
      assignmentId: "asgn-001",
      parentSessionId: "sess-parent-001",
    });
  });

  it("returns VALIDATION_FAILED for a missing assignmentId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { parentSessionId: "sess-parent-001" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.session.spawnFromAssignment).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for a missing parentSessionId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "asgn-001" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for an empty assignmentId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { assignmentId: "", parentSessionId: "sess-parent-001" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for a non-object payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "not-an-object");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for undefined payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionSpawnFromAssignment: async () => {
        throw new Error("assignment not found");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { assignmentId: "asgn-001", parentSessionId: "sess-parent-001" }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });

  it("returns INTERNAL with no path leakage when service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionSpawnFromAssignment: async () => {
        throw new Error("/home/user/.praxis/dev.db: no such table: sessions");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromAssignment");
    expect(handler).toBeDefined();

    const result = await handler?.(
      {},
      {
        assignmentId: "asgn-001",
        parentSessionId: "sess-parent-001",
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.session.active — modeId payload variants ──────────────────────────

describe("praxis.session.active — modeId filter payload", () => {
  it("forwards { modeId: 'configure' } to the service and returns the handle", async () => {
    const handle = { sessionId: "sess-cfg-1", modeId: "configure", startedAt: 1000 };
    const log = makeFakeLogger();
    const services = makeServices({
      sessionActive: async (opts: unknown) => {
        // Verify the modeId was forwarded.
        if ((opts as { modeId?: string } | undefined)?.modeId === "configure") return handle;
        return null;
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "configure" });
    expect(result).toMatchObject({ ok: true, value: handle });
    expect(services.session.active).toHaveBeenCalledWith({ modeId: "configure" });
  });

  it("accepts omitted payload (undefined) and calls service with undefined", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: true, value: null });
    // Service called with undefined (no modeId filter)
    expect(services.session.active).toHaveBeenCalledWith(undefined);
  });

  it("returns VALIDATION_FAILED when modeId is not a string (e.g. number)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: 42 });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.session.active).not.toHaveBeenCalled();
  });

  it("accepts an empty object payload (modeId omitted) and calls service with {}", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.active");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: true, value: null });
    // Called with {} — modeId not provided so service uses no filter
    expect(services.session.active).toHaveBeenCalledWith({});
  });
});
