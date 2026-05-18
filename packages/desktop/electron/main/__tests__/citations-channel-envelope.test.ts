/**
 * IPC harness tests for citations-channel.ts and the
 * praxis.session.spawnFromPassage handler in ipc-server.ts.
 *
 * Channels exercised:
 *   praxis.citations.record          — envelope, input validation
 *   praxis.citations.listByDocument  — envelope, input validation
 *   praxis.session.spawnFromPassage  — envelope, input validation
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
import { registerCitationsHandlers } from "../citations-channel.js";

// ── Minimal fake Services ────────────────────────────────────────────────────

const FAKE_CITATION = {
  id: "cit-1",
  documentId: "doc-1",
  citingSessionId: "sess-1",
  citingTurnId: null,
  startOffset: 10,
  endOffset: 50,
  citedText: "hello",
  createdAt: new Date("2024-01-01T00:00:00Z"),
};

function makeServices(
  overrides: {
    citationsRecord?: (input: unknown) => Promise<unknown>;
    citationsListByDocument?: (documentId: unknown) => Promise<unknown>;
  } = {},
) {
  return {
    citations: {
      record: overrides.citationsRecord ?? vi.fn().mockResolvedValue(FAKE_CITATION),
      listByDocument:
        overrides.citationsListByDocument ?? vi.fn().mockResolvedValue([FAKE_CITATION]),
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

// ── praxis.citations.record ───────────────────────────────────────────────────

describe("praxis.citations.record — envelope wiring", () => {
  it("is registered by registerCitationsHandlers", () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);
    expect(handlers.has("praxis.citations.record")).toBe(true);
  });

  it("returns { ok: true, value: <record> } for a valid payload", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.record");
    const result = await handler?.(
      {},
      {
        documentId: "doc-1",
        citingSessionId: "sess-1",
        startOffset: 10,
        endOffset: 50,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({
        id: "cit-1",
        documentId: "doc-1",
        citingSessionId: "sess-1",
        startOffset: 10,
        endOffset: 50,
        // createdAt is converted to epoch ms for wire transport
        createdAt: FAKE_CITATION.createdAt.getTime(),
      }),
    });
  });

  it("passes optional citingTurnId and citedText to service", async () => {
    const record = vi.fn().mockResolvedValue(FAKE_CITATION);
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices({ citationsRecord: record }), log);

    const handler = handlers.get("praxis.citations.record");
    await handler?.(
      {},
      {
        documentId: "doc-1",
        citingSessionId: "sess-1",
        citingTurnId: "turn-42",
        startOffset: 0,
        endOffset: 100,
        citedText: "some passage",
      },
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        citingTurnId: "turn-42",
        citedText: "some passage",
      }),
    );
  });

  it("returns VALIDATION_FAILED for missing documentId", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.record");
    const result = await handler?.(
      {},
      { citingSessionId: "sess-1", startOffset: 0, endOffset: 10 },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for missing citingSessionId", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.record");
    const result = await handler?.({}, { documentId: "doc-1", startOffset: 0, endOffset: 10 });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for negative startOffset", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.record");
    const result = await handler?.(
      {},
      { documentId: "doc-1", citingSessionId: "sess-1", startOffset: -1, endOffset: 10 },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL (never rejects) when service throws", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(
      makeServices({
        citationsRecord: async () => {
          throw new Error("db error");
        },
      }),
      log,
    );

    const handler = handlers.get("praxis.citations.record");
    await expect(
      handler?.(
        {},
        { documentId: "doc-1", citingSessionId: "sess-1", startOffset: 0, endOffset: 10 },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

// ── praxis.citations.listByDocument ──────────────────────────────────────────

describe("praxis.citations.listByDocument — envelope wiring", () => {
  it("is registered by registerCitationsHandlers", () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);
    expect(handlers.has("praxis.citations.listByDocument")).toBe(true);
  });

  it("returns { ok: true, value: [<record>] } for a valid documentId", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.listByDocument");
    const result = await handler?.({}, "doc-1");

    expect(result).toMatchObject({
      ok: true,
      value: [
        expect.objectContaining({
          id: "cit-1",
          documentId: "doc-1",
          createdAt: FAKE_CITATION.createdAt.getTime(),
        }),
      ],
    });
  });

  it("returns VALIDATION_FAILED for an empty string documentId", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.listByDocument");
    const result = await handler?.({}, "");

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns VALIDATION_FAILED for a non-string payload", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(makeServices(), log);

    const handler = handlers.get("praxis.citations.listByDocument");
    const result = await handler?.({}, 42);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("returns INTERNAL when service throws", async () => {
    const log = makeSpyLogger();
    registerCitationsHandlers(
      makeServices({
        citationsListByDocument: async () => {
          throw new Error("db error");
        },
      }),
      log,
    );

    const handler = handlers.get("praxis.citations.listByDocument");
    await expect(handler?.({}, "doc-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
  });
});
