/**
 * Integration tests: envelope wiring for praxis.sketches.* and praxis.conceptMaps.*
 * invoke channels.
 *
 * Channels exercised:
 *   praxis.sketches.get         — string (sketchId); handleEnvelope
 *   praxis.sketches.getSummary  — string (sketchId); handleEnvelope
 *   praxis.conceptMaps.create   — { courseId, title }; handleEnvelope
 *   praxis.conceptMaps.get      — string (id); handleEnvelope
 *   praxis.conceptMaps.list     — { courseId }; handleEnvelope
 *   praxis.conceptMaps.rename   — { id, title }; handleEnvelope
 *   praxis.conceptMaps.delete   — string (id); handleEnvelope
 *   praxis.conceptMaps.listVersions — string (id); handleEnvelope
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

type SketchesOverrides = {
  get?: (id: unknown) => Promise<unknown>;
  getSummary?: (id: unknown) => Promise<unknown>;
};

type ConceptMapsOverrides = {
  create?: (input: unknown) => Promise<unknown>;
  get?: (id: unknown) => Promise<unknown>;
  list?: (input: unknown) => Promise<unknown>;
  rename?: (id: unknown, title: unknown) => Promise<unknown>;
  delete?: (id: unknown) => Promise<unknown>;
  listVersions?: (id: unknown) => Promise<unknown>;
  setNodeLink?: (input: unknown) => Promise<unknown>;
  computeRipples?: (input: unknown) => Promise<unknown>;
  convertFromSketch?: (noteId: unknown, studentId: unknown) => Promise<unknown>;
};

function makeServices(
  sketchesOverrides: SketchesOverrides = {},
  conceptMapsOverrides: ConceptMapsOverrides = {},
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
    listOpen: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    open: vi.fn().mockResolvedValue({}),
    openDocument: vi.fn().mockResolvedValue({}),
    reopen: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue({}),
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
    get: sketchesOverrides.get
      ? vi.fn().mockImplementation(sketchesOverrides.get)
      : vi.fn().mockResolvedValue({
          id: "sketch-1",
          snapshot: { shapes: [] },
          width: 800,
          height: 600,
          createdAt: 1000,
          image: Buffer.from("png-data"),
        }),
    getSummary: sketchesOverrides.getSummary
      ? vi.fn().mockImplementation(sketchesOverrides.getSummary)
      : vi.fn().mockResolvedValue({ id: "sketch-1", createdAt: 1000 }),
  };

  const conceptMaps = {
    create: conceptMapsOverrides.create
      ? vi.fn().mockImplementation(conceptMapsOverrides.create)
      : vi.fn().mockResolvedValue({ id: "cm-1", title: "Map", courseId: "course-1" }),
    get: conceptMapsOverrides.get
      ? vi.fn().mockImplementation(conceptMapsOverrides.get)
      : vi.fn().mockResolvedValue(null),
    list: conceptMapsOverrides.list
      ? vi.fn().mockImplementation(conceptMapsOverrides.list)
      : vi.fn().mockResolvedValue([]),
    rename: conceptMapsOverrides.rename
      ? vi.fn().mockImplementation(conceptMapsOverrides.rename)
      : vi.fn().mockResolvedValue({ id: "cm-1", title: "Renamed" }),
    delete: conceptMapsOverrides.delete
      ? vi.fn().mockImplementation(conceptMapsOverrides.delete)
      : vi.fn().mockResolvedValue(undefined),
    updateScene: vi.fn().mockResolvedValue(undefined),
    listVersions: conceptMapsOverrides.listVersions
      ? vi.fn().mockImplementation(conceptMapsOverrides.listVersions)
      : vi.fn().mockResolvedValue([]),
    setNodeLink: conceptMapsOverrides.setNodeLink
      ? vi.fn().mockImplementation(conceptMapsOverrides.setNodeLink)
      : vi.fn().mockResolvedValue({ id: "cm-1", conceptLinks: [] }),
    computeRipples: conceptMapsOverrides.computeRipples
      ? vi.fn().mockImplementation(conceptMapsOverrides.computeRipples)
      : vi.fn().mockResolvedValue({ conceptCountDelta: 0, notesRetagged: 0, tutorRefsAffected: 0 }),
    convertFromSketch: conceptMapsOverrides.convertFromSketch
      ? vi.fn().mockImplementation(conceptMapsOverrides.convertFromSketch)
      : vi.fn().mockResolvedValue({
          conceptMapId: "cm-new-1",
          originalSketchNoteId: "note-1",
          nodeCount: 3,
        }),
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

// ── praxis.sketches.get — string-payload envelope ─────────────────────────────

describe("praxis.sketches.get — envelope wiring", () => {
  it("resolves with { ok: true, value: <sketch> } for a valid sketchId", async () => {
    const sketch = {
      id: "sketch-1",
      snapshot: { shapes: [] },
      width: 800,
      height: 600,
      createdAt: 1000,
      image: Buffer.from("png-data"),
    };
    const log = makeFakeLogger();
    const services = makeServices({ get: async () => sketch });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.sketches.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "sketch-1");
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "sketch-1",
        snapshot: { shapes: [] },
        width: 800,
        height: 600,
        createdAt: 1000,
        imageBase64: Buffer.from("png-data").toString("base64"),
      },
    });
    expect(services.sketches.get).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string sketchId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.sketches.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sketches.get).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      get: async () => {
        throw new Error("sketch not found");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.sketches.get");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "sketch-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.sketches.getSummary — string-payload envelope ─────────────────────

describe("praxis.sketches.getSummary — envelope wiring", () => {
  it("resolves with { ok: true, value: <summary> } for a valid sketchId", async () => {
    const summary = { id: "sketch-1", createdAt: 1000 };
    const log = makeFakeLogger();
    const services = makeServices({ getSummary: async () => summary });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.sketches.getSummary");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "sketch-1");
    expect(result).toMatchObject({ ok: true, value: summary });
    expect(services.sketches.getSummary).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when sketch has no summary", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ getSummary: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.sketches.getSummary");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "sketch-missing");
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty string sketchId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.sketches.getSummary");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sketches.getSummary).not.toHaveBeenCalled();
  });
});

// ── praxis.conceptMaps.create — structured-payload envelope ──────────────────

describe("praxis.conceptMaps.create — envelope wiring", () => {
  it("resolves with { ok: true, value: <map> } for a valid payload", async () => {
    const map = { id: "cm-1", title: "Biology Map", courseId: "course-bio" };
    const log = makeFakeLogger();
    const services = makeServices({}, { create: async () => map });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.create");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseId: "course-bio", title: "Biology Map" });
    expect(result).toMatchObject({ ok: true, value: map });
    expect(services.conceptMaps.create).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when courseId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.create");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { title: "Biology Map" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.create).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when title is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.create");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseId: "course-bio", title: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.create).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        create: async () => {
          throw new Error("course not found");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.create");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { courseId: "course-bio", title: "Biology Map" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.conceptMaps.get — string-payload envelope ─────────────────────────

describe("praxis.conceptMaps.get — envelope wiring", () => {
  it("resolves with { ok: true, value: <map> } for a valid id", async () => {
    const map = { id: "cm-1", title: "Biology Map", courseId: "course-bio" };
    const log = makeFakeLogger();
    const services = makeServices({}, { get: async () => map });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "cm-1");
    expect(result).toMatchObject({ ok: true, value: map });
    expect(services.conceptMaps.get).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: null } when map is not found", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { get: async () => null });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "cm-missing");
    expect(result).toMatchObject({ ok: true, value: null });
  });

  it("returns VALIDATION_FAILED for an empty string id", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.get");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.get).not.toHaveBeenCalled();
  });
});

// ── praxis.conceptMaps.list — structured-payload envelope ────────────────────

describe("praxis.conceptMaps.list — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no maps exist", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { list: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseId: "course-bio" });
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.conceptMaps.list).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <maps> } when maps exist", async () => {
    const maps = [{ id: "cm-1", title: "Map 1", courseId: "course-bio" }];
    const log = makeFakeLogger();
    const services = makeServices({}, { list: async () => maps });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { courseId: "course-bio" });
    expect(result).toMatchObject({ ok: true, value: maps });
  });

  it("returns VALIDATION_FAILED when courseId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.list");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.list).not.toHaveBeenCalled();
  });
});

// ── praxis.conceptMaps.rename — structured-payload envelope ──────────────────

describe("praxis.conceptMaps.rename — envelope wiring", () => {
  it("resolves with { ok: true, value: <map> } for a valid payload", async () => {
    const map = { id: "cm-1", title: "New Name" };
    const log = makeFakeLogger();
    const services = makeServices({}, { rename: async () => map });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.rename");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { id: "cm-1", title: "New Name" });
    expect(result).toMatchObject({ ok: true, value: map });
    expect(services.conceptMaps.rename).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when id is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.rename");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { title: "New Name" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.rename).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when title is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.rename");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { id: "cm-1", title: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.rename).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        rename: async () => {
          throw new Error("map not found");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.rename");
    expect(handler).toBeDefined();

    await expect(handler?.({}, { id: "cm-1", title: "New Name" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.conceptMaps.delete — string-payload envelope ──────────────────────

describe("praxis.conceptMaps.delete — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { delete: async () => undefined });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "cm-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.conceptMaps.delete).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED for an empty string id", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.delete");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.delete).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        delete: async () => {
          throw new Error("map already deleted");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.delete");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "cm-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.conceptMaps.listVersions — string-payload envelope ────────────────

describe("praxis.conceptMaps.listVersions — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no versions exist", async () => {
    const log = makeFakeLogger();
    const services = makeServices({}, { listVersions: async () => [] });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.listVersions");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "cm-1");
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.conceptMaps.listVersions).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <versions> } when versions exist", async () => {
    const versions = [{ id: "v1", createdAt: 1000 }];
    const log = makeFakeLogger();
    const services = makeServices({}, { listVersions: async () => versions });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.listVersions");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "cm-1");
    expect(result).toMatchObject({ ok: true, value: versions });
  });

  it("returns VALIDATION_FAILED for an empty string id", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.listVersions");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.listVersions).not.toHaveBeenCalled();
  });
});

// ── praxis.conceptMaps.setNodeLink — structured-payload envelope ──────────────

describe("praxis.conceptMaps.setNodeLink — envelope wiring", () => {
  it("resolves with { ok: true, value: <map> } for a valid payload", async () => {
    const map = { id: "cm-1", conceptLinks: [{ elementId: "shape:n1", linkState: "linked" }] };
    const log = makeFakeLogger();
    const services = makeServices({}, { setNodeLink: async () => map });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.setNodeLink");
    expect(handler).toBeDefined();

    const result = await handler?.(
      {},
      {
        mapId: "cm-1",
        elementId: "shape:n1",
        candidateId: "concept-algebra",
        state: "linked",
      },
    );
    expect(result).toMatchObject({ ok: true, value: map });
    expect(services.conceptMaps.setNodeLink).toHaveBeenCalledOnce();
  });

  it("resolves with null candidateId for unlinked state", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      { setNodeLink: async () => ({ id: "cm-1", conceptLinks: [] }) },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.setNodeLink");
    const result = await handler?.(
      {},
      {
        mapId: "cm-1",
        elementId: "shape:n1",
        candidateId: null,
        state: "unlinked",
      },
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("returns VALIDATION_FAILED when mapId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.setNodeLink");
    const result = await handler?.(
      {},
      { elementId: "shape:n1", candidateId: "c-1", state: "linked" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.setNodeLink).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when state is not a valid enum value", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.setNodeLink");
    const result = await handler?.(
      {},
      {
        mapId: "cm-1",
        elementId: "shape:n1",
        candidateId: "c-1",
        state: "invalid_state",
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.setNodeLink).not.toHaveBeenCalled();
  });

  it("returns INTERNAL when service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        setNodeLink: async () => {
          throw new Error("map not found");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.setNodeLink");
    await expect(
      handler?.({}, { mapId: "cm-1", elementId: "shape:n1", candidateId: "c-1", state: "linked" }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

// ── praxis.conceptMaps.computeRipples — structured-payload envelope ───────────

describe("praxis.conceptMaps.computeRipples — envelope wiring", () => {
  it("resolves with { ok: true, value: <ripples> } for a valid payload", async () => {
    const ripples = { conceptCountDelta: 1, notesRetagged: 2, tutorRefsAffected: 0 };
    const log = makeFakeLogger();
    const services = makeServices({}, { computeRipples: async () => ripples });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.computeRipples");
    expect(handler).toBeDefined();

    const result = await handler?.(
      {},
      {
        mapId: "cm-1",
        elementId: "shape:n1",
        candidateId: "concept-algebra",
      },
    );
    expect(result).toMatchObject({ ok: true, value: ripples });
    expect(services.conceptMaps.computeRipples).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when candidateId is empty", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.computeRipples");
    const result = await handler?.(
      {},
      {
        mapId: "cm-1",
        elementId: "shape:n1",
        candidateId: "",
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.computeRipples).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when elementId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.computeRipples");
    const result = await handler?.({}, { mapId: "cm-1", candidateId: "concept-x" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL when service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        computeRipples: async () => {
          throw new Error("DB error");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.computeRipples");
    await expect(
      handler?.({}, { mapId: "cm-1", elementId: "shape:n1", candidateId: "concept-x" }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

// ── praxis.conceptMaps.convertFromSketch — structured-payload envelope ────────

describe("praxis.conceptMaps.convertFromSketch — envelope wiring", () => {
  it("resolves with { ok: true, value: <result> } for a valid sketchNoteId", async () => {
    const conversionResult = {
      conceptMapId: "cm-new-1",
      originalSketchNoteId: "note-sketch-1",
      nodeCount: 5,
    };
    const log = makeFakeLogger();
    const services = makeServices({}, { convertFromSketch: async () => conversionResult });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.convertFromSketch");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { sketchNoteId: "note-sketch-1" });
    expect(result).toMatchObject({ ok: true, value: conversionResult });
    expect(services.conceptMaps.convertFromSketch).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when sketchNoteId is empty", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.convertFromSketch");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { sketchNoteId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.convertFromSketch).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when sketchNoteId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.convertFromSketch");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.conceptMaps.convertFromSketch).not.toHaveBeenCalled();
  });

  it("returns INTERNAL when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices(
      {},
      {
        convertFromSketch: async () => {
          throw new Error("sketch not found");
        },
      },
    );
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.conceptMaps.convertFromSketch");
    await expect(handler?.({}, { sketchNoteId: "note-1" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
