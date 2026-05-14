/**
 * Integration tests: envelope wiring for praxis.memory.* invoke channels.
 *
 * Channels exercised (all no-payload — bare wrapEnvelope):
 *   praxis.memory.studentModel   — getter returning StudentModel (Map serialized as entries)
 *   praxis.memory.misconceptions — getter returning Misconception[]
 *   praxis.memory.procedural     — getter returning ProceduralModel (Map serialized)
 *   praxis.memory.affective      — getter returning AffectiveModel
 *   praxis.memory.export         — returns full MemoryExport blob
 *   praxis.memory.delete         — destructive, returns void
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: 12 (success + INTERNAL on throw for each channel; path-leakage
 * guard for studentModel, export, and delete).
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

type MemoryOverrides = {
  studentModel?: () => Promise<unknown>;
  misconceptions?: () => Promise<unknown>;
  procedural?: () => Promise<unknown>;
  affective?: () => Promise<unknown>;
  export?: () => Promise<unknown>;
  delete?: () => Promise<unknown>;
};

function makeServices(memoryOverrides: MemoryOverrides = {}) {
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
    studentModel: memoryOverrides.studentModel
      ? vi.fn().mockImplementation(memoryOverrides.studentModel)
      : vi.fn().mockResolvedValue({ studentId: "student-1", conceptMastery: new Map(), lastUpdated: 0 }),
    misconceptions: memoryOverrides.misconceptions
      ? vi.fn().mockImplementation(memoryOverrides.misconceptions)
      : vi.fn().mockResolvedValue([]),
    procedural: memoryOverrides.procedural
      ? vi.fn().mockImplementation(memoryOverrides.procedural)
      : vi.fn().mockResolvedValue({ studentId: "student-1", strategies: new Map() }),
    affective: memoryOverrides.affective
      ? vi.fn().mockImplementation(memoryOverrides.affective)
      : vi.fn().mockResolvedValue({ mood: "neutral" }),
    export: memoryOverrides.export
      ? vi.fn().mockImplementation(memoryOverrides.export)
      : vi.fn().mockResolvedValue({
          studentId: "student-1",
          episodic: [],
          studentModel: { studentId: "student-1", conceptMastery: new Map(), lastUpdated: 0 },
          procedural: { studentId: "student-1", strategies: new Map() },
          affective: { mood: "neutral" },
          misconceptions: [],
          exportedAt: 0,
          formatVersion: "1",
        }),
    delete: memoryOverrides.delete
      ? vi.fn().mockImplementation(memoryOverrides.delete)
      : vi.fn().mockResolvedValue(undefined),
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

// ── praxis.memory.studentModel ────────────────────────────────────────────────

describe("praxis.memory.studentModel — envelope wiring", () => {
  it("resolves with { ok: true, value: <model> } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.studentModel");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true });
    const envelope = result as { ok: true; value: { studentId: string } };
    expect(envelope.value.studentId).toBe("student-1");
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      studentModel: async () => {
        throw new Error("index corrupted");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.studentModel");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      studentModel: async () => {
        throw new Error("/home/user/.praxis/dev.db: SQLITE_CANTOPEN");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.studentModel");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.memory.misconceptions ──────────────────────────────────────────────

describe("praxis.memory.misconceptions — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when there are no misconceptions", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.misconceptions");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("resolves with { ok: true, value: <list> } when misconceptions exist", async () => {
    const misconceptions = [{ id: "m-1", description: "Confuses multiplication and addition" }];
    const log = makeFakeLogger();
    const services = makeServices({ misconceptions: async () => misconceptions });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.misconceptions");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: misconceptions });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      misconceptions: async () => {
        throw new Error("query failed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.misconceptions");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.memory.procedural ──────────────────────────────────────────────────

describe("praxis.memory.procedural — envelope wiring", () => {
  it("resolves with { ok: true, value: <model> } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.procedural");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true });
    const envelope = result as { ok: true; value: { studentId: string } };
    expect(envelope.value.studentId).toBe("student-1");
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      procedural: async () => {
        throw new Error("strategy store unavailable");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.procedural");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.memory.affective ───────────────────────────────────────────────────

describe("praxis.memory.affective — envelope wiring", () => {
  it("resolves with { ok: true, value: <model> } on success", async () => {
    const affective = { mood: "curious", frustration: 0.2 };
    const log = makeFakeLogger();
    const services = makeServices({ affective: async () => affective });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.affective");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: affective });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      affective: async () => {
        throw new Error("affective index missing");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.affective");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.memory.export ──────────────────────────────────────────────────────

describe("praxis.memory.export — envelope wiring", () => {
  it("resolves with { ok: true, value: <export> } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.export");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true });
    const envelope = result as { ok: true; value: { studentId: string; formatVersion: string } };
    expect(envelope.value.studentId).toBe("student-1");
    expect(envelope.value.formatVersion).toBe("1");
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      export: async () => {
        throw new Error("serialization failed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.export");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      export: async () => {
        throw new Error("/home/user/.praxis/dev.db: no such table: episodic_events");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.export");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.memory.delete ──────────────────────────────────────────────────────

describe("praxis.memory.delete — envelope wiring", () => {
  it("resolves with { ok: true, value: undefined } when deletion succeeds", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true });
    expect(services.memory.delete).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      delete: async () => {
        throw new Error("cannot delete: active session");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.delete");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when the service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      delete: async () => {
        throw new Error("/home/user/.praxis/dev.db: SQLITE_BUSY");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.memory.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});
