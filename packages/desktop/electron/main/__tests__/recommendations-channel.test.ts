/**
 * IPC harness tests for recommendations-channel.ts.
 *
 * Channel exercised:
 *   praxis.recommendations.next — { limit?: number } input; wrapEnvelope
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
import { registerRecommendationsHandlers } from "../recommendations-channel.js";

// ── Minimal fake Services ────────────────────────────────────────────────────

function makeServices(next?: (input: { studentId: string; limit?: number }) => Promise<unknown>) {
  return {
    recommendations: {
      next: next ?? vi.fn().mockResolvedValue([]),
    },
    getDefaultStudentId: () => "student-1",
    // biome-ignore lint/suspicious/noExplicitAny: partial stub — only exercised fields matter
  } as any;
}

beforeEach(() => {
  handlers.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── praxis.recommendations.next — envelope wiring ────────────────────────────

describe("praxis.recommendations.next — envelope wiring", () => {
  it("is registered by registerRecommendationsHandlers", () => {
    const log = makeSpyLogger();
    registerRecommendationsHandlers(makeServices(), log);
    expect(handlers.has("praxis.recommendations.next")).toBe(true);
  });

  it("resolves with { ok: true, value: [] } when no recommendations", async () => {
    const log = makeSpyLogger();
    registerRecommendationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.recommendations.next");
    const result = await handler?.({});

    expect(result).toMatchObject({ ok: true, value: [] });
  });

  it("forwards the limit parameter to recommendations.next", async () => {
    const next = vi.fn().mockResolvedValue([]);
    const log = makeSpyLogger();
    registerRecommendationsHandlers(makeServices(next), log);

    const handler = handlers.get("praxis.recommendations.next");
    await handler?.({}, { limit: 3 });

    expect(next).toHaveBeenCalledOnce();
    const call = next.mock.calls[0];
    expect(call?.[0]).toMatchObject({ limit: 3 });
  });

  it("resolves with the recommendations from the service (envelope-wrapped)", async () => {
    const fakeRec = {
      kind: "review_cards",
      courseId: null,
      dueNow: 5,
      dueIn24h: 0,
      reason: "5 cards ready to review.",
      score: 80,
    };
    const next = vi.fn().mockResolvedValue([fakeRec]);
    const log = makeSpyLogger();
    registerRecommendationsHandlers(makeServices(next), log);

    const handler = handlers.get("praxis.recommendations.next");
    const result = await handler?.({});

    expect(result).toMatchObject({ ok: true, value: [fakeRec] });
  });

  it("passes studentId resolved from getDefaultStudentId to the service", async () => {
    const next = vi.fn().mockResolvedValue([]);
    const log = makeSpyLogger();
    registerRecommendationsHandlers(makeServices(next), log);

    const handler = handlers.get("praxis.recommendations.next");
    await handler?.({});

    const call = next.mock.calls[0];
    expect(call?.[0]).toMatchObject({ studentId: "student-1" });
  });

  it("returns { ok: false } on Zod validation error for invalid limit", async () => {
    const log = makeSpyLogger();
    registerRecommendationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.recommendations.next");
    const result = await handler?.({}, { limit: "not-a-number" });

    expect(result).toMatchObject({ ok: false });
  });
});
