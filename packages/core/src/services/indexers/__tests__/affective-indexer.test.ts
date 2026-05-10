/**
 * AffectiveIndexer unit tests.
 *
 * Covers: empty/tiny session skip, explicit-checkin only, transcript-only
 * (model inference), model failure (explicit rows still write), mixed path,
 * out-of-range model output (rejected, not clamped).
 *
 * Engine is mocked at the runOneShot level via vi.mock("@praxis/engines").
 * DB is a real temp SQLite instance via useTempDb().
 */
import { affectiveSamples } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../../db/index.js";
import type { Engine, EngineEvent, IndexerContext, Timestamp } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { AffectiveIndexer, extractExplicitCheckins } from "../affective-indexer.js";

// ── Mock @praxis/engines ──────────────────────────────────────────────────────
// We mock runOneShot at the module level so AffectiveIndexer's import resolves
// to our fake. The real Engine.open / .send path is bypassed entirely —
// the fake generator yields directly.

vi.mock("@praxis/engines", () => ({
  runOneShot: vi.fn(),
}));

import { runOneShot } from "@praxis/engines";
import { beforeEach } from "vitest";

const mockRunOneShot = vi.mocked(runOneShot);

// Reset the mock before every test so call counts don't leak across tests.
beforeEach(() => {
  mockRunOneShot.mockReset();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-affect-test");
const SESSION_ID = brandId<"SessionId">("session-affect-test");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const dbCtx = useTempDb();

function makeFakeEngine(): Engine {
  return {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn(),
  } as unknown as Engine;
}

/** Create a fake async generator that yields the given events. */
async function* makeEventStream(events: EngineEvent[]): AsyncGenerator<EngineEvent> {
  for (const ev of events) yield ev;
}

function makeValidJson(
  overrides?: Partial<{
    engagement: number;
    frustration: number;
    confidence: number;
    rationale: string;
  }>,
): string {
  const obj = {
    engagement: 0.7,
    frustration: 0.3,
    confidence: 0.6,
    rationale: "test rationale",
    ...overrides,
  };
  return `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
}

function makeCtx(events: IndexerContext["events"]): IndexerContext {
  return { studentId: STUDENT_ID, sessionId: SESSION_ID, events, log: MOCK_LOG };
}

function makeEvent(
  id: string,
  turnIndex: number,
  event: EngineEvent,
  ts?: number,
): IndexerContext["events"][number] {
  return {
    id: brandId<"EventId">(id),
    turnIndex,
    ts: (ts ?? Date.now()) as Timestamp,
    event,
  };
}

function makeToolCallEvent(
  id: string,
  turnIndex: number,
  callId: string,
  scale?: "1-4" | "1-5",
): IndexerContext["events"][number] {
  return makeEvent(id, turnIndex, {
    type: "tool_call",
    toolName: "quick_check.confidence",
    args: { scale: scale ?? "1-4", prompt: "How confident?" },
    callId,
  });
}

function makeToolResultEvent(
  id: string,
  turnIndex: number,
  callId: string,
  rating: number,
): IndexerContext["events"][number] {
  return makeEvent(id, turnIndex, {
    type: "tool_result",
    callId,
    result: { ok: true, value: { rating }, tier: "model-derived" as const },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AffectiveIndexer — empty / tiny session skip", () => {
  it("returns immediately with fewer than 2 events; no DB write, no engine call", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([makeEvent("e1", 0, { type: "user_message", content: "hello" })]);
    await indexer.run(ctx);

    expect(mockRunOneShot).not.toHaveBeenCalled();
    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("returns immediately with zero events", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();
    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    await indexer.run(makeCtx([]));

    expect(mockRunOneShot).not.toHaveBeenCalled();
  });
});

describe("AffectiveIndexer — explicit-checkin only", () => {
  it("writes per-checkin rows; no model call when no transcript to infer from", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    // Model returns empty text so inferred = null
    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([{ type: "final", usage: { inputTokens: 10, outputTokens: 0 } }]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "question" }),
      makeToolCallEvent("e2", 1, "call-1", "1-4"),
      makeToolResultEvent("e3", 1, "call-1", 4), // rating=4 → confidence = 1.0
      makeToolCallEvent("e4", 2, "call-2", "1-5"),
      makeToolResultEvent("e5", 2, "call-2", 3), // rating=3 on 1-5 → (3-1)/(5-1) = 0.5
    ]);

    await indexer.run(ctx);

    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();

    // Two explicit-checkin rows; no model-inferred row
    const explicit = rows.filter((r) => r.source === "explicit-checkin");
    const inferred = rows.filter((r) => r.source === "model-inferred");

    expect(explicit).toHaveLength(2);
    expect(inferred).toHaveLength(0);

    // First checkin: rating=4 on 1-4 scale → confidence=1.0 → 1000 milli
    const first = explicit.find((r) => r.confidenceMilli === 1000);
    expect(first).toBeDefined();
    expect(first?.engagementMilli).toBe(500);
    expect(first?.frustrationMilli).toBe(500);

    // Second checkin: rating=3 on 1-5 scale → (3-1)/(5-1) = 0.5 → 500 milli
    const second = explicit.find((r) => r.confidenceMilli === 500);
    expect(second).toBeDefined();
  });

  it("skips abandoned check-ins (rating === 0)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([{ type: "final", usage: { inputTokens: 5, outputTokens: 0 } }]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "hi" }),
      makeToolCallEvent("e2", 1, "call-x", "1-4"),
      makeToolResultEvent("e3", 1, "call-x", 0), // abandoned
    ]);

    await indexer.run(ctx);

    // No rows: the abandoned check-in is skipped, model returns nothing
    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(0);
  });
});

describe("AffectiveIndexer — transcript-only (model inference)", () => {
  it("makes one model call; on success writes a single model-inferred row", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([
        {
          type: "model_message",
          content: makeValidJson({ engagement: 0.8, frustration: 0.2, confidence: 0.75 }),
        },
        { type: "final", usage: { inputTokens: 200, outputTokens: 30 } },
      ]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "I'm not sure about this" }),
      makeEvent("e2", 1, { type: "model_message", content: "Let's work through it" }),
    ]);

    await indexer.run(ctx);

    expect(mockRunOneShot).toHaveBeenCalledOnce();

    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row?.source).toBe("model-inferred");
    expect(row?.engagementMilli).toBe(800);
    expect(row?.frustrationMilli).toBe(200);
    expect(row?.confidenceMilli).toBe(750);
  });
});

describe("AffectiveIndexer — model failure", () => {
  it("explicit-checkin rows still write; no model-inferred row; warn logged", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    // Engine emits an error event
    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([
        {
          type: "error",
          error: { code: "engine.timeout", message: "timed out", recoverable: false },
        },
      ]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "question" }),
      makeToolCallEvent("e2", 1, "call-err", "1-4"),
      makeToolResultEvent("e3", 1, "call-err", 2), // rating=2 → (2-1)/(4-1) = 0.333…
    ]);

    await indexer.run(ctx);

    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();

    const explicit = rows.filter((r) => r.source === "explicit-checkin");
    const inferred = rows.filter((r) => r.source === "model-inferred");

    expect(explicit).toHaveLength(1);
    expect(inferred).toHaveLength(0);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith("affective.engine_error", expect.anything());
  });

  it("explicit-checkin rows still write when model returns unparseable JSON", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([
        { type: "model_message", content: "Sorry, I cannot analyze this transcript." },
      ]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "question" }),
      makeToolCallEvent("e2", 1, "call-parse", "1-4"),
      makeToolResultEvent("e3", 1, "call-parse", 3),
    ]);

    await indexer.run(ctx);

    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();

    expect(rows.filter((r) => r.source === "explicit-checkin")).toHaveLength(1);
    expect(rows.filter((r) => r.source === "model-inferred")).toHaveLength(0);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith("affective.no_json_block_found", expect.anything());
  });
});

describe("AffectiveIndexer — mixed (both paths)", () => {
  it("writes explicit-checkin rows AND model-inferred row in one pass", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([
        {
          type: "model_message",
          content: makeValidJson({ engagement: 0.6, frustration: 0.4, confidence: 0.65 }),
        },
      ]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "let me try" }),
      makeToolCallEvent("e2", 1, "call-m", "1-4"),
      makeToolResultEvent("e3", 1, "call-m", 3), // confidence = (3-1)/(4-1) = 0.667
      makeEvent("e4", 2, { type: "model_message", content: "well done" }),
    ]);

    await indexer.run(ctx);

    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();

    expect(rows.filter((r) => r.source === "explicit-checkin")).toHaveLength(1);
    expect(rows.filter((r) => r.source === "model-inferred")).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });
});

describe("AffectiveIndexer — out-of-range model output", () => {
  it("rejects (does not clamp) out-of-range values; no model-inferred row written", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const engine = makeFakeEngine();

    // Model returns an engagement > 1 which fails Zod validation
    mockRunOneShot.mockReturnValueOnce(
      makeEventStream([
        {
          type: "model_message",
          content: makeValidJson({ engagement: 1.5, frustration: 0.3, confidence: 0.5 }),
        },
      ]),
    );

    const indexer = new AffectiveIndexer({ db, log: MOCK_LOG, engineResolver: () => engine });

    const ctx = makeCtx([
      makeEvent("e1", 0, { type: "user_message", content: "question" }),
      makeEvent("e2", 1, { type: "model_message", content: "answer" }),
    ]);

    await indexer.run(ctx);

    const rows = db
      .select()
      .from(affectiveSamples)
      .where(eq(affectiveSamples.studentId, STUDENT_ID))
      .all();

    // No rows — schema validation rejected the out-of-range value
    expect(rows.filter((r) => r.source === "model-inferred")).toHaveLength(0);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith(
      "affective.schema_validation_failed",
      expect.anything(),
    );
  });
});

// ── extractExplicitCheckins unit tests ────────────────────────────────────────

describe("extractExplicitCheckins", () => {
  it("extracts confidence check-ins with correct normalization for 1-4 scale", () => {
    const events: IndexerContext["events"] = [
      makeToolCallEvent("tc1", 0, "cid-1", "1-4"),
      makeToolResultEvent("tr1", 0, "cid-1", 3),
    ];

    const checkins = extractExplicitCheckins(events);
    expect(checkins).toHaveLength(1);
    // (3-1)/(4-1) = 2/3 ≈ 0.667
    expect(checkins[0]?.confidence).toBeCloseTo(2 / 3, 5);
  });

  it("extracts confidence check-ins with correct normalization for 1-5 scale", () => {
    const events: IndexerContext["events"] = [
      makeToolCallEvent("tc2", 0, "cid-2", "1-5"),
      makeToolResultEvent("tr2", 0, "cid-2", 5),
    ];

    const checkins = extractExplicitCheckins(events);
    expect(checkins).toHaveLength(1);
    // (5-1)/(5-1) = 1.0
    expect(checkins[0]?.confidence).toBe(1.0);
  });

  it("defaults to 1-4 scale when scale arg is missing", () => {
    const events: IndexerContext["events"] = [
      makeEvent("tc3", 0, {
        type: "tool_call",
        toolName: "quick_check.confidence",
        args: { prompt: "How sure?" }, // no scale field
        callId: "cid-3",
      }),
      makeToolResultEvent("tr3", 0, "cid-3", 1),
    ];

    const checkins = extractExplicitCheckins(events);
    expect(checkins).toHaveLength(1);
    // (1-1)/(4-1) = 0
    expect(checkins[0]?.confidence).toBe(0);
  });

  it("ignores tool_result events for non-confidence tools", () => {
    const events: IndexerContext["events"] = [
      makeEvent("tc4", 0, {
        type: "tool_call",
        toolName: "quick_check.single_choice",
        args: {},
        callId: "cid-4",
      }),
      makeEvent("tr4", 0, {
        type: "tool_result",
        callId: "cid-4",
        result: { ok: true, value: { selectedIndex: 2 }, tier: "model-derived" as const },
      }),
    ];

    const checkins = extractExplicitCheckins(events);
    expect(checkins).toHaveLength(0);
  });

  it("skips abandoned check-ins (rating === 0)", () => {
    const events: IndexerContext["events"] = [
      makeToolCallEvent("tc5", 0, "cid-5", "1-4"),
      makeToolResultEvent("tr5", 0, "cid-5", 0),
    ];

    expect(extractExplicitCheckins(events)).toHaveLength(0);
  });

  it("skips tool_result events with no matching tool_call", () => {
    const events: IndexerContext["events"] = [makeToolResultEvent("tr6", 0, "orphan-call-id", 3)];

    expect(extractExplicitCheckins(events)).toHaveLength(0);
  });
});
