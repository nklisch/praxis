/**
 * IPC harness tests for quick-check-channel.ts.
 *
 * Channel exercised:
 *   praxis.quickCheck.resolve — { callId, answer: QuickCheckAnswer }; handleEnvelope
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
    getVersion: () => "0.0.1",
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
    on: () => {},
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}));

// Import AFTER mock is in place — Vitest hoists vi.mock() automatically.
import { registerQuickCheckHandlers } from "../quick-check-channel.js";

// ── Minimal fake Services ────────────────────────────────────────────────────

function makeServices(resolveImpl?: (input: unknown) => void) {
  return {
    quickCheck: {
      subscribe: vi.fn().mockReturnValue(() => {}),
      resolve: resolveImpl ? vi.fn().mockImplementation(resolveImpl) : vi.fn(),
    },
    // biome-ignore lint/suspicious/noExplicitAny: partial stub
  } as any;
}

beforeEach(() => {
  handlers.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.quickCheck.resolve — VALIDATION_FAILED cases ──────────────────────

describe("praxis.quickCheck.resolve — Zod validation", () => {
  it("is registered by registerQuickCheckHandlers", () => {
    const log = makeSpyLogger();
    registerQuickCheckHandlers(makeServices(), () => null, new Map(), log);
    expect(handlers.has("praxis.quickCheck.resolve")).toBe(true);
  });

  it("returns VALIDATION_FAILED when callId is missing", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.({}, { answer: { kind: "abandoned" } });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.quickCheck.resolve).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when callId is empty string", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.({}, { callId: "", answer: { kind: "abandoned" } });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.quickCheck.resolve).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when answer.kind is not in the union", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.({}, { callId: "c1", answer: { kind: "free-text" } });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.quickCheck.resolve).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when single-choice selectedIndex is negative", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.(
      {},
      { callId: "c1", answer: { kind: "single-choice", selectedIndex: -1 } },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.quickCheck.resolve).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED when answer field is missing entirely", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.({}, { callId: "c1" });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.quickCheck.resolve).not.toHaveBeenCalled();
  });

  // ── Happy-path round-trips for key QuickCheckAnswer kinds ──────────────────

  it("accepts single-choice answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.(
      {},
      { callId: "c1", answer: { kind: "single-choice", selectedIndex: 2 } },
    );

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("accepts multi-select answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.(
      {},
      { callId: "c2", answer: { kind: "multi-select", selectedIndices: [0, 2] } },
    );

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("accepts short-answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.(
      {},
      { callId: "c3", answer: { kind: "short-answer", text: "photosynthesis" } },
    );

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("accepts abandoned answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.({}, { callId: "c4", answer: { kind: "abandoned" } });

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("accepts confidence answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.({}, { callId: "c5", answer: { kind: "confidence", rating: 3 } });

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("accepts matching answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.(
      {},
      {
        callId: "c6",
        answer: {
          kind: "matching",
          pairs: [{ leftId: "a", rightId: "x" }],
        },
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });

  it("accepts structured-question answer and calls resolve", async () => {
    const log = makeSpyLogger();
    const services = makeServices();
    registerQuickCheckHandlers(services, () => null, new Map(), log);

    const handler = handlers.get("praxis.quickCheck.resolve");
    const result = await handler?.(
      {},
      {
        callId: "c7",
        answer: {
          kind: "structured-question",
          answers: [{ questionIndex: 0, selectedIndices: [1] }],
        },
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(services.quickCheck.resolve).toHaveBeenCalledOnce();
  });
});
