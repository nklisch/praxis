# Design: Phase 6 — Course + Lesson + Bootstrap

## Overview

Phase 6 makes Praxis course-aware. The student (or self-directed learner) drops a syllabus + textbook into Praxis, opens a **`bootstrap` mode** session, and walks the tutor through proposing a course outline, refining it conversationally, and confirming it as a real course. After bootstrap, every `teach` session for that course opens with **course context loaded into the system prompt** — the agent knows the active lesson, the concepts in it, what the student has studied, and where the textbook references live. Mid-session, the tutor uses **course-navigation tools** (`course.what_can_i_teach`, `course.start_lesson`, `course.current_concept`, `course.mark_studied`) to read and update progress.

After Phase 6: bootstrap mode → confirm draft → start a teach session against the new course → tutor opens with the active lesson loaded and the right textbook references in scope.

**Key design move:** following the project's "everything should be conversational" stance, **bootstrap is a mode, not a service method**. The user has a chat with the tutor; the tutor calls draft-authoring tools; the user refines through dialogue. The legacy `AuthoringService.bootstrap(files, opts)` contract method remains an unimplemented stub for now — Phase 11's full configure mode (lock-gated) may revive it for scripted use, or it may be removed when configure mode lands. This design supersedes that contract path.

**What ships:**

- **Schema additions** (`@praxis/artifacts/schema.ts`): `lesson_progress`, `concept_progress`. Two thin progress tables keyed by `(studentId, lessonId)` and `(studentId, conceptId)`. Phase 7 mastery (BKT) augments concept_progress with a separate `student_mastery` table — progress is "I've covered this", mastery is "how well I know it". Different concerns, different tables.
- **`ArtifactsServiceImpl`** in `@praxis/core/services` — concrete implementation of `ArtifactsService` plus a `CourseStateReader` interface used by tools and the brief composer. `ToolContext.services.artifacts` becomes concrete (was `unknown`).
- **`BootstrapServiceImpl`** in `@praxis/core/services` — owns the in-memory draft cache and the `confirmDraft` transactional persist. Holds drafts for 2 hours. Survives within one process; not durable across restarts (drafts are cheap to regenerate).
- **Concept extractor** in `@praxis/curriculum/bootstrap/extractor.ts` — runs a one-shot fresh engine session via `runOneShot` (same isolation pattern as Phase 5 vision). Reads document chunks, returns structured `ProposedCourse` JSON. Bills against the user's existing engine credentials (CLI subscription or API key).
- **Course-navigation tools** (`@praxis/tools/course/`): `course.what_can_i_teach`, `course.start_lesson`, `course.current_concept`, `course.mark_studied`. All tier `"grounded"` (read or write structured artifact state).
- **Bootstrap-mode tools**: `course.list_documents`, `course.propose_draft`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`. Tier `"grounded"` (artifact mutations) except `propose_draft` and `list_documents` which are tier `"model-derived"` and `"grounded"` respectively.
- **`bootstrap` mode** in `@praxis/curriculum/modes/bootstrap.ts` — prompt fragments that orient the agent toward authoring, plus the bootstrap-tool subset. Available without lock; Phase 11's `configure` mode will subsume it (lock-gated, with editor and memory inspector tools layered on).
- **Course-context fragment** in `@praxis/curriculum/brief/course-context.ts` — a `PromptFragment` at position `context` that summarizes the active course/lesson/concepts/recent-progress for `teach` (and any future course-aware mode). Computed dynamically by `SessionServiceImpl.openActive` per session via `CourseStateReader`.
- **`teach` mode update**: navigation tools added to `toolNames`; tools fragment updated to mention them.
- **IPC additions**: `praxis.artifacts.{courses,course,lessons,gates,progress}` (read-only). No new write IPC — all artifact mutations go through tools called by the agent.
- **Client additions**: `ArtifactsClient` (Phase 3 stub → real impl) backed by the new IPC channels.
- **UI**: `/courses` route (course list + "New course" button), `/courses/:courseId` route (lesson list + concept list + "Start session" button), `course.show_draft` tool-result rendering as a structured draft-review card in chat, nav update.
- **Doc updates**: `docs/ROADMAP.md` Phase 6 description clarified to reflect bootstrap-as-mode; `docs/CURRICULUM.md` adds `bootstrap` to the modes section; `docs/CONTRACT.md` notes the `AuthoringService.bootstrap` deprecation.

**What does not ship (deferred):**

- **Gate evaluation and unlock semantics** — Phase 9. Gates table is populated by bootstrap with `state.kind: "locked"`; nothing reads `state` in Phase 6.
- **Mastery scoring (BKT)** — Phase 7. `concept_progress.studiedAt` is the only Phase 6 signal.
- **Adaptive routing** — Phase 9 / 10. `course.current_concept` returns concepts in declared order, no router.
- **Canonical math / biology pack** — Phase 10 / 15. Phase 6 ships extracted graphs only; no canonical pack import flow.
- **Concept embeddings** for cross-graph linking — Phase 10. The schema column is reserved (Phase 1) but unused in Phase 6.
- **Scripted (non-conversational) bootstrap** via `AuthoringService.bootstrap` — stays a stub.
- **Lock-gated configure mode** — Phase 11.
- **Multi-student isolation tests** — single-student per install in v1.

## Why these choices (decision rationale)

**Why bootstrap is a mode.** The Praxis stance is that authoring, like teaching, happens through dialogue. A wizard-style "form → validate → submit" flow contradicts the project's voice. Making bootstrap a mode means the same agent loop, the same UI shell, the same prompt-fragment composition mechanism we already use for `teach`. Adding a mode is the cheapest extension point Praxis has — exactly the shape `Mode` was designed for.

**Why the extractor is a one-shot fresh session inside a tool.** The bootstrap-mode session is a long conversation with the user. The extractor needs to chew through hundreds of textbook chunks. If we sent those chunks through the live tutoring `EngineSession`, the prompt cache would die, the conversation history would balloon with extraction noise, and the model's view of the user's intent would degrade. Phase 5's vision capability solved the same isolation problem with one-shot fresh SDK sessions; we reuse that pattern. The tool handler opens a fresh session with `runOneShot`, drives the extractor end-to-end, persists the draft in memory, returns a compact summary. The live session continues clean.

**Why progress lives in `@praxis/artifacts`, not `@praxis/memory`.** "Studied" is an artifact-state question ("did the user cover this lesson?"), not a memory-projection question ("how well does the user know this concept?"). Mastery is the domain of memory and BKT. Mixing them now would force Phase 7 to refactor the schema. Two thin tables instead — `lesson_progress` and `concept_progress` — keep the boundary clean. Phase 7's `student_mastery` table augments concept_progress with `pKnown` and uncertainty.

**Why in-memory draft cache.** Drafts are cheap to regenerate (re-run the extractor on the same documents) and short-lived (the user reviews and confirms within minutes). Persisting drafts to a `courses` table with a `status` flag would force every course-reading query to filter by status, and would leak unconfirmed schema state into every consumer. Holding drafts in a process-local Map keyed by `draftId` with a 2-hour TTL is simpler and the failure mode (process restart loses drafts) is recoverable.

**Why course context is injected as a prompt fragment, not a system-prompt-prefix or a user-message-prefix.** The mode's prompt fragments already establish a stable, customizable, ordered system-prompt assembly. A new fragment at position `context` slots in cleanly without introducing a parallel "context injection" mechanism. `composeSystemPrompt` already accepts a list of fragments and sorts by position — we extend it to optionally accept additional fragments computed at session start. Customization (Phase 11) can override the static template parts but not the dynamic course-state interpolation.

**Why `course.show_draft` returns structured data the UI renders inline.** A textbook of 50 concepts and 20 lessons doesn't fit cleanly in a chat message. Plain-text serialization either becomes too long to scan or too compressed to be useful. Instead: the tool returns a structured `DraftCourse` payload; the UI's chat surface, when it sees a `tool_result` whose `toolName` is `course.show_draft`, renders the value as a structured card (collapsible course outline) the user can scroll. Same surface as Phase 5's citation cards. The agent narrates next to the card.

**Why no new write IPC channels.** Every artifact mutation in Phase 6 (create course, edit lesson, mark studied) is something the agent does on the user's behalf via tools. Tools dispatch through the existing tool pipeline — no IPC additions needed for writes. The new IPC additions are purely read-only Artifact queries the UI uses to render the courses list and detail view outside chat.

## Scope and assumptions

- **Single-student per install** (v1 invariant). All Phase 6 code reads `studentId` from `getOrCreateDefaultStudentId(db)`.
- **Bootstrap operates on already-ingested documents.** The user uses the existing Phase 5 file-picker → ingest flow first, then enters bootstrap mode. Bootstrap mode's tools select from documents already persisted; no inline ingestion.
- **The extractor uses the user's selected engine.** No separate API key. Same isolation pattern as Phase 5 vision.
- **Concept extraction quality is "best guess".** Following CURRICULUM.md, extracted graphs ship with a "best guess" badge until canonical packs land in Phase 10. Phase 6 makes the extractor work; correctness across subjects is iterative.
- **Lessons are ordered.** `lessons.orderIndex` defines a strict order. "Current lesson" is the first non-completed lesson. No interleaving / no spaced review insertion in Phase 6 (Phase 9+).
- **No mid-session unlock surfacing.** Gates exist as rows but their `state` is not evaluated in Phase 6. Phase 9 owns gate evaluation.
- **Draft TTL is process-local.** A draft lives 2 hours after the last access and is dropped on process exit. Recovery is "re-run propose_draft against the same documents."
- **The bootstrap mode's "confirm" step is gated by the agent's tool call**, not a separate UI button. The agent narrates the draft, the user types "looks good", the agent calls `course.confirm_draft`. This keeps the conversational frame intact.
- **No multi-document cross-references during extraction.** The extractor sees chunks from one document at a time, ordered by chunk index. Cross-document concept merging happens by name-equality (case-insensitive, trimmed) — good enough for "syllabus mentions linear equations, textbook chapter 3 mentions linear equations".

## Dependency direction (Phase 6 additions)

```
@praxis/core/types
  ├─ (no breaking changes)
  ├─ NEW: artifacts.ts — LessonProgress, ConceptProgress, ProposedCourse, DraftEditOp
  ├─ NEW: tool.ts — ArtifactsService.* concretized; CourseStateReader
  └─ MODIFIED: tool.ts — ToolServices.artifacts: ArtifactsService (was unknown)

@praxis/artifacts/schema.ts
  ├─ NEW: lesson_progress table
  └─ NEW: concept_progress table

@praxis/curriculum
  ├─ NEW: bootstrap/extractor.ts — runConceptExtractor (uses runOneShot)
  ├─ NEW: bootstrap/extractor-prompt.ts — extractor system prompt
  ├─ NEW: brief/course-context.ts — composeCourseContextFragment
  ├─ MODIFIED: brief/compose.ts — composeSystemPrompt accepts additionalFragments
  ├─ NEW: modes/bootstrap.ts — bootstrap mode
  ├─ NEW: modes/fragments/course-context.ts — context-position template scaffold
  ├─ NEW: modes/fragments/teach-course-tools.ts — teach tools fragment update
  └─ MODIFIED: modes/teach.ts — toolNames append + replace tools fragment

@praxis/core/services
  ├─ NEW: artifacts-service.ts — ArtifactsServiceImpl (reads + progress writes)
  ├─ NEW: bootstrap-service.ts — BootstrapServiceImpl (in-mem draft cache + confirm)
  ├─ MODIFIED: types.ts — ServiceDeps.toolServices.artifacts (concrete)
  ├─ MODIFIED: session-service.ts — inject course-context fragment when courseId set
  └─ MODIFIED: index.ts — export new services

@praxis/tools
  └─ NEW: course/
      ├─ shared/course-state.ts — CourseStateReader (read-only handle for navigation tools)
      ├─ what-can-i-teach.ts
      ├─ start-lesson.ts
      ├─ current-concept.ts
      ├─ mark-studied.ts
      ├─ list-documents.ts
      ├─ propose-draft.ts (calls extractor; tier model-derived)
      ├─ show-draft.ts
      ├─ edit-draft.ts
      ├─ confirm-draft.ts
      ├─ discard-draft.ts
      └─ index.ts — export all + COURSE_TOOLS array

@praxis/desktop
  ├─ MODIFIED: services.ts — wire ArtifactsServiceImpl + BootstrapServiceImpl + register course tools
  └─ MODIFIED: ipc-server.ts — register praxis.artifacts.* read channels

@praxis/client
  ├─ MODIFIED: services/artifacts-client.ts — replace stub with real impl
  └─ MODIFIED: client.ts — pass transport to ArtifactsClient

@praxis/ui
  ├─ NEW: routes/courses.tsx — course list + "New course" button
  ├─ NEW: routes/course-detail.tsx — /courses/:courseId
  ├─ NEW: hooks/use-courses.ts
  ├─ NEW: hooks/use-course-detail.ts
  ├─ NEW: components/draft-card.tsx — renders course.show_draft tool results
  ├─ NEW: components/course-list-item.tsx
  ├─ MODIFIED: components/nav.tsx — add Courses link
  ├─ MODIFIED: components/message.tsx — recognize course.show_draft tool results
  └─ MODIFIED: router.tsx — register new routes
```

No Python in Phase 6.

---

## Implementation Units

### Unit 1: Type contract additions

**Files**:
- `packages/core/src/types/artifacts.ts` (modified — add `LessonProgress`, `ConceptProgress`, `ProposedCourse`, `DraftEditOp`, `CourseSummary`)
- `packages/core/src/types/tool.ts` (modified — `ArtifactsService` becomes concrete; `CourseStateReader` added)

```typescript
// packages/core/src/types/artifacts.ts — additions

import type { Timestamp } from "./common.js";
import type { ConceptId, CourseId, DocumentId, LessonId, StudentId } from "./ids.js";

// ─── Per-student progress ────────────────────────────────────────────────────

export type LessonProgressStatus = "not_started" | "in_progress" | "completed";

export interface LessonProgress {
  studentId: StudentId;
  lessonId: LessonId;
  status: LessonProgressStatus;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface ConceptProgress {
  studentId: StudentId;
  conceptId: ConceptId;
  studiedAt: Timestamp;
  /** Episodic event IDs that produced this 'studied' marker — for back-reference. */
  evidence: string[];
}

// ─── Bootstrap (extractor output / draft state) ──────────────────────────────

/**
 * The structured output of the concept-extractor agent. Pre-persistence shape:
 * uses names (not IDs) for concepts and prerequisite edges so the user can
 * rename/reorder freely before confirmation. ConfirmDraft assigns IDs.
 */
export interface ProposedCourse {
  title: string;
  subject: string;
  gradeLevel: string;
  thresholds: ThresholdConfig;
  proposedConcepts: ProposedConcept[];
  proposedEdges: ProposedEdge[];
  proposedLessons: ProposedLesson[];
}

export interface ProposedLesson {
  /** Stable within the draft; reassigned at confirm time. */
  draftLessonId: string;
  title: string;
  /** Names referencing ProposedConcept.name. Order matters within a lesson. */
  conceptNames: string[];
  references: Reference[];
  suggestedStrategy: StrategyId;
  estimatedMinutes: number;
}

// (ProposedConcept, ProposedEdge, ThresholdConfig already defined.)

/**
 * In-memory draft state held by BootstrapService. Identifies the draft and
 * carries the editable shape the user is iterating on.
 */
export interface DraftCourseState {
  draftId: string;
  studentId: StudentId;
  documentIds: DocumentId[];
  proposed: ProposedCourse;
  createdAt: Timestamp;
  lastTouchedAt: Timestamp;
  expiresAt: Timestamp;
}

/** Compact summary returned by `course.propose_draft` to keep tool output small. */
export interface DraftSummary {
  draftId: string;
  title: string;
  lessonCount: number;
  conceptCount: number;
  edgeCount: number;
  /** First 5 lessons for the agent to narrate. */
  firstLessons: Array<{ title: string; conceptCount: number }>;
}

// ─── Draft edit operations (used by course.edit_draft) ────────────────────────

export type DraftEditOp =
  | { kind: "rename-course"; title: string }
  | { kind: "rename-lesson"; lessonIndex: number; title: string }
  | { kind: "reorder-lessons"; newOrder: number[] /* indices */ }
  | { kind: "remove-lesson"; lessonIndex: number }
  | { kind: "add-lesson"; afterIndex: number; title: string; conceptNames: string[] }
  | { kind: "rename-concept"; conceptName: string; newName: string }
  | { kind: "remove-concept"; conceptName: string }
  | {
      kind: "add-concept";
      lessonIndex: number;
      name: string;
      description: string;
      afterConceptIndex?: number;
    }
  | { kind: "set-thresholds"; thresholds: ThresholdConfig };

// ─── Course summary (for list views) ──────────────────────────────────────────

export interface CourseSummary {
  courseId: CourseId;
  title: string;
  subject: string;
  gradeLevel: string;
  lessonCount: number;
  conceptCount: number;
  /** Studied / total — derived from concept_progress. */
  studiedConcepts: number;
  createdAt: Timestamp;
}
```

```typescript
// packages/core/src/types/tool.ts — modifications

export interface ToolServices {
  memory: unknown; // → Phase 7
  artifacts: ArtifactsService;     // ← Phase 6 (was: unknown)
  vectorStore: VectorStore;
  ftsStore: FtsStore;
  sandbox: CodeSandbox;
  sympy: SymPyService;
  embeddings: EmbeddingService;
  documents: DocumentsReader;
  /** ← Phase 6 NEW */
  bootstrap: BootstrapService;
  /** ← Phase 6 NEW */
  courseState: CourseStateReader;
  pedagogyPack: unknown; // → Phase 14
}

// ─── ArtifactsService (concrete) ─────────────────────────────────────────────

export interface ArtifactsService {
  // Existing reads (move stubs → concrete):
  course(id: CourseId): Promise<Course | null>;
  courses(studentId: StudentId): Promise<CourseSummary[]>;
  lessons(courseId: CourseId): Promise<Lesson[]>;
  gates(courseId: CourseId): Promise<Gate[]>;
  progress(studentId: StudentId): Promise<ProgressSnapshot>;
  // Phase 6 progress writes (called by course tools):
  markLessonStarted(input: { studentId: StudentId; lessonId: LessonId }): Promise<void>;
  markConceptStudied(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    evidenceEventId?: string;
  }): Promise<{ lessonComplete: boolean; lessonId: LessonId | null }>;
}

// ─── CourseStateReader — narrow read-only handle for tools + brief composition ─

export interface CourseStateReader {
  /**
   * Resolve the active course's current lesson and concept-status map.
   * Returns null when courseId is invalid for this student.
   */
  read(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<CourseStateSnapshot | null>;
}

export interface CourseStateSnapshot {
  course: Course;
  lessons: Lesson[];                      // ordered by orderIndex
  currentLesson: Lesson | null;            // first non-completed lesson, or null if all done
  /** All concepts touched by the course's lessons, with study status. */
  conceptsByLesson: Map<LessonId, ConceptStateRow[]>;
  /** Quick index for ToolContext consumers. */
  conceptsById: Map<ConceptId, ConceptStateRow>;
}

export interface ConceptStateRow {
  conceptId: ConceptId;
  name: string;
  description: string;
  studied: boolean;
  studiedAt?: Timestamp;
  lessonId: LessonId;
}

// ─── BootstrapService (used by course.* draft tools) ─────────────────────────

export interface BootstrapService {
  proposeDraft(input: ProposeDraftInput): Promise<{ draft: DraftCourseState; summary: DraftSummary }>;
  showDraft(draftId: string): Promise<DraftCourseState | null>;
  editDraft(input: { draftId: string; op: DraftEditOp }): Promise<DraftCourseState>;
  confirmDraft(input: {
    draftId: string;
    studentId: StudentId;
  }): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }>;
  discardDraft(draftId: string): Promise<void>;
}

export interface ProposeDraftInput {
  studentId: StudentId;
  documentIds: DocumentId[];
  courseTitle: string;
  subject: string;
  gradeLevel: string;
}
```

**Implementation notes**:
- Keep the existing `DraftCourse` type (with `course`, `draftLessons`, `proposedConcepts`, `proposedEdges`, `needsConfirmation: true`) for forward-compat with the Phase-11 `AuthoringService.bootstrap` shape, but Phase 6 uses the new `DraftCourseState` / `ProposedCourse` shapes which are simpler (no premature ID assignment).
- `ConceptId` / `LessonId` etc. are already branded strings (`packages/core/src/types/ids.ts`); reuse `brandId<"...">(string)` everywhere.

**Acceptance criteria**:
- [ ] `pnpm typecheck` passes after additions; no breaking changes to existing consumers.
- [ ] `ToolServices.artifacts` is `ArtifactsService` (was `unknown`).
- [ ] All new types are re-exported through `packages/core/src/types/index.ts`.

---

### Unit 2: Schema additions — `lesson_progress` + `concept_progress`

**File**: `packages/artifacts/src/schema.ts` (modified)

```typescript
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ... existing tables ...

export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    studentId: text("student_id").notNull(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["not_started", "in_progress", "completed"] }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.lessonId] }),
    studentIdx: index("lesson_progress_student_idx").on(t.studentId),
  }),
);

export const conceptProgress = sqliteTable(
  "concept_progress",
  {
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id").notNull(),  // FK to concepts.id (in @praxis/curriculum); cross-package FK omitted to keep schema modular
    studiedAt: integer("studied_at", { mode: "timestamp_ms" }).notNull(),
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(),  // string[] of event IDs
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.conceptId] }),
    studentIdx: index("concept_progress_student_idx").on(t.studentId),
  }),
);

export const artifactsSchema = {
  courses,
  lessons,
  assignments,
  gates,
  flashcards,
  notes,
  conceptMapDrawings,
  documents,
  documentChunks,
  lessonProgress,        // ← Phase 6
  conceptProgress,       // ← Phase 6
};
```

**Implementation notes**:
- `conceptProgress.conceptId` references `concepts.id` from `@praxis/curriculum/schema.ts`. Drizzle FK across schema packages is intentionally omitted because both schemas live in the same SQLite file (composed in `@praxis/core/db`), and adding a cross-package FK would create a build-order dependency. Cleanup at concept deletion is handled programmatically by `BootstrapServiceImpl.confirmDraft` (no concept deletions in Phase 6 anyway — extractor only adds concepts).
- Migration generated via `pnpm db:generate` after schema edit; commit the resulting `drizzle/` SQL file.

**Acceptance criteria**:
- [ ] `pnpm db:generate` produces a migration that `CREATE TABLE`s both new tables.
- [ ] `pnpm db:migrate` applies cleanly on a fresh DB and idempotently on an existing DB.
- [ ] `pnpm db:show` lists `lesson_progress` and `concept_progress` in the schema.
- [ ] `studentMastery` (Phase 7) does NOT replace `concept_progress` — they coexist.

---

### Unit 3: `ArtifactsServiceImpl` — reads + progress writes

**File**: `packages/core/src/services/artifacts-service.ts` (new)

```typescript
import type { Course, Gate, Lesson } from "@praxis/core/types";
import {
  conceptProgress,
  courses,
  documents,
  documentChunks,
  gates,
  lessons,
  lessonProgress,
} from "@praxis/artifacts/schema";
import { concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  ArtifactsService,
  ConceptId,
  ConceptStateRow,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  CourseSummary,
  EvidenceRef,
  LessonId,
  Logger,
  ProgressSnapshot,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface ArtifactsServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export class ArtifactsServiceImpl implements ArtifactsService, CourseStateReader {
  constructor(private readonly deps: ArtifactsServiceDeps) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async course(id: CourseId): Promise<Course | null> {
    const row = this.deps.db.select().from(courses).where(eq(courses.id, id)).get();
    if (!row) return null;
    return rowToCourse(row);
  }

  async courses(studentId: StudentId): Promise<CourseSummary[]> {
    // Single SQL pass: courses joined to lesson count + concept-progress count.
    // Implementation walks the data in app-code for simplicity (small N).
    const rows = this.deps.db
      .select()
      .from(courses)
      .where(eq(courses.studentId, studentId))
      .all();
    return Promise.all(rows.map((c) => this.summarizeCourse(c, studentId)));
  }

  async lessons(courseId: CourseId): Promise<Lesson[]> {
    const rows = this.deps.db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(asc(lessons.orderIndex))
      .all();
    return rows.map(rowToLesson);
  }

  async gates(courseId: CourseId): Promise<Gate[]> {
    const rows = this.deps.db.select().from(gates).where(eq(gates.courseId, courseId)).all();
    return rows.map(rowToGate);
  }

  async progress(studentId: StudentId): Promise<ProgressSnapshot> {
    const cs = this.deps.db.select().from(courses).where(eq(courses.studentId, studentId)).all();
    const courseProgress = await Promise.all(
      cs.map(async (c) => {
        const summary = await this.summarizeCourse(c, studentId);
        return {
          courseId: brandId<"CourseId">(c.id),
          masteredConceptCount: 0,           // Phase 7
          inProgressConceptCount: summary.studiedConcepts,
          lockedConceptCount: Math.max(0, summary.conceptCount - summary.studiedConcepts),
          // nextRecommended computed in Phase 9 router; omitted in Phase 6.
        };
      }),
    );
    return { studentId, courseProgress, recentUnlocks: [] };
  }

  // ── Progress writes ───────────────────────────────────────────────────────

  async markLessonStarted(input: { studentId: StudentId; lessonId: LessonId }): Promise<void> {
    const now = new Date();
    this.deps.db
      .insert(lessonProgress)
      .values({
        studentId: input.studentId,
        lessonId: input.lessonId,
        status: "in_progress",
        startedAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.studentId, lessonProgress.lessonId],
        set: { status: "in_progress", startedAt: now },
      })
      .run();
  }

  async markConceptStudied(input: {
    studentId: StudentId;
    conceptId: ConceptId;
    evidenceEventId?: string;
  }): Promise<{ lessonComplete: boolean; lessonId: LessonId | null }> {
    const now = new Date();
    const evidence: string[] = input.evidenceEventId ? [input.evidenceEventId] : [];

    // Append-merge evidence on conflict (idempotent re-marks).
    const existing = this.deps.db
      .select()
      .from(conceptProgress)
      .where(
        and(
          eq(conceptProgress.studentId, input.studentId),
          eq(conceptProgress.conceptId, input.conceptId),
        ),
      )
      .get();

    const merged = existing
      ? Array.from(new Set([...(existing.evidenceJson as string[]), ...evidence]))
      : evidence;

    this.deps.db
      .insert(conceptProgress)
      .values({
        studentId: input.studentId,
        conceptId: input.conceptId,
        studiedAt: now,
        evidenceJson: merged,
      })
      .onConflictDoUpdate({
        target: [conceptProgress.studentId, conceptProgress.conceptId],
        set: { studiedAt: now, evidenceJson: merged },
      })
      .run();

    // Find the lesson that contains this concept and check completion.
    const lessonRow = this.findLessonContainingConcept(input.conceptId);
    if (!lessonRow) return { lessonComplete: false, lessonId: null };

    const conceptIds = lessonRow.conceptIdsJson as string[];
    if (conceptIds.length === 0) return { lessonComplete: false, lessonId: brandId<"LessonId">(lessonRow.id) };

    const studied = this.deps.db
      .select()
      .from(conceptProgress)
      .where(
        and(
          eq(conceptProgress.studentId, input.studentId),
          inArray(conceptProgress.conceptId, conceptIds),
        ),
      )
      .all();

    const lessonComplete = studied.length === conceptIds.length;
    if (lessonComplete) {
      this.deps.db
        .update(lessonProgress)
        .set({ status: "completed", completedAt: now })
        .where(
          and(
            eq(lessonProgress.studentId, input.studentId),
            eq(lessonProgress.lessonId, lessonRow.id),
          ),
        )
        .run();
    }
    return { lessonComplete, lessonId: brandId<"LessonId">(lessonRow.id) };
  }

  // ── CourseStateReader ─────────────────────────────────────────────────────

  async read(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<CourseStateSnapshot | null> {
    const course = await this.course(input.courseId);
    if (!course || course.studentId !== input.studentId) return null;
    const lessonsList = await this.lessons(input.courseId);

    // Concept rows for every concept referenced by this course's lessons.
    const allConceptIds = lessonsList.flatMap((l) => l.conceptIds);
    const conceptRows =
      allConceptIds.length === 0
        ? []
        : this.deps.db.select().from(concepts).where(inArray(concepts.id, allConceptIds)).all();
    const conceptById = new Map(conceptRows.map((c) => [c.id, c]));

    // Studied concept set for this student.
    const studiedRows =
      allConceptIds.length === 0
        ? []
        : this.deps.db
            .select()
            .from(conceptProgress)
            .where(
              and(
                eq(conceptProgress.studentId, input.studentId),
                inArray(conceptProgress.conceptId, allConceptIds),
              ),
            )
            .all();
    const studiedById = new Map(studiedRows.map((s) => [s.conceptId, s]));

    // Build per-lesson + flat indexes.
    const conceptsByLesson = new Map<LessonId, ConceptStateRow[]>();
    const conceptsById = new Map<ConceptId, ConceptStateRow>();
    for (const lesson of lessonsList) {
      const rows: ConceptStateRow[] = lesson.conceptIds.map((conceptId) => {
        const c = conceptById.get(conceptId);
        const s = studiedById.get(conceptId);
        const row: ConceptStateRow = {
          conceptId,
          name: c?.name ?? "(unknown)",
          description: c?.description ?? "",
          studied: !!s,
          ...(s?.studiedAt && { studiedAt: s.studiedAt.getTime() as Timestamp }),
          lessonId: lesson.id,
        };
        conceptsById.set(conceptId, row);
        return row;
      });
      conceptsByLesson.set(lesson.id, rows);
    }

    // Current lesson = first lesson whose progress.status != "completed".
    const lessonStatusRows = this.deps.db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.studentId, input.studentId),
          inArray(lessonProgress.lessonId, lessonsList.map((l) => l.id)),
        ),
      )
      .all();
    const lessonStatusById = new Map(lessonStatusRows.map((r) => [r.lessonId, r.status]));
    const currentLesson =
      lessonsList.find((l) => (lessonStatusById.get(l.id) ?? "not_started") !== "completed") ??
      null;

    return { course, lessons: lessonsList, currentLesson, conceptsByLesson, conceptsById };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private findLessonContainingConcept(conceptId: ConceptId): { id: string; conceptIdsJson: unknown } | null {
    // Scan small lessons table; conceptIdsJson is JSON-stored.
    const rows = this.deps.db.select().from(lessons).all();
    return (
      rows.find((l) => Array.isArray(l.conceptIdsJson) && (l.conceptIdsJson as string[]).includes(conceptId)) ??
      null
    );
  }

  private async summarizeCourse(
    row: typeof courses.$inferSelect,
    studentId: StudentId,
  ): Promise<CourseSummary> {
    const lessonRows = this.deps.db.select().from(lessons).where(eq(lessons.courseId, row.id)).all();
    const conceptIds = new Set<string>();
    for (const lr of lessonRows) for (const c of (lr.conceptIdsJson as string[])) conceptIds.add(c);
    const studied = this.deps.db
      .select()
      .from(conceptProgress)
      .where(
        and(
          eq(conceptProgress.studentId, studentId),
          inArray(conceptProgress.conceptId, [...conceptIds]),
        ),
      )
      .all();
    return {
      courseId: brandId<"CourseId">(row.id),
      title: row.title,
      subject: row.subject,
      gradeLevel: row.gradeLevel,
      lessonCount: lessonRows.length,
      conceptCount: conceptIds.size,
      studiedConcepts: studied.length,
      createdAt: row.createdAt.getTime() as Timestamp,
    };
  }
}

// rowTo* helpers translate JSON columns into the typed Course/Lesson/Gate values.
function rowToCourse(row: typeof courses.$inferSelect): Course { /* … */ }
function rowToLesson(row: typeof lessons.$inferSelect): Lesson { /* … */ }
function rowToGate(row: typeof gates.$inferSelect): Gate { /* … */ }
```

**Implementation notes**:
- `ArtifactsServiceImpl` implements **both** `ArtifactsService` and `CourseStateReader`. They overlap — the snapshot is `read(studentId, courseId)`; the per-method API is what tools call. Splitting interfaces lets `ToolContext.services.courseState` carry the narrow read-only shape without exposing the mutation methods.
- All `rowTo*` helpers parse JSON columns into the corresponding typed shapes. Use `Course` / `Lesson` / `Gate` discriminated unions — `kind` discriminator on `CourseSource`, `GateTarget`, `SuccessCriteria`, `GateState`.
- `lessonProgress` upsert uses `onConflictDoUpdate` on the composite primary key — see the `config-kv-store` pattern in `.claude/skills/patterns/config-kv-store.md`.
- `findLessonContainingConcept` is intentionally a small full scan; lessons are at most ~50 per course in v1.

**Acceptance criteria**:
- [ ] `course(id)` returns null for unknown ID; correct shape for known.
- [ ] `markConceptStudied` is idempotent (calling twice with same input produces same DB state).
- [ ] When all concepts in a lesson are studied, that lesson's `lesson_progress.status` flips to `completed`.
- [ ] `read({ studentId, courseId })` returns `currentLesson === null` when all lessons are completed.

---

### Unit 4: `BootstrapServiceImpl` — in-memory drafts + atomic confirm

**File**: `packages/core/src/services/bootstrap-service.ts` (new)

```typescript
import { documentChunks, documents } from "@praxis/artifacts/schema";
import { conceptGraphs, concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { courses, gates, lessons } from "@praxis/artifacts/schema";
import { runConceptExtractor } from "@praxis/curriculum/bootstrap";
import { eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  BootstrapService,
  ConceptId,
  CourseId,
  DocumentChunk,
  DraftCourseState,
  DraftEditOp,
  DraftSummary,
  Engine,
  LessonId,
  Logger,
  ProposeDraftInput,
  ProposedCourse,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

const DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BootstrapServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves to the user's currently selected engine. */
  engineResolver: () => Engine;
  /** Sweep period for expired drafts. */
  sweepIntervalMs?: number;
}

export class BootstrapServiceImpl implements BootstrapService {
  private readonly drafts = new Map<string, DraftCourseState>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: BootstrapServiceDeps) {
    const period = deps.sweepIntervalMs ?? 60_000;
    this.sweepTimer = setInterval(() => this.sweepExpired(), period);
    // unref so this timer doesn't keep the process alive.
    this.sweepTimer.unref?.();
  }

  async proposeDraft(
    input: ProposeDraftInput,
  ): Promise<{ draft: DraftCourseState; summary: DraftSummary }> {
    // 1. Read the document chunks for the requested documents.
    const chunks = this.readChunksFor(input.documentIds);
    if (chunks.length === 0) {
      throw new Error(
        `No chunks found for the given documentIds. Did the documents finish ingesting?`,
      );
    }

    // 2. Run the extractor — fresh one-shot session, isolated.
    const engine = this.deps.engineResolver();
    const proposed: ProposedCourse = await runConceptExtractor({
      engine,
      chunks,
      courseTitle: input.courseTitle,
      subject: input.subject,
      gradeLevel: input.gradeLevel,
      log: this.deps.log,
    });

    // 3. Validate (post-condition checks; throw with a helpful message on bad LLM output).
    validateProposed(proposed);

    // 4. Cache the draft.
    const now = Date.now() as Timestamp;
    const draft: DraftCourseState = {
      draftId: uuidv7(),
      studentId: input.studentId,
      documentIds: input.documentIds,
      proposed,
      createdAt: now,
      lastTouchedAt: now,
      expiresAt: (now + DRAFT_TTL_MS) as Timestamp,
    };
    this.drafts.set(draft.draftId, draft);
    return { draft, summary: summarize(draft) };
  }

  async showDraft(draftId: string): Promise<DraftCourseState | null> {
    const d = this.drafts.get(draftId);
    if (!d) return null;
    if (d.expiresAt <= Date.now()) {
      this.drafts.delete(draftId);
      return null;
    }
    d.lastTouchedAt = Date.now() as Timestamp;
    return d;
  }

  async editDraft(input: { draftId: string; op: DraftEditOp }): Promise<DraftCourseState> {
    const d = await this.showDraft(input.draftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    d.proposed = applyEdit(d.proposed, input.op);
    d.lastTouchedAt = Date.now() as Timestamp;
    return d;
  }

  async confirmDraft(input: { draftId: string; studentId: StudentId }): Promise<{
    courseId: CourseId;
    lessonIds: LessonId[];
    conceptGraphId: string;
  }> {
    const d = await this.showDraft(input.draftId);
    if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
    if (d.studentId !== input.studentId) throw new Error(`Draft owner mismatch`);

    const result = persistDraft({ db: this.deps.db, draft: d, now: new Date() });
    this.drafts.delete(input.draftId);
    return result;
  }

  async discardDraft(draftId: string): Promise<void> {
    this.drafts.delete(draftId);
  }

  /** Test/observability handle: count active drafts. */
  size(): number {
    return this.drafts.size;
  }

  /** Cleanup helper for shutdown. */
  shutdown(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.drafts.clear();
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, d] of this.drafts) {
      if (d.expiresAt <= now) this.drafts.delete(id);
    }
  }

  private readChunksFor(documentIds: string[]): ReadonlyArray<{ documentId: string; chunkIndex: number; text: string; locator: { page?: number; section?: string } }> {
    const rows = this.deps.db
      .select()
      .from(documentChunks)
      .where(inArray(documentChunks.documentId, documentIds))
      .all();
    return rows.map((r) => ({
      documentId: r.documentId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      locator: r.locatorJson as { page?: number; section?: string },
    }));
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function summarize(d: DraftCourseState): DraftSummary {
  const p = d.proposed;
  return {
    draftId: d.draftId,
    title: p.title,
    lessonCount: p.proposedLessons.length,
    conceptCount: p.proposedConcepts.length,
    edgeCount: p.proposedEdges.length,
    firstLessons: p.proposedLessons.slice(0, 5).map((l) => ({
      title: l.title,
      conceptCount: l.conceptNames.length,
    })),
  };
}

function validateProposed(p: ProposedCourse): void {
  if (!p.title?.trim()) throw new Error("Extractor produced empty course title");
  if (p.proposedLessons.length === 0) throw new Error("Extractor produced 0 lessons");
  if (p.proposedConcepts.length === 0) throw new Error("Extractor produced 0 concepts");
  // Every lesson concept-name must resolve to a proposedConcept.
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  for (const lesson of p.proposedLessons) {
    for (const cn of lesson.conceptNames) {
      if (!known.has(cn)) {
        throw new Error(`Lesson "${lesson.title}" references unknown concept "${cn}"`);
      }
    }
  }
  // Every edge endpoint must be a known concept name.
  for (const e of p.proposedEdges) {
    if (!known.has(e.fromName) || !known.has(e.toName)) {
      throw new Error(`Edge ${e.fromName}→${e.toName} references unknown concept`);
    }
  }
}

function applyEdit(p: ProposedCourse, op: DraftEditOp): ProposedCourse {
  // Pure functional updates. One switch statement, exhaustive over DraftEditOp kinds.
  // (Implementation details in unit-tests; see Unit 16.)
  switch (op.kind) { /* ... per-kind transforms, see tests ... */ }
}

interface PersistDraftArgs { db: PraxisDb; draft: DraftCourseState; now: Date; }

function persistDraft(args: PersistDraftArgs): {
  courseId: CourseId;
  lessonIds: LessonId[];
  conceptGraphId: string;
} {
  const { db, draft, now } = args;
  return db.transaction((tx) => {
    // 1. ConceptGraph row.
    const conceptGraphId = uuidv7();
    tx.insert(conceptGraphs).values({
      id: conceptGraphId,
      source: "extracted",
      name: `${draft.proposed.title} graph`,
      version: "1",
      createdAt: now,
    }).run();

    // 2. Concept rows — assign IDs by name.
    const conceptIdByName = new Map<string, string>();
    const conceptRows = draft.proposed.proposedConcepts.map((c) => {
      const id = uuidv7();
      conceptIdByName.set(c.name, id);
      return {
        id,
        graphId: conceptGraphId,
        name: c.name,
        description: c.description,
        aliasesJson: [],
        standardsTagsJson: [],
      };
    });
    if (conceptRows.length > 0) tx.insert(concepts).values(conceptRows).run();

    // 3. Edge rows.
    const edgeRows = draft.proposed.proposedEdges.map((e) => ({
      fromId: conceptIdByName.get(e.fromName)!,
      toId: conceptIdByName.get(e.toName)!,
      strengthMilli: Math.round(Math.max(0, Math.min(1, e.strength)) * 1000),
      source: "extracted" as const,
    }));
    if (edgeRows.length > 0) tx.insert(prerequisiteEdges).values(edgeRows).run();

    // 4. Course row.
    const courseId = uuidv7();
    tx.insert(courses).values({
      id: courseId,
      studentId: draft.studentId,
      title: draft.proposed.title,
      subject: draft.proposed.subject,
      gradeLevel: draft.proposed.gradeLevel,
      sourceJson: { kind: "bootstrapped", sourceMaterials: draft.documentIds },
      conceptGraphId,
      thresholdsJson: draft.proposed.thresholds,
      createdAt: now,
      updatedAt: now,
    }).run();

    // 5. Lesson rows — preserve order.
    const lessonRows = draft.proposed.proposedLessons.map((l, i) => {
      const id = uuidv7();
      return {
        id,
        courseId,
        title: l.title,
        orderIndex: i,
        conceptIdsJson: l.conceptNames.map((n) => conceptIdByName.get(n)!),
        referencesJson: l.references,
        suggestedStrategy: l.suggestedStrategy,
        estimatedMinutes: l.estimatedMinutes,
      };
    });
    if (lessonRows.length > 0) tx.insert(lessons).values(lessonRows).run();

    // 6. Skeleton gates: one concept-mastery gate per lesson, with strength-derived prerequisite chain.
    //    Phase 9 overwrites these with full gating logic; for now we just create a placeholder per lesson
    //    so the gates table is non-empty for any consumer that lists them.
    const gateIds = lessonRows.map(() => uuidv7());
    const gateRows = lessonRows.map((l, i) => ({
      id: gateIds[i]!,
      courseId,
      guardsJson: { kind: "lesson", lessonId: l.id },
      prerequisitesJson: i > 0 ? [gateIds[i - 1]] : [],
      successCriteriaJson: {
        kind: "mastery-threshold",
        conceptIds: l.conceptIdsJson,
        minScore: draft.proposed.thresholds.conceptMastery,
      },
      stateJson: { kind: "locked", missingPrerequisites: i > 0 ? [gateIds[i - 1]] : [] },
      evidenceJson: [],
    }));
    if (gateRows.length > 0) tx.insert(gates).values(gateRows).run();

    return {
      courseId: brandId<"CourseId">(courseId),
      lessonIds: lessonRows.map((r) => brandId<"LessonId">(r.id)),
      conceptGraphId,
    };
  });
}
```

**Implementation notes**:
- `engineResolver` is a closure over `readEngineConfig + createEngine`. Same pattern as `visionResolver` in `services.ts` — looks up the active engine at call time so engine swaps reflect immediately.
- `confirmDraft` runs everything in **one Drizzle transaction** so partial failures don't leak rows. Better-sqlite3 transactions are synchronous; the surrounding async wrapper just yields the same shape the rest of the codebase expects.
- Skeleton gates are intentionally minimal (one per lesson, chained, all initially `locked`). Phase 9 overwrites with proper gate evaluation. Phase 6 just persists rows so future code can find them.
- `applyEdit` is a pure function; full per-kind logic is straightforward and tested in Unit 16.

**Acceptance criteria**:
- [ ] `proposeDraft` errors loudly when any documentId has 0 chunks (caller verified).
- [ ] `confirmDraft` writes Course + Lessons + Concepts + PrerequisiteEdges + Gates in one transaction; partial failures roll back.
- [ ] After `confirmDraft`, the draft is removed from the cache.
- [ ] Drafts older than `DRAFT_TTL_MS` are dropped on next access (and on the periodic sweep).
- [ ] `applyEdit` rejects an `add-concept` whose name collides with an existing concept (or quietly merges, per chosen semantics).

---

### Unit 5: Concept extractor — `runConceptExtractor`

**Files**:
- `packages/curriculum/src/bootstrap/extractor.ts` (new)
- `packages/curriculum/src/bootstrap/extractor-prompt.ts` (new)
- `packages/curriculum/src/bootstrap/index.ts` (new)

```typescript
// packages/curriculum/src/bootstrap/extractor.ts

import { runOneShot } from "@praxis/engines";
import type { Engine, Logger, ProposedCourse } from "@praxis/core/types";
import { z } from "zod";
import { EXTRACTOR_SYSTEM_PROMPT } from "./extractor-prompt.js";

export interface RunConceptExtractorInput {
  engine: Engine;
  chunks: ReadonlyArray<{
    documentId: string;
    chunkIndex: number;
    text: string;
    locator: { page?: number; section?: string };
  }>;
  courseTitle: string;
  subject: string;
  gradeLevel: string;
  log: Logger;
  /** Maximum chunks per batch sent to the extractor. Default 30. */
  chunksPerBatch?: number;
  /** Cap on extracted concept count. Default 200. */
  maxConcepts?: number;
}

const ProposedSchema = z.object({
  title: z.string().min(1),
  subject: z.string(),
  gradeLevel: z.string(),
  thresholds: z.object({
    conceptMastery: z.number().min(0).max(1).default(0.7),
    examPass: z.number().min(0).max(1).default(0.7),
    allowRetake: z.boolean().default(true),
    decayDays: z.number().int().positive().default(14),
  }),
  proposedConcepts: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        evidence: z.array(z.object({ kind: z.literal("event"), id: z.string() })).default([]),
      }),
    )
    .min(1),
  proposedEdges: z
    .array(
      z.object({
        fromName: z.string(),
        toName: z.string(),
        strength: z.number().min(0).max(1),
        rationale: z.string(),
      }),
    )
    .default([]),
  proposedLessons: z
    .array(
      z.object({
        draftLessonId: z.string(),
        title: z.string(),
        conceptNames: z.array(z.string()).min(1),
        references: z
          .array(
            z.object({
              kind: z.enum(["textbook", "url", "video", "note"]),
              source: z.string(),
              locator: z
                .object({
                  page: z.number().int().optional(),
                  section: z.string().optional(),
                })
                .optional(),
            }),
          )
          .default([]),
        suggestedStrategy: z.string().default("worked-examples"),
        estimatedMinutes: z.number().int().positive().default(45),
      }),
    )
    .min(1),
});

export async function runConceptExtractor(input: RunConceptExtractorInput): Promise<ProposedCourse> {
  const userMessage = buildUserMessage(input);

  // Open a fresh one-shot session — isolated from any live tutoring.
  const events = runOneShot(
    input.engine,
    {
      systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
      tools: { list: () => [], dispatch: async () => ({ ok: false, error: { code: "no_tools", message: "extractor has no tools", recoverable: false } }) },
      maxSteps: 1,
    },
    userMessage,
  );

  // Drain to a single full assistant message. The extractor is text-only; ignore tool_call events.
  let assistantText = "";
  for await (const event of events) {
    if (event.type === "model_message") {
      // partial: false events carry the final accumulated content for some adapters,
      // others stream deltas. Concatenate either way; downstream parser is tolerant.
      assistantText += event.content;
    }
    if (event.type === "error") {
      throw new Error(`Extractor engine error: ${event.error.message}`);
    }
  }

  const json = extractJsonBlock(assistantText);
  const parsed = ProposedSchema.safeParse(json);
  if (!parsed.success) {
    input.log.warn("extractor_invalid_output", { errors: parsed.error.flatten() });
    throw new Error(
      `Extractor output failed schema validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // Cap concepts; trim from the end of the array (extractor lists by importance).
  if (parsed.data.proposedConcepts.length > (input.maxConcepts ?? 200)) {
    const max = input.maxConcepts ?? 200;
    const kept = new Set(parsed.data.proposedConcepts.slice(0, max).map((c) => c.name));
    parsed.data.proposedConcepts = parsed.data.proposedConcepts.slice(0, max);
    parsed.data.proposedEdges = parsed.data.proposedEdges.filter(
      (e) => kept.has(e.fromName) && kept.has(e.toName),
    );
    parsed.data.proposedLessons = parsed.data.proposedLessons
      .map((l) => ({ ...l, conceptNames: l.conceptNames.filter((n) => kept.has(n)) }))
      .filter((l) => l.conceptNames.length > 0);
  }

  return parsed.data;
}

function buildUserMessage(input: RunConceptExtractorInput): string {
  // Group chunks by document, prefix with document marker.
  const byDoc = new Map<string, typeof input.chunks>();
  for (const c of input.chunks) {
    const arr = byDoc.get(c.documentId) ?? [];
    arr.push(c);
    byDoc.set(c.documentId, arr);
  }
  const sections: string[] = [];
  sections.push(`Course title: ${input.courseTitle}`);
  sections.push(`Subject: ${input.subject}`);
  sections.push(`Grade level: ${input.gradeLevel}`);
  sections.push("");
  for (const [docId, chunks] of byDoc) {
    sections.push(`=== Document ${docId} ===`);
    for (const c of chunks) {
      const loc = c.locator.section ? ` [${c.locator.section}]` : "";
      const page = c.locator.page ? ` (p.${c.locator.page})` : "";
      sections.push(`--- chunk ${c.chunkIndex}${loc}${page} ---`);
      sections.push(c.text);
      sections.push("");
    }
  }
  return sections.join("\n");
}

function extractJsonBlock(text: string): unknown {
  // Look for fenced JSON; fall back to the largest {...} block.
  const fence = text.match(/```json\n([\s\S]*?)\n```/);
  if (fence?.[1]) return JSON.parse(fence[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Extractor output contained no JSON block`);
  }
  return JSON.parse(text.slice(start, end + 1));
}
```

```typescript
// packages/curriculum/src/bootstrap/extractor-prompt.ts

export const EXTRACTOR_SYSTEM_PROMPT = `You are a course-design assistant. Given excerpts from a syllabus and/or textbook, you produce a structured course proposal.

Output a single JSON object (in a \`\`\`json fence) with this shape:

{
  "title": "<course title>",
  "subject": "<short slug like 'math.algebra-1' if implied; otherwise echo the user's subject>",
  "gradeLevel": "<echo the user's grade level>",
  "thresholds": {
    "conceptMastery": 0.7,
    "examPass": 0.7,
    "allowRetake": true,
    "decayDays": 14
  },
  "proposedConcepts": [
    { "name": "<concept name, ~1–4 words>", "description": "<one sentence>", "evidence": [] }
  ],
  "proposedEdges": [
    { "fromName": "<concept>", "toName": "<concept>", "strength": 0.0–1.0, "rationale": "<short reason>" }
  ],
  "proposedLessons": [
    {
      "draftLessonId": "lesson-1",
      "title": "<lesson title>",
      "conceptNames": ["<concept>", "..."],
      "references": [{ "kind": "textbook", "source": "<doc title or filename>", "locator": { "page": 12, "section": "chapter 3" } }],
      "suggestedStrategy": "worked-examples",
      "estimatedMinutes": 45
    }
  ]
}

Rules:
- Concept names must be unique within the course (case-insensitive match counts as duplicate).
- Every conceptName in proposedLessons MUST appear in proposedConcepts.
- Every endpoint of proposedEdges MUST appear in proposedConcepts.
- Order lessons by intended teaching sequence (prereqs first).
- Granularity: each lesson should cover what fits in 30–60 minutes of teaching.
- Strength on edges: 0.9 = strong prerequisite ("can't learn B without A"), 0.3 = weak suggestion.
- suggestedStrategy is one of: "worked-examples", "socratic", "elaborative-interrogation", "analogy-bridging", "productive-failure-gauntlet". Default "worked-examples" when uncertain.
- Cap output at ~50 concepts unless the materials clearly justify more.
- Do not include any prose outside the JSON fence.`;
```

**Implementation notes**:
- `runOneShot` is the existing helper from `@praxis/engines`. It wraps `engine.open(opts) → session.send(msg)` with `close()` in `finally`. For the extractor we pass `maxSteps: 1` so the engine doesn't loop on tool calls (the registry intentionally exposes 0 tools).
- The empty `tools.dispatch` returns a benign error if the model tries to call something. Some engines refuse to register a 0-tool registry; if that's the case in the Claude Code adapter, register a single no-op tool whose handler always returns `{ok: false}`. Verified at integration time.
- The extractor is text-only — `Phase 5 vision is irrelevant here`. Even for vision-tier-ingested PDFs, the chunks already contain extracted text/markdown.
- Single-pass for now (one model call). If output quality requires it, switch to a chunked-batches strategy in a future iteration. Phase 6 ships single-pass with a max-concept cap so we don't blow context.

**Acceptance criteria**:
- [ ] `runConceptExtractor` invokes `runOneShot` once and returns a `ProposedCourse`.
- [ ] Output is validated by Zod; invalid JSON or schema mismatch raises a descriptive error.
- [ ] Lesson concept names always resolve to a `proposedConcepts` entry (post-cap consistency).
- [ ] Edge endpoints always resolve to a `proposedConcepts` entry (post-cap consistency).

---

### Unit 6: Course-context fragment + `composeSystemPrompt` extension

**Files**:
- `packages/curriculum/src/brief/course-context.ts` (new)
- `packages/curriculum/src/brief/compose.ts` (modified — accept `additionalFragments`)
- `packages/curriculum/src/modes/fragments/course-context.ts` (new — fallback template when no course context exists)

```typescript
// packages/curriculum/src/brief/course-context.ts

import type {
  ConceptStateRow,
  Course,
  CourseStateSnapshot,
  Lesson,
  PromptFragment,
} from "@praxis/core/types";

/**
 * Build a `context`-position PromptFragment summarizing the active course.
 *
 * Called by SessionServiceImpl when starting a teach session whose courseId
 * resolves. The fragment is appended to the mode's prompt fragments before
 * composition.
 */
export function composeCourseContextFragment(snapshot: CourseStateSnapshot): PromptFragment {
  const lines: string[] = [];
  lines.push(`Active course: ${snapshot.course.title} (${snapshot.course.subject}, ${snapshot.course.gradeLevel})`);
  if (snapshot.currentLesson) {
    lines.push(`Current lesson: ${snapshot.currentLesson.title}`);
    const conceptRows = snapshot.conceptsByLesson.get(snapshot.currentLesson.id) ?? [];
    if (conceptRows.length > 0) {
      lines.push(`Concepts in this lesson:`);
      for (const c of conceptRows) {
        const tag = c.studied ? "studied" : "not yet studied";
        lines.push(`  • ${c.name} — ${tag}`);
      }
    }
    if (snapshot.currentLesson.references.length > 0) {
      lines.push(`References:`);
      for (const r of snapshot.currentLesson.references) {
        const loc = r.locator?.page ? ` (p.${r.locator.page})` : r.locator?.section ? ` [${r.locator.section}]` : "";
        lines.push(`  • ${r.kind}: ${r.source}${loc}`);
      }
    }
    lines.push(`Suggested strategy: ${snapshot.currentLesson.suggestedStrategy}`);
  } else {
    lines.push(`This course has no in-progress lesson; all lessons are completed or none have been started.`);
  }
  return {
    id: "context.course-state",
    position: "context",
    customizable: false,
    template: lines.join("\n"),
  };
}
```

```typescript
// packages/curriculum/src/brief/compose.ts — additions

export interface ComposeSystemPromptInput {
  mode: Mode;
  overrides?: ReadonlyMap<string, string>;
  /** Phase 6: additional fragments computed at session start. Sorted-in by position. */
  additionalFragments?: ReadonlyArray<PromptFragment>;
}

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const overrides = input.overrides ?? new Map<string, string>();
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue;
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }
  const all = [...input.mode.promptFragments, ...(input.additionalFragments ?? [])];
  const sorted = all.sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  return sorted.map((f) => overrides.get(f.id) ?? f.template).join("\n\n");
}
```

```typescript
// packages/curriculum/src/modes/fragments/course-context.ts

import type { PromptFragment } from "@praxis/core/types";

/**
 * Fallback `context`-position fragment used when a session has no courseId.
 * Phase 6: included by default in `teach` mode so the agent has a stable
 * "no active course" signal. The session's BootstrapService composer
 * REPLACES this fragment with a course-state fragment when a courseId is set.
 */
export const courseContextFragmentDefault: PromptFragment = {
  id: "context.course-state",
  position: "context",
  customizable: false,
  template: `No course is loaded for this session. The user is working without a structured curriculum.`,
};
```

**Implementation notes**:
- `additionalFragments` are appended and sorted by position. Same fragment id from the mode + additional list will both render; that's why we use a fixed default fragment in `teach` and replace its template at session start. Implementation: SessionServiceImpl strips the default `context.course-state` fragment if it's about to inject a course-state fragment with the same id. Cleanest way: pass the override via `overrides` map keyed by `id`, but `customizable: false` blocks that. Alternative: make the default fragment `customizable: true` so the session-start replacement uses the overrides map. Trade-off documented; pick the overrides path.
- Concrete plan: `courseContextFragmentDefault` set to `customizable: true`. SessionServiceImpl, when computing course state, passes `overrides: new Map([["context.course-state", composedTemplate]])`. The principles fragment stays `customizable: false`, preserving the verification-principle invariant.

**Acceptance criteria**:
- [ ] `composeSystemPrompt({ mode, additionalFragments })` returns a string with the additional fragments interleaved by position.
- [ ] When the additional fragment id collides with a mode fragment, the override mechanism replaces (not duplicates).
- [ ] `composeCourseContextFragment(snapshot)` lists current-lesson concepts with study tags.
- [ ] Empty current-lesson case produces a sensible "all complete" line.

---

### Unit 7: SessionService — inject course-context at session start

**File**: `packages/core/src/services/session-service.ts` (modified)

```typescript
// In SessionServiceImpl.openActive, replace:
//   const systemPrompt = composeSystemPrompt({ mode: args.mode });
// with:

const additionalFragments: PromptFragment[] = [];
let overrides: ReadonlyMap<string, string> | undefined;

if (args.courseId) {
  const snapshot = await this.deps.toolServices.courseState.read({
    studentId: args.studentId as StudentId,
    courseId: args.courseId,
  });
  if (snapshot) {
    const fragment = composeCourseContextFragment(snapshot);
    overrides = new Map([[fragment.id, fragment.template]]);
  }
}

const systemPrompt = composeSystemPrompt({
  mode: args.mode,
  ...(overrides !== undefined && { overrides }),
});
```

**And in the `ToolContext` construction, fill the new artifacts/bootstrap/courseState handles**:

```typescript
const toolContext: ToolContext = {
  studentId: args.studentId as ToolContext["studentId"],
  sessionId: args.sessionId as ToolContext["sessionId"],
  services: {
    memory: null,
    artifacts: this.deps.toolServices.artifacts,    // ← Phase 6
    bootstrap: this.deps.toolServices.bootstrap,    // ← Phase 6
    courseState: this.deps.toolServices.courseState, // ← Phase 6
    vectorStore: this.deps.toolServices.vectorStore,
    ftsStore: this.deps.toolServices.ftsStore,
    embeddings: this.deps.toolServices.embeddings,
    documents: this.deps.toolServices.documents,
    sandbox: this.deps.toolServices.sandbox,
    sympy: this.deps.toolServices.sympy,
    pedagogyPack: null,
  },
  log: this.deps.log,
};
```

**And the active session's `args.courseId` is plumbed in. The existing code already passes `opts.courseId` from `start({ courseId })` — confirmed via Read of `session-service.ts`.**

**Implementation notes**:
- `args.courseId` may be undefined for non-course sessions (bootstrap mode itself, or a `teach` session without a course); the override is skipped and the default "no course" template renders.
- The snapshot read happens at `open` time only — not at every `send`. That's correct for Phase 6 (no per-turn course state changes that warrant re-composing the system prompt). When Phase 9 lands and gates re-evaluate, the same composition path reflects updated state on the next session start.
- `ServiceDeps` (in `types.ts`) gets new toolService fields: `artifacts: ArtifactsService`, `bootstrap: BootstrapService`, `courseState: CourseStateReader`. See Unit 8.

**Acceptance criteria**:
- [ ] Starting a session with a valid `courseId` puts the course-state template into the system prompt at position `context`.
- [ ] Starting without a `courseId` (or with an unknown one) falls back to the default "no course" template.
- [ ] No regression: existing `teach` sessions without a course still work.

---

### Unit 8: `ServiceDeps` + `buildServices` wiring

**Files**:
- `packages/core/src/services/types.ts` (modified)
- `packages/desktop/electron/main/services.ts` (modified)

```typescript
// packages/core/src/services/types.ts

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  toolServices: {
    sympy: SymPyService;
    sandbox: CodeSandbox;
    vectorStore: VectorStore;
    ftsStore: FtsStore;
    embeddings: EmbeddingService;
    documents: DocumentsReader;
    /** ← Phase 6 NEW */
    artifacts: ArtifactsService;
    /** ← Phase 6 NEW */
    bootstrap: BootstrapService;
    /** ← Phase 6 NEW */
    courseState: CourseStateReader;
  };
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
```

```typescript
// packages/desktop/electron/main/services.ts — additions

import {
  ArtifactsServiceImpl,
  BootstrapServiceImpl,
  // ... existing imports
} from "@praxis/core/services";
import { teachMode, bootstrapMode } from "@praxis/curriculum/modes";
import {
  COURSE_TOOLS, // exported array of all course.* tools
} from "@praxis/tools/course";

// Inside buildServices(dbPath):

// (after vector / fts / embeddings / documents wiring …)

const artifactsService = new ArtifactsServiceImpl({ db, log });

const engineResolver = () => {
  const engineConfig = readEngineConfig(db);
  return createEngine({ config: engineConfig, deps: { log } });
};
const bootstrapService = new BootstrapServiceImpl({ db, log, engineResolver });

const modes = new Map([
  [teachMode.id, teachMode],
  [bootstrapMode.id, bootstrapMode], // ← Phase 6
]);

const toolDefinitions = [
  gradeMathTool,
  codeSandboxTool,
  retrieveFromTextbookTool,
  ...COURSE_TOOLS, // ← Phase 6
];

const deps: ServiceDeps = {
  db,
  log,
  modes,
  toolDefinitions,
  toolServices: {
    sympy,
    sandbox,
    vectorStore,
    ftsStore,
    embeddings,
    documents: documentsReader,
    artifacts: artifactsService,
    bootstrap: bootstrapService,
    courseState: artifactsService, // same instance implements both
  },
};
```

**Implementation notes**:
- The `Services` interface gains `artifacts: ArtifactsServiceImpl` so IPC handlers can call read methods. `bootstrap` doesn't need IPC exposure (only tools call it).
- Add `bootstrapService.shutdown()` to whatever process-shutdown hook the desktop app already has (sweep timer cleanup).

**Acceptance criteria**:
- [ ] `buildServices(dbPath)` returns the same `Services` shape with new fields.
- [ ] `pnpm desktop:build` succeeds.
- [ ] First-run boot still works against an empty DB (no courses → empty list, no errors).

---

### Unit 9: Course-navigation tools

**Files** (each is its own file in `packages/tools/src/course/`):

```typescript
// packages/tools/src/course/what-can-i-teach.ts

import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z.string().optional(),
});

const OutputSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  currentLesson: z
    .object({
      lessonId: z.string(),
      title: z.string(),
      conceptCount: z.number().int(),
      studiedConceptCount: z.number().int(),
    })
    .nullable(),
  nextConceptToStudy: z
    .object({
      conceptId: z.string(),
      name: z.string(),
      description: z.string(),
    })
    .nullable(),
  completed: z.boolean(),
});

export const whatCanITeachTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.what_can_i_teach",
  description:
    "Return the active course's current lesson and the next concept to teach. Call this at the start of a tutoring turn when you need to orient yourself; the system prompt includes a snapshot but this tool gives a fresh read.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const courseId = brandId<"CourseId">(args.courseId ?? requireSessionCourseId(ctx));
    const snap = await ctx.services.courseState.read({ studentId: ctx.studentId, courseId });
    if (!snap) {
      throw new Error(`Course not found for this student: ${courseId}`);
    }
    if (!snap.currentLesson) {
      return {
        courseId: snap.course.id,
        courseTitle: snap.course.title,
        currentLesson: null,
        nextConceptToStudy: null,
        completed: true,
      };
    }
    const conceptRows = snap.conceptsByLesson.get(snap.currentLesson.id) ?? [];
    const nextRow = conceptRows.find((c) => !c.studied) ?? null;
    return {
      courseId: snap.course.id,
      courseTitle: snap.course.title,
      currentLesson: {
        lessonId: snap.currentLesson.id,
        title: snap.currentLesson.title,
        conceptCount: conceptRows.length,
        studiedConceptCount: conceptRows.filter((c) => c.studied).length,
      },
      nextConceptToStudy: nextRow
        ? { conceptId: nextRow.conceptId, name: nextRow.name, description: nextRow.description }
        : null,
      completed: false,
    };
  },
};

function requireSessionCourseId(ctx: ToolContext): string {
  // The session's courseId was passed at start; tools see it via the systemPrompt context.
  // For now, tool callers must pass courseId explicitly OR we look it up via the session row.
  // Implementation: read the session row from the DB via a small helper. Phase 6 plumbs it in.
  throw new Error("course tools require an explicit courseId or active course context (Phase 6)");
}
```

```typescript
// packages/tools/src/course/start-lesson.ts

const InputSchema = z.object({ lessonId: z.string() });
const OutputSchema = z.object({
  ok: z.literal(true),
  lessonId: z.string(),
  conceptIds: z.array(z.string()),
  references: z.array(/* Reference */ z.any()),
  suggestedStrategy: z.string(),
});

export const startLessonTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_lesson",
  description:
    "Mark a lesson as in-progress for the current student. Returns the lesson's concept IDs, references, and suggested strategy.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const lessonId = brandId<"LessonId">(args.lessonId);
    await ctx.services.artifacts.markLessonStarted({ studentId: ctx.studentId, lessonId });
    // Pull the lesson detail via artifacts.lessons(courseId) — simpler: add a lesson(id) read.
    // ... return { ok: true, lessonId, conceptIds, references, suggestedStrategy }
  },
};
```

```typescript
// packages/tools/src/course/current-concept.ts

const InputSchema = z.object({ courseId: z.string().optional() });
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    conceptId: z.string(),
    name: z.string(),
    description: z.string(),
    lessonId: z.string(),
  }),
  z.object({ kind: z.literal("all_complete"), courseId: z.string() }),
]);

export const currentConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.current_concept",
  description:
    "Return the next un-studied concept in the current lesson, or signal that all concepts are studied.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) { /* ... uses courseState.read ... */ },
};
```

```typescript
// packages/tools/src/course/mark-studied.ts

const InputSchema = z.object({
  conceptId: z.string(),
  evidenceEventId: z.string().optional(),
});
const OutputSchema = z.object({
  ok: z.literal(true),
  conceptId: z.string(),
  lessonComplete: z.boolean(),
  lessonId: z.string().nullable(),
});

export const markStudiedTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.mark_studied",
  description:
    "Record that the student has covered a concept. Pass the evidence event ID if you'd like the marker traced to a specific turn. Returns lessonComplete=true when this concept was the last one in the current lesson.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const conceptId = brandId<"ConceptId">(args.conceptId);
    const result = await ctx.services.artifacts.markConceptStudied({
      studentId: ctx.studentId,
      conceptId,
      ...(args.evidenceEventId !== undefined && { evidenceEventId: args.evidenceEventId }),
    });
    return {
      ok: true,
      conceptId,
      lessonComplete: result.lessonComplete,
      lessonId: result.lessonId,
    };
  },
};
```

**Implementation notes**:
- `requireSessionCourseId` needs the session's courseId. The cleanest plumb-through: extend `ToolContext` with an optional `courseId?: CourseId` populated by SessionServiceImpl when it builds the context. Add it to `ToolContext` in `packages/core/src/types/tool.ts`.
- All four navigation tools work whether or not the session has a courseId, but the agent typically invokes them inside a course-aware session.
- `effects` annotations are accurate: `mark_studied` and `start_lesson` mutate; `what_can_i_teach` and `current_concept` only read.

**Acceptance criteria**:
- [ ] `course.what_can_i_teach` returns a stable shape; `currentLesson === null` when course is fully completed.
- [ ] `course.start_lesson` upserts a `lesson_progress` row with `status: "in_progress"`.
- [ ] `course.mark_studied` is idempotent (re-marking a studied concept doesn't error or mis-trigger lesson-complete).
- [ ] `course.current_concept` returns `kind: "all_complete"` when nothing remains.

---

### Unit 10: Bootstrap-mode tools (draft authoring)

**Files** (in `packages/tools/src/course/`):

```typescript
// packages/tools/src/course/list-documents.ts

const InputSchema = z.object({});
const OutputSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      filename: z.string(),
      ingestorLabel: z.string(),
      chunkCount: z.number().int(),
      hasPageImages: z.boolean(),
    }),
  ),
});

export const listDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_documents",
  description:
    "List the student's ingested documents. Use this in bootstrap mode to see what materials are available before proposing a course draft.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx) {
    // Read directly from the documents table via DocumentsReader or a thin DB call.
    // Implementation calls a new ArtifactsService.documents(studentId) helper or
    // reuses DocumentsServiceImpl.list (which is per-student via getOrCreateDefaultStudentId).
  },
};
```

```typescript
// packages/tools/src/course/propose-draft.ts

const InputSchema = z.object({
  documentIds: z.array(z.string()).min(1),
  courseTitle: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.string().min(1),
});
const OutputSchema = z.object({
  draftId: z.string(),
  summary: z.object({
    title: z.string(),
    lessonCount: z.number().int(),
    conceptCount: z.number().int(),
    edgeCount: z.number().int(),
    firstLessons: z.array(
      z.object({ title: z.string(), conceptCount: z.number().int() }),
    ),
  }),
});

export const proposeDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.propose_draft",
  description:
    "Propose a course draft from the student's ingested documents. Returns a draftId and summary; the full draft is shown via course.show_draft. This call may take 30-90 seconds for a textbook.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["none"], // draft is in-memory; only confirm_draft persists
  async handler(args, ctx) {
    const { draft, summary } = await ctx.services.bootstrap.proposeDraft({
      studentId: ctx.studentId,
      documentIds: args.documentIds.map((id) => id as DocumentId),
      courseTitle: args.courseTitle,
      subject: args.subject,
      gradeLevel: args.gradeLevel,
    });
    return { draftId: draft.draftId, summary };
  },
};
```

```typescript
// packages/tools/src/course/show-draft.ts

const InputSchema = z.object({ draftId: z.string() });
// Output mirrors DraftCourseState — the UI uses this to render the structured card.
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    draft: z.any(), // serialized DraftCourseState (or its `proposed` field)
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("expired") }),
]);

export const showDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.show_draft",
  description:
    "Return the current state of a draft course. The student's UI renders this as a structured card so they can scan the proposal. Use this after course.propose_draft to display the draft, after each course.edit_draft to re-display, and before course.confirm_draft to verify.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) { /* ... */ },
};
```

```typescript
// packages/tools/src/course/edit-draft.ts

const DraftEditOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rename-course"), title: z.string().min(1) }),
  z.object({ kind: z.literal("rename-lesson"), lessonIndex: z.number().int().nonnegative(), title: z.string().min(1) }),
  z.object({ kind: z.literal("reorder-lessons"), newOrder: z.array(z.number().int().nonnegative()) }),
  z.object({ kind: z.literal("remove-lesson"), lessonIndex: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal("add-lesson"),
    afterIndex: z.number().int(), // -1 to prepend
    title: z.string().min(1),
    conceptNames: z.array(z.string()).min(1),
  }),
  z.object({ kind: z.literal("rename-concept"), conceptName: z.string(), newName: z.string().min(1) }),
  z.object({ kind: z.literal("remove-concept"), conceptName: z.string() }),
  z.object({
    kind: z.literal("add-concept"),
    lessonIndex: z.number().int().nonnegative(),
    name: z.string().min(1),
    description: z.string(),
    afterConceptIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("set-thresholds"),
    thresholds: z.object({
      conceptMastery: z.number().min(0).max(1),
      examPass: z.number().min(0).max(1),
      allowRetake: z.boolean(),
      decayDays: z.number().int().positive(),
    }),
  }),
]);

const InputSchema = z.object({ draftId: z.string(), op: DraftEditOpSchema });
const OutputSchema = z.object({
  ok: z.literal(true),
  draftId: z.string(),
  summary: z.object({
    title: z.string(),
    lessonCount: z.number().int(),
    conceptCount: z.number().int(),
  }),
});

export const editDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.edit_draft",
  description: `Apply an edit operation to an in-memory course draft. Operations:
- rename-course: change the course title
- rename-lesson / reorder-lessons / remove-lesson / add-lesson: lesson sequence edits
- rename-concept / remove-concept / add-concept: concept-graph edits
- set-thresholds: change mastery / exam-pass thresholds
After each edit, call course.show_draft to display the new state.`,
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const draft = await ctx.services.bootstrap.editDraft({ draftId: args.draftId, op: args.op });
    return {
      ok: true,
      draftId: draft.draftId,
      summary: {
        title: draft.proposed.title,
        lessonCount: draft.proposed.proposedLessons.length,
        conceptCount: draft.proposed.proposedConcepts.length,
      },
    };
  },
};
```

```typescript
// packages/tools/src/course/confirm-draft.ts

const InputSchema = z.object({ draftId: z.string() });
const OutputSchema = z.object({
  ok: z.literal(true),
  courseId: z.string(),
  lessonIds: z.array(z.string()),
  conceptGraphId: z.string(),
});

export const confirmDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.confirm_draft",
  description:
    "Persist the draft as a real course. After this call, the course appears in the student's course list and is selectable for teach sessions. The draft is removed from the cache.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const result = await ctx.services.bootstrap.confirmDraft({
      draftId: args.draftId,
      studentId: ctx.studentId,
    });
    return { ok: true, ...result };
  },
};
```

```typescript
// packages/tools/src/course/discard-draft.ts

const InputSchema = z.object({ draftId: z.string() });
const OutputSchema = z.object({ ok: z.literal(true) });

export const discardDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.discard_draft",
  description:
    "Drop an in-memory draft. Use this when the user wants to start over from scratch without confirming.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    await ctx.services.bootstrap.discardDraft(args.draftId);
    return { ok: true };
  },
};
```

```typescript
// packages/tools/src/course/index.ts

export { whatCanITeachTool } from "./what-can-i-teach.js";
export { startLessonTool } from "./start-lesson.js";
export { currentConceptTool } from "./current-concept.js";
export { markStudiedTool } from "./mark-studied.js";
export { listDocumentsTool } from "./list-documents.js";
export { proposeDraftTool } from "./propose-draft.js";
export { showDraftTool } from "./show-draft.js";
export { editDraftTool } from "./edit-draft.js";
export { confirmDraftTool } from "./confirm-draft.js";
export { discardDraftTool } from "./discard-draft.js";

import { whatCanITeachTool } from "./what-can-i-teach.js";
import { startLessonTool } from "./start-lesson.js";
import { currentConceptTool } from "./current-concept.js";
import { markStudiedTool } from "./mark-studied.js";
import { listDocumentsTool } from "./list-documents.js";
import { proposeDraftTool } from "./propose-draft.js";
import { showDraftTool } from "./show-draft.js";
import { editDraftTool } from "./edit-draft.js";
import { confirmDraftTool } from "./confirm-draft.js";
import { discardDraftTool } from "./discard-draft.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const COURSE_TOOLS = [
  whatCanITeachTool,
  startLessonTool,
  currentConceptTool,
  markStudiedTool,
  listDocumentsTool,
  proposeDraftTool,
  showDraftTool,
  editDraftTool,
  discardDraftTool,
  confirmDraftTool,
] as const;
```

Update `packages/tools/package.json` `exports` to include `./course`.

**Implementation notes**:
- `propose_draft` is tier `model-derived` because the extractor's output is LLM-generated; everything else that simply reads/writes the structured draft is tier `grounded`.
- Output schemas use the discriminated-union-dispatch pattern (`kind` discriminator) per `.claude/skills/patterns/discriminated-union-dispatch.md`.
- The agent narrates the conversation; tools provide structured state. Don't return long prose from tool outputs — keep them compact and consumable.

**Acceptance criteria**:
- [ ] All 10 tools type-check, register correctly with `InProcessToolRegistry`, and survive a roundtrip `tool.input.parse(JSON.parse(JSON.stringify(args)))` (no Date / Map / Buffer in inputs).
- [ ] `confirm_draft` persists rows in one transaction; partial failure rolls back.
- [ ] `propose_draft` followed by `confirm_draft` produces a queryable course (returned `courseId` is found by `ArtifactsServiceImpl.course`).

---

### Unit 11: `bootstrap` mode + `teach` mode update

**Files**:
- `packages/curriculum/src/modes/bootstrap.ts` (new)
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` (new)
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` (new)
- `packages/curriculum/src/modes/teach.ts` (modified — add nav tools + the default course-context fragment)
- `packages/curriculum/src/modes/fragments/tools.ts` (modified — append nav-tool docs)
- `packages/curriculum/src/modes/index.ts` (modified — register `bootstrapMode`)

```typescript
// packages/curriculum/src/modes/fragments/bootstrap-role.ts

export const bootstrapRoleFragment: PromptFragment = {
  id: "role.bootstrap",
  position: "role",
  customizable: true,
  template: `You are a course-design assistant. The student or self-directed learner wants to set up a course from materials they've uploaded. Your job is to:
1. List the documents available (course.list_documents).
2. Confirm the course title, subject, and grade level with the student.
3. Propose a draft via course.propose_draft.
4. Show the draft via course.show_draft so the student can review.
5. Refine the draft conversationally — use course.edit_draft for each change the student requests.
6. When the student confirms, call course.confirm_draft to persist the course.
You are not a teacher in this mode — you don't grade, quiz, or scaffold. You author.`,
};
```

```typescript
// packages/curriculum/src/modes/fragments/bootstrap-tools.ts

export const bootstrapToolsFragment: PromptFragment = {
  id: "tools.bootstrap",
  position: "tools",
  customizable: false,
  template: `Tools available in bootstrap mode:
- course.list_documents — see the student's ingested materials
- course.propose_draft — generate a draft course from selected documents (takes 30-90 seconds)
- course.show_draft — render the current draft for review
- course.edit_draft — apply a single edit to the draft (rename, reorder, add, remove)
- course.confirm_draft — persist the draft as a real course
- course.discard_draft — drop a draft and start over
- retrieve_from_textbook — quote specific passages from the documents while authoring

Workflow rules:
- Always call course.show_draft after course.edit_draft so the student sees the change.
- Don't call course.confirm_draft until the student explicitly says they're ready.
- If the student wants to undo, prefer a fresh course.propose_draft (drafts are cheap).`,
};
```

```typescript
// packages/curriculum/src/modes/bootstrap.ts

export const bootstrapMode: Mode = {
  id: "bootstrap",
  label: "Bootstrap a course",
  description:
    "Conversational mode for authoring a new course from ingested documents.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,             // shared (existing)
    bootstrapRoleFragment,
    principlesFragment,           // shared (existing) — verification / source-authority still applies
    bootstrapToolsFragment,
    courseContextFragmentDefault, // empty in bootstrap mode (no active course); session won't override.
    constraintsFragment,          // shared
    postambleFragment,            // shared
  ],
  toolNames: [
    "course.list_documents",
    "course.propose_draft",
    "course.show_draft",
    "course.edit_draft",
    "course.confirm_draft",
    "course.discard_draft",
    "retrieve_from_textbook",
  ],
  uiSurface: "chat",
};
```

```typescript
// packages/curriculum/src/modes/teach.ts (modified)

export const teachMode: Mode = {
  id: "teach",
  label: "Teach",
  description:
    "Interactive lecture mode: introduce concepts, scaffold worked examples, fade to independent practice.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    toolsFragment,                  // updated below
    courseContextFragmentDefault,   // ← NEW: replaced at session start when courseId set
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    "grade_math",
    "code_sandbox",
    "retrieve_from_textbook",
    "course.what_can_i_teach",     // ← NEW
    "course.start_lesson",          // ← NEW
    "course.current_concept",       // ← NEW
    "course.mark_studied",          // ← NEW
  ],
  uiSurface: "chat",
};
```

```typescript
// packages/curriculum/src/modes/fragments/tools.ts (modified — append course nav docs)

export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox. Use to demonstrate algorithms or verify multi-step computation.
- retrieve_from_textbook — hybrid (semantic + lexical) search of the student's uploaded textbooks. Use for ANY claim that should be grounded in their course material. Filters available: documentIds, sectionPattern (e.g. "chapter 3"), pageRange (e.g. pages 40-50). Use these when the student gives you a hint about where to look.
- course.what_can_i_teach — orient yourself: returns the active course's current lesson and the next concept to study.
- course.start_lesson — mark a lesson as in-progress when the student begins it.
- course.current_concept — fetch the next un-studied concept of the current lesson.
- course.mark_studied — record that the student has covered a concept; pass evidenceEventId when you can.

When you cite from retrieve_from_textbook results, refer to them as [1], [2], [3] in the order they appear. The student's UI renders these as clickable chips that show the source chunk; for vision-parsed PDFs, the source card includes a "View page" button so the student can see the original.

When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
```

```typescript
// packages/curriculum/src/modes/index.ts (modified)

import { bootstrapMode } from "./bootstrap.js";
import { teachMode } from "./teach.js";

const MODE_REGISTRY: ReadonlyMap<string, Mode> = new Map([
  [teachMode.id, teachMode],
  [bootstrapMode.id, bootstrapMode],
]);

export { teachMode, bootstrapMode };
// (existing getMode / requireMode / listModes unchanged)
```

**Acceptance criteria**:
- [ ] `getMode("bootstrap")` returns the new mode; `listModes()` includes both.
- [ ] `teachMode.toolNames` includes the four nav tool names.
- [ ] System prompt for a `bootstrap` session contains the bootstrap-specific role + tools fragments.
- [ ] System prompt for a `teach` session with no `courseId` contains the default "no course" template.
- [ ] System prompt for a `teach` session with a valid `courseId` contains a populated course-state template (verified in Unit 7).

---

### Unit 12: `praxis.artifacts.*` IPC + `ArtifactsClient` (real impl)

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified — add artifacts handlers)
- `packages/client/src/services/artifacts-client.ts` (modified — replace stub with real impl)

```typescript
// packages/desktop/electron/main/ipc-server.ts — additions inside registerIpcHandlers

// ── Artifacts (read-only) ────────────────────────────────────────────────────

handle("praxis.artifacts.courses", async () => {
  const studentId = services.session.getDefaultStudentId();
  return services.artifacts.courses(studentId);
});

handle("praxis.artifacts.course", async (_event, courseId: string) => {
  return services.artifacts.course(brandId<"CourseId">(courseId) as CourseId);
});

handle("praxis.artifacts.lessons", async (_event, courseId: string) => {
  return services.artifacts.lessons(brandId<"CourseId">(courseId) as CourseId);
});

handle("praxis.artifacts.gates", async (_event, courseId: string) => {
  return services.artifacts.gates(brandId<"CourseId">(courseId) as CourseId);
});

handle("praxis.artifacts.progress", async () => {
  const studentId = services.session.getDefaultStudentId();
  return services.artifacts.progress(studentId);
});
```

(`SessionServiceImpl` exposes `getDefaultStudentId()` via the existing `getOrCreateDefaultStudentId(db)` helper — add a small wrapper method on the service if needed.)

```typescript
// packages/client/src/services/artifacts-client.ts — real impl

import type {
  ArtifactsService,
  ConceptId,
  ConceptMapDrawing,
  Course,
  CourseId,
  CourseSummary,
  Flashcard,
  Gate,
  Lesson,
  Note,
  ProgressSnapshot,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  courses: "praxis.artifacts.courses",
  course: "praxis.artifacts.course",
  lessons: "praxis.artifacts.lessons",
  gates: "praxis.artifacts.gates",
  progress: "praxis.artifacts.progress",
} as const;

export class ArtifactsClient implements ArtifactsService {
  constructor(private readonly transport: ClientTransport) {}

  async course(id: CourseId): Promise<Course> {
    const c = await this.transport.invoke<Course | null>(C.course, id);
    if (!c) throw new Error(`Course not found: ${id}`);
    return c;
  }

  courses(): Promise<CourseSummary[]> {
    return this.transport.invoke<CourseSummary[]>(C.courses);
  }

  lessons(courseId: CourseId): Promise<Lesson[]> {
    return this.transport.invoke<Lesson[]>(C.lessons, courseId);
  }

  gates(courseId: CourseId): Promise<Gate[]> {
    return this.transport.invoke<Gate[]>(C.gates, courseId);
  }

  progress(): Promise<ProgressSnapshot> {
    return this.transport.invoke<ProgressSnapshot>(C.progress);
  }

  // Phase 6 leaves these as Phase-12 territory.
  flashcards(_opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]> {
    return Promise.resolve([]);
  }
  notes(_opts?: { courseId?: CourseId }): Promise<Note[]> {
    return Promise.resolve([]);
  }
  conceptMaps(_courseId?: CourseId): Promise<ConceptMapDrawing[]> {
    return Promise.resolve([]);
  }
}
```

Update `packages/client/src/client.ts` to pass `transport` to `ArtifactsClient`:

```typescript
artifacts: new ArtifactsClient(transport),
```

**Implementation notes**:
- `ArtifactsService.courses()` originally returned `Course[]` per CONTRACT.md. Phase 6 narrows to `CourseSummary[]` for the list view (cheaper render, no JSON parsing). The contract change is additive; explicit individual `course(id)` reads still return full `Course`.
- The contract document needs a small note: `ArtifactsService.courses()` returns summaries; full Course is fetched per-id. Documented in Unit 14.

**Acceptance criteria**:
- [ ] `ArtifactsClient.courses()` returns `[]` on a fresh DB.
- [ ] After bootstrap → confirm, `ArtifactsClient.courses()` returns the new course summary.
- [ ] `course(id)` throws on unknown ID; returns the Course on success.

---

### Unit 13: UI — Courses list, course detail, draft card, nav

**Files**:
- `packages/ui/src/routes/courses.tsx` (new)
- `packages/ui/src/routes/courses.module.css` (new)
- `packages/ui/src/routes/course-detail.tsx` (new)
- `packages/ui/src/routes/course-detail.module.css` (new)
- `packages/ui/src/hooks/use-courses.ts` (new)
- `packages/ui/src/hooks/use-course-detail.ts` (new)
- `packages/ui/src/components/draft-card.tsx` (new)
- `packages/ui/src/components/draft-card.module.css` (new)
- `packages/ui/src/components/course-list-item.tsx` (new)
- `packages/ui/src/components/nav.tsx` (modified — add Courses link)
- `packages/ui/src/components/message.tsx` (modified — render draft tool results)
- `packages/ui/src/router.tsx` (modified — register routes)

```tsx
// packages/ui/src/routes/courses.tsx (sketch)

export function CoursesRoute() {
  const { courses, refresh, loading, error } = useCourses();
  const navigate = useNavigate();

  const startBootstrap = async () => {
    const handle = await client.session.start({ modeId: "bootstrap" });
    navigate({ to: "/", search: { sessionId: handle.sessionId } as never });
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1>Courses</h1>
        <button type="button" onClick={startBootstrap}>+ New course</button>
      </header>
      {loading && <div>Loading…</div>}
      {error && <div className={styles.error}>{error.message}</div>}
      {courses.length === 0 && !loading ? (
        <EmptyState>
          You don't have any courses yet. Upload a syllabus and textbook in chat,
          then click "New course" to bootstrap one from your materials.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {courses.map((c) => (
            <CourseListItem key={c.courseId} course={c}
              onOpen={() => navigate({ to: "/courses/$courseId", params: { courseId: c.courseId } })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
```

```tsx
// packages/ui/src/routes/course-detail.tsx (sketch)

export function CourseDetailRoute() {
  const { courseId } = useParams({ strict: false });
  const { course, lessons, loading } = useCourseDetail(courseId);
  const navigate = useNavigate();

  const startTeachSession = async () => {
    const handle = await client.session.start({ modeId: "teach", courseId });
    navigate({ to: "/", search: { sessionId: handle.sessionId } as never });
  };

  if (loading) return <div>Loading…</div>;
  if (!course) return <div>Course not found</div>;

  return (
    <div className={styles.layout}>
      <header>
        <button onClick={() => navigate({ to: "/courses" })}>← Courses</button>
        <h1>{course.title}</h1>
        <p>{course.subject} · {course.gradeLevel}</p>
      </header>
      <button onClick={startTeachSession} className={styles.startBtn}>
        Start session
      </button>
      <ol className={styles.lessons}>
        {lessons.map((l, i) => (
          <li key={l.id}>
            <span className={styles.lessonIdx}>Lesson {i + 1}</span>
            <span className={styles.lessonTitle}>{l.title}</span>
            <span className={styles.lessonMeta}>
              {l.conceptIds.length} concepts · ~{l.estimatedMinutes} min
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

```tsx
// packages/ui/src/components/draft-card.tsx (sketch)

interface DraftCardProps {
  draft: { proposed: ProposedCourse };
}

/**
 * Renders the structured draft a student can scan during bootstrap mode.
 * Used when message.tsx detects a tool_result for course.show_draft.
 */
export function DraftCard({ draft }: DraftCardProps) {
  const p = draft.proposed;
  return (
    <article className={styles.card}>
      <header>
        <h3>{p.title}</h3>
        <p>{p.subject} · {p.gradeLevel}</p>
      </header>
      <details open>
        <summary>{p.proposedLessons.length} lessons</summary>
        <ol>
          {p.proposedLessons.map((l, i) => (
            <li key={i}>
              <strong>{l.title}</strong>
              <ul className={styles.conceptList}>
                {l.conceptNames.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>{p.proposedConcepts.length} concepts</summary>
        <ul>
          {p.proposedConcepts.map((c) => (
            <li key={c.name}><strong>{c.name}</strong> — {c.description}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>{p.proposedEdges.length} prerequisites</summary>
        <ul>
          {p.proposedEdges.map((e, i) => (
            <li key={i}>{e.fromName} → {e.toName} ({Math.round(e.strength * 100)}%) — {e.rationale}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
```

```tsx
// packages/ui/src/components/message.tsx (modification sketch)

// In the tool_result rendering switch, add a case for course.show_draft:
case "course.show_draft": {
  const result = ev.result;
  if (result.ok && result.value && (result.value as { kind: string }).kind === "ok") {
    return <DraftCard draft={(result.value as { kind: "ok"; draft: { proposed: ProposedCourse } }).draft} />;
  }
  return <span className={styles.toolMissing}>Draft not found.</span>;
}
```

```tsx
// packages/ui/src/router.tsx (modified — add routes)

const coursesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/courses", component: CoursesRoute });
const courseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId",
  component: CourseDetailRoute,
});
const routeTree = rootRoute.addChildren([chatRoute, settingsRoute, coursesRoute, courseDetailRoute]);
```

**Implementation notes**:
- "New course" button starts a `bootstrap` mode session and navigates to chat with the new sessionId. The chat hook (`useStreamedSend`) loads that session's transcript on mount.
- The chat surface continues to render `tool_call` and `tool_result` events as it does in Phase 5. The only new piece is the dispatch on `toolName === "course.show_draft"` to render `<DraftCard>` instead of generic JSON.
- Concept-graph visualization is out of scope (Phase 9 / 10 ships React Flow node editor). Phase 6 ships the lesson list only.

**Acceptance criteria**:
- [ ] `/courses` lists confirmed courses; "New course" launches a bootstrap session.
- [ ] `/courses/:courseId` shows lessons + a "Start session" button that opens a teach session.
- [ ] The draft card renders inside chat when the agent calls `course.show_draft`.
- [ ] Nav has "Courses" link.

---

### Unit 14: Documentation updates

**Files**:
- `docs/ROADMAP.md` (modified — Phase 6 description)
- `docs/CURRICULUM.md` (modified — modes section adds bootstrap)
- `docs/CONTRACT.md` (modified — `AuthoringService.bootstrap` deprecation note + `ArtifactsService.courses` returns summaries note)

**ROADMAP.md** — replace Phase 6 build list:

```markdown
## Phase 6: Course + lesson + bootstrap

**Goal:** Author a course conversationally; tutor navigates lessons.

**Build:**
- Course / Lesson / Reference schemas + state machine (`lesson_progress`, `concept_progress` tables)
- Course-navigation tools in `teach` mode (`course.what_can_i_teach`, `course.start_lesson`, `course.current_concept`, `course.mark_studied`)
- New `bootstrap` mode + draft-authoring tools (`course.list_documents`, `course.propose_draft`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`) — bootstrap is conversational; the user refines the proposed course in dialogue with the agent
- Concept-extractor agent: one-shot fresh engine session reading ingested document chunks; returns proposed concepts, edges, lessons; persisted on `course.confirm_draft`
- Course context loaded into `teach` system prompts at session bootstrap (current lesson, concepts studied/unstudied, references, suggested strategy)

**Test checkpoint:** Drop syllabus + textbook through Phase 5 ingestion. Open a `bootstrap` session, ask the tutor to draft a course; refine via conversation; confirm. Confirmed course appears in /courses. Open a `teach` session against the new course — the tutor's first message references the active lesson and concepts.
```

**CURRICULUM.md** — add to the "Modes and their pedagogical role" section, after `configure`:

```markdown
### `bootstrap`

A pre-curricular mode for authoring a new course from uploaded materials. Available without lock; intended for student self-onboard (UX path 2 in `UX.md`) and for the parent / teacher's first course before lock-gated `configure` is set up.

- Prompt fragments: bootstrap-specific role + tools.
- Tools: `course.list_documents`, `course.propose_draft`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`, plus `retrieve_from_textbook` for ad-hoc lookup while authoring.
- The agent runs the conversation: proposes a draft, walks the student through it, applies edits one at a time, persists on confirmation.
- Phase 11's `configure` mode subsumes bootstrap (lock-gated, with full gate / prompt / memory editors layered on).
```

**CONTRACT.md** — small notes:

- Under "Client RPC contract → ArtifactsService", add: "`courses()` returns `CourseSummary[]` for the list view; full `Course` is fetched per-id via `course(id)`. (Phase 6 change.)"
- Under "AuthoringService", add: "v1 ships course-bootstrap as a `bootstrap` mode (Phase 6) and full lock-gated authoring as `configure` mode (Phase 11). The `AuthoringService.bootstrap(files, opts) → DraftCourse` interface remains specified for forward-compat with scripted-authoring use cases but is unimplemented in v1."

**Acceptance criteria**:
- [ ] `docs/ROADMAP.md` reflects bootstrap-as-mode and the navigation-tool / extractor split.
- [ ] `docs/CURRICULUM.md` "Modes" section lists `bootstrap`.
- [ ] `docs/CONTRACT.md` notes the courses-summary change and the AuthoringService v1 status.

---

### Unit 15: `ToolContext.courseId` plumbing

**File**: `packages/core/src/types/tool.ts` (modified — add optional `courseId` to ToolContext)

```typescript
export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  /** Phase 6: when the active session was started with a courseId, propagated here. */
  courseId?: CourseId;
  services: ToolServices;
  log: Logger;
}
```

`SessionServiceImpl.openActive` populates `toolContext.courseId` from the session row (or from `args.courseId`). `course.what_can_i_teach`, `course.current_concept`, etc. read it as a fallback when their input args don't supply one.

**Acceptance criteria**:
- [ ] All four navigation tools work with no `courseId` argument when the session was started with a courseId.
- [ ] When called outside a course-aware session and with no `courseId`, tools throw a clear error.

---

### Unit 16: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/artifacts/src/__tests__/lesson-progress.test.ts` | unit, fast | Schema migration applies; `lesson_progress` and `concept_progress` rows can be inserted, upserted, queried. |
| `packages/core/src/__tests__/artifacts-service.test.ts` | unit, fast (real DB via useTempDb) | `course / courses / lessons / gates`; `markLessonStarted` upsert idempotency; `markConceptStudied` flips `lesson_progress.status` to completed when last concept hits; `read({studentId, courseId})` returns null on mismatch. |
| `packages/core/src/__tests__/bootstrap-service.test.ts` | unit, fast (real DB; mocked engineResolver returning a FakeEngine that returns canned ProposedCourse JSON) | `proposeDraft` validates Zod; cache size grows; `editDraft` applies each `DraftEditOp` kind; `confirmDraft` writes Course + Lessons + Concepts + Edges + Gates in one tx; draft removed after confirm; expired drafts dropped. |
| `packages/curriculum/src/bootstrap/__tests__/extractor.test.ts` | unit, fast | `runConceptExtractor` parses a fenced JSON response; rejects malformed output; caps concept count; trims orphaned edges/lessons. |
| `packages/curriculum/src/brief/__tests__/course-context.test.ts` | unit, fast | `composeCourseContextFragment(snapshot)` produces a context fragment containing course title, current lesson, studied/unstudied concept tags. |
| `packages/curriculum/src/__tests__/compose.test.ts` (extended) | unit, fast | `composeSystemPrompt({mode, additionalFragments, overrides})` — additional fragments interleave by position; collision via overrides replaces. |
| `packages/curriculum/src/__tests__/bootstrap-mode.test.ts` | unit, fast | `bootstrapMode.toolNames` contains the bootstrap tool subset; `teachMode.toolNames` contains the navigation tools. |
| `packages/tools/src/course/__tests__/tools.test.ts` | unit, fast (mocked services) | Each tool's handler invokes the right service method with the right args; outputs validate against the tool's `output` schema. |
| `packages/desktop/src/__tests__/ipc-server-artifacts.test.ts` | unit, fast | `praxis.artifacts.*` handlers route to the right ArtifactsServiceImpl methods. |
| `packages/client/src/__tests__/artifacts-client.test.ts` | unit, fast | `ArtifactsClient.*` methods invoke the right channel names. |
| `packages/ui/src/__tests__/draft-card.test.tsx` | unit (jsdom), fast | DraftCard renders title, lesson list, concept list. |
| `packages/ui/src/__tests__/course-detail.test.tsx` | unit (jsdom), fast | CourseDetailRoute lists lessons in order; "Start session" calls `client.session.start` with `{ modeId: "teach", courseId }`. |
| `tests/bootstrap-end-to-end.test.ts` | integration, fast (mocked extractor) | Real DB + real services; FakeEngine with canned events. Run flow: ingest fixture → bootstrap mode session → propose_draft → show_draft → edit_draft → confirm_draft → assert Course + Lessons in DB → start a teach session against the courseId → first system prompt contains the course-context fragment. |
| `tests/teach-with-course-context.test.ts` | integration, fast | Existing teach session with a confirmed course; assert the prompt the FakeEngine receives includes "Active course:" and "Current lesson:". |

Slow tests (real engine extractor) gated behind `PRAXIS_RUN_SLOW_TESTS=1`; they exist but aren't required for `pnpm test` to pass.

---

## Implementation Order

1. **Unit 1** — Type contract additions.
2. **Unit 2** — Schema migration (`pnpm db:generate` after).
3. **Unit 3** — `ArtifactsServiceImpl` (depends on Unit 1, 2).
4. **Unit 4** — `BootstrapServiceImpl` (depends on Unit 1, plus extractor stub Unit 5).
5. **Unit 5** — `runConceptExtractor` + extractor prompt (independent of services).
6. **Unit 6** — Course-context fragment + `composeSystemPrompt` extension.
7. **Unit 15** — `ToolContext.courseId` plumbing (small, but unblocks Unit 9).
8. **Unit 7** — `SessionServiceImpl` injection (depends on Unit 6, 3, 15).
9. **Unit 9** — Course-navigation tools (depends on Unit 3, 15).
10. **Unit 10** — Bootstrap-mode tools (depends on Unit 4).
11. **Unit 11** — `bootstrap` mode + `teach` mode update.
12. **Unit 8** — `ServiceDeps` + `buildServices` wiring (depends on Units 3, 4, 9, 10, 11).
13. **Unit 12** — IPC + `ArtifactsClient` real impl.
14. **Unit 13** — UI routes + draft card + nav.
15. **Unit 14** — Doc updates (ROADMAP / CURRICULUM / CONTRACT).
16. **Unit 16** — Tests interspersed; final integration tests last.

Units 5, 6, and 15 are parallelizable with each other.

---

## Verification

```bash
# Type + lint + fast tests
pnpm install && pnpm typecheck && pnpm lint && pnpm test

# Slow tests (real extractor against fixture documents)
PRAXIS_RUN_SLOW_TESTS=1 pnpm test

# Manual checkpoint (Phase 6)
pnpm desktop:build && pnpm dev
# 1. Drop a syllabus.md and textbook.pdf via the chat sidebar (Phase 5 flow). Wait for ingestion.
# 2. Open /courses. Click "New course" — chat opens in bootstrap mode.
# 3. Tell the tutor: "Build me an Algebra 1 course from those documents."
# 4. Tutor calls course.list_documents → confirms the materials.
# 5. Tutor calls course.propose_draft (30-90 sec). Returns summary.
# 6. Tutor calls course.show_draft → DraftCard renders inline.
# 7. Ask: "rename Lesson 3 to 'Solving for x'." Tutor calls course.edit_draft → course.show_draft.
# 8. Ask: "looks good — confirm it." Tutor calls course.confirm_draft.
# 9. /courses lists the new course. Click → /courses/<id> shows lessons.
# 10. Click "Start session" → chat opens in teach mode with courseId set.
# 11. Tutor's first message references the active lesson. Tool registry exposes course.* nav tools.
# 12. Ask: "what should we cover today?" — tutor calls course.what_can_i_teach.
# 13. Work through a concept. Tutor calls course.mark_studied at the appropriate moment.
# 14. End the session. Re-open /courses/<id> — progress reflected.
```
