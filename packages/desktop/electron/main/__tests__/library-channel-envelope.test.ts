/**
 * Integration tests: envelope wiring for praxis.library.search IPC channel.
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: 5
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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

type LibraryOverrides = {
  search?: (input: unknown) => Promise<unknown>;
};

function makeServices(libraryOverrides: LibraryOverrides = {}) {
  const library = {
    search: libraryOverrides.search
      ? vi.fn().mockImplementation(libraryOverrides.search)
      : vi.fn().mockResolvedValue([]),
  };

  // biome-ignore lint/suspicious/noExplicitAny: partial stub — only library exercised
  return {
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({}),
      end: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue([]),
      send: vi.fn(async function* () {}),
      spawnFromAssignment: vi.fn().mockResolvedValue({}),
      notifySession: vi.fn().mockResolvedValue(undefined),
    },
    config: {
      isLocked: vi.fn().mockResolvedValue(false),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn().mockResolvedValue("claude-code"),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn().mockResolvedValue({}),
      revealApiKey: vi.fn().mockResolvedValue({}),
      setEngineConfig: vi.fn(),
      bootstrapConfig: vi.fn().mockResolvedValue({}),
      setBootstrapConfig: vi.fn(),
      firstRunCompleted: vi.fn().mockResolvedValue(false),
      markFirstRunComplete: vi.fn(),
    },
    update: { checkLatest: vi.fn().mockResolvedValue({ status: "disabled" }) },
    lock: {
      isSet: vi.fn().mockResolvedValue(false),
      isUnlocked: vi.fn().mockResolvedValue(true),
      setLockCode: vi.fn(),
      unlock: vi.fn().mockResolvedValue({ ok: true }),
      lock: vi.fn(),
      clearLock: vi.fn(),
    },
    authoring: {
      setGlobalPrompt: vi.fn(),
      getGlobalPrompt: vi.fn().mockResolvedValue(null),
      setModeAppend: vi.fn(),
      getModeAppend: vi.fn().mockResolvedValue(null),
      previewPrompt: vi.fn().mockResolvedValue(""),
      previewPromptWithAttribution: vi.fn().mockResolvedValue(""),
      setFragmentOverride: vi.fn(),
      clearFragmentOverride: vi.fn(),
      setStyleSliders: vi.fn(),
      getStyleSliders: vi.fn().mockResolvedValue({ socratic: 5, verbosity: 5, formality: 5 }),
      resetConcept: vi.fn(),
      openConfigurator: vi.fn(),
      listActions: vi.fn().mockResolvedValue([]),
      setGateStatus: vi.fn(),
      setGateLockdown: vi.fn(),
      updateCourse: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      getCourseSummary: vi.fn().mockResolvedValue({}),
      customizePrompt: vi.fn(),
      listFragmentOverrides: vi.fn().mockResolvedValue([]),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      listConfiguratorActions: vi.fn().mockResolvedValue([]),
    },
    documents: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      pageImage: vi.fn().mockResolvedValue(null),
    },
    artifacts: {
      courses: vi.fn().mockResolvedValue([]),
      course: vi.fn().mockResolvedValue(null),
      lessons: vi.fn().mockResolvedValue([]),
      gates: vi.fn().mockResolvedValue([]),
      progress: vi.fn().mockResolvedValue({}),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateAndPersistGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn(),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    },
    memory: {
      studentModel: vi.fn().mockResolvedValue({ conceptMastery: new Map() }),
      misconceptions: vi.fn().mockResolvedValue([]),
      procedural: vi.fn().mockResolvedValue({ strategies: new Map() }),
      affective: vi.fn().mockResolvedValue({}),
      export: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      episodic: vi.fn(async function* () {}),
    },
    assignments: {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      recordResponse: vi.fn(),
      getResponses: vi.fn().mockResolvedValue([]),
      submit: vi.fn(),
    },
    packs: {
      listAvailablePacks: vi.fn().mockResolvedValue([]),
      listImportedPacks: vi.fn().mockResolvedValue([]),
      importPack: vi.fn(),
    },
    claudeAuth: {
      status: vi.fn().mockResolvedValue({ authenticated: false }),
      login: vi.fn(async function* () {}),
    },
    tabs: {
      listOpen: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      open: vi.fn().mockResolvedValue({}),
      openDocument: vi.fn().mockResolvedValue({}),
      reopen: vi.fn().mockResolvedValue({}),
      close: vi.fn(),
      touch: vi.fn(),
      rename: vi.fn(),
    },
    notes: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      setAnnotations: vi.fn(),
      getAnnotations: vi.fn().mockResolvedValue([]),
    },
    flashcards: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      review: vi.fn().mockResolvedValue({}),
      dueCount: vi.fn().mockResolvedValue(0),
    },
    library,
    sketches: {
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
    },
    conceptMaps: {
      create: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      rename: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      updateScene: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
    },
    activity: { subscribe: vi.fn().mockReturnValue(() => {}) },
    subAgent: { subscribe: vi.fn().mockReturnValue(() => {}) },
    bootstrap: {
      subscribe: vi.fn().mockReturnValue(() => {}),
      startExploration: vi.fn(async function* () {}),
    },
    quickCheck: { subscribe: vi.fn().mockReturnValue(() => {}) },
    documentScopes: { list: vi.fn().mockResolvedValue([]), attach: vi.fn(), detach: vi.fn() },
    ingestorRegistry: { supported: vi.fn().mockReturnValue([]) },
    getDefaultStudentId: () => "student-1",
  } as any;
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.library.search — envelope wiring ────────────────────────────────────

describe("praxis.library.search — envelope wiring", () => {
  it("resolves with { ok: true, value: <hits> } for a valid payload", async () => {
    const hits = [
      {
        kind: "note",
        id: "n-1",
        body: "test",
        sessionId: null,
        linksJson: [],
        studentId: "s-1",
        format: "free",
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const log = makeFakeLogger();
    const services = makeServices({ search: async () => hits });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.library.search");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { query: "test" });
    expect(result).toMatchObject({ ok: true, value: hits });
    expect(services.library.search).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: [] } when no results", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ search: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.library.search");
    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("resolves with { ok: true } for no-payload (all notes+flashcards)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.library.search");
    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: true });
  });

  it("returns VALIDATION_FAILED when query is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.library.search");
    const result = await handler?.({}, { query: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.library.search).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      search: async () => {
        throw new Error("DB locked");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.library.search");
    await expect(handler?.({}, { query: "hello" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
