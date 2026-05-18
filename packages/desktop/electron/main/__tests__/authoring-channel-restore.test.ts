/**
 * IPC harness tests: praxis.author.restoreAction channel.
 *
 * Covers:
 *   a. Valid actionId → envelope ok → RestoreResult.ok = true
 *   b. Unknown actionId → envelope ok → RestoreResult.ok = false, reason = "no_snapshot"
 *   c. Already-restored actionId → envelope ok → RestoreResult.ok = false, reason = "already_restored"
 *   d. Invalid args (missing actionId) → envelope VALIDATION_FAILED via Zod
 *   e. Service throws → INTERNAL envelope (never rejects)
 *   f. Locked state → handler throws (requireUnlocked guard)
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

type RestoreActionOverride = (input: unknown) => Promise<unknown>;
type ListConfiguratorActionsOverride = (input?: unknown) => Promise<unknown>;

function makeServices(
  opts: {
    restoreAction?: RestoreActionOverride;
    listConfiguratorActions?: ListConfiguratorActionsOverride;
    isUnlocked?: boolean;
  } = {},
) {
  const isUnlocked = opts.isUnlocked ?? true;

  const lock = {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(isUnlocked),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
  };

  const authoring = {
    getGlobalPrompt: vi.fn().mockResolvedValue(null),
    setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
    getModeAppend: vi.fn().mockResolvedValue(null),
    setModeAppend: vi.fn().mockResolvedValue(undefined),
    listFragmentOverrides: vi.fn().mockResolvedValue([]),
    customizePrompt: vi.fn().mockResolvedValue(undefined),
    clearFragmentOverride: vi.fn().mockResolvedValue(undefined),
    previewPrompt: vi.fn().mockResolvedValue("composed prompt"),
    previewPromptWithAttribution: vi.fn().mockResolvedValue({ fragments: [] }),
    setStyleSliders: vi.fn().mockResolvedValue(undefined),
    getStyleSliders: vi.fn().mockResolvedValue({ socratic: 5, verbosity: 5, formality: 5 }),
    getCourseSummary: vi
      .fn()
      .mockResolvedValue({ course: {}, lessons: [], gates: [], concepts: [] }),
    updateCourse: vi.fn().mockResolvedValue({ id: "course-1", title: "Updated" }),
    createLesson: vi.fn().mockResolvedValue({ id: "lesson-1", title: "New Lesson" }),
    updateLesson: vi.fn().mockResolvedValue({ id: "lesson-1", title: "Updated" }),
    deleteLesson: vi.fn().mockResolvedValue(undefined),
    createGate: vi.fn().mockResolvedValue({ id: "gate-1" }),
    updateGate: vi.fn().mockResolvedValue({ id: "gate-1" }),
    deleteGate: vi.fn().mockResolvedValue(undefined),
    overrideGate: vi.fn().mockResolvedValue({ id: "gate-1" }),
    resetConcept: vi.fn().mockResolvedValue(undefined),
    clearMisconception: vi.fn().mockResolvedValue(undefined),
    exportMemory: vi.fn().mockResolvedValue({ ok: true, bytesWritten: 1024 }),
    deleteAllMemory: vi.fn().mockResolvedValue(undefined),
    listConfiguratorActions: opts.listConfiguratorActions
      ? vi.fn().mockImplementation(opts.listConfiguratorActions)
      : vi.fn().mockResolvedValue([]),
    setFragmentOverride: vi.fn().mockResolvedValue(undefined),
    openConfigurator: vi.fn().mockResolvedValue(undefined),
    listActions: vi.fn().mockResolvedValue([]),
    setGateStatus: vi.fn().mockResolvedValue(undefined),
    setGateLockdown: vi.fn().mockResolvedValue(undefined),
    restoreAction: opts.restoreAction
      ? vi.fn().mockImplementation(opts.restoreAction)
      : vi.fn().mockResolvedValue({ ok: true, restoredEntity: "course", entityKey: "course-1" }),
  };

  const session = {
    active: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({ summary: "ended" }),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: vi.fn().mockResolvedValue({ id: "sess-child-1" }),
    notifySession: vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    isLocked: vi.fn().mockResolvedValue(false),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    selectedEngine: vi.fn().mockResolvedValue("claude-code"),
    setSelectedEngine: vi.fn().mockResolvedValue(undefined),
    engineConfig: vi.fn().mockResolvedValue({}),
    revealApiKey: vi.fn().mockResolvedValue({ apiKey: null }),
    setEngineConfig: vi.fn().mockResolvedValue(undefined),
    bootstrapConfig: vi.fn().mockResolvedValue({ maxSteps: 10 }),
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

  const update = {
    checkLatest: vi.fn().mockResolvedValue({ status: "disabled" }),
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

// ── praxis.author.restoreAction ───────────────────────────────────────────────

describe("praxis.author.restoreAction — envelope wiring", () => {
  it("handler is registered", () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    expect(handlers.get("praxis.author.restoreAction")).toBeDefined();
  });

  it("(a) valid actionId → envelope ok → RestoreResult.ok = true", async () => {
    const restoreResult = {
      ok: true,
      restoredEntity: "course" as const,
      entityKey: "course-42",
    };
    const log = makeFakeLogger();
    const services = makeServices({
      restoreAction: async () => restoreResult,
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    const result = await handler?.({}, { actionId: "action-abc" });

    expect(result).toMatchObject({ ok: true, value: restoreResult });
    expect(services.authoring.restoreAction).toHaveBeenCalledWith({ actionId: "action-abc" });
  });

  it("(b) unknown actionId → envelope ok → RestoreResult.ok = false, reason = 'no_snapshot'", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      restoreAction: async () => ({ ok: false, reason: "no_snapshot" }),
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    const result = await handler?.({}, { actionId: "action-unknown" });

    expect(result).toMatchObject({
      ok: true,
      value: { ok: false, reason: "no_snapshot" },
    });
    expect(services.authoring.restoreAction).toHaveBeenCalledWith({ actionId: "action-unknown" });
  });

  it("(c) already-restored actionId → envelope ok → RestoreResult.ok = false, reason = 'already_restored'", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      restoreAction: async () => ({ ok: false, reason: "already_restored" }),
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    const result = await handler?.({}, { actionId: "action-already-done" });

    expect(result).toMatchObject({
      ok: true,
      value: { ok: false, reason: "already_restored" },
    });
  });

  it("(d) missing actionId → VALIDATION_FAILED envelope via Zod", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    const result = await handler?.({}, {});

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.restoreAction).not.toHaveBeenCalled();
  });

  it("(d) empty string actionId → VALIDATION_FAILED envelope via Zod", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    const result = await handler?.({}, { actionId: "" });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.restoreAction).not.toHaveBeenCalled();
  });

  it("(e) service throws → INTERNAL envelope (never rejects)", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      restoreAction: async () => {
        throw new Error("DB write failure during restore");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    await expect(handler?.({}, { actionId: "action-xyz" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("(f) locked state → requireUnlocked throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ isUnlocked: false });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.restoreAction");
    // requireUnlocked throws inside wrapEnvelope → INTERNAL envelope
    await expect(handler?.({}, { actionId: "action-xyz" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
    expect(services.authoring.restoreAction).not.toHaveBeenCalled();
  });
});
