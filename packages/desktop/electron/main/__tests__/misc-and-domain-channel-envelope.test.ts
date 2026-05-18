/**
 * Integration tests: envelope wiring for misc ipc-server.ts channels and
 * per-domain channel module invoke handlers.
 *
 * Channels exercised:
 *   ipc-server.ts:
 *     praxis.auth.claude.status     — no-payload getter; wrapEnvelope
 *     praxis.tabs.openDocument      — { documentId, title }; handleEnvelope
 *
 *   document-scopes-channel.ts:
 *     praxis.documentScopes.listOrphaned           — wrapEnvelope
 *     praxis.documentScopes.listForScope           — wrapEnvelope
 *     praxis.documentScopes.attach                 — wrapEnvelope
 *     praxis.documentScopes.detach                 — wrapEnvelope
 *     praxis.documentScopes.listScopesForDocument  — wrapEnvelope
 *
 *   ingest-channel.ts:
 *     praxis.ingest.pickFile      — wrapEnvelope
 *     praxis.ingest.pickPaths     — wrapEnvelope
 *     praxis.ingest.isAvailable   — wrapEnvelope
 *     praxis.ingest.candidatesFor — wrapEnvelope
 *
 *   quick-check-channel.ts:
 *     praxis.quickCheck.resolve — wrapEnvelope
 *
 *   subagent-channel.ts:
 *     praxis.subAgent.list — wrapEnvelope
 *
 *   activity-channel.ts:
 *     praxis.activity.dismiss — wrapEnvelope
 *
 * Pattern: electron-ipc-test-harness — mock `electron` before importing the
 * module under test; capture handlers from ipcMain.handle; invoke directly.
 *
 * Test count: 20
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
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
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

type ServiceOverrides = {
  claudeAuth?: {
    status?: () => Promise<unknown>;
  };
  tabs?: {
    openDocument?: (input: unknown) => Promise<unknown>;
  };
  documentScopes?: {
    listOrphaned?: (studentId: unknown) => Promise<unknown>;
    listForScopeDetailed?: (scope: unknown) => Promise<unknown>;
    attach?: (input: unknown) => Promise<unknown>;
    detach?: (input: unknown) => Promise<unknown>;
    listScopesForDocument?: (documentId: unknown) => Promise<unknown>;
  };
  ingestorRegistry?: {
    supportedExtensions?: () => string[];
    candidatesFor?: (payload: unknown) => Promise<unknown>;
  };
  quickCheck?: {
    resolve?: (input: unknown) => void;
  };
  subAgent?: {
    list?: () => Promise<unknown>;
  };
  activity?: {
    dismiss?: (id: unknown) => void;
  };
};

function makeServices(overrides: ServiceOverrides = {}) {
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
    status: overrides.claudeAuth?.status
      ? vi.fn().mockImplementation(overrides.claudeAuth.status)
      : vi.fn().mockResolvedValue({ authenticated: false }),
    login: vi.fn(async function* () {}),
  };

  const tabs = {
    listOpen: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    open: vi.fn().mockResolvedValue({}),
    openDocument: overrides.tabs?.openDocument
      ? vi.fn().mockImplementation(overrides.tabs.openDocument)
      : vi.fn().mockResolvedValue({ id: "tab-doc-1", title: "My Doc" }),
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
    get: vi.fn().mockResolvedValue(null),
    getSummary: vi.fn().mockResolvedValue(null),
  };

  const conceptMaps = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    updateScene: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
  };

  const documentScopes = {
    listOrphaned: overrides.documentScopes?.listOrphaned
      ? vi.fn().mockImplementation(overrides.documentScopes.listOrphaned)
      : vi.fn().mockResolvedValue([]),
    listForScopeDetailed: overrides.documentScopes?.listForScopeDetailed
      ? vi.fn().mockImplementation(overrides.documentScopes.listForScopeDetailed)
      : vi.fn().mockResolvedValue([]),
    attach: overrides.documentScopes?.attach
      ? vi.fn().mockImplementation(overrides.documentScopes.attach)
      : vi.fn().mockResolvedValue({ attached: true }),
    detach: overrides.documentScopes?.detach
      ? vi.fn().mockImplementation(overrides.documentScopes.detach)
      : vi.fn().mockResolvedValue({ detached: true }),
    listScopesForDocument: overrides.documentScopes?.listScopesForDocument
      ? vi.fn().mockImplementation(overrides.documentScopes.listScopesForDocument)
      : vi.fn().mockResolvedValue([]),
  };

  const activity = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    dismiss: overrides.activity?.dismiss
      ? vi.fn().mockImplementation(overrides.activity.dismiss)
      : vi.fn(),
  };

  const subAgent = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    list: overrides.subAgent?.list
      ? vi.fn().mockImplementation(overrides.subAgent.list)
      : vi.fn().mockResolvedValue([]),
  };

  const bootstrap = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    startExploration: vi.fn(async function* () {}),
  };

  const quickCheck = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    resolve: overrides.quickCheck?.resolve
      ? vi.fn().mockImplementation(overrides.quickCheck.resolve)
      : vi.fn(),
  };

  const ingestorRegistry = {
    supportedExtensions: overrides.ingestorRegistry?.supportedExtensions
      ? vi.fn().mockImplementation(overrides.ingestorRegistry.supportedExtensions)
      : vi.fn().mockReturnValue([]),
    candidatesFor: overrides.ingestorRegistry?.candidatesFor
      ? vi.fn().mockImplementation(overrides.ingestorRegistry.candidatesFor)
      : vi.fn().mockResolvedValue([]),
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
    documentScopes,
    activity,
    subAgent,
    bootstrap,
    quickCheck,
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

// ── praxis.auth.claude.status — no-payload envelope ──────────────────────────

describe("praxis.auth.claude.status — envelope wiring", () => {
  it("resolves with { ok: true, value: <status> } when authenticated", async () => {
    const status = { authenticated: true };
    const log = makeFakeLogger();
    const services = makeServices({ claudeAuth: { status: async () => status } });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.auth.claude.status");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: { authenticated: true } });
    expect(services.claudeAuth.status).toHaveBeenCalledOnce();
  });

  it("resolves with { ok: true, value: <status> } when not authenticated", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      claudeAuth: { status: async () => ({ authenticated: false }) },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.auth.claude.status");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: { authenticated: false } });
  });

  it("returns INTERNAL envelope (never rejects) when claudeAuth.status throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      claudeAuth: {
        status: async () => {
          throw new Error("auth service unavailable");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.auth.claude.status");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.tabs.openDocument — structured-payload envelope ───────────────────

describe("praxis.tabs.openDocument — envelope wiring", () => {
  it("resolves with { ok: true, value: <tab> } for a valid payload", async () => {
    const tab = { id: "tab-doc-1", title: "Biology Textbook" };
    const log = makeFakeLogger();
    const services = makeServices({ tabs: { openDocument: async () => tab } });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.openDocument");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { documentId: "doc-1", title: "Biology Textbook" });
    expect(result).toMatchObject({ ok: true, value: tab });
    expect(services.tabs.openDocument).toHaveBeenCalledOnce();
  });

  it("returns VALIDATION_FAILED when documentId is missing", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.openDocument");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { title: "Biology Textbook" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.openDocument).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when documentId is an empty string", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.openDocument");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { documentId: "", title: "Biology Textbook" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.tabs.openDocument).not.toHaveBeenCalled();
  });

  it("returns INTERNAL envelope (never rejects) when tabs.openDocument throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      tabs: {
        openDocument: async () => {
          throw new Error("document not found");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.tabs.openDocument");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { documentId: "doc-missing", title: "Missing Doc" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.documentScopes.listOrphaned — no-payload envelope ─────────────────

describe("praxis.documentScopes.listOrphaned — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no orphaned scopes exist", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ documentScopes: { listOrphaned: async () => [] } });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.documentScopes.listOrphaned");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.documentScopes.listOrphaned).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      documentScopes: {
        listOrphaned: async () => {
          throw new Error("db error");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.documentScopes.listOrphaned");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.documentScopes.attach — structured-payload envelope ───────────────

describe("praxis.documentScopes.attach — envelope wiring", () => {
  it("resolves with { ok: true, value: { attached: true } } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      documentScopes: { attach: async () => ({ attached: true }) },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.documentScopes.attach");
    expect(handler).toBeDefined();

    const result = await handler?.(
      {},
      {
        scope: { kind: "course", id: "course-1" },
        documentId: "doc-1",
      },
    );
    expect(result).toMatchObject({ ok: true, value: { attached: true } });
    expect(services.documentScopes.attach).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      documentScopes: {
        attach: async () => {
          throw new Error("attach failed");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.documentScopes.attach");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { scope: { kind: "course", id: "course-1" }, documentId: "doc-1" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.ingest.pickFile — no-payload envelope ──────────────────────────────

describe("praxis.ingest.pickFile — envelope wiring", () => {
  it("resolves with { ok: true, value: null } when dialog is cancelled", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.ingest.pickFile");
    expect(handler).toBeDefined();

    // dialog mock returns { canceled: true, filePaths: [] } by default
    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: null });
  });
});

// ── praxis.ingest.isAvailable — no-payload envelope ──────────────────────────

describe("praxis.ingest.isAvailable — envelope wiring", () => {
  it("resolves with { ok: true, value: { available: true } }", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.ingest.isAvailable");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: { available: true } });
  });
});

// ── praxis.ingest.candidatesFor — structured-payload envelope ─────────────────

describe("praxis.ingest.candidatesFor — envelope wiring", () => {
  it("resolves with { ok: true, value: <candidates> } for a valid payload", async () => {
    const candidates = [{ id: "pdf", label: "PDF" }];
    const log = makeFakeLogger();
    const services = makeServices({
      ingestorRegistry: { candidatesFor: async () => candidates },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.ingest.candidatesFor");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { mimeType: "application/pdf", filename: "bio.pdf" });
    expect(result).toMatchObject({ ok: true, value: candidates });
    expect(services.ingestorRegistry.candidatesFor).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when the registry throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      ingestorRegistry: {
        candidatesFor: async () => {
          throw new Error("registry error");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.ingest.candidatesFor");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { mimeType: "application/pdf", filename: "bio.pdf" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.quickCheck.resolve — structured-payload envelope ───────────────────

describe("praxis.quickCheck.resolve — envelope wiring", () => {
  it("resolves with { ok: true, value: undefined } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ quickCheck: { resolve: () => undefined } });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    expect(handler).toBeDefined();

    const result = await handler?.({}, { callId: "call-1", answer: { correct: true } });
    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when quickCheck.resolve throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      quickCheck: {
        resolve: () => {
          throw new Error("no pending check");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    expect(handler).toBeDefined();

    await expect(
      handler?.({}, { callId: "call-missing", answer: { correct: false } }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.subAgent.list — no-payload envelope ────────────────────────────────

describe("praxis.subAgent.list — envelope wiring", () => {
  it("resolves with { ok: true, value: [] } when no sub-agents exist", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ subAgent: { list: async () => [] } });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.subAgent.list");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: [] });
    expect(services.subAgent.list).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when subAgent.list throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      subAgent: {
        list: async () => {
          throw new Error("registry error");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.subAgent.list");
    expect(handler).toBeDefined();

    await expect(handler?.({})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});

// ── praxis.activity.dismiss — string-payload envelope ─────────────────────────

describe("praxis.activity.dismiss — envelope wiring", () => {
  it("resolves with { ok: true } on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices({ activity: { dismiss: () => undefined } });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.activity.dismiss");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "activity-1");
    expect(result).toMatchObject({ ok: true });
    expect(services.activity.dismiss).toHaveBeenCalledOnce();
  });

  it("returns INTERNAL envelope (never rejects) when activity.dismiss throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      activity: {
        dismiss: () => {
          throw new Error("activity not found");
        },
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.activity.dismiss");
    expect(handler).toBeDefined();

    await expect(handler?.({}, "activity-missing")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
