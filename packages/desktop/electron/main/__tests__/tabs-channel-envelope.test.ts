/**
 * Integration tests: envelope wiring for praxis.tabs.* invoke channels.
 *
 * Channels exercised:
 *   praxis.tabs.listOpen  — no-payload; wrapEnvelope
 *   praxis.tabs.list      — { limit?, includeClosed? }; handleEnvelope (optional object)
 *   praxis.tabs.get       — string (tabId); handleEnvelope
 *   praxis.tabs.open      — { sessionId, courseTitle? }; handleEnvelope
 *   praxis.tabs.reopen    — string (tabId); handleEnvelope
 *   praxis.tabs.close     — string (tabId); handleEnvelope
 *   praxis.tabs.touch     — string (tabId); handleEnvelope
 *   praxis.tabs.rename    — { tabId, title }; handleEnvelope
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: 18
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

type TabsOverrides = {
  listOpen?: () => Promise<unknown>;
  list?: (input: unknown) => Promise<unknown>;
  get?: (input: unknown) => Promise<unknown>;
  open?: (input: unknown) => Promise<unknown>;
  reopen?: (input: unknown) => Promise<unknown>;
  close?: (input: unknown) => Promise<unknown>;
  touch?: (input: unknown) => Promise<unknown>;
  rename?: (input: unknown) => Promise<unknown>;
};

function makeServices(tabsOverrides: TabsOverrides = {}) {
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
    listOpen: tabsOverrides.listOpen
      ? vi.fn().mockImplementation(tabsOverrides.listOpen)
      : vi.fn().mockResolvedValue([]),
    list: tabsOverrides.list
      ? vi.fn().mockImplementation(tabsOverrides.list)
      : vi.fn().mockResolvedValue([]),
    get: tabsOverrides.get
      ? vi.fn().mockImplementation(tabsOverrides.get)
      : vi.fn().mockResolvedValue(null),
    open: tabsOverrides.open
      ? vi.fn().mockImplementation(tabsOverrides.open)
      : vi.fn().mockResolvedValue({}),
    openDocument: vi.fn().mockResolvedValue({}),
    reopen: tabsOverrides.reopen
      ? vi.fn().mockImplementation(tabsOverrides.reopen)
      : vi.fn().mockResolvedValue({}),
    close: tabsOverrides.close
      ? vi.fn().mockImplementation(tabsOverrides.close)
      : vi.fn().mockResolvedValue(undefined),
    touch: tabsOverrides.touch
      ? vi.fn().mockImplementation(tabsOverrides.touch)
      : vi.fn().mockResolvedValue(undefined),
    rename: tabsOverrides.rename
      ? vi.fn().mockImplementation(tabsOverrides.rename)
      : vi.fn().mockResolvedValue({}),
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

// ── praxis.tabs.listOpen — no-payload envelope ────────────────────────────────

describe("praxis.tabs.listOpen — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no tabs are open", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ listOpen: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.listOpen");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.tabs.listOpen).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <tabs> } when tabs are open", async () => {
    const tab = { id: "tab-1", title: "Math 101", sortOrder: 1 };
    const log = makeFakeLogger();
    const services = makeServices({ listOpen: async () => [tab] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.listOpen");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: [tab] });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      listOpen: async () => {
        throw new Error("DB unavailable");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.listOpen");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.tabs.open — structured-payload envelope ────────────────────────────

describe("praxis.tabs.open — envelope wiring", () => {
  it("resolves with { ok: true, value: <tab> } for a valid payload", async () => {
    const tab = { id: "tab-2", title: "Physics 101", sortOrder: 2 };
    const log = makeFakeLogger();
    const services = makeServices({ open: async () => tab });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.open");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { sessionId: "sess-1", courseTitle: "Physics 101" });
    expect(result).toMatchObject({ ok: true, value: tab });
    expect(services.tabs.open).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <tab> } when courseTitle is omitted", async () => {
    const tab = { id: "tab-3", title: "Session", sortOrder: 3 };
    const log = makeFakeLogger();
    const services = makeServices({ open: async () => tab });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.open");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { sessionId: "sess-2" });
    expect(result).toMatchObject({ ok: true, value: tab });
  });

  it("returns VALIDATION_FAILED when sessionId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.open");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseTitle: "Math" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.open).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when sessionId is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.open");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { sessionId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.open).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      open: async () => {
        throw new Error("session not found");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.open");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { sessionId: "sess-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.tabs.close — string-payload envelope ───────────────────────────────

describe("praxis.tabs.close — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ close: async () => undefined });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.close");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "tab-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.tabs.close).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string tabId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.close");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.close).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      close: async () => {
        throw new Error("tab already closed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.close");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "tab-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.tabs.get — string-payload envelope ─────────────────────────────────

describe("praxis.tabs.get — envelope wiring", () => {
  it("resolves with { ok: true, value: <tab> } for a valid tabId", async () => {
    const tab = { id: "tab-1", title: "Math 101", sortOrder: 1 };
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => tab });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "tab-1");
    expect(result).toMatchObject({ ok: true, value: tab });
    expect(services.tabs.get).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when tab is not found", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "tab-missing");
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty string tabId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.get).not.toHaveBeenCalled();
  });
});

// ── praxis.tabs.reopen — string-payload envelope ──────────────────────────────

describe("praxis.tabs.reopen — envelope wiring", () => {
  it("resolves with { ok: true, value: <tab> } on success", async () => {
    const tab = { id: "tab-1", title: "Reopened", sortOrder: 5 };
    const log = makeFakeLogger();
    const services = makeServices({ reopen: async () => tab });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.reopen");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "tab-1");
    expect(result).toMatchObject({ ok: true, value: tab });
    expect(services.tabs.reopen).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string tabId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.reopen");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.reopen).not.toHaveBeenCalled();
  });
});

// ── praxis.tabs.touch — string-payload envelope ───────────────────────────────

describe("praxis.tabs.touch — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ touch: async () => undefined });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.touch");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "tab-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.tabs.touch).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string tabId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.touch");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.touch).not.toHaveBeenCalled();
  });
});

// ── praxis.tabs.rename — structured-payload envelope ─────────────────────────

describe("praxis.tabs.rename — envelope wiring", () => {
  it("resolves with { ok: true, value: <tab> } for a valid payload", async () => {
    const tab = { id: "tab-1", title: "Renamed Tab", sortOrder: 1 };
    const log = makeFakeLogger();
    const services = makeServices({ rename: async () => tab });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.rename");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { tabId: "tab-1", title: "Renamed Tab" });
    expect(result).toMatchObject({ ok: true, value: tab });
    expect(services.tabs.rename).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when tabId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.rename");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { title: "New Title" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.rename).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when tabId is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.rename");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { tabId: "", title: "New Title" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.rename).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      rename: async () => {
        throw new Error("tab not found");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.rename");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { tabId: "tab-1", title: "New Title" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.tabs.list — optional-object-payload envelope ───────────────────────

describe("praxis.tabs.list — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when called with no opts", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ list: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.tabs.list).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <tabs> } with valid opts", async () => {
    const tabs = [{ id: "tab-1", title: "Math", sortOrder: 1 }];
    const log = makeFakeLogger();
    const services = makeServices({ list: async () => tabs });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { limit: 10, includeClosed: true });
    expect(result).toMatchObject({ ok: true, value: tabs });
  });

  it("returns VALIDATION_FAILED when limit is not a positive integer", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { limit: -5 });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.list).not.toHaveBeenCalled();
  });
});
