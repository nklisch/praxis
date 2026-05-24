/**
 * Integration tests: envelope wiring for the 13 residual raw invoke channels
 * that were missed in the initial feature-mutating-ipc-channels-envelope-migration.
 *
 * Channels exercised (representative sample — 5 of 13):
 *   praxis.session.start         — structured payload; handleEnvelope
 *   praxis.session.list          — optional structured payload; handleEnvelope
 *   praxis.assignments.list      — structured payload; handleEnvelope
 *   praxis.flashcards.create     — structured payload; handleEnvelope
 *   praxis.conceptMaps.updateScene — structured payload (large opaque fields); handleEnvelope
 *
 * Channels wrapped but not individually tested here (pattern already proven):
 *   praxis.documents.pageImage, praxis.assignments.recordResponse,
 *   praxis.notes.create, praxis.notes.list, praxis.flashcards.update,
 *   praxis.flashcards.list, praxis.flashcards.review, praxis.sketches.put
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
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

function makeServices(
  overrides: {
    sessionStart?: (opts: unknown) => Promise<unknown>;
    sessionList?: (opts: unknown) => Promise<unknown>;
    assignmentsList?: (opts: unknown) => Promise<unknown>;
    flashcardsCreate?: (opts: unknown) => Promise<unknown>;
    conceptMapsUpdateScene?: (opts: unknown) => Promise<unknown>;
  } = {},
) {
  const session = {
    active: vi.fn().mockResolvedValue(null),
    start: overrides.sessionStart
      ? vi.fn().mockImplementation(overrides.sessionStart)
      : vi.fn().mockResolvedValue({ id: "sess-1", modeId: "teach" }),
    end: vi.fn().mockResolvedValue({ summary: "ended" }),
    list: overrides.sessionList
      ? vi.fn().mockImplementation(overrides.sessionList)
      : vi.fn().mockResolvedValue([]),
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
    list: overrides.assignmentsList
      ? vi.fn().mockImplementation(overrides.assignmentsList)
      : vi.fn().mockResolvedValue([]),
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
    create: overrides.flashcardsCreate
      ? vi.fn().mockImplementation(overrides.flashcardsCreate)
      : vi.fn().mockResolvedValue({ id: "fc-1", front: "Q", back: "A" }),
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
    updateScene: overrides.conceptMapsUpdateScene
      ? vi.fn().mockImplementation(overrides.conceptMapsUpdateScene)
      : vi.fn().mockResolvedValue({ id: "cm-1", scene: {} }),
    listVersions: vi.fn().mockResolvedValue([]),
  };

  const activity = { subscribe: vi.fn().mockReturnValue(() => {}) };
  const subAgent = { subscribe: vi.fn().mockReturnValue(() => {}) };
  const bootstrap = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    startExploration: vi.fn(async function* () {}),
  };
  const quickCheck = { subscribe: vi.fn().mockReturnValue(() => {}) };
  const documentScopes = {
    list: vi.fn().mockResolvedValue([]),
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
  };
  const ingestorRegistry = { supported: vi.fn().mockReturnValue([]) };

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

// ── praxis.session.start — structured-payload envelope ───────────────────────

describe("praxis.session.start — envelope wiring", () => {
  it("resolves with { ok: true, value: <handle> } for a valid modeId", async () => {
    const handle = { id: "sess-1", modeId: "teach" };
    const log = makeSpyLogger();
    const services = makeServices({ sessionStart: async () => handle });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.start");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "teach" });
    expect(result).toMatchObject({ ok: true, value: handle });
    expect(services.session.start).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when modeId is missing", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.start");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseId: "course-1" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.session.start).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when modeId is an empty string", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.start");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      sessionStart: async () => {
        throw new Error("/home/user/.praxis/engines/init.db: SQLITE_CANTOPEN");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.start");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "teach" });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    // Path must not leak across the trust boundary
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("engines/init.db");
  });

  it("passes optional courseId and assignmentId through", async () => {
    const handle = { id: "sess-2", modeId: "quiz" };
    const log = makeSpyLogger();
    const services = makeServices({ sessionStart: async () => handle });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.start");
    const result = await handler?.(
      {},
      { modeId: "quiz", courseId: "course-abc", assignmentId: "asgn-xyz" },
    );
    expect(result).toMatchObject({ ok: true, value: handle });
    expect(services.session.start).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: "quiz" }),
    );
  });
});

// ── praxis.session.list — optional-payload envelope ───────────────────────────

describe("praxis.session.list — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no sessions exist (no opts)", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ sessionList: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("resolves with { ok: true, value: <sessions> } when opts are provided", async () => {
    const sessions = [{ id: "sess-1" }, { id: "sess-2" }];
    const log = makeSpyLogger();
    const services = makeServices({ sessionList: async () => sessions });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.list");
    const result = await handler?.({}, { includeEnded: true, limit: 10 });
    expect(result).toMatchObject({ ok: true, value: sessions });
  });

  it("returns VALIDATION_FAILED when limit is not an integer", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.list");
    const result = await handler?.({}, { limit: 3.14 });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.session.list).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      sessionList: async () => {
        throw new Error("DB locked");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.list");
    await expect(handler?.({}, undefined)).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.assignments.list — structured-payload envelope ────────────────────

describe("praxis.assignments.list — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } for a valid courseId", async () => {
    const log = makeSpyLogger();
    const services = makeServices({ assignmentsList: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseId: "course-1" });
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.assignments.list).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when courseId is missing", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.list");
    const result = await handler?.({}, { kind: "quiz" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignments.list).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when kind is invalid", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.list");
    const result = await handler?.({}, { courseId: "c-1", kind: "bogus" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      assignmentsList: async () => {
        throw new Error("no such table: assignments");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.assignments.list");
    await expect(handler?.({}, { courseId: "c-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.flashcards.create — structured-payload envelope ───────────────────

describe("praxis.flashcards.create — envelope wiring", () => {
  it("resolves with { ok: true, value: <card> } for a valid payload", async () => {
    const card = { id: "fc-1", front: "Q", back: "A" };
    const log = makeSpyLogger();
    const services = makeServices({ flashcardsCreate: async () => card });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.create");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { front: "Q", back: "A" });
    expect(result).toMatchObject({ ok: true, value: card });
    expect(services.flashcards.create).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when front is missing", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.create");
    const result = await handler?.({}, { back: "A" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.flashcards.create).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when front is an empty string", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.create");
    const result = await handler?.({}, { front: "", back: "A" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      flashcardsCreate: async () => {
        throw new Error("unique constraint violated");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.flashcards.create");
    await expect(handler?.({}, { front: "Q", back: "A" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.conceptMaps.updateScene — structured-payload envelope ─────────────

describe("praxis.conceptMaps.updateScene — envelope wiring", () => {
  it("resolves with { ok: true, value: <drawing> } for a valid payload", async () => {
    const drawing = { id: "cm-1", title: "My Map" };
    const log = makeSpyLogger();
    const services = makeServices({ conceptMapsUpdateScene: async () => drawing });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.updateScene");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { id: "cm-1", scene: { nodes: [] }, conceptLinks: [] });
    expect(result).toMatchObject({ ok: true, value: drawing });
    expect(services.conceptMaps.updateScene).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when id is missing", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.updateScene");
    const result = await handler?.({}, { scene: {}, conceptLinks: [] });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.updateScene).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when conceptLinks is not an array", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.updateScene");
    const result = await handler?.({}, { id: "cm-1", scene: {}, conceptLinks: "not-an-array" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      conceptMapsUpdateScene: async () => {
        throw new Error("version conflict");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.updateScene");
    await expect(handler?.({}, { id: "cm-1", scene: {}, conceptLinks: [] })).resolves.toMatchObject(
      { ok: false, error: { code: "INTERNAL" } },
    );
  });

  it("returns INTERNAL with no path leakage when service throws a path error", async () => {
    const log = makeSpyLogger();
    const services = makeServices({
      conceptMapsUpdateScene: async () => {
        throw new Error("/home/user/.praxis/dev.db: disk I/O error");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.updateScene");
    const result = await handler?.({}, { id: "cm-1", scene: {}, conceptLinks: [] });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});
