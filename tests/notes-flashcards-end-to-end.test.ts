/**
 * End-to-end integration test for Phase 12 — Notes + Flashcards flow.
 *
 * Covers the full loop:
 *  1. Create a cornell note → assert body persists and parses cleanly.
 *  2. Call flashcard.from_note tool handler → assert proposed cards.
 *  3. Create flashcards from proposed cards.
 *  4. List due cards (immediately due after creation).
 *  5. Review one card → assert nextReviewAt is in the future.
 *  6. dueCount decreases after review.
 *  7. Student scoping: a second student's note is not visible to the first.
 *
 * Uses real SQLite (useTempDb) + FsrsSchedulerImpl.
 * No LLM engine needed (no note.from_session_summary calls).
 */

import { openDb } from "@praxis/core/db";
import { FlashcardsServiceImpl, NotesServiceImpl } from "@praxis/core/services";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  Logger,
  NoteBody,
  ToolContext,
} from "@praxis/core/types";
import { brandId, parseNoteBody, serializeNoteBody } from "@praxis/core/types";
import { FsrsSchedulerImpl } from "@praxis/curriculum/scheduling";
import { fromNoteTool } from "@praxis/tools/flashcards";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";

// ── Minimal stub logger ────────────────────────────────────────────────────────

const noopLog: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => noopLog,
};

// ── Minimal stub Engine (not invoked; engineResolver required by NotesServiceImpl) ───────────────

class StubEngineSession implements EngineSession {
  readonly id = "stub-session";
  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } };
  }
  async close(): Promise<void> {}
}

class StubEngine implements Engine {
  readonly id = "stub";
  readonly kind = "single-shot" as const;
  async open(_opts: EngineOpenOptions): Promise<EngineSession> {
    return new StubEngineSession();
  }
  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

describe("notes-flashcards end-to-end", () => {
  const studentId = brandId<"StudentId">("student-e2e");
  const studentId2 = brandId<"StudentId">("student-e2e-2");

  function buildServices() {
    const { db } = openDb({ path: dbCtx.dbPath });
    const scheduler = new FsrsSchedulerImpl();

    const notesService = new NotesServiceImpl({
      db,
      log: noopLog,
      engineResolver: () => new StubEngine(),
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub — fromSessionSummary not tested
      memory: {} as any,
    });

    const flashcardsService = new FlashcardsServiceImpl({
      db,
      log: noopLog,
      scheduler,
    });

    return { db, notesService, flashcardsService, scheduler };
  }

  it("step 1: create cornell note — body persists and parses cleanly", async () => {
    const { notesService } = buildServices();

    const body: NoteBody = {
      kind: "cornell",
      questions: ["Q1", "Q2"],
      details: ["D1", "D2"],
      summary: "S",
    };

    const note = await notesService.create({
      studentId,
      format: "cornell",
      body,
      context: {},
    });

    expect(note.id).toBeTruthy();
    expect(note.format).toBe("cornell");
    expect(note.body).toBeTruthy();

    // Round-trip parse
    const parsed = parseNoteBody("cornell", note.body ?? null);
    expect(parsed.kind).toBe("cornell");
    if (parsed.kind === "cornell") {
      expect(parsed.questions).toEqual(["Q1", "Q2"]);
      expect(parsed.details).toEqual(["D1", "D2"]);
      expect(parsed.summary).toBe("S");
    }
  });

  it("step 2: flashcard.from_note proposes correct cards from cornell note", async () => {
    const { notesService, flashcardsService, scheduler } = buildServices();

    // Create the note
    const note = await notesService.create({
      studentId,
      format: "cornell",
      body: {
        kind: "cornell",
        questions: ["Q1", "Q2"],
        details: ["D1", "D2"],
        summary: "S",
      },
      context: {},
    });

    // Build a minimal ToolContext (only notes + flashcards + fsrsScheduler are needed)
    const toolCtx: ToolContext = {
      studentId,
      sessionId: brandId("session-e2e"),
      services: {
        notes: notesService,
        flashcards: flashcardsService,
        fsrsScheduler: scheduler,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        sympy: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        sandbox: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        artifacts: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        assignments: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        memory: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        config: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        packs: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        vectorStore: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        ftsStore: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        embeddings: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        documents: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        bootstrap: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        courseState: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        pedagogyPack: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        lock: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stubs for unused services
        authoring: null as any,
      } as any,
      // biome-ignore lint/suspicious/noExplicitAny: minimal stubs
      log: noopLog as any,
    } as any;

    const result = await fromNoteTool.handler({ noteId: note.id }, toolCtx);

    expect(result.ok).toBe(true);
    expect(result.proposed).toHaveLength(2);
    expect(result.proposed[0]).toEqual({ front: "Q1", back: "D1" });
    expect(result.proposed[1]).toEqual({ front: "Q2", back: "D2" });
  });

  it("step 3–4: create flashcards from proposed and list as due", async () => {
    const { notesService, flashcardsService } = buildServices();

    // Create note
    const note = await notesService.create({
      studentId,
      format: "cornell",
      body: {
        kind: "cornell",
        questions: ["Q1", "Q2"],
        details: ["D1", "D2"],
        summary: "",
      },
      context: {},
    });

    // Create 2 flashcards (simulating user confirming proposed cards)
    const card1 = await flashcardsService.create({
      studentId,
      front: "Q1",
      back: "D1",
      source: { kind: "extracted", ref: note.id },
    });
    const card2 = await flashcardsService.create({
      studentId,
      front: "Q2",
      back: "D2",
      source: { kind: "extracted", ref: note.id },
    });

    // Both should be immediately due (initial FSRS state = due now)
    const dueList = await flashcardsService.list({ studentId, due: true });
    const dueIds = dueList.map((c) => c.id);
    expect(dueIds).toContain(card1.id);
    expect(dueIds).toContain(card2.id);
  });

  it("step 5–6: review one card → nextReviewAt in future; dueCount decreases", async () => {
    const { notesService, flashcardsService } = buildServices();

    // Setup: create two cards
    await notesService.create({
      studentId,
      format: "free",
      body: { kind: "free", text: "context" },
      context: {},
    });

    const card1 = await flashcardsService.create({
      studentId,
      front: "Front A",
      back: "Back A",
      source: { kind: "user-created" },
    });
    const card2 = await flashcardsService.create({
      studentId,
      front: "Front B",
      back: "Back B",
      source: { kind: "user-created" },
    });

    const countBefore = await flashcardsService.dueCount({ studentId });
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // Review card1 as "good"
    const { nextReviewAt } = await flashcardsService.review({
      studentId,
      flashcardId: card1.id,
      rating: "good",
    });

    expect(nextReviewAt).toBeGreaterThan(Date.now());

    // card2 should still be due; card1 is not (FSRS scheduled it in the future)
    const dueAfter = await flashcardsService.list({ studentId, due: true });
    const dueIds = dueAfter.map((c) => c.id);
    expect(dueIds).toContain(card2.id);
    expect(dueIds).not.toContain(card1.id);

    const countAfter = await flashcardsService.dueCount({ studentId });
    expect(countAfter).toBeLessThan(countBefore);
  });

  it("step 7: notes are student-scoped — student2 cannot see student1 notes", async () => {
    const { notesService } = buildServices();

    // Student 1 creates a note
    await notesService.create({
      studentId,
      format: "free",
      body: { kind: "free", text: "student 1 note" },
      context: {},
    });

    // Student 2 creates a different note
    await notesService.create({
      studentId: studentId2,
      format: "free",
      body: { kind: "free", text: "student 2 note" },
      context: {},
    });

    // Student 1 list should not contain student 2's note
    const s1Notes = await notesService.list({ studentId });
    const s1Texts = s1Notes.map((n) => {
      const parsed = parseNoteBody(n.format, n.body ?? null);
      return parsed.kind === "free" ? parsed.text : "";
    });
    expect(s1Texts).toContain("student 1 note");
    expect(s1Texts).not.toContain("student 2 note");

    // Student 2 list should not contain student 1's note
    const s2Notes = await notesService.list({ studentId: studentId2 });
    const s2Texts = s2Notes.map((n) => {
      const parsed = parseNoteBody(n.format, n.body ?? null);
      return parsed.kind === "free" ? parsed.text : "";
    });
    expect(s2Texts).toContain("student 2 note");
    expect(s2Texts).not.toContain("student 1 note");
  });

  it("parseNoteBody / serializeNoteBody round-trip for all formats", () => {
    const bodies: NoteBody[] = [
      { kind: "cornell", questions: ["Q"], details: ["D"], summary: "Sum" },
      { kind: "feynman", explanation: "Explain", followUps: ["Follow?"] },
      { kind: "outline", root: { text: "Root", children: [{ text: "Child", children: [] }] } },
      { kind: "free", text: "Free text" },
    ];

    for (const body of bodies) {
      const serialized = serializeNoteBody(body);
      const parsed = parseNoteBody(body.kind, serialized);
      expect(parsed).toEqual(body);
    }
  });
});
