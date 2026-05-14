/**
 * Integration tests: envelope wiring for praxis.author.* invoke channels.
 *
 * Channels exercised (24 total):
 *   praxis.author.getGlobalPrompt       — no-payload getter, wrapEnvelope
 *   praxis.author.setGlobalPrompt       — { text: string | null }, handleEnvelope
 *   praxis.author.getModeAppend         — { modeId }, handleEnvelope
 *   praxis.author.setModeAppend         — { modeId, text }, handleEnvelope
 *   praxis.author.listFragmentOverrides — { modeId }, handleEnvelope
 *   praxis.author.customizePrompt       — { modeId, fragmentId, override }, handleEnvelope
 *   praxis.author.clearFragmentOverride — { modeId, fragmentId }, handleEnvelope
 *   praxis.author.previewPrompt         — { modeId, draftGlobal?, draftAppend? }, handleEnvelope
 *   praxis.author.previewPromptWithAttribution — same shape, handleEnvelope
 *   praxis.author.setStyleSliders       — { socratic, verbosity, formality }, handleEnvelope
 *   praxis.author.getCourseSummary      — string (courseId), handleEnvelope
 *   praxis.author.updateCourse          — structured payload, handleEnvelope
 *   praxis.author.createLesson          — structured payload, handleEnvelope
 *   praxis.author.updateLesson          — structured payload, handleEnvelope
 *   praxis.author.deleteLesson          — { lessonId, reason? }, handleEnvelope
 *   praxis.author.createGate            — structured payload, handleEnvelope
 *   praxis.author.updateGate            — structured payload, handleEnvelope
 *   praxis.author.deleteGate            — { gateId, reason? }, handleEnvelope
 *   praxis.author.overrideGate          — { gateId, reason }, handleEnvelope
 *   praxis.author.resetConcept          — { conceptId, reason }, handleEnvelope
 *   praxis.author.clearMisconception    — { misconceptionId, reason }, handleEnvelope
 *   praxis.author.exportMemory          — { targetPath }, handleEnvelope
 *   praxis.author.deleteAllMemory       — { reason, confirm: true }, handleEnvelope
 *   praxis.author.listConfiguratorActions — optional payload, handleEnvelope
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: ~28
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

type AuthoringOverrides = {
  getGlobalPrompt?: () => Promise<unknown>;
  setGlobalPrompt?: (text: string | null) => Promise<unknown>;
  getModeAppend?: (modeId: string) => Promise<unknown>;
  setModeAppend?: (input: unknown) => Promise<unknown>;
  listFragmentOverrides?: (modeId: string) => Promise<unknown>;
  customizePrompt?: (modeId: string, fragmentId: string, override: string) => Promise<unknown>;
  clearFragmentOverride?: (input: unknown) => Promise<unknown>;
  previewPrompt?: (input: unknown) => Promise<unknown>;
  previewPromptWithAttribution?: (input: unknown) => Promise<unknown>;
  setStyleSliders?: (input: unknown) => Promise<unknown>;
  getCourseSummary?: (courseId: unknown) => Promise<unknown>;
  updateCourse?: (input: unknown) => Promise<unknown>;
  createLesson?: (input: unknown) => Promise<unknown>;
  updateLesson?: (input: unknown) => Promise<unknown>;
  deleteLesson?: (input: unknown) => Promise<unknown>;
  createGate?: (input: unknown) => Promise<unknown>;
  updateGate?: (input: unknown) => Promise<unknown>;
  deleteGate?: (input: unknown) => Promise<unknown>;
  overrideGate?: (input: unknown) => Promise<unknown>;
  resetConcept?: (input: unknown) => Promise<unknown>;
  clearMisconception?: (input: unknown) => Promise<unknown>;
  exportMemory?: (input: unknown) => Promise<unknown>;
  deleteAllMemory?: (input: unknown) => Promise<unknown>;
  listConfiguratorActions?: (input?: unknown) => Promise<unknown>;
};

function makeServices(authoringOverrides: AuthoringOverrides = {}) {
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

  const authoring = {
    getGlobalPrompt: authoringOverrides.getGlobalPrompt
      ? vi.fn().mockImplementation(authoringOverrides.getGlobalPrompt)
      : vi.fn().mockResolvedValue(null),
    setGlobalPrompt: authoringOverrides.setGlobalPrompt
      ? vi.fn().mockImplementation(authoringOverrides.setGlobalPrompt)
      : vi.fn().mockResolvedValue(undefined),
    getModeAppend: authoringOverrides.getModeAppend
      ? vi.fn().mockImplementation(authoringOverrides.getModeAppend)
      : vi.fn().mockResolvedValue(null),
    setModeAppend: authoringOverrides.setModeAppend
      ? vi.fn().mockImplementation(authoringOverrides.setModeAppend)
      : vi.fn().mockResolvedValue(undefined),
    listFragmentOverrides: authoringOverrides.listFragmentOverrides
      ? vi.fn().mockImplementation(authoringOverrides.listFragmentOverrides)
      : vi.fn().mockResolvedValue([]),
    customizePrompt: authoringOverrides.customizePrompt
      ? vi.fn().mockImplementation(authoringOverrides.customizePrompt)
      : vi.fn().mockResolvedValue(undefined),
    clearFragmentOverride: authoringOverrides.clearFragmentOverride
      ? vi.fn().mockImplementation(authoringOverrides.clearFragmentOverride)
      : vi.fn().mockResolvedValue(undefined),
    previewPrompt: authoringOverrides.previewPrompt
      ? vi.fn().mockImplementation(authoringOverrides.previewPrompt)
      : vi.fn().mockResolvedValue("composed prompt"),
    previewPromptWithAttribution: authoringOverrides.previewPromptWithAttribution
      ? vi.fn().mockImplementation(authoringOverrides.previewPromptWithAttribution)
      : vi.fn().mockResolvedValue({ fragments: [] }),
    setStyleSliders: authoringOverrides.setStyleSliders
      ? vi.fn().mockImplementation(authoringOverrides.setStyleSliders)
      : vi.fn().mockResolvedValue(undefined),
    getStyleSliders: vi.fn().mockResolvedValue({ socratic: 5, verbosity: 5, formality: 5 }),
    getCourseSummary: authoringOverrides.getCourseSummary
      ? vi.fn().mockImplementation(authoringOverrides.getCourseSummary)
      : vi.fn().mockResolvedValue({ course: {}, lessons: [], gates: [], concepts: [] }),
    updateCourse: authoringOverrides.updateCourse
      ? vi.fn().mockImplementation(authoringOverrides.updateCourse)
      : vi.fn().mockResolvedValue({ id: "course-1", title: "Updated" }),
    createLesson: authoringOverrides.createLesson
      ? vi.fn().mockImplementation(authoringOverrides.createLesson)
      : vi.fn().mockResolvedValue({ id: "lesson-1", title: "New Lesson" }),
    updateLesson: authoringOverrides.updateLesson
      ? vi.fn().mockImplementation(authoringOverrides.updateLesson)
      : vi.fn().mockResolvedValue({ id: "lesson-1", title: "Updated" }),
    deleteLesson: authoringOverrides.deleteLesson
      ? vi.fn().mockImplementation(authoringOverrides.deleteLesson)
      : vi.fn().mockResolvedValue(undefined),
    createGate: authoringOverrides.createGate
      ? vi.fn().mockImplementation(authoringOverrides.createGate)
      : vi.fn().mockResolvedValue({ id: "gate-1" }),
    updateGate: authoringOverrides.updateGate
      ? vi.fn().mockImplementation(authoringOverrides.updateGate)
      : vi.fn().mockResolvedValue({ id: "gate-1" }),
    deleteGate: authoringOverrides.deleteGate
      ? vi.fn().mockImplementation(authoringOverrides.deleteGate)
      : vi.fn().mockResolvedValue(undefined),
    overrideGate: authoringOverrides.overrideGate
      ? vi.fn().mockImplementation(authoringOverrides.overrideGate)
      : vi.fn().mockResolvedValue({ id: "gate-1" }),
    resetConcept: authoringOverrides.resetConcept
      ? vi.fn().mockImplementation(authoringOverrides.resetConcept)
      : vi.fn().mockResolvedValue(undefined),
    clearMisconception: authoringOverrides.clearMisconception
      ? vi.fn().mockImplementation(authoringOverrides.clearMisconception)
      : vi.fn().mockResolvedValue(undefined),
    exportMemory: authoringOverrides.exportMemory
      ? vi.fn().mockImplementation(authoringOverrides.exportMemory)
      : vi.fn().mockResolvedValue({ ok: true, bytesWritten: 1024 }),
    deleteAllMemory: authoringOverrides.deleteAllMemory
      ? vi.fn().mockImplementation(authoringOverrides.deleteAllMemory)
      : vi.fn().mockResolvedValue(undefined),
    listConfiguratorActions: authoringOverrides.listConfiguratorActions
      ? vi.fn().mockImplementation(authoringOverrides.listConfiguratorActions)
      : vi.fn().mockResolvedValue([]),
    setFragmentOverride: vi.fn().mockResolvedValue(undefined),
    openConfigurator: vi.fn().mockResolvedValue(undefined),
    listActions: vi.fn().mockResolvedValue([]),
    setGateStatus: vi.fn().mockResolvedValue(undefined),
    setGateLockdown: vi.fn().mockResolvedValue(undefined),
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

// ── praxis.author.getGlobalPrompt ─────────────────────────────────────────────

describe("praxis.author.getGlobalPrompt — envelope wiring (no-payload getter)", () => {
  it("resolves with { ok: true, value: null } when no prompt is set", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getGlobalPrompt");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: null });
    expect(services.authoring.getGlobalPrompt).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <prompt> } when a prompt is stored", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ getGlobalPrompt: async () => "Be concise." });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getGlobalPrompt");
    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: "Be concise." });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      getGlobalPrompt: async () => {
        throw new Error("DB read failure");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getGlobalPrompt");
    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.author.setGlobalPrompt ─────────────────────────────────────────────

describe("praxis.author.setGlobalPrompt — envelope wiring (structured payload)", () => {
  it("resolves with { ok: true } when setting a non-null prompt", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { text: "Always use Socratic method." });
    expect(result).toMatchObject({ ok: true });
    expect(services.authoring.setGlobalPrompt).toHaveBeenCalledWith("Always use Socratic method.");
  });

  it("resolves with { ok: true } when clearing the prompt (text: null)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    const result = await handler?.({}, { text: null });
    expect(result).toMatchObject({ ok: true });
    expect(services.authoring.setGlobalPrompt).toHaveBeenCalledWith(null);
  });

  it("returns VALIDATION_FAILED when the payload is missing the text field", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.setGlobalPrompt).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      setGlobalPrompt: async () => {
        throw new Error("write failed");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setGlobalPrompt");
    await expect(handler?.({}, { text: "some prompt" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.author.listFragmentOverrides ───────────────────────────────────────

describe("praxis.author.listFragmentOverrides — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no overrides exist", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.listFragmentOverrides");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "teach" });
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.authoring.listFragmentOverrides).toHaveBeenCalledWith("teach");
  });

  it("returns VALIDATION_FAILED when modeId is empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.listFragmentOverrides");
    const result = await handler?.({}, { modeId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.listFragmentOverrides).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when modeId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.listFragmentOverrides");
    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.author.getModeAppend ───────────────────────────────────────────────

describe("praxis.author.getModeAppend — envelope wiring", () => {
  it("resolves with { ok: true, value: null } when no append is set", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getModeAppend");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "quiz" });
    expect(result).toMatchObject({ ok: true, value: null });
    expect(services.authoring.getModeAppend).toHaveBeenCalledWith("quiz");
  });

  it("returns VALIDATION_FAILED when modeId is empty", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getModeAppend");
    const result = await handler?.({}, { modeId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.author.setModeAppend ───────────────────────────────────────────────

describe("praxis.author.setModeAppend — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setModeAppend");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "quiz", text: "Extra instructions." });
    expect(result).toMatchObject({ ok: true });
    expect(services.authoring.setModeAppend).toHaveBeenCalledWith({
      modeId: "quiz",
      text: "Extra instructions.",
    });
  });

  it("returns VALIDATION_FAILED when modeId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.setModeAppend");
    const result = await handler?.({}, { text: "hello" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.setModeAppend).not.toHaveBeenCalled();
  });
});

// ── praxis.author.previewPrompt ───────────────────────────────────────────────

describe("praxis.author.previewPrompt — envelope wiring", () => {
  it("resolves with { ok: true, value: <string> } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ previewPrompt: async () => "you are a tutor" });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.previewPrompt");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { modeId: "teach" });
    expect(result).toMatchObject({ ok: true, value: "you are a tutor" });
    expect(services.authoring.previewPrompt).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when modeId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.previewPrompt");
    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.author.getCourseSummary ────────────────────────────────────────────

describe("praxis.author.getCourseSummary — envelope wiring (string payload)", () => {
  it("resolves with { ok: true, value: <summary> } on success", async () => {
    const summary = { course: { id: "course-1" }, lessons: [], gates: [], concepts: [] };
    const log = makeFakeLogger();
    const services = makeServices({ getCourseSummary: async () => summary });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getCourseSummary");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "course-1");
    expect(result).toMatchObject({ ok: true, value: summary });
    expect(services.authoring.getCourseSummary).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when courseId is empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getCourseSummary");
    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.getCourseSummary).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      getCourseSummary: async () => {
        throw new Error("course not found");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.getCourseSummary");
    await expect(handler?.({}, "course-99")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.author.deleteGate ──────────────────────────────────────────────────

describe("praxis.author.deleteGate — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteGate");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { gateId: "gate-1", reason: "obsolete" });
    expect(result).toMatchObject({ ok: true });
    expect(services.authoring.deleteGate).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true } when reason is omitted (optional field)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteGate");
    const result = await handler?.({}, { gateId: "gate-1" });
    expect(result).toMatchObject({ ok: true });
  });

  it("returns VALIDATION_FAILED when gateId is empty", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteGate");
    const result = await handler?.({}, { gateId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.deleteGate).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      deleteGate: async () => {
        throw new Error("gate has dependents");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteGate");
    await expect(handler?.({}, { gateId: "gate-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.author.deleteAllMemory ─────────────────────────────────────────────

describe("praxis.author.deleteAllMemory — envelope wiring", () => {
  it("resolves with { ok: true } on success with confirm: true", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteAllMemory");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { reason: "fresh start", confirm: true });
    expect(result).toMatchObject({ ok: true });
    expect(services.authoring.deleteAllMemory).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when confirm is false (wrong literal)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteAllMemory");
    const result = await handler?.({}, { reason: "fresh start", confirm: false });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.deleteAllMemory).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when reason is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.deleteAllMemory");
    const result = await handler?.({}, { confirm: true });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

// ── praxis.author.exportMemory ────────────────────────────────────────────────

describe("praxis.author.exportMemory — envelope wiring", () => {
  it("resolves with { ok: true, value: { ok: true, bytesWritten } } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      exportMemory: async () => ({ ok: true, bytesWritten: 2048 }),
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.exportMemory");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { targetPath: "/tmp/export.json" });
    expect(result).toMatchObject({ ok: true, value: { ok: true, bytesWritten: 2048 } });
    expect(services.authoring.exportMemory).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when targetPath is empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.exportMemory");
    const result = await handler?.({}, { targetPath: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.exportMemory).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      exportMemory: async () => {
        throw new Error("disk full");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.exportMemory");
    await expect(handler?.({}, { targetPath: "/tmp/export.json" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.author.resetConcept ────────────────────────────────────────────────

describe("praxis.author.resetConcept — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.resetConcept");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { conceptId: "concept-1", reason: "re-teach" });
    expect(result).toMatchObject({ ok: true });
    expect(services.authoring.resetConcept).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when reason is empty", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.resetConcept");
    const result = await handler?.({}, { conceptId: "concept-1", reason: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.authoring.resetConcept).not.toHaveBeenCalled();
  });
});

// ── praxis.author.listConfiguratorActions ─────────────────────────────────────

describe("praxis.author.listConfiguratorActions — envelope wiring (optional payload)", () => {
  it("resolves with { ok: true, value: [] } with no payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.listConfiguratorActions");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.authoring.listConfiguratorActions).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: [] } with limit filter", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.listConfiguratorActions");
    const result = await handler?.({}, { limit: 10 });
    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      listConfiguratorActions: async () => {
        throw new Error("audit log unavailable");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.author.listConfiguratorActions");
    await expect(handler?.({}, undefined)).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
