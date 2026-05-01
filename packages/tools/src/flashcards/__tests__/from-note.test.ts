/**
 * flashcard.from_note tool — unit tests.
 * Tests per-format extraction logic.
 */

import type { NoteBody } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { fromNoteTool } from "../from-note.js";

function makeCtxForNote(noteBody: NoteBody, format: string) {
  const studentId = brandId<"StudentId">("student-test");
  const noteId = brandId<"NoteId">("note-1");

  return makeToolContext({
    services: {
      notes: {
        get: vi.fn().mockResolvedValue({
          id: noteId,
          studentId,
          format,
          context: {},
          links: [],
          body: JSON.stringify(noteBody),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        create: vi.fn(),
        update: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        fromSessionSummary: vi.fn(),
      },
    },
  });
}

describe("fromNoteTool", () => {
  it("Cornell: pairs questions[i] with details[i]", async () => {
    const body: NoteBody = {
      kind: "cornell",
      questions: ["What is x?", "What is y?"],
      details: ["x is the unknown.", "y is another unknown."],
      summary: "Variables.",
    };
    const ctx = makeCtxForNote(body, "cornell");
    const result = await fromNoteTool.handler({ noteId: "note-1" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.proposed).toHaveLength(2);
    expect(result.proposed[0]).toEqual({ front: "What is x?", back: "x is the unknown." });
    expect(result.proposed[1]).toEqual({
      front: "What is y?",
      back: "y is another unknown.",
    });
  });

  it("Cornell: filters out pairs with missing question or detail", async () => {
    const body: NoteBody = {
      kind: "cornell",
      questions: ["Q1", "", "Q3"],
      details: ["D1", "D2", ""],
      summary: "sum",
    };
    const ctx = makeCtxForNote(body, "cornell");
    const result = await fromNoteTool.handler({ noteId: "note-1" }, ctx);
    // Only Q1/D1 pair is non-empty on both sides
    expect(result.proposed).toHaveLength(1);
    expect(result.proposed[0]?.front).toBe("Q1");
  });

  it("Cornell: sectionIndex selects only one pair", async () => {
    const body: NoteBody = {
      kind: "cornell",
      questions: ["Q1", "Q2", "Q3"],
      details: ["D1", "D2", "D3"],
      summary: "sum",
    };
    const ctx = makeCtxForNote(body, "cornell");
    const result = await fromNoteTool.handler({ noteId: "note-1", sectionIndex: 1 }, ctx);
    expect(result.proposed).toHaveLength(1);
    expect(result.proposed[0]).toEqual({ front: "Q2", back: "D2" });
  });

  it("Feynman: explanation → one card + followUps → one card each", async () => {
    const body: NoteBody = {
      kind: "feynman",
      explanation: "Gravity pulls things together.",
      followUps: ["Why does mass matter?", "What is G?"],
    };
    const ctx = makeCtxForNote(body, "feynman");
    const result = await fromNoteTool.handler({ noteId: "note-1" }, ctx);
    // 1 explanation card + 2 follow-up cards
    expect(result.proposed).toHaveLength(3);
    expect(result.proposed[0]?.back).toBe("Gravity pulls things together.");
    expect(result.proposed[1]?.front).toBe("Why does mass matter?");
  });

  it("Outline: leaf nodes become cards with ancestor path as front", async () => {
    const body: NoteBody = {
      kind: "outline",
      root: {
        text: "Calculus",
        children: [
          {
            text: "Derivatives",
            children: [{ text: "Power rule", children: [] }],
          },
        ],
      },
    };
    const ctx = makeCtxForNote(body, "outline");
    const result = await fromNoteTool.handler({ noteId: "note-1" }, ctx);
    expect(result.proposed).toHaveLength(1);
    expect(result.proposed[0]?.front).toBe("Calculus > Derivatives");
    expect(result.proposed[0]?.back).toBe("Power rule");
  });

  it("Free: returns empty array (no structure to extract)", async () => {
    const body: NoteBody = { kind: "free", text: "Just some text here." };
    const ctx = makeCtxForNote(body, "free");
    const result = await fromNoteTool.handler({ noteId: "note-1" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.proposed).toHaveLength(0);
  });

  it("throws when note not found", async () => {
    const ctx = makeCtxForNote({ kind: "free", text: "x" }, "free");
    (ctx.services.notes.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(fromNoteTool.handler({ noteId: "nonexistent" }, ctx)).rejects.toThrow(
      "note not found",
    );
  });
});
