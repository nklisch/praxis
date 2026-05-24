/**
 * Integration tests: envelope wiring for praxis.session.spawnFromNote.
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
  overrides: { sessionSpawnFromNote?: (opts: unknown) => Promise<unknown> } = {},
) {
  const session = {
    active: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({ summary: "ended" }),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: vi.fn().mockResolvedValue({ id: "sess-child-1" }),
    spawnFromNote: overrides.sessionSpawnFromNote
      ? vi.fn().mockImplementation(overrides.sessionSpawnFromNote)
      : vi.fn().mockResolvedValue({ sessionId: "sess-note-1", modeId: "teach", startedAt: 0 }),
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

  const update = { checkLatest: vi.fn().mockResolvedValue({ status: "disabled" }) };

  const artifacts = {
    courses: vi.fn().mockResolvedValue([]),
    course: vi.fn().mockResolvedValue(null),
    lessons: vi.fn().mockResolvedValue([]),
    lessonAssessments: vi.fn().mockResolvedValue([]),
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
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
  } as any;
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.session.spawnFromNote ──────────────────────────────────────────────

describe("praxis.session.spawnFromNote — envelope wiring", () => {
  it("resolves with { ok: true, value: <handle> } for a valid noteId payload", async () => {
    const noteHandle = { sessionId: "sess-note-1", modeId: "teach", startedAt: 0 };
    const log = makeFakeLogger();
    const services = makeServices({ sessionSpawnFromNote: async () => noteHandle });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { noteId: "note-abc-001" });
    expect(result).toMatchObject({ ok: true, value: noteHandle });
    expect(services.session.spawnFromNote).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: "note-abc-001" }),
    );
  });

  it("resolves with { ok: true } when optional cueId is provided", async () => {
    const noteHandle = { sessionId: "sess-note-2", modeId: "teach", startedAt: 0 };
    const log = makeFakeLogger();
    const services = makeServices({ sessionSpawnFromNote: async () => noteHandle });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    const result = await handler?.({}, { noteId: "note-abc-002", cueId: "1" });
    expect(result).toMatchObject({ ok: true, value: noteHandle });
    expect(services.session.spawnFromNote).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: "note-abc-002", cueId: "1" }),
    );
  });

  it("returns VALIDATION_FAILED for a missing noteId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    expect(handler).toBeDefined();

    const result = await handler?.({}, {});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.session.spawnFromNote).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED for an empty noteId string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    const result = await handler?.({}, { noteId: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for a non-object payload", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    const result = await handler?.({}, "not-an-object");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionSpawnFromNote: async () => {
        throw new Error("note not found");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    await expect(handler?.({}, { noteId: "note-abc-001" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });

  it("returns INTERNAL with no path leakage when service throws a path error", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      sessionSpawnFromNote: async () => {
        throw new Error("/home/user/.praxis/dev.db: no such table: notes");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromNote");
    const result = await handler?.({}, { noteId: "note-abc-001" });
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/home/user/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── praxis.session.spawnFromPassage ──────────────────────────────────────────

describe("praxis.session.spawnFromPassage — envelope wiring", () => {
  it("resolves with { ok: true, value: <handle> } for a valid payload", async () => {
    const passageHandle = { sessionId: "sess-passage-1", modeId: "teach", startedAt: 0 };
    const spawnFromPassage = vi.fn().mockResolvedValue(passageHandle);
    const log = makeFakeLogger();
    const services = makeServices();
    // Patch spawnFromPassage onto the session stub.
    // biome-ignore lint/suspicious/noExplicitAny: test patching
    (services.session as any).spawnFromPassage = spawnFromPassage;
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    expect(handler).toBeDefined();

    const result = await handler?.(
      {},
      { documentId: "doc-001", range: { startOffset: 10, endOffset: 50 } },
    );
    expect(result).toMatchObject({ ok: true, value: passageHandle });
    expect(spawnFromPassage).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-001", range: { startOffset: 10, endOffset: 50 } }),
    );
  });

  it("returns VALIDATION_FAILED for missing documentId", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    const result = await handler?.({}, { range: { startOffset: 0, endOffset: 10 } });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for missing range", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    const result = await handler?.({}, { documentId: "doc-001" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for negative startOffset", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    const result = await handler?.(
      {},
      { documentId: "doc-001", range: { startOffset: -1, endOffset: 10 } },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED when endOffset < startOffset", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    const result = await handler?.(
      {},
      { documentId: "doc-001", range: { startOffset: 50, endOffset: 10 } },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED when endOffset exceeds MAX_PASSAGE_OFFSET (10_000_000)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    const result = await handler?.(
      {},
      { documentId: "doc-001", range: { startOffset: 0, endOffset: 10_000_001 } },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL (never rejects) when service throws", async () => {
    const spawnFromPassage = vi.fn().mockRejectedValue(new Error("document not found"));
    const log = makeFakeLogger();
    const services = makeServices();
    // biome-ignore lint/suspicious/noExplicitAny: test patching
    (services.session as any).spawnFromPassage = spawnFromPassage;
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.session.spawnFromPassage");
    await expect(
      handler?.({}, { documentId: "doc-001", range: { startOffset: 0, endOffset: 10 } }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});
