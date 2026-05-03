/**
 * NotesServiceImpl — unit tests using a real migrated SQLite DB.
 */

import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { NotesServiceImpl } from "../services/notes-service.js";
import type { NoteBody } from "../types/index.js";
import { brandId } from "../types/index.js";

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const STUDENT_ID = brandId<"StudentId">("student-notes-test");

const dbCtx = useTempDb();

function makeService(db: ReturnType<typeof openDb>["db"]) {
  return new NotesServiceImpl({
    db,
    log: MOCK_LOG,
    engineResolver: () => {
      throw new Error("engineResolver not needed in this test");
    },
    // biome-ignore lint/suspicious/noExplicitAny: memory not needed in these tests
    memory: null as any,
  });
}

describe("NotesServiceImpl", () => {
  describe("create", () => {
    it("creates a cornell note and returns it", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = {
        kind: "cornell",
        questions: ["What is x?"],
        details: ["x is a variable."],
        summary: "Variables represent unknowns.",
      };
      const note = await svc.create({ studentId: STUDENT_ID, format: "cornell", body });
      expect(note.format).toBe("cornell");
      expect(note.body).toBe(JSON.stringify(body));
      expect(note.studentId).toBe(STUDENT_ID);
    });

    it("creates a free note", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "free form text here" };
      const note = await svc.create({ studentId: STUDENT_ID, format: "free", body });
      expect(note.format).toBe("free");
    });

    it("rejects format/body mismatch", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "feynman", explanation: "x", followUps: [] };
      await expect(svc.create({ studentId: STUDENT_ID, format: "cornell", body })).rejects.toThrow(
        "does not match body kind",
      );
    });

    it("stores context fields", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "context note" };
      const courseId = brandId<"CourseId">("course-abc");
      const note = await svc.create({
        studentId: STUDENT_ID,
        format: "free",
        body,
        context: { courseId },
      });
      expect(note.context.courseId).toBe(courseId);
    });
  });

  describe("update", () => {
    it("updates note body", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "original" };
      const note = await svc.create({ studentId: STUDENT_ID, format: "free", body });
      const newBody: NoteBody = { kind: "free", text: "updated" };
      const updated = await svc.update({
        studentId: STUDENT_ID,
        noteId: note.id,
        body: newBody,
      });
      expect(updated.body).toBe(JSON.stringify(newBody));
    });

    it("rejects format change on update", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "original" };
      const note = await svc.create({ studentId: STUDENT_ID, format: "free", body });
      const newBody: NoteBody = { kind: "feynman", explanation: "x", followUps: [] };
      await expect(
        svc.update({ studentId: STUDENT_ID, noteId: note.id, body: newBody }),
      ).rejects.toThrow("Cannot change note format on update");
    });

    it("throws when note not found", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      await expect(
        svc.update({
          studentId: STUDENT_ID,
          noteId: brandId<"NoteId">("nonexistent"),
          body: { kind: "free", text: "x" },
        }),
      ).rejects.toThrow("Note not found");
    });
  });

  describe("get", () => {
    it("returns null for unknown noteId", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const result = await svc.get({
        studentId: STUDENT_ID,
        noteId: brandId<"NoteId">("unknown"),
      });
      expect(result).toBeNull();
    });

    it("returns null when studentId doesn't match", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "private" };
      const note = await svc.create({ studentId: STUDENT_ID, format: "free", body });
      const result = await svc.get({
        studentId: brandId<"StudentId">("other-student"),
        noteId: note.id,
      });
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("orders by updatedAt desc", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const studentId = brandId<"StudentId">("student-list");
      const note1 = await svc.create({
        studentId,
        format: "free",
        body: { kind: "free", text: "first" },
      });
      const note2 = await svc.create({
        studentId,
        format: "free",
        body: { kind: "free", text: "second" },
      });
      // Touch note1 after note2 so it has a later updatedAt.
      await svc.update({
        studentId,
        noteId: note1.id,
        body: { kind: "free", text: "first-updated" },
      });
      const notes = await svc.list({ studentId });
      // note1 was updated last, so it should be first in desc order.
      expect(notes[0]?.body).toContain("first-updated");
      expect(notes[1]?.body).toContain("second");
    });

    it("filters by format", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const studentId = brandId<"StudentId">("student-format-filter");
      await svc.create({ studentId, format: "free", body: { kind: "free", text: "f" } });
      await svc.create({
        studentId,
        format: "feynman",
        body: { kind: "feynman", explanation: "x", followUps: [] },
      });
      const freeNotes = await svc.list({ studentId, format: "free" });
      expect(freeNotes.every((n) => n.format === "free")).toBe(true);
      expect(freeNotes).toHaveLength(1);
    });

    it("filters by courseId", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const studentId = brandId<"StudentId">("student-course-filter");
      const courseId = brandId<"CourseId">("course-xyz");
      await svc.create({
        studentId,
        format: "free",
        body: { kind: "free", text: "with course" },
        context: { courseId },
      });
      await svc.create({
        studentId,
        format: "free",
        body: { kind: "free", text: "no course" },
      });
      const filtered = await svc.list({ studentId, courseId });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.context.courseId).toBe(courseId);
    });
  });

  describe("delete", () => {
    it("removes the note", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "to be deleted" };
      const note = await svc.create({ studentId: STUDENT_ID, format: "free", body });
      await svc.delete({ studentId: STUDENT_ID, noteId: note.id });
      const result = await svc.get({ studentId: STUDENT_ID, noteId: note.id });
      expect(result).toBeNull();
    });

    it("is studentId-scoped (no cross-student delete)", async () => {
      const { db } = openDb({ path: dbCtx.dbPath });
      const svc = makeService(db);
      const body: NoteBody = { kind: "free", text: "private" };
      const note = await svc.create({ studentId: STUDENT_ID, format: "free", body });
      // Delete with a different studentId — should be a no-op.
      await svc.delete({
        studentId: brandId<"StudentId">("other-student"),
        noteId: note.id,
      });
      const result = await svc.get({ studentId: STUDENT_ID, noteId: note.id });
      expect(result).not.toBeNull();
    });
  });
});
