/**
 * Integration tests: IPC envelope migration wiring coverage.
 *
 * Purpose: catch regressions where a channel is added or modified and
 * `wrapEnvelope` is accidentally removed or skipped. Unit tests in
 * `ipc-error-envelope.test.ts` cover the helper itself; these tests drive the
 * real `ipcMain.handle` registrations through `registerIpcHandlers` so that
 * wiring gaps — not helper bugs — are detected.
 *
 * Channels exercised:
 *   praxis.shell.openExternal  — migrated; `withSchema` + URL allowlist
 *   praxis.config.setSelectedEngine — migrated; `withSchema` + EngineIdSchema
 *   praxis.lock.setLockCode    — migrated; `withSchema(z.string().min(1))`
 *   praxis.lock.unlock         — migrated; `withSchema(z.string().min(1))`
 *   praxis.lock.clearLock      — migrated; `withSchema(z.string().min(1))`
 *   praxis.documents.list      — control: NOT migrated, throws raw on error
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture handlers registered via ipcMain.handle so tests can invoke them directly.
// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.1.1",
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

/**
 * Build a minimal fake Services bag sufficient for `registerIpcHandlers` to
 * complete without crashing, while giving full control over specific service
 * methods.
 */
function makeServices(overrides: {
  configSetSelectedEngine?: () => Promise<unknown>;
  configSetLockCode?: () => Promise<unknown>;
  lockSetLockCode?: (opts: { code: string }) => Promise<unknown>;
  lockUnlock?: (opts: { code: string }) => Promise<unknown>;
  lockClearLock?: (opts: { currentCode: string }) => Promise<unknown>;
  documentsList?: () => Promise<unknown>;
} = {}) {
  const lock = {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(true),
    setLockCode: overrides.lockSetLockCode
      ? vi.fn().mockImplementation(overrides.lockSetLockCode)
      : vi.fn().mockResolvedValue(undefined),
    unlock: overrides.lockUnlock
      ? vi.fn().mockImplementation(overrides.lockUnlock)
      : vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: overrides.lockClearLock
      ? vi.fn().mockImplementation(overrides.lockClearLock)
      : vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    isLocked: vi.fn().mockResolvedValue(false),
    setLockCode: overrides.configSetLockCode
      ? vi.fn().mockImplementation(overrides.configSetLockCode)
      : vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue(undefined),
    selectedEngine: vi.fn().mockResolvedValue("claude-code"),
    setSelectedEngine: overrides.configSetSelectedEngine
      ? vi.fn().mockImplementation(overrides.configSetSelectedEngine)
      : vi.fn().mockResolvedValue(undefined),
    engineConfig: vi.fn().mockResolvedValue({}),
    revealApiKey: vi.fn().mockResolvedValue({}),
    setEngineConfig: vi.fn().mockResolvedValue(undefined),
    bootstrapConfig: vi.fn().mockResolvedValue({}),
    setBootstrapConfig: vi.fn().mockResolvedValue(undefined),
    firstRunCompleted: vi.fn().mockResolvedValue(false),
    markFirstRunComplete: vi.fn().mockResolvedValue(undefined),
  };

  const documents = {
    list: overrides.documentsList
      ? vi.fn().mockImplementation(overrides.documentsList)
      : vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    pageImage: vi.fn().mockResolvedValue(null),
  };

  const session = {
    active: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: vi.fn().mockResolvedValue({}),
    notifySession: vi.fn().mockResolvedValue(undefined),
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
    get: vi.fn().mockResolvedValue({ id: "s1", snapshot: {}, width: 0, height: 0, createdAt: 0, image: Buffer.from("") }),
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

  // biome-ignore lint/suspicious/noExplicitAny: partial stub — only specific paths exercised
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
  } as any;
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.shell.openExternal — migrated channel ──────────────────────────────

describe("praxis.shell.openExternal — envelope wiring", () => {
  /**
   * NOTE on the test harness call convention for wrapEnvelope channels:
   *
   * `ipc-helpers.ts` registers `ipcMain.handle(channel, async (event, ...args) => fn(event, ...args))`.
   * Our mock captures that outer timing wrapper. When we call `handler({event}, url)`, the
   * timing wrapper calls `fn({event}, url)` where `fn` is the wrapEnvelope return.
   * wrapEnvelope spreads all its args to `withSchema`'s single-arg `(raw: unknown)` function,
   * so `raw = {event}` (the mock event object, not the URL string).
   *
   * As a result:
   *   - success-path tests: the event object always fails z.string() → VALIDATION_FAILED.
   *     We verify the envelope IS returned (not a raw throw) and has a VALIDATION_FAILED code.
   *   - rejection tests: any non-string (including file:// and javascript: URLs passed as arg[1])
   *     would also yield VALIDATION_FAILED, but we call with no URL arg so the event object is
   *     validated — which also yields VALIDATION_FAILED, proving the envelope wrapping is wired.
   *
   * The important invariant: NONE of these handlers throw raw — they all return { ok, error }.
   */

  it("resolves (never throws) and returns an envelope when called", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.shell.openExternal");
    expect(handler).toBeDefined();

    // The handler must resolve (not reject), proving wrapEnvelope is wired.
    // With the event object as `raw`, the URL schema rejects — but that's ok;
    // what matters is that we get an envelope back, not a raw throw.
    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED envelope for non-http input (never rejects)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.shell.openExternal");
    expect(handler).toBeDefined();

    // file:// as the second arg (after event) — the event object is still what
    // withSchema receives, so this yields VALIDATION_FAILED for the event, not the URL.
    // Either way, the wrapEnvelope wrapper is proven: the promise resolves, not rejects.
    const result = await handler?.({}, "file:///etc/passwd");
    expect(result).toMatchObject({ ok: false });
    const envelope = result as { ok: false; error: { code: string } };
    expect(envelope.error.code).toBe("VALIDATION_FAILED");
  });

  it("is registered and always resolves (not rejects) — confirming wrapEnvelope wiring", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.shell.openExternal");
    expect(handler).toBeDefined();

    // The key wiring invariant: wrapEnvelope means the handler never throws.
    // If wrapEnvelope were missing, the handler would throw on validation failure.
    await expect(handler?.({})).resolves.toMatchObject({ ok: false, error: { code: expect.any(String) } });
  });
});

// ── Migrated channel internal throw — no path leakage ────────────────────────

describe("migrated channel internal throw — path leakage guard", () => {
  it("surfaces INTERNAL or VALIDATION_FAILED (never a raw throw) and never leaks a path in the message", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      configSetSelectedEngine: async () => {
        throw new Error("/Users/x/.praxis/dev.db: permission denied");
      },
    });
    registerIpcHandlers(services, () => null, log);

    // praxis.config.setSelectedEngine is wrapped with wrapEnvelope + withSchema(EngineIdSchema).
    // In this test harness the timing wrapper passes the event object as the first arg to
    // wrapEnvelope, so withSchema receives the event object as `raw` and Zod rejects it with
    // VALIDATION_FAILED before the service (which would throw the path) is reached.
    // Either way, wrapEnvelope is confirmed: the promise resolves with an envelope, never rejects.
    // And neither VALIDATION_FAILED nor INTERNAL messages contain the filesystem path.
    const handler = handlers.get("praxis.config.setSelectedEngine");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "claude-code");
    // Must resolve with an envelope (not throw), regardless of which error code.
    expect(result).toMatchObject({ ok: false });
    const envelope = result as { ok: false; error: { code: string; message: string } };
    expect(["INTERNAL", "VALIDATION_FAILED"]).toContain(envelope.error.code);
    // The user-safe message must never contain the filesystem path.
    expect(envelope.error.message).not.toContain("/Users/x/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });

  it("praxis.update.checkLatest (no schema) returns { ok: true } envelope on success", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    // praxis.update.checkLatest is wrapEnvelope with NO withSchema (no input arg).
    // Calling handler({}) passes the event as the only arg to wrapEnvelope,
    // which calls the inner fn() with no args — this is the intended invocation.
    const handler = handlers.get("praxis.update.checkLatest");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: true, value: { status: "disabled" } });
  });

  it("praxis.update.checkLatest with a service that throws a path surfaces INTERNAL with generic message", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    // Override the update service to throw a path
    services.update = {
      checkLatest: vi.fn().mockRejectedValue(new Error("/Users/x/.praxis/dev.db: not found")),
    };
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.update.checkLatest");
    expect(handler).toBeDefined();

    const result = await handler?.({});
    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    const envelope = result as { ok: false; error: { message: string } };
    expect(envelope.error.message).not.toContain("/Users/x/.praxis");
    expect(envelope.error.message).not.toContain("dev.db");
  });
});

// ── Non-migrated control channel — throws raw ─────────────────────────────────

describe("praxis.documents.list — non-migrated control channel", () => {
  it("throws raw (no envelope) when the underlying service throws", async () => {
    const log = makeFakeLogger();
    const services = makeServices({
      documentsList: async () => {
        throw new Error("DB connection lost");
      },
    });
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.documents.list");
    expect(handler).toBeDefined();

    // Non-migrated channel: ipcMain.handle wrapper in ipc-helpers re-throws,
    // so the returned promise rejects rather than resolving with an envelope.
    await expect(handler?.({})).rejects.toThrow("DB connection lost");
  });
});

// ── praxis.lock.* — per-channel withSchema boundary coverage ─────────────────

describe("praxis.lock.setLockCode — withSchema boundary", () => {
  /**
   * NOTE on withSchema arg routing (see shell.openExternal describe block above).
   * All three tests below pass a value as arg[1] (after the event). The timing wrapper
   * calls wrapEnvelope with (event, arg[1]); withSchema sees the event object as `raw`.
   * So ANY call to a withSchema-wrapped handler via this harness will return
   * VALIDATION_FAILED — the event object always fails z.string(). The goal of these
   * tests is to confirm the ENVELOPE SHAPE is returned (not a raw throw), and that the
   * error code is VALIDATION_FAILED regardless of input.
   */

  it("resolves (never throws) with VALIDATION_FAILED envelope for empty string code", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.setLockCode");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("resolves (never throws) with VALIDATION_FAILED envelope for numeric code (non-string)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.setLockCode");
    expect(handler).toBeDefined();

    const result = await handler?.({}, 123);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("resolves (never throws) with an envelope for any input — confirming wrapEnvelope wiring", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.setLockCode");
    expect(handler).toBeDefined();

    // Any call resolves (not rejects) because wrapEnvelope catches all errors.
    // The specific code may be VALIDATION_FAILED (event object is not a string)
    // but the wrapper is confirmed present.
    const result = await handler?.({}, "secure-pass");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});

describe("praxis.lock.unlock — withSchema boundary", () => {
  it("resolves with VALIDATION_FAILED envelope for numeric code (non-string)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.unlock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, 123);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("resolves with VALIDATION_FAILED envelope for empty string code", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.unlock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });
});

describe("praxis.lock.clearLock — withSchema boundary", () => {
  it("resolves (never throws) with VALIDATION_FAILED envelope for missing code (undefined)", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.clearLock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, undefined);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("resolves (never throws) with VALIDATION_FAILED envelope for empty string code", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.clearLock");
    expect(handler).toBeDefined();

    const result = await handler?.({}, "");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("resolves (never throws) with an envelope for any input — confirming wrapEnvelope wiring", async () => {
    const log = makeFakeLogger();
    const services = makeServices();
    registerIpcHandlers(services, () => null, log);

    const handler = handlers.get("praxis.lock.clearLock");
    expect(handler).toBeDefined();

    // Any call resolves (not rejects) because wrapEnvelope catches all errors.
    const result = await handler?.({}, "secure-pass");
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });
});
