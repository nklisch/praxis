/**
 * Integration tests: envelope wiring for praxis.lock.* and praxis.config.* invoke channels.
 *
 * Channels exercised (9 total — the remaining non-envelope channels from step-7):
 *   praxis.lock.isSet              — no-payload, wrapEnvelope, returns boolean
 *   praxis.lock.isUnlocked         — no-payload, wrapEnvelope, returns boolean
 *   praxis.lock.lock               — no-payload mutation, wrapEnvelope, returns void
 *   praxis.config.isLocked         — no-payload, wrapEnvelope, returns boolean
 *   praxis.config.unlock           — string code, handleEnvelope + z.string().min(1)
 *   praxis.config.selectedEngine   — no-payload getter, wrapEnvelope, returns string
 *   praxis.config.bootstrapConfig  — no-payload getter, wrapEnvelope, returns BootstrapConfigSnapshot
 *   praxis.config.firstRunCompleted  — no-payload getter, wrapEnvelope, returns boolean
 *   praxis.config.markFirstRunComplete — no-payload mutation, wrapEnvelope, returns void
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: ~18 (success + INTERNAL for no-payload channels; success +
 * VALIDATION_FAILED for empty/wrong-type code + INTERNAL for config.unlock).
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

type LockOverrides = {
  isSet?: () => Promise<unknown>;
  isUnlocked?: () => Promise<unknown>;
  lock?: () => Promise<unknown>;
};

type ConfigOverrides = {
  isLocked?: () => Promise<unknown>;
  unlock?: (code: string) => Promise<unknown>;
  selectedEngine?: () => Promise<unknown>;
  bootstrapConfig?: () => Promise<unknown>;
  firstRunCompleted?: () => Promise<unknown>;
  markFirstRunComplete?: () => Promise<unknown>;
};

function makeServices(lockOverrides: LockOverrides = {}, configOverrides: ConfigOverrides = {}) {
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
    isSet: lockOverrides.isSet
      ? vi.fn().mockImplementation(lockOverrides.isSet)
      : vi.fn().mockResolvedValue(false),
    isUnlocked: lockOverrides.isUnlocked
      ? vi.fn().mockImplementation(lockOverrides.isUnlocked)
      : vi.fn().mockResolvedValue(true),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: lockOverrides.lock
      ? vi.fn().mockImplementation(lockOverrides.lock)
      : vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    isLocked: configOverrides.isLocked
      ? vi.fn().mockImplementation(configOverrides.isLocked)
      : vi.fn().mockResolvedValue(false),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: configOverrides.unlock
      ? vi.fn().mockImplementation(configOverrides.unlock)
      : vi.fn().mockResolvedValue({ ok: true }),
    selectedEngine: configOverrides.selectedEngine
      ? vi.fn().mockImplementation(configOverrides.selectedEngine)
      : vi.fn().mockResolvedValue("claude-code"),
    setSelectedEngine: vi.fn().mockResolvedValue(undefined),
    engineConfig: vi.fn().mockResolvedValue({}),
    revealApiKey: vi.fn().mockResolvedValue({ apiKey: null }),
    setEngineConfig: vi.fn().mockResolvedValue(undefined),
    bootstrapConfig: configOverrides.bootstrapConfig
      ? vi.fn().mockImplementation(configOverrides.bootstrapConfig)
      : vi.fn().mockResolvedValue({ maxSteps: 10 }),
    setBootstrapConfig: vi.fn().mockResolvedValue(undefined),
    firstRunCompleted: configOverrides.firstRunCompleted
      ? vi.fn().mockImplementation(configOverrides.firstRunCompleted)
      : vi.fn().mockResolvedValue(false),
    markFirstRunComplete: configOverrides.markFirstRunComplete
      ? vi.fn().mockImplementation(configOverrides.markFirstRunComplete)
      : vi.fn().mockResolvedValue(undefined),
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
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    recordResponse: vi.fn().mockResolvedValue(undefined),
    getResponses: vi.fn().mockResolvedValue([]),
    submit: vi.fn().mockResolvedValue({ score: 0, passed: false }),
  };

  const packs = {
    listAvailablePacks: vi.fn().mockResolvedValue([]),
    listImportedPacks: vi.fn().mockResolvedValue([]),
    importPack: vi.fn().mockResolvedValue({ id: "pack-1" }),
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

// ── praxis.lock.isSet ─────────────────────────────────────────────────────────

describe("praxis.lock.isSet — envelope wiring", () => {
  it("resolves with { ok: true, value: false } when lock is not set", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.isSet");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: false });
    expect(services.lock.isSet).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: true } when lock is set", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ isSet: async () => true });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.isSet");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: true });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      isSet: async () => {
        throw new Error("lock state corrupted");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.isSet");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.lock.isUnlocked ────────────────────────────────────────────────────

describe("praxis.lock.isUnlocked — envelope wiring", () => {
  it("resolves with { ok: true, value: true } when unlocked", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.isUnlocked");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: true });
    expect(services.lock.isUnlocked).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: false } when locked out", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ isUnlocked: async () => false });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.isUnlocked");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: false });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      isUnlocked: async () => {
        throw new Error("session expired");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.isUnlocked");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.lock.lock ──────────────────────────────────────────────────────────

describe("praxis.lock.lock — envelope wiring", () => {
  it("resolves with { ok: true, value: undefined } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.lock");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true });
    expect(services.lock.lock).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      lock: async () => {
        throw new Error("cannot lock — no code set");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.lock");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.config.isLocked ────────────────────────────────────────────────────

describe("praxis.config.isLocked — envelope wiring", () => {
  it("resolves with { ok: true, value: false } when not locked", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, {});
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.isLocked");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: false });
    expect(services.config.isLocked).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: true } when config lock is engaged", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { isLocked: async () => true });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.isLocked");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: true });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        isLocked: async () => {
          throw new Error("config service unavailable");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.isLocked");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.config.unlock ──────────────────────────────────────────────────────

describe("praxis.config.unlock — envelope wiring", () => {
  it("resolves with { ok: true, value: { ok: true } } for a valid code", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { unlock: async () => ({ ok: true }) });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.unlock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "correct-code");
    expect(result).toMatchObject({ ok: true, value: { ok: true } });
    expect(services.config.unlock).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: { ok: false } } for a wrong code", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { unlock: async () => ({ ok: false }) });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.unlock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "wrong-code");
    expect(result).toMatchObject({ ok: true, value: { ok: false } });
  });

  it("returns VALIDATION_FAILED for an empty code string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.unlock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.config.unlock).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when the payload is not a string (e.g. object)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.unlock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { code: "secret" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.config.unlock).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        unlock: async () => {
          throw new Error("crypto subsystem failure");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.unlock");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "some-code")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.config.selectedEngine ──────────────────────────────────────────────

describe("praxis.config.selectedEngine — envelope wiring", () => {
  it("resolves with { ok: true, value: 'claude-code' } by default", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.selectedEngine");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: "claude-code" });
    expect(services.config.selectedEngine).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        selectedEngine: async () => {
          throw new Error("config DB missing");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.selectedEngine");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.config.bootstrapConfig ─────────────────────────────────────────────

describe("praxis.config.bootstrapConfig — envelope wiring", () => {
  it("resolves with { ok: true, value: <snapshot> } on success", async () => {
    const snapshot = { maxSteps: 20 };
    const log = makeFakeLogger();
    const services = makeServices({}, { bootstrapConfig: async () => snapshot });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.bootstrapConfig");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: snapshot });
    expect(services.config.bootstrapConfig).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        bootstrapConfig: async () => {
          throw new Error("read error");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.bootstrapConfig");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.config.firstRunCompleted ───────────────────────────────────────────

describe("praxis.config.firstRunCompleted — envelope wiring", () => {
  it("resolves with { ok: true, value: false } on a fresh install", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.firstRunCompleted");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: false });
    expect(services.config.firstRunCompleted).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: true } after first run is marked complete", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { firstRunCompleted: async () => true });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.firstRunCompleted");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: true });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        firstRunCompleted: async () => {
          throw new Error("DB error");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.firstRunCompleted");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.config.markFirstRunComplete ────────────────────────────────────────

describe("praxis.config.markFirstRunComplete — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.markFirstRunComplete");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true });
    expect(services.config.markFirstRunComplete).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        markFirstRunComplete: async () => {
          throw new Error("write failed");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.config.markFirstRunComplete");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
