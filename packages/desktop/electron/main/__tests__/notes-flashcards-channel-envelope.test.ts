/**
 * Integration tests: envelope wiring for praxis.notes.* and praxis.flashcards.*
 * invoke channels.
 *
 * Channels exercised:
 *   praxis.notes.update    — { noteId, body }; handleEnvelope
 *   praxis.notes.get       — string (noteId); handleEnvelope
 *   praxis.notes.delete    — string (noteId); handleEnvelope
 *   praxis.flashcards.get  — string (flashcardId); handleEnvelope
 *   praxis.flashcards.delete — string (flashcardId); handleEnvelope
 *   praxis.flashcards.dueCount — no-payload; wrapEnvelope
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: 14
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

type NotesOverrides = {
  update?: (input: unknown) => Promise<unknown>;
  get?: (input: unknown) => Promise<unknown>;
  delete?: (input: unknown) => Promise<unknown>;
};

type FlashcardsOverrides = {
  get?: (input: unknown) => Promise<unknown>;
  delete?: (input: unknown) => Promise<unknown>;
  dueCount?: (input: unknown) => Promise<unknown>;
};

function makeServices(
  notesOverrides: NotesOverrides = {},
  flashcardsOverrides: FlashcardsOverrides = {},
) {
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
    update: notesOverrides.update
      ? vi.fn().mockImplementation(notesOverrides.update)
      : vi.fn().mockResolvedValue({}),
    get: notesOverrides.get
      ? vi.fn().mockImplementation(notesOverrides.get)
      : vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    delete: notesOverrides.delete
      ? vi.fn().mockImplementation(notesOverrides.delete)
      : vi.fn().mockResolvedValue(undefined),
  };

  const flashcards = {
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    get: flashcardsOverrides.get
      ? vi.fn().mockImplementation(flashcardsOverrides.get)
      : vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    delete: flashcardsOverrides.delete
      ? vi.fn().mockImplementation(flashcardsOverrides.delete)
      : vi.fn().mockResolvedValue(undefined),
    review: vi.fn().mockResolvedValue({}),
    dueCount: flashcardsOverrides.dueCount
      ? vi.fn().mockImplementation(flashcardsOverrides.dueCount)
      : vi.fn().mockResolvedValue(0),
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

// ── praxis.notes.update — structured-payload envelope ────────────────────────

describe("praxis.notes.update — envelope wiring", () => {
  it("resolves with { ok: true, value: <note> } for a valid payload", async () => {
    const note = { id: "n-1", body: { text: "hello" } };
    const log = makeFakeLogger();
    const services = makeServices({ update: async () => note });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.update");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { noteId: "n-1", body: { text: "hello" } });
    expect(result).toMatchObject({ ok: true, value: note });
    expect(services.notes.update).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when noteId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.update");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { body: { text: "x" } });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.notes.update).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when noteId is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.update");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { noteId: "", body: {} });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.notes.update).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      update: async () => {
        throw new Error("write failed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.update");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { noteId: "n-1", body: { text: "x" } }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

// ── praxis.notes.get — string-payload envelope ────────────────────────────────

describe("praxis.notes.get — envelope wiring", () => {
  it("resolves with { ok: true, value: <note> } for a valid noteId", async () => {
    const note = { id: "n-1", body: { text: "hello" } };
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => note });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "n-1");
    expect(result).toMatchObject({ ok: true, value: note });
    expect(services.notes.get).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when the note is not found", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "n-missing");
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty string noteId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.notes.get).not.toHaveBeenCalled();
  });
});

// ── praxis.notes.delete — string-payload envelope ─────────────────────────────

describe("praxis.notes.delete — envelope wiring", () => {
  it("resolves with { ok: true, value: undefined } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ delete: async () => undefined });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "n-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.notes.delete).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string noteId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.notes.delete).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      delete: async () => {
        throw new Error("constraint violation");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.notes.delete");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "n-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.flashcards.get — string-payload envelope ───────────────────────────

describe("praxis.flashcards.get — envelope wiring", () => {
  it("resolves with { ok: true, value: <flashcard> } for a valid flashcardId", async () => {
    const card = { id: "fc-1", front: "Q", back: "A" };
    const log = makeFakeLogger();
    const services = makeServices({}, { get: async () => card });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "fc-1");
    expect(result).toMatchObject({ ok: true, value: card });
    expect(services.flashcards.get).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when the flashcard is not found", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { get: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "fc-missing");
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty string flashcardId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.flashcards.get).not.toHaveBeenCalled();
  });
});

// ── praxis.flashcards.delete — string-payload envelope ────────────────────────

describe("praxis.flashcards.delete — envelope wiring", () => {
  it("resolves with { ok: true, value: undefined } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { delete: async () => undefined });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "fc-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.flashcards.delete).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string flashcardId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.flashcards.delete).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        delete: async () => {
          throw new Error("foreign key constraint");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.delete");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "fc-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.flashcards.dueCount — no-payload envelope ─────────────────────────

describe("praxis.flashcards.dueCount — envelope wiring", () => {
  it("resolves with { ok: true, value: <count> } when cards are due", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { dueCount: async () => 7 });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.dueCount");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: 7 });
    expect(services.flashcards.dueCount).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: 0 } when no cards are due", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { dueCount: async () => 0 });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.dueCount");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: 0 });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        dueCount: async () => {
          throw new Error("DB locked");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.dueCount");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
