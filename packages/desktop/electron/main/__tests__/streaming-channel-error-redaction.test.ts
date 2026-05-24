/**
 * Regression-pin tests: streaming-channel error push redaction.
 *
 * Security invariant: no raw error message containing secret-shaped substrings
 * (`sk-ant-`, `Bearer `, `?key=`) may cross the IPC trust boundary to the
 * renderer. Each of the six streaming channels routes caught errors through
 * `redactSecrets(err.message)` before pushing `{ kind: "error", error }`.
 * These tests pin that contract so a future refactor that drops the
 * `redactSecrets(...)` call causes a test failure.
 *
 * Approach per channel:
 *   - For channels backed by a synchronous `subscribe(listener)` call
 *     (activity, course-create-drafts, quick-check, subagent): mock `subscribe`
 *     to throw synchronously, which propagates to the `catch` block.
 *   - For channels backed by an async generator (`session.send`, `ingest`):
 *     mock the generator to throw on the first `next()` call, which propagates
 *     to the `for await … catch` block in the channel handler.
 *   - For ingest: the handler reads `services.session.deps.db` via a cast to
 *     get a studentId before calling `services.ingestion.ingest`. We stub that
 *     path so `ingest(...)` is reached and then throws.
 *
 * Each test:
 *   1. Registers channel handlers with a fake Services bag.
 *   2. Invokes the `.start` handler directly (skipping the Electron IPC
 *      machinery — the handler is a plain async function).
 *   3. Captures `webContents.send(channel, msg)` calls.
 *   4. Asserts the pushed `{ kind: "error" }` message does NOT contain the
 *      secret-shaped substring that was injected into the thrown error.
 *
 * Secret strings used:
 *   - `sk-ant-leak-value`          → Anthropic API key shape
 *   - `Bearer eyJsZWFr...`         → Bearer token shape
 *   - `?key=topsecret`             → URL-embedded query param shape
 *
 * All six channel handlers are tested via their dedicated module entry points
 * (registerActivityHandlers, registerCourseCreateDraftsHandlers, etc.) so the
 * test reaches the same code path that runs in production, not a reimplemented
 * approximation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpyLogger } from "../../../../../tests/helpers/mocks.js";

// ── Module mocks ──────────────────────────────────────────────────────────────
// biome-ignore lint/suspicious/noExplicitAny: handler args vary per channel
type Handler = (event: unknown, ...args: any[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const onListeners = new Map<string, Handler>();

// Mock getOrCreateDefaultStudentId so the ingest-channel test doesn't need a
// real Drizzle-backed DB. The function is called inside the ingest handler
// before `services.ingestion.ingest(...)` is reached.
vi.mock("@praxis/core/services", () => ({
  getOrCreateDefaultStudentId: vi.fn(() => "student-test-1"),
}));

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.0.0-test",
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
    on: (channel: string, listener: Handler) => {
      onListeners.set(channel, listener);
    },
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  },
}));

// Channel registrars — imported AFTER vi.mock (Vitest hoisting ensures the
// mock is in place before any module-level import code executes).
import { registerActivityHandlers } from "../activity-channel.js";
import { registerCourseCreateDraftsHandlers } from "../course-create-drafts-channel.js";
import { registerIngestHandlers } from "../ingest-channel.js";
import { registerIpcHandlers } from "../ipc-server.js";
import { registerQuickCheckHandlers } from "../quick-check-channel.js";
import { registerSubAgentHandlers } from "../subagent-channel.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a fake WebContents that captures every `send(channel, msg)` call.
 * Returns the collector array alongside the fake so tests can inspect it.
 */
function makeFakeWebContents() {
  const sent: Array<{ channel: string; msg: unknown }> = [];
  const wc = {
    isDestroyed: () => false,
    send: (channel: string, msg: unknown) => {
      sent.push({ channel, msg });
    },
  };
  return { wc, sent };
}

/**
 * Find the first pushed message whose `kind` is "error" across all captured
 * sends, regardless of channel name.
 */
function firstErrorMsg(
  sent: Array<{ channel: string; msg: unknown }>,
): { kind: "error"; error: string } | undefined {
  for (const { msg } of sent) {
    if (
      msg !== null &&
      typeof msg === "object" &&
      "kind" in msg &&
      (msg as { kind: unknown }).kind === "error"
    ) {
      return msg as { kind: "error"; error: string };
    }
  }
  return undefined;
}

// ── Minimal fake Services builder ─────────────────────────────────────────────

/**
 * Build the smallest possible Services stub that lets registerIpcHandlers
 * complete registration without crashing, while leaving specific service
 * methods open for override per test.
 */
// biome-ignore lint/suspicious/noExplicitAny: partial stub — only targeted paths exercised
function makeFullServices(overrides: Record<string, any> = {}): any {
  const session = overrides.session ?? {
    active: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
    send: vi.fn(async function* () {}),
    spawnFromAssignment: vi.fn().mockResolvedValue({}),
    notifySession: vi.fn().mockResolvedValue(undefined),
    // Stub the `deps.db` path used by ingest-channel to get a studentId.
    deps: { db: { prepare: vi.fn(() => ({ get: vi.fn(() => null), run: vi.fn() })) } },
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

  const update = { checkLatest: vi.fn().mockResolvedValue({ status: "disabled" }) };

  const lock = {
    isSet: vi.fn().mockResolvedValue(false),
    isUnlocked: vi.fn().mockResolvedValue(true),
    setLockCode: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    lock: vi.fn().mockResolvedValue(undefined),
    clearLock: vi.fn().mockResolvedValue(undefined),
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

  const documentScopes = {
    list: vi.fn().mockResolvedValue([]),
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
  };

  const activity = overrides.activity ?? {
    subscribe: vi.fn().mockReturnValue(() => {}),
    dismiss: vi.fn(),
  };
  const subAgent = overrides.subAgent ?? {
    subscribe: vi.fn().mockReturnValue(() => {}),
    list: vi.fn().mockResolvedValue([]),
  };
  const bootstrap = overrides.bootstrap ?? {
    subscribe: vi.fn().mockReturnValue(() => {}),
    startExploration: vi.fn(async function* () {}),
  };
  const quickCheck = overrides.quickCheck ?? {
    subscribe: vi.fn().mockReturnValue(() => {}),
    resolve: vi.fn(),
  };
  const ingestion = overrides.ingestion ?? { ingest: vi.fn(async function* () {}) };

  const ingestorRegistry = {
    supported: vi.fn().mockReturnValue([]),
    supportedExtensions: vi.fn().mockReturnValue([]),
    candidatesFor: vi.fn().mockResolvedValue([]),
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
    ingestion,
    documentScopes,
    ingestorRegistry,
    getDefaultStudentId: () => "student-1",
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  handlers.clear();
  onListeners.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("streaming channel error redaction", () => {
  /**
   * Channel: praxis.session.send.start (ipc-server.ts:163)
   *
   * The session service's `send()` is an async generator. We make it throw
   * immediately on the first iteration. The catch block in the handler wraps
   * the raw error through `redactSecrets` before pushing `{ kind: "error" }`.
   */
  it("praxis.session.send.start — error push redacts Anthropic API key shape (sk-ant-)", async () => {
    const secret = "sk-ant-leak-value";
    const services = makeFullServices({
      session: {
        active: vi.fn().mockResolvedValue([]),
        start: vi.fn().mockResolvedValue({}),
        end: vi.fn().mockResolvedValue({}),
        list: vi.fn().mockResolvedValue([]),
        send: vi.fn(async function* () {
          throw new Error(`apiKey=${secret}`);
        }),
        spawnFromAssignment: vi.fn().mockResolvedValue({}),
        notifySession: vi.fn().mockResolvedValue(undefined),
        deps: { db: { prepare: vi.fn(() => ({ get: vi.fn(() => null), run: vi.fn() })) } },
      },
    });

    const { wc, sent } = makeFakeWebContents();
    const log = makeSpyLogger();
    registerIpcHandlers(services, () => wc as unknown as Electron.WebContents, log);

    const handler = handlers.get("praxis.session.send.start");
    expect(handler).toBeDefined();

    // The handler resolves (does not throw) even when the stream errors.
    await handler?.({}, "stream-1", "session-abc", "Hello");

    const errMsg = firstErrorMsg(sent);
    expect(errMsg).toBeDefined();
    expect(errMsg?.kind).toBe("error");
    // The raw secret body must NOT appear in the pushed error string.
    // Note: redactSecrets preserves the "sk-ant-" prefix and replaces the body
    // with "[REDACTED]", so we assert the original value is gone.
    expect(errMsg?.error).not.toContain("sk-ant-leak-value");
    // The redacted placeholder must be present instead.
    expect(errMsg?.error).toContain("sk-ant-[REDACTED]");
  });

  /**
   * Channel: praxis.activity.events.start (activity-channel.ts:59)
   *
   * `services.activity.subscribe(...)` throws synchronously. The channel
   * handler's try/catch picks it up and pushes `{ kind: "error" }`.
   *
   * Tighter scope: tests registerActivityHandlers directly rather than going
   * through registerIpcHandlers, to keep this test independent from the full
   * Services bag required by ipc-server.ts.
   */
  it("activity-channel — error push redacts Bearer-shaped token", async () => {
    const secret = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig";

    const activity = {
      subscribe: vi.fn(() => {
        throw new Error(`Authorization: ${secret}`);
      }),
      dismiss: vi.fn(),
    };

    const { wc, sent } = makeFakeWebContents();
    const log = makeSpyLogger();
    const activeAbortControllers = new Map<string, AbortController>();

    registerActivityHandlers(
      { activity } as unknown as import("../services.js").Services,
      () => wc as unknown as Electron.WebContents,
      activeAbortControllers,
      log,
    );

    const handler = handlers.get("praxis.activity.events.start");
    expect(handler).toBeDefined();

    await handler?.({}, "stream-act-1");

    const errMsg = firstErrorMsg(sent);
    expect(errMsg).toBeDefined();
    expect(errMsg?.kind).toBe("error");
    expect(errMsg?.error).not.toContain("Bearer eyJ");
    // redactSecrets replaces the Bearer token body.
    expect(errMsg?.error).toContain("Bearer [REDACTED]");
  });

  /**
   * Channel: praxis.courseCreate.drafts.events.start (course-create-drafts-channel.ts)
   *
   * `services.bootstrap.subscribe(...)` throws synchronously with a URL-embedded
   * `?key=` secret. The catch block must redact it.
   *
   * Tighter scope: tests registerCourseCreateDraftsHandlers directly.
   */
  it("course-create-drafts-channel — error push redacts URL-embedded ?key= secret", async () => {
    const bootstrap = {
      subscribe: vi.fn(() => {
        throw new Error("https://api.example.com/v1/foo?key=topsecret");
      }),
      startExploration: vi.fn(async function* () {}),
    };

    const { wc, sent } = makeFakeWebContents();
    const log = makeSpyLogger();
    const activeAbortControllers = new Map<string, AbortController>();

    registerCourseCreateDraftsHandlers(
      { bootstrap } as unknown as import("../services.js").Services,
      () => wc as unknown as Electron.WebContents,
      activeAbortControllers,
      log,
    );

    const handler = handlers.get("praxis.courseCreate.drafts.events.start");
    expect(handler).toBeDefined();

    await handler?.({}, "stream-bs-1");

    const errMsg = firstErrorMsg(sent);
    expect(errMsg).toBeDefined();
    expect(errMsg?.kind).toBe("error");
    // The raw secret value must not appear in the pushed error string.
    expect(errMsg?.error).not.toContain("topsecret");
    // The query-param key should still be visible (only the value is redacted).
    expect(errMsg?.error).toContain("?key=[REDACTED]");
  });

  /**
   * Channel: praxis.ingest.start (ingest-channel.ts:180)
   *
   * The ingestion channel reads `services.session.deps.db` to resolve a
   * studentId, then calls `services.ingestion.ingest(req, signal)` which
   * returns an async generator. We make `ingest` throw immediately.
   *
   * The `db.prepare(...).get(...)` path used by `getOrCreateDefaultStudentId`
   * is stubbed to return `null` (triggering the "create" branch which calls
   * `db.prepare(...).run(...)`). The student id returned is a UUID we don't
   * care about; what matters is that `ingest` is reached and throws.
   *
   * Tighter scope: tests registerIngestHandlers directly.
   */
  it("ingest-channel — error push redacts Anthropic API key shape (sk-ant-)", async () => {
    const secret = "sk-ant-api03-leak-value";

    // getOrCreateDefaultStudentId is mocked at the module level (vi.mock above)
    // so we don't need a Drizzle-backed DB stub here. The session stub only
    // needs to satisfy the cast in ingest-channel.ts's handler body.
    const session = {
      deps: { db: {} },
    };

    const ingestion = {
      ingest: vi.fn(async function* () {
        throw new Error(`Connection failed: apiKey=${secret}`);
      }),
    };

    const ingestorRegistry = {
      supported: vi.fn().mockReturnValue([]),
      supportedExtensions: vi.fn().mockReturnValue([]),
      candidatesFor: vi.fn().mockResolvedValue([]),
    };

    const { wc, sent } = makeFakeWebContents();
    const log = makeSpyLogger();
    const activeAbortControllers = new Map<string, AbortController>();

    registerIngestHandlers(
      { session, ingestion } as unknown as import("../services.js").Services,
      () => wc as unknown as Electron.WebContents,
      ingestorRegistry as unknown as import("@praxis/tools/runtime/ingestion").IngestorRegistry,
      activeAbortControllers,
      log,
    );

    const handler = handlers.get("praxis.ingest.start");
    expect(handler).toBeDefined();

    const req = { paths: ["/tmp/test.pdf"], ingestorId: "pdf" };
    await handler?.({}, "stream-ing-1", req);

    const errMsg = firstErrorMsg(sent);
    expect(errMsg).toBeDefined();
    expect(errMsg?.kind).toBe("error");
    // The raw secret body must NOT appear in the pushed error string.
    expect(errMsg?.error).not.toContain("sk-ant-api03-leak-value");
    // The redacted placeholder must be present instead.
    expect(errMsg?.error).toContain("sk-ant-[REDACTED]");
  });

  /**
   * Channel: praxis.quickCheck.events.start (quick-check-channel.ts:59)
   *
   * `quickCheck.subscribe(...)` throws synchronously with a Bearer token.
   *
   * Tighter scope: tests registerQuickCheckHandlers directly.
   */
  it("quick-check-channel — error push redacts Bearer-shaped token", async () => {
    const quickCheck = {
      subscribe: vi.fn(() => {
        throw new Error("Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature");
      }),
      resolve: vi.fn(),
    };

    const { wc, sent } = makeFakeWebContents();
    const log = makeSpyLogger();
    const activeAbortControllers = new Map<string, AbortController>();

    registerQuickCheckHandlers(
      { quickCheck } as unknown as import("../services.js").Services,
      () => wc as unknown as Electron.WebContents,
      activeAbortControllers,
      log,
    );

    const handler = handlers.get("praxis.quickCheck.events.start");
    expect(handler).toBeDefined();

    await handler?.({}, "stream-qc-1");

    const errMsg = firstErrorMsg(sent);
    expect(errMsg).toBeDefined();
    expect(errMsg?.kind).toBe("error");
    expect(errMsg?.error).not.toContain("eyJhbGciOiJSUzI1NiJ9");
    expect(errMsg?.error).toContain("Bearer [REDACTED]");
  });

  /**
   * Channel: praxis.subAgent.events.start (subagent-channel.ts:62)
   *
   * `subAgent.subscribe(...)` throws synchronously with a URL-embedded secret.
   *
   * Tighter scope: tests registerSubAgentHandlers directly.
   */
  it("subagent-channel — error push redacts URL-embedded ?key= secret", async () => {
    const subAgent = {
      subscribe: vi.fn(() => {
        throw new Error("upstream error: https://api.example.com/subagent?key=super-secret-key");
      }),
      list: vi.fn().mockResolvedValue([]),
    };

    const { wc, sent } = makeFakeWebContents();
    const log = makeSpyLogger();
    const activeAbortControllers = new Map<string, AbortController>();

    registerSubAgentHandlers(
      { subAgent } as unknown as import("../services.js").Services,
      () => wc as unknown as Electron.WebContents,
      activeAbortControllers,
      log,
    );

    const handler = handlers.get("praxis.subAgent.events.start");
    expect(handler).toBeDefined();

    await handler?.({}, "stream-sa-1");

    const errMsg = firstErrorMsg(sent);
    expect(errMsg).toBeDefined();
    expect(errMsg?.kind).toBe("error");
    expect(errMsg?.error).not.toContain("super-secret-key");
    expect(errMsg?.error).toContain("?key=[REDACTED]");
  });
});
