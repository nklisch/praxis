/**
 * Phase 12: NotesServiceImpl — creates, updates, reads, and deletes student notes.
 *
 * Note bodies are stored as JSON-encoded NoteBody strings in the `notes.body` column.
 * `fromSessionSummary` reads episodic events via MemoryService, runs a one-shot LLM
 * call to produce structured JSON, validates it, and persists.
 */

import { notes } from "@praxis/artifacts/schema";
import { runOneShot } from "@praxis/engines";
import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import type {
  Annotation,
  CourseId,
  Engine,
  LessonId,
  Logger,
  MemoryService,
  Note,
  NoteBody,
  NoteContext,
  NoteId,
  NotesService,
  SessionId,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId, serializeNoteBody } from "../types/index.js";
import { loadOrThrow } from "./db-helpers.js";
import { extractJsonBlock } from "./llm-helpers.js";
import { FROM_SESSION_SUMMARY_PROMPT } from "./notes-session-summary-prompt.js";

export interface NotesServiceDeps {
  db: PraxisDb;
  log: Logger;
  /**
   * Resolves the user's currently selected engine.
   * Same pattern as CourseCreateServiceImpl and MisconceptionIndexer.
   * Only needed for fromSessionSummary; safe to pass a dummy in unit tests
   * that don't invoke that method.
   */
  engineResolver: () => Engine;
  /**
   * MemoryService for reading episodic events in fromSessionSummary.
   */
  memory: MemoryService;
}

/** Recursive outline node schema (legacy tree format). Requires z.lazy for self-reference. */
const OutlineNodeSchema: z.ZodType<{ text: string; children: unknown[] }> = z.lazy(() =>
  z.object({
    text: z.string(),
    children: z.array(OutlineNodeSchema),
  }),
);

/** Flat outline row schema (new keyboard-first editor). */
const OutlineRowSchema = z.object({
  id: z.string(),
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  isCheckbox: z.boolean().optional(),
  checked: z.boolean().optional(),
});

export const NoteBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cornell"),
    questions: z.array(z.string()),
    details: z.array(z.string()),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("feynman"),
    explanation: z.string().min(1),
    followUps: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("outline"),
    rows: z.array(OutlineRowSchema).optional(),
    root: z.lazy(() => OutlineNodeSchema).optional(),
  }),
  z.object({
    kind: z.literal("free"),
    text: z.string(),
  }),
]);

const MAX_EPISODIC_EVENTS = 50;

export class NotesServiceImpl implements NotesService {
  constructor(private readonly deps: NotesServiceDeps) {}

  async create(input: {
    studentId: StudentId;
    format: "cornell" | "feynman" | "outline" | "free";
    body: NoteBody;
    context?: NoteContext;
  }): Promise<Note> {
    if (input.body.kind !== input.format) {
      throw new Error(
        `Note format '${input.format}' does not match body kind '${input.body.kind}'`,
      );
    }
    const id = uuidv7();
    const now = new Date();
    this.deps.db
      .insert(notes)
      .values({
        id,
        studentId: input.studentId,
        sessionId: input.context?.sessionId ?? null,
        contextJson: input.context ?? {},
        format: input.format,
        body: serializeNoteBody(input.body),
        sketchSceneJson: null,
        linksJson: [],
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return loadOrThrow(
      () => this.get({ studentId: input.studentId, noteId: brandId<"NoteId">(id) }),
      { entity: "note", op: "create", id, log: this.deps.log },
    );
  }

  async update(input: { studentId: StudentId; noteId: NoteId; body: NoteBody }): Promise<Note> {
    const existing = await this.get({ studentId: input.studentId, noteId: input.noteId });
    if (!existing) throw new Error(`Note not found: ${input.noteId}`);
    if (input.body.kind !== existing.format) {
      throw new Error(
        `Cannot change note format on update; tried to write '${input.body.kind}' to '${existing.format}' note`,
      );
    }
    const now = new Date();
    this.deps.db
      .update(notes)
      .set({
        body: serializeNoteBody(input.body),
        updatedAt: now,
      })
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .run();
    return loadOrThrow(() => this.get({ studentId: input.studentId, noteId: input.noteId }), {
      entity: "note",
      op: "update",
      id: input.noteId,
      log: this.deps.log,
    });
  }

  async get(input: { studentId: StudentId; noteId: NoteId }): Promise<Note | null> {
    const row = this.deps.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .get();
    if (!row) return null;
    return rowToNote(row);
  }

  async list(input: {
    studentId: StudentId;
    courseId?: CourseId;
    lessonId?: LessonId;
    format?: "cornell" | "feynman" | "outline" | "free";
    limit?: number;
  }): Promise<Note[]> {
    const limit = input.limit ?? 100;
    const conditions = [eq(notes.studentId, input.studentId)];
    if (input.format) conditions.push(eq(notes.format, input.format));

    const rows = this.deps.db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.updatedAt))
      .limit(limit)
      .all();

    let result = rows.map(rowToNote);

    // Filter context fields in app code (SQLite JSON path queries have limited Drizzle support).
    if (input.courseId !== undefined) {
      result = result.filter((n) => n.context.courseId === input.courseId);
    }
    if (input.lessonId !== undefined) {
      result = result.filter((n) => n.context.lessonId === input.lessonId);
    }
    return result;
  }

  async delete(input: { studentId: StudentId; noteId: NoteId }): Promise<void> {
    this.deps.db
      .delete(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .run();
  }

  async setAnnotations(input: {
    studentId: StudentId;
    noteId: NoteId;
    annotations: Annotation[];
  }): Promise<void> {
    for (const ann of input.annotations) {
      if (
        !Number.isInteger(ann.rangeStart) ||
        !Number.isInteger(ann.rangeEnd) ||
        ann.rangeStart < 0 ||
        ann.rangeEnd < 0 ||
        ann.rangeStart >= ann.rangeEnd
      ) {
        throw new Error(
          `Invalid annotation range [${ann.rangeStart}, ${ann.rangeEnd}): ` +
            "rangeStart and rangeEnd must be non-negative integers with rangeStart < rangeEnd.",
        );
      }
    }
    this.deps.db
      .update(notes)
      .set({ annotationsJson: input.annotations })
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .run();
  }

  async getAnnotations(input: { studentId: StudentId; noteId: NoteId }): Promise<Annotation[]> {
    const row = this.deps.db
      .select({ annotationsJson: notes.annotationsJson })
      .from(notes)
      .where(and(eq(notes.id, input.noteId), eq(notes.studentId, input.studentId)))
      .get();
    if (!row || row.annotationsJson === null || row.annotationsJson === undefined) return [];
    return row.annotationsJson as Annotation[];
  }

  /**
   * Generate a structured note from a session's episodic events via a one-shot LLM call.
   * Reads events from MemoryService.episodic, composes a transcript prompt, runs runOneShot,
   * parses and validates the JSON result, and persists via create().
   */
  async fromSessionSummary(input: {
    studentId: StudentId;
    sessionId: string;
    format: "cornell" | "feynman" | "outline" | "free";
  }): Promise<Note> {
    // 1. Read the last N episodic events from this session.
    const events: unknown[] = [];
    const sessionIdBranded = brandId<"SessionId">(input.sessionId) as SessionId;
    for await (const ev of this.deps.memory.episodic({
      studentId: input.studentId,
      sessionId: sessionIdBranded,
    })) {
      events.push(ev);
      if (events.length >= MAX_EPISODIC_EVENTS) break;
    }

    if (events.length === 0) {
      throw new Error(
        `No episodic events found for session ${input.sessionId}. ` +
          "Ensure the session has run at least one turn before calling fromSessionSummary.",
      );
    }

    // 2. Compose user message — events as JSON + format request.
    const transcript = events
      // biome-ignore lint/suspicious/noExplicitAny: episodic events have varied shapes
      .map((ev: any) => {
        const role = ev.kind === "user_message" ? "Student" : "Tutor";
        const content = ev.content ?? ev.text ?? JSON.stringify(ev);
        return `[${role}] ${content}`;
      })
      .join("\n");

    const userMessage =
      `Session transcript (${events.length} turns):\n\n${transcript}\n\n` +
      `Please produce a study note in '${input.format}' format.`;

    // 3. Run the one-shot LLM call.
    const engine = this.deps.engineResolver();
    const eventStream = runOneShot(
      engine,
      {
        systemPrompt: FROM_SESSION_SUMMARY_PROMPT,
        tools: { list: () => [], dispatch: noopDispatch },
        maxSteps: 1,
      },
      userMessage,
    );

    let assistantText = "";
    for await (const ev of eventStream) {
      if (ev.type === "model_message") assistantText += ev.content;
      if (ev.type === "error") {
        throw new Error(`fromSessionSummary engine error: ${ev.error.message}`);
      }
    }

    if (!assistantText.trim()) {
      throw new Error("fromSessionSummary: LLM returned empty response");
    }

    // 4. Parse + validate the LLM's JSON output.
    const rawJson = extractJsonBlock(assistantText);
    if (rawJson === null) {
      throw new Error(
        `fromSessionSummary: could not extract JSON block from LLM output. ` +
          `First 200 chars: ${assistantText.slice(0, 200)}`,
      );
    }

    const parsed = NoteBodySchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new Error(`fromSessionSummary output failed Zod validation: ${parsed.error.message}`);
    }
    if (parsed.data.kind !== input.format) {
      throw new Error(
        `fromSessionSummary returned '${parsed.data.kind}', expected '${input.format}'`,
      );
    }

    // 5. Persist and return.
    // Cast to NoteBody: Zod's inferred type for OutlineNode uses `unknown[]` for children
    // (due to z.lazy recursive inference), but the runtime shape matches NoteBody exactly.
    return this.create({
      studentId: input.studentId,
      format: input.format,
      body: parsed.data as NoteBody,
      context: { sessionId: input.sessionId },
    });
  }
}

function rowToNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id as NoteId,
    studentId: row.studentId as StudentId,
    context: row.contextJson as NoteContext,
    format: row.format,
    ...(row.body !== null ? { body: row.body } : {}),
    // biome-ignore lint/suspicious/noExplicitAny: sketchScene is Phase 13 tldraw type
    ...(row.sketchSceneJson !== null ? { sketchScene: row.sketchSceneJson as any } : {}),
    links: (row.linksJson ?? []) as Note["links"],
    createdAt: row.createdAt.getTime() as Timestamp,
    updatedAt: row.updatedAt.getTime() as Timestamp,
  };
}

async function noopDispatch(): Promise<{
  ok: false;
  error: { code: string; message: string; recoverable: boolean };
}> {
  return {
    ok: false,
    error: { code: "no_tools", message: "notes service has no tools", recoverable: false },
  };
}
